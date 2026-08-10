import express from "express";
import {
  listInventoryLocations, getInventoryLocation,
  listInventoryZones,
  listWarehouses, getWarehouse, createWarehouse, updateWarehouse, deleteWarehouse,
  db,
} from "../../data/store.js";
import { withTenantContext } from "../../db/withTenantContext.js";
import { requireRole } from "../../middlewares/auth.js";
import { buildPagination, parsePagination } from "../../utils/pagination.js";

const router = express.Router();
const skuManagerRoles = ["superadmin", "hqadmin", "storemanager"];

function getTenantId(req) {
  return req.context?.tenantId;
}

function requiredText(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    const error = new Error(`${fieldName} is required`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function optionalNumber(value, fieldName, { defaultValue = null, min = null } = {}) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || (min !== null && normalized < min)) {
    const suffix = min === null ? "a valid number" : `a number greater than or equal to ${min}`;
    const error = new Error(`${fieldName} must be ${suffix}`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function optionalBoolean(value, fieldName, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  const error = new Error(`${fieldName} must be true or false`);
  error.status = 400;
  throw error;
}

function skuStatusFromBody(body) {
  const normalized = requiredText(body?.status, "Status").toLowerCase();
  if (["active", "inactive"].includes(normalized)) return normalized;
  const error = new Error("Status must be active or inactive");
  error.status = 400;
  throw error;
}

function skuPayloadFromBody(body) {
  return {
    skuCode: requiredText(body?.sku_code, "SKU code"),
    description: requiredText(body?.description, "Description"),
    uom: requiredText(body?.uom, "UOM"),
    category: optionalText(body?.category),
    hazardous: optionalBoolean(body?.hazardous, "hazardous", false),
    weight: optionalNumber(body?.weight, "weight", { min: 0 }),
    dimensions: optionalText(body?.dimensions),
    reorderPoint: optionalNumber(body?.reorder_point, "reorder_point", { defaultValue: 0, min: 0 }),
    reorderQty: optionalNumber(body?.reorder_qty, "reorder_qty", { defaultValue: 0, min: 0 }),
    status: skuStatusFromBody(body),
    qrPayload: optionalText(body?.qr_payload),
    rfidEpc: optionalText(body?.rfid_epc),
  };
}

function skuDuplicateMessage(error) {
  const constraint = String(error?.constraint || "");
  if (constraint.includes("sku_code")) return "SKU code already exists for this tenant";
  if (constraint.includes("description")) return "SKU description already exists for this tenant";
  return "SKU code or description already exists for this tenant";
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function skuHasReferences(client, tenantId, skuId) {
  const constraints = await client.query(`
    SELECT
      source_namespace.nspname AS schema_name,
      source_table.relname AS table_name,
      source_column.attname AS sku_column,
      EXISTS (
        SELECT 1
        FROM pg_attribute tenant_column
        WHERE tenant_column.attrelid = source_table.oid
          AND tenant_column.attname = 'tenant_id'
          AND tenant_column.attnum > 0
          AND NOT tenant_column.attisdropped
      ) AS has_tenant_id
    FROM pg_constraint constraint_row
    JOIN pg_class source_table
      ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace source_namespace
      ON source_namespace.oid = source_table.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY source_key(attnum, position)
      ON true
    JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY target_key(attnum, position)
      ON target_key.position = source_key.position
    JOIN pg_attribute source_column
      ON source_column.attrelid = constraint_row.conrelid
     AND source_column.attnum = source_key.attnum
    JOIN pg_attribute target_column
      ON target_column.attrelid = constraint_row.confrelid
     AND target_column.attnum = target_key.attnum
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.skus'::regclass
      AND target_column.attname = 'sku_id'
  `);

  for (const constraint of constraints.rows) {
    const tableName = `${quoteIdentifier(constraint.schema_name)}.${quoteIdentifier(constraint.table_name)}`;
    const skuColumn = quoteIdentifier(constraint.sku_column);
    const tenantClause = constraint.has_tenant_id ? " AND tenant_id = $2" : "";
    const params = constraint.has_tenant_id ? [skuId, tenantId] : [skuId];
    const reference = await client.query(
      `SELECT 1 FROM ${tableName} WHERE ${skuColumn} = $1${tenantClause} LIMIT 1`,
      params
    );
    if (reference.rowCount > 0) return true;
  }

  return false;
}

function supplierStatusFromBody(body) {
  if (typeof body?.is_active === "boolean") {
    return body.is_active ? "active" : "inactive";
  }
  if (typeof body?.status === "string") {
    const normalized = body.status.trim().toLowerCase();
    if (["active", "inactive"].includes(normalized)) return normalized;
  }
  return "active";
}

function sendRouteError(res, error) {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message,
  });
}

function mapSupplierRow(row) {
  if (!row) return null;
  return {
    ...row,
    contact_person: row.contact_person || null,
    is_active: row.status === "active",
  };
}

const supplierSelectSql = `
  SELECT
    supplier_id,
    supplier_name,
    supplier_code,
    contact_person,
    email,
    phone,
    address,
    status,
    created_at,
    updated_at,
    tenant_id
  FROM public.suppliers
`;

const skuSelectSql = `
  SELECT
    tenant_id,
    sku_id,
    sku_code,
    description,
    uom,
    category,
    hazardous,
    weight,
    dimensions,
    reorder_point,
    reorder_qty,
    status,
    qr_payload,
    rfid_epc,
    created_at,
    updated_at
  FROM public.skus
`;

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

router.get("/suppliers", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { page, pageSize } = parsePagination(req.query);
    const offset = (page - 1) * pageSize;
    const search = String(req.query.search || "").trim().toLowerCase();

    const result = await withTenantContext(tenantId, async (client) => {
      const params = [tenantId];
      let whereSql = "WHERE tenant_id = $1";

      if (search) {
        params.push(`%${search}%`);
        whereSql += ` AND (
          lower(supplier_name) LIKE $${params.length}
          OR lower(COALESCE(email::text, '')) LIKE $${params.length}
          OR lower(COALESCE(phone, '')) LIKE $${params.length}
        )`;
      }

      const countResult = await client.query(
        `SELECT count(*)::int AS total FROM public.suppliers ${whereSql}`,
        params
      );

      const listParams = [...params, pageSize, offset];
      const limitParam = listParams.length - 1;
      const offsetParam = listParams.length;
      const rowsResult = await client.query(
        `${supplierSelectSql}
         ${whereSql}
         ORDER BY supplier_name
         LIMIT $${limitParam}
         OFFSET $${offsetParam}`,
        listParams
      );

      return {
        rows: rowsResult.rows.map(mapSupplierRow),
        pagination: buildPagination(page, pageSize, countResult.rows[0]?.total || 0),
      };
    });

    res.json({
      success: true,
      data: result.rows,
      total: result.pagination.total,
      page: result.pagination.page,
      pageSize: result.pagination.pageSize,
      meta: { pagination: result.pagination },
    });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get("/suppliers/:id", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const supplier = await withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `${supplierSelectSql}
         WHERE tenant_id = $1
           AND supplier_id = $2`,
        [tenantId, req.params.id]
      );
      return mapSupplierRow(result.rows[0]);
    });
    if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });
    res.json({ success: true, data: supplier });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post("/suppliers", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const supplierName = requiredText(req.body?.supplier_name, "supplier_name");
    const supplierCode = optionalText(req.body?.supplier_code);
    const contactPerson = optionalText(req.body?.contact_person);
    const email = optionalText(req.body?.email);
    const phone = optionalText(req.body?.phone);
    const address = optionalText(req.body?.address);
    const status = supplierStatusFromBody(req.body);

    const supplier = await withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO public.suppliers (
           tenant_id,
           supplier_name,
           supplier_code,
           contact_person,
           email,
           phone,
           address,
           status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING
           supplier_id,
           supplier_name,
           supplier_code,
           contact_person,
           email,
           phone,
           address,
           status,
           created_at,
           updated_at,
           tenant_id`,
        [tenantId, supplierName, supplierCode, contactPerson, email, phone, address, status]
      );

      return mapSupplierRow(result.rows[0]);
    });

    res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ success: false, message: "Supplier already exists" });
    }
    sendRouteError(res, err);
  }
});

router.put("/suppliers/:id", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const supplierName = requiredText(req.body?.supplier_name, "supplier_name");
    const supplierCode = optionalText(req.body?.supplier_code);
    const contactPerson = optionalText(req.body?.contact_person);
    const email = optionalText(req.body?.email);
    const phone = optionalText(req.body?.phone);
    const address = optionalText(req.body?.address);
    const status = supplierStatusFromBody(req.body);

    const supplier = await withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `UPDATE public.suppliers
         SET supplier_name = $3,
             supplier_code = $4,
             contact_person = $5,
             email = $6,
             phone = $7,
             address = $8,
             status = $9,
             updated_at = now()
         WHERE tenant_id = $1
           AND supplier_id = $2
         RETURNING
           supplier_id,
           supplier_name,
           supplier_code,
           contact_person,
           email,
           phone,
           address,
           status,
           created_at,
           updated_at,
           tenant_id`,
        [tenantId, req.params.id, supplierName, supplierCode, contactPerson, email, phone, address, status]
      );

      return mapSupplierRow(result.rows[0]);
    });
    if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });
    res.json({ success: true, data: supplier });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ success: false, message: "Supplier already exists" });
    }
    sendRouteError(res, err);
  }
});

router.delete("/suppliers/:id", async (req, res) => {
  try {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }

    const tenantId = getTenantId(req);
    const deleted = await withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `DELETE FROM public.suppliers
         WHERE tenant_id = $1
           AND supplier_id = $2
         RETURNING
           supplier_id,
           supplier_name,
           supplier_code,
           contact_person,
           email,
           phone,
           address,
           status,
           created_at,
           updated_at,
           tenant_id`,
        [tenantId, req.params.id]
      );

      return mapSupplierRow(result.rows[0]);
    });
    if (!deleted) return res.status(404).json({ success: false, message: "Supplier not found" });
    res.json({ success: true, data: deleted });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({ success: false, message: "Supplier is in use" });
    }
    sendRouteError(res, err);
  }
});

// ─── SKU MASTER ───────────────────────────────────────────────────────────────

router.get("/skus", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { page, pageSize } = parsePagination(req.query);
    const offset = (page - 1) * pageSize;
    const search = String(req.query.search || "").trim().toLowerCase();
    const status = req.query.status ? skuStatusFromBody({ status: req.query.status }) : "";

    const result = await withTenantContext(tenantId, async (client) => {
      const params = [tenantId];
      let whereSql = "WHERE tenant_id = $1";

      if (search) {
        params.push(`%${search}%`);
        whereSql += ` AND (
          lower(COALESCE(sku_code, '')) LIKE $${params.length}
          OR lower(description) LIKE $${params.length}
        )`;
      }

      if (status) {
        params.push(status);
        whereSql += ` AND status = $${params.length}`;
      }

      const countResult = await client.query(
        `SELECT count(*)::int AS total FROM public.skus ${whereSql}`,
        params
      );
      const pagination = buildPagination(page, pageSize, countResult.rows[0]?.total || 0);
      const listParams = [...params, pageSize, offset];
      const rowsResult = await client.query(
        `${skuSelectSql}
         ${whereSql}
         ORDER BY sku_id
         LIMIT $${listParams.length - 1}
         OFFSET $${listParams.length}`,
        listParams
      );

      return { rows: rowsResult.rows, pagination };
    });

    res.json({
      data: result.rows,
      page: result.pagination.page,
      pageSize: result.pagination.pageSize,
      total: result.pagination.total,
      totalPages: result.pagination.totalPages,
    });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get("/skus/lookup", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const search = String(req.query.search || "").trim().toLowerCase();
    const skus = await withTenantContext(tenantId, async (client) => {
      const params = [tenantId];
      let searchSql = "";
      if (search) {
        params.push(`%${search}%`);
        searchSql = ` AND (
          lower(sku_code) LIKE $2
          OR lower(description) LIKE $2
        )`;
      }

      const result = await client.query(
        `SELECT sku_id, sku_code, description, uom, status
         FROM public.skus
         WHERE tenant_id = $1
           AND status = 'active'
           ${searchSql}
         ORDER BY sku_code, description
         LIMIT 25`,
        params
      );
      return result.rows;
    });

    res.json({ success: true, data: skus });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get("/skus/:skuId", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const sku = await withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `${skuSelectSql}
         WHERE tenant_id = $1
           AND sku_id = $2`,
        [tenantId, req.params.skuId]
      );
      return result.rows[0] || null;
    });
    if (!sku) return res.status(404).json({ success: false, message: "SKU not found" });
    res.json({ success: true, data: sku });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post("/skus", requireRole(skuManagerRoles), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const sku = skuPayloadFromBody(req.body);
    const created = await withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO public.skus (
           tenant_id, sku_code, description, uom, category, hazardous,
           weight, dimensions, reorder_point, reorder_qty, status,
           qr_payload, rfid_epc
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          tenantId, sku.skuCode, sku.description, sku.uom, sku.category,
          sku.hazardous, sku.weight, sku.dimensions, sku.reorderPoint,
          sku.reorderQty, sku.status, sku.qrPayload, sku.rfidEpc,
        ]
      );
      return result.rows[0];
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ success: false, message: skuDuplicateMessage(err) });
    }
    sendRouteError(res, err);
  }
});

router.put("/skus/:skuId", requireRole(skuManagerRoles), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const sku = skuPayloadFromBody(req.body);
    const updated = await withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `UPDATE public.skus
         SET sku_code = $3,
             description = $4,
             uom = $5,
             category = $6,
             hazardous = $7,
             weight = $8,
             dimensions = $9,
             reorder_point = $10,
             reorder_qty = $11,
             status = $12,
             qr_payload = $13,
             rfid_epc = $14,
             updated_at = now()
         WHERE tenant_id = $1
           AND sku_id = $2
         RETURNING *`,
        [
          tenantId, req.params.skuId, sku.skuCode, sku.description, sku.uom,
          sku.category, sku.hazardous, sku.weight, sku.dimensions,
          sku.reorderPoint, sku.reorderQty, sku.status, sku.qrPayload, sku.rfidEpc,
        ]
      );
      return result.rows[0] || null;
    });
    if (!updated) return res.status(404).json({ success: false, message: "SKU not found" });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ success: false, message: skuDuplicateMessage(err) });
    }
    sendRouteError(res, err);
  }
});

router.delete("/skus/:skuId", requireRole(skuManagerRoles), async (req, res) => {
  try {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }

    const tenantId = getTenantId(req);
    const result = await withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        `${skuSelectSql}
         WHERE tenant_id = $1
           AND sku_id = $2
         FOR UPDATE`,
        [tenantId, req.params.skuId]
      );
      if (!existing.rows[0]) return null;

      if (await skuHasReferences(client, tenantId, req.params.skuId)) {
        const deactivated = await client.query(
          `UPDATE public.skus
           SET status = 'inactive',
               updated_at = now()
           WHERE tenant_id = $1
             AND sku_id = $2
           RETURNING *`,
          [tenantId, req.params.skuId]
        );
        return { sku: deactivated.rows[0], deletionMode: "soft" };
      }

      await client.query("SAVEPOINT sku_delete");
      try {
        const deleted = await client.query(
          `DELETE FROM public.skus
           WHERE tenant_id = $1
             AND sku_id = $2
           RETURNING *`,
          [tenantId, req.params.skuId]
        );
        await client.query("RELEASE SAVEPOINT sku_delete");
        return { sku: deleted.rows[0], deletionMode: "hard" };
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT sku_delete");
        await client.query("RELEASE SAVEPOINT sku_delete");
        if (error.code !== "23503") throw error;

        const deactivated = await client.query(
          `UPDATE public.skus
           SET status = 'inactive',
               updated_at = now()
           WHERE tenant_id = $1
             AND sku_id = $2
           RETURNING *`,
          [tenantId, req.params.skuId]
        );
        return { sku: deactivated.rows[0], deletionMode: "soft" };
      }
    });

    if (!result) return res.status(404).json({ success: false, message: "SKU not found" });
    res.json({
      success: true,
      data: result.sku,
      deletionMode: result.deletionMode,
      message: result.deletionMode === "soft"
        ? "SKU is referenced by transactions and has been set to inactive."
        : "SKU deleted",
    });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({
        success: false,
        message: "SKU is referenced by transactions and could not be deleted.",
      });
    }
    sendRouteError(res, err);
  }
});

// ─── LOCATIONS ────────────────────────────────────────────────────────────────

router.get("/locations", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const locations = listInventoryLocations(tenantId, warehouseId);
    const zones = listInventoryZones(tenantId, warehouseId);
    const hydrated = locations.map((loc) => ({
      ...loc,
      zone_name: zones.find((z) => z.zone_id === loc.zone_id)?.zone_name || loc.zone_id,
    }));
    res.json({ success: true, data: hydrated, total: hydrated.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/locations", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || "WH000001";
    const { location_code, zone_id, capacity } = req.body;
    if (!location_code) return res.status(400).json({ success: false, message: "location_code is required" });
    if (!zone_id) return res.status(400).json({ success: false, message: "zone_id is required" });
    const maxId = db.inventory_locations.reduce((max, loc) => {
      const match = /LOC(\d+)/.exec(loc.location_id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const newLocation = {
      location_id: `LOC${String(maxId + 1).padStart(6, "0")}`,
      location_code: location_code.trim(),
      zone_id,
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      capacity: Number(capacity) || 100,
      used_qty: 0,
    };
    db.inventory_locations.push(newLocation);
    res.status(201).json({ success: true, data: newLocation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/locations/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const idx = db.inventory_locations.findIndex(
      (loc) => loc.tenant_id === tenantId && loc.location_id === req.params.id
    );
    if (idx < 0) return res.status(404).json({ success: false, message: "Location not found" });
    const { location_code, zone_id, capacity } = req.body;
    db.inventory_locations[idx] = {
      ...db.inventory_locations[idx],
      location_code: location_code ?? db.inventory_locations[idx].location_code,
      zone_id: zone_id ?? db.inventory_locations[idx].zone_id,
      capacity: capacity !== undefined ? Number(capacity) : db.inventory_locations[idx].capacity,
    };
    res.json({ success: true, data: db.inventory_locations[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/locations/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const idx = db.inventory_locations.findIndex(
      (loc) => loc.tenant_id === tenantId && loc.location_id === req.params.id
    );
    if (idx < 0) return res.status(404).json({ success: false, message: "Location not found" });
    db.inventory_locations.splice(idx, 1);
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/zones", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const zones = listInventoryZones(tenantId, warehouseId);
    res.json({ success: true, data: zones });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── WAREHOUSES ───────────────────────────────────────────────────────────────

router.get("/warehouses", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouses = listWarehouses(tenantId);
    res.json({ success: true, data: warehouses, total: warehouses.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/warehouses", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const { warehouse_name, city, country } = req.body;
    if (!warehouse_name) {
      return res.status(400).json({ success: false, message: "warehouse_name is required" });
    }
    const created = createWarehouse(tenantId, {
      warehouseName: warehouse_name,
      city: city || "",
      country: country || "",
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/warehouses/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const existing = getWarehouse(tenantId, req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Warehouse not found" });
    const updated = updateWarehouse(tenantId, req.params.id, {
      warehouse_name: req.body?.warehouse_name,
      city: req.body?.city,
      country: req.body?.country,
      is_active: req.body?.is_active,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/warehouses/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const existing = getWarehouse(tenantId, req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Warehouse not found" });
    deleteWarehouse(tenantId, req.params.id);
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

router.get("/customers", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    if (!db.customers) db.customers = [];
    const customers = db.customers.filter((c) => c.tenant_id === tenantId);
    res.json({ success: true, data: customers, total: customers.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/customers", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    if (!db.customers) db.customers = [];
    const { customer_name, contact, phone } = req.body;
    if (!customer_name) return res.status(400).json({ success: false, message: "customer_name is required" });
    const maxId = db.customers.reduce((max, c) => {
      const match = /CUS(\d+)/.exec(c.customer_id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const customer = {
      customer_id: `CUS${String(maxId + 1).padStart(6, "0")}`,
      customer_name: customer_name.trim(),
      contact: contact || "",
      phone: phone || "",
      tenant_id: tenantId,
    };
    db.customers.push(customer);
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/customers/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    if (!db.customers) db.customers = [];
    const idx = db.customers.findIndex(
      (c) => c.tenant_id === tenantId && c.customer_id === req.params.id
    );
    if (idx < 0) return res.status(404).json({ success: false, message: "Customer not found" });
    const { customer_name, contact, phone } = req.body;
    db.customers[idx] = {
      ...db.customers[idx],
      customer_name: customer_name ?? db.customers[idx].customer_name,
      contact: contact ?? db.customers[idx].contact,
      phone: phone ?? db.customers[idx].phone,
    };
    res.json({ success: true, data: db.customers[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/customers/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    if (!db.customers) db.customers = [];
    const idx = db.customers.findIndex(
      (c) => c.tenant_id === tenantId && c.customer_id === req.params.id
    );
    if (idx < 0) return res.status(404).json({ success: false, message: "Customer not found" });
    db.customers.splice(idx, 1);
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
