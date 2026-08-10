import express from "express";
import {
  getInventoryConfig,
} from "../../data/store.js";
import { withTenantContext } from "../../db/withTenantContext.js";
import { requireRole } from "../../middlewares/auth.js";
import {
  listAdjustmentLocations,
  listBalances as listSequelizeBalances,
  listTransactions as listSequelizeTransactions,
} from "../../repositories/InventoryReadRepository.js";
import { ApiError } from "../../utils/errors.js";

const router = express.Router();
const inventoryViewRoles = [
  "superadmin",
  "hqadmin",
  "admin",
  "manager",
  "storemanager",
  "warehousemanager",
  "storeoperator",
  "warehouseoperator",
  "auditor",
];
router.use(requireRole(inventoryViewRoles));

function normalized(value) {
  return String(value ?? "").trim();
}

async function listBalances(req) {
  return listSequelizeBalances({
    tenantId: req.context.tenantId,
    warehouseId: req.context.warehouseId,
    filters: req.query,
  });
}

async function validateWarehouseAccess(client, { tenantId, warehouseId, userId }) {
  const result = await client.query(
    `SELECT 1
     FROM public.user_warehouses
     WHERE tenant_id = $1
       AND warehouse_id = $2
       AND user_id = $3
     LIMIT 1`,
    [tenantId, warehouseId, userId]
  );
  if (!result.rowCount) {
    throw new ApiError(403, "WAREHOUSE_FORBIDDEN", "Selected warehouse is not available to the current user");
  }
}

router.get("/balances", async (req, res, next) => {
  try {
    return res.json(await listBalances(req));
  } catch (error) {
    return next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const result = await listBalances(req);
    return res.json({ ...result, items: result.data });
  } catch (error) {
    return next(error);
  }
});

router.get("/transactions", async (req, res, next) => {
  try {
    if (normalized(req.query.lot_no || req.query.lot || req.query.serial_no || req.query.serial)) {
      throw new ApiError(
        400,
        "INVENTORY_FILTER_UNAVAILABLE",
        "Lot and serial filters are not available for inventory transactions because those fields are not stored on this table"
      );
    }

    const result = await listSequelizeTransactions({
      tenantId: req.context.tenantId,
      warehouseId: req.context.warehouseId,
      filters: req.query,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.get("/adjustment-locations", async (req, res, next) => {
  try {
    const tenantId = req.context.tenantId;
    const warehouseId = normalized(req.context.warehouseId);
    const userId = req.context.userId;
    const skuId = normalized(req.query.sku_id || req.query.skuId);

    const result = await withTenantContext(tenantId, async (client) => {
      if (!warehouseId) {
        throw new ApiError(400, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required");
      }
      await validateWarehouseAccess(client, { tenantId, warehouseId, userId });
      return listAdjustmentLocations(client, { tenantId, warehouseId, skuId });
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.get("/options", async (req, res, next) => {
  try {
    const tenantId = req.context.tenantId;
    const warehouseId = normalized(req.query.warehouse_id) || normalized(req.context.warehouseId);
    const data = await withTenantContext(tenantId, async (client) => {
      const values = [tenantId];
      const warehouseClause = warehouseId ? " AND warehouse_id = $2" : "";
      if (warehouseId) values.push(warehouseId);

      const warehouseResult = await client.query(
        `SELECT warehouse_id, warehouse_code, warehouse_name, status
         FROM public.warehouses
         WHERE tenant_id = $1${warehouseClause}
         ORDER BY warehouse_code`,
        values
      );
      const zoneResult = await client.query(
        `SELECT zone_id, zone_code, zone_name, warehouse_id, status
         FROM public.warehouse_zones
         WHERE tenant_id = $1${warehouseClause}
           AND status = 'active'
         ORDER BY zone_code`,
        values
      );
      const skuResult = await client.query(
        `SELECT sku_id, sku_code, description, uom, status
         FROM public.skus
         WHERE tenant_id = $1
         ORDER BY sku_code`,
        [tenantId]
      );
      const reasonResult = await client.query(
        `SELECT
           value.value_code AS reason_code,
           value.value_label AS reason_name
         FROM public.lov_groups reason
         JOIN public.lov_values value
           ON value.tenant_id = reason.tenant_id
          AND value.lov_group_id = reason.lov_group_id
         WHERE reason.tenant_id = $1
           AND reason.group_code = 'ADJUSTMENT_REASON'
           AND value.is_active = true
         ORDER BY value.sort_order, value.value_label`,
        [tenantId]
      );

      return {
        warehouses: warehouseResult.rows,
        zones: zoneResult.rows,
        skus: skuResult.rows,
        reason_codes: reasonResult.rows,
      };
    });

    return res.json({
      ...data,
      count_config: getInventoryConfig(tenantId),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
