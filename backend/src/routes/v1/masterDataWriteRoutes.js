import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import {
  createCustomer,
  createLocation,
  createSku,
  createSupplier,
  createWarehouse,
  deleteCustomer,
  deleteLocation,
  deleteSku,
  deleteSupplier,
  deleteWarehouse,
  updateCustomer,
  updateLocation,
  updateSku,
  updateSupplier,
  updateWarehouse,
} from "../../repositories/MasterDataWriteRepository.js";

const router = express.Router();
const skuManagerRoles = ["superadmin", "hqadmin", "storemanager"];
const masterDataManagerRoles = ["superadmin", "hqadmin", "storemanager"];

function tenantId(req) {
  return req.context?.tenantId;
}

function warehouseId(req) {
  return req.headers["x-warehouse-id"] || req.body?.warehouse_id || null;
}

function sendError(res, error) {
  if (error?.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({ success: false, message: "Record already exists" });
  }
  if (error?.name === "SequelizeForeignKeyConstraintError" || error?.parent?.code === "23503") {
    return res.status(409).json({ success: false, message: error.message || "Record is in use" });
  }
  return res.status(error.statusCode || error.status || 500).json({ success: false, message: error.message || "Unexpected server error" });
}

router.post("/suppliers", async (req, res) => {
  try {
    return res.status(201).json({ success: true, data: await createSupplier(tenantId(req), req.body) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/suppliers/:id", async (req, res) => {
  try {
    const supplier = await updateSupplier(tenantId(req), req.params.id, req.body);
    if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });
    return res.json({ success: true, data: supplier });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/suppliers/:id", async (req, res) => {
  try {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }
    const result = await deleteSupplier(tenantId(req), req.params.id);
    if (!result) return res.status(404).json({ success: false, message: "Supplier not found" });
    return res.json({ success: true, data: result.row });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/skus", requireRole(skuManagerRoles), async (req, res) => {
  try {
    return res.status(201).json({ success: true, data: await createSku(tenantId(req), req.body) });
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "SKU code or description already exists for this tenant" });
    }
    return sendError(res, error);
  }
});

router.put("/skus/:skuId", requireRole(skuManagerRoles), async (req, res) => {
  try {
    const sku = await updateSku(tenantId(req), req.params.skuId, req.body);
    if (!sku) return res.status(404).json({ success: false, message: "SKU not found" });
    return res.json({ success: true, data: sku });
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "SKU code or description already exists for this tenant" });
    }
    return sendError(res, error);
  }
});

router.delete("/skus/:skuId", requireRole(skuManagerRoles), async (req, res) => {
  try {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }
    const result = await deleteSku(tenantId(req), req.params.skuId);
    if (!result) return res.status(404).json({ success: false, message: "SKU not found" });
    return res.json({
      success: true,
      data: result.row,
      deletionMode: result.deletionMode,
      message: result.deletionMode === "soft"
        ? "SKU is referenced by transactions and has been set to inactive."
        : "SKU deleted",
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/warehouses", async (req, res) => {
  try {
    return res.status(201).json({ success: true, data: await createWarehouse(tenantId(req), req.body) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/warehouses/:id", async (req, res) => {
  try {
    const warehouse = await updateWarehouse(tenantId(req), req.params.id, req.body);
    if (!warehouse) return res.status(404).json({ success: false, message: "Warehouse not found" });
    return res.json({ success: true, data: warehouse });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/warehouses/:id", async (req, res) => {
  try {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }
    const result = await deleteWarehouse(tenantId(req), req.params.id);
    if (!result) return res.status(404).json({ success: false, message: "Warehouse not found" });
    return res.json({ success: true, data: result.row });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/customers", async (req, res) => {
  try {
    return res.status(201).json({ success: true, data: await createCustomer(tenantId(req), req.body) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/customers/:id", async (req, res) => {
  try {
    const customer = await updateCustomer(tenantId(req), req.params.id, req.body);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    return res.json({ success: true, data: customer });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }
    const result = await deleteCustomer(tenantId(req), req.params.id);
    if (!result) return res.status(404).json({ success: false, message: "Customer not found" });
    return res.json({ success: true, data: result.row });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/locations", requireRole(masterDataManagerRoles), async (req, res) => {
  try {
    const wid = warehouseId(req);
    if (!wid) {
      return res.status(400).json({ success: false, message: "warehouse_id is required" });
    }
    return res.status(201).json({ success: true, data: await createLocation(tenantId(req), wid, req.body) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/locations/:id", requireRole(masterDataManagerRoles), async (req, res) => {
  try {
    const wid = warehouseId(req);
    if (!wid) {
      return res.status(400).json({ success: false, message: "warehouse_id is required" });
    }
    const location = await updateLocation(tenantId(req), req.params.id, wid, req.body);
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    return res.json({ success: true, data: location });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/locations/:id", requireRole(masterDataManagerRoles), async (req, res) => {
  try {
    const wid = warehouseId(req);
    if (!wid) {
      return res.status(400).json({ success: false, message: "warehouse_id is required" });
    }
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }
    const result = await deleteLocation(tenantId(req), req.params.id);
    if (!result) return res.status(404).json({ success: false, message: "Location not found" });
    return res.json({ success: true, data: result.row });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
