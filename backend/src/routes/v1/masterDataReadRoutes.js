import express from "express";
import {
  getCustomer,
  getSku,
  getSupplier,
  getTaxonomyResource,
  getWarehouse,
  listCustomers,
  listMasterLocations,
  listSkus,
  listSuppliers,
  listTaxonomyResource,
  listWarehouseTaxonomyTree,
  listWarehouses,
  lookupSkus,
} from "../../repositories/MasterDataReadRepository.js";
import { buildPagination } from "../../utils/pagination.js";

const router = express.Router();

function parsePositiveInt(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

router.get("/suppliers", async (req, res, next) => {
  try {
    const result = await listSuppliers({
      tenantId: req.context.tenantId,
      search: req.query.search,
      page: parsePositiveInt(req.query.page, 1, 1000000),
      pageSize: parsePositiveInt(req.query.pageSize, 20, 100),
    });

    res.json({
      success: true,
      data: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      meta: { pagination: buildPagination(result.page, result.pageSize, result.total) },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/suppliers/:id", async (req, res, next) => {
  try {
    const supplier = await getSupplier({
      tenantId: req.context.tenantId,
      supplierId: req.params.id,
    });
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    return res.json({ success: true, data: supplier });
  } catch (error) {
    return next(error);
  }
});

router.get("/skus", async (req, res, next) => {
  try {
    const result = await listSkus({
      tenantId: req.context.tenantId,
      search: req.query.search,
      status: req.query.status,
      page: parsePositiveInt(req.query.page, 1, 1000000),
      pageSize: parsePositiveInt(req.query.pageSize, 20, 100),
    });

    return res.json({
      data: result.rows,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/skus/lookup", async (req, res, next) => {
  try {
    const rows = await lookupSkus({
      tenantId: req.context.tenantId,
      search: req.query.search,
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/skus/:skuId", async (req, res, next) => {
  try {
    const sku = await getSku({
      tenantId: req.context.tenantId,
      skuId: req.params.skuId,
    });
    if (!sku) {
      return res.status(404).json({ success: false, message: "SKU not found" });
    }
    return res.json({ success: true, data: sku });
  } catch (error) {
    return next(error);
  }
});

router.get("/warehouses", async (req, res, next) => {
  try {
    const rows = await listWarehouses({
      tenantId: req.context.tenantId,
      search: req.query.search,
    });
    return res.json({ success: true, data: rows, total: rows.length });
  } catch (error) {
    return next(error);
  }
});

router.get("/warehouses/:id", async (req, res, next) => {
  try {
    const warehouse = await getWarehouse({
      tenantId: req.context.tenantId,
      warehouseId: req.params.id,
    });
    if (!warehouse) {
      return res.status(404).json({ success: false, message: "Warehouse not found" });
    }
    return res.json({ success: true, data: warehouse });
  } catch (error) {
    return next(error);
  }
});

router.get("/customers", async (req, res, next) => {
  try {
    const result = await listCustomers({
      tenantId: req.context.tenantId,
      search: req.query.search,
      page: parsePositiveInt(req.query.page, 1, 1000000),
      pageSize: parsePositiveInt(req.query.pageSize, 20, 100),
    });

    return res.json({ success: true, data: result.rows, total: result.total });
  } catch (error) {
    return next(error);
  }
});

router.get("/customers/:id", async (req, res, next) => {
  try {
    const customer = await getCustomer({
      tenantId: req.context.tenantId,
      customerId: req.params.id,
    });
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    return res.json({ success: true, data: customer });
  } catch (error) {
    return next(error);
  }
});

router.get("/locations", async (req, res, next) => {
  try {
    const rows = await listMasterLocations({
      tenantId: req.context.tenantId,
      warehouseId: req.headers["x-warehouse-id"] || req.query.warehouse_id || "",
    });

    return res.json({ success: true, data: rows, total: rows.length });
  } catch (error) {
    return next(error);
  }
});

router.get("/taxonomy/tree", async (req, res, next) => {
  try {
    const result = await listWarehouseTaxonomyTree({
      tenantId: req.context.tenantId,
      search: req.query.search,
      page: parsePositiveInt(req.query.page, 1, 1000000),
      pageSize: parsePositiveInt(req.query.pageSize, 10, 100),
    });

    return res.json({
      success: true,
      data: result.rows,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/taxonomy/:resource", async (req, res, next) => {
  try {
    if (req.params.resource === "warehouses") {
      const rows = await listWarehouses({
        tenantId: req.context.tenantId,
        search: req.query.search,
      });
      const page = parsePositiveInt(req.query.page, 1, 1000000);
      const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
      const total = rows.length;
      const pagination = buildPagination(page, pageSize, total);
      return res.json({
        success: true,
        data: rows.slice((pagination.page - 1) * pagination.pageSize, (pagination.page - 1) * pagination.pageSize + pagination.pageSize),
        ...pagination,
      });
    }

    const result = await listTaxonomyResource(req.params.resource, {
      tenantId: req.context.tenantId,
      warehouseId: req.query.warehouse_id || "",
      zoneId: req.query.zone_id || "",
      aisleId: req.query.aisle_id || "",
      bayId: req.query.bay_id || "",
      levelId: req.query.level_id || "",
      search: req.query.search,
      status: req.query.status,
      page: parsePositiveInt(req.query.page, 1, 1000000),
      pageSize: parsePositiveInt(req.query.pageSize, 20, 100),
    });

    return res.json({
      success: true,
      data: result.rows,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/taxonomy/:resource/:id", async (req, res, next) => {
  try {
    if (req.params.resource === "warehouses") {
      const warehouse = await getWarehouse({
        tenantId: req.context.tenantId,
        warehouseId: req.params.id,
      });
      if (!warehouse) {
        return res.status(404).json({ success: false, message: "Warehouse not found" });
      }
      return res.json({ success: true, data: warehouse });
    }

    const row = await getTaxonomyResource(req.params.resource, req.params.id, {
      tenantId: req.context.tenantId,
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

export default router;
