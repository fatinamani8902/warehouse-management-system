import express from "express";
import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  listAsns,
  listGrns,
  listSuppliers,
  updateSupplier,
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from "../data/store.js";

const router = express.Router();

// ── SUPPLIER ROUTES ──
router.get("/suppliers", (req, res) => {
  const tenantId = req.tenant_id;
  const suppliers = listSuppliers(tenantId).map((item) => ({
    supplier_id: item.supplier_id,
    supplier_name: item.supplier_name,
    is_active: item.is_active,
  }));
  return res.json(suppliers);
});

router.post("/suppliers", (req, res) => {
  const tenantId = req.tenant_id;
  const supplierName = String(req.body?.supplier_name || "").trim();
  const isActive = req.body?.is_active === undefined ? true : Boolean(req.body?.is_active);
  if (!supplierName) {
    return res.status(400).json({ message: "supplier_name is required" });
  }
  const created = createSupplier(tenantId, supplierName, isActive);
  return res.status(201).json(created);
});

router.put("/suppliers/:supplier_id", (req, res) => {
  const tenantId = req.tenant_id;
  const supplierId = req.params.supplier_id;
  const existing = getSupplier(tenantId, supplierId);
  if (!existing) {
    return res.status(404).json({ message: "Supplier not found" });
  }
  const supplierName = req.body?.supplier_name;
  if (supplierName !== undefined && !String(supplierName).trim()) {
    return res.status(400).json({ message: "supplier_name cannot be empty" });
  }
  const updated = updateSupplier(tenantId, supplierId, {
    supplier_name: supplierName === undefined ? undefined : String(supplierName).trim(),
    is_active: req.body?.is_active,
  });
  return res.json(updated);
});

router.delete("/suppliers/:supplier_id", (req, res) => {
  const tenantId = req.tenant_id;
  const supplierId = req.params.supplier_id;
  const relatedAsn = listAsns(tenantId).some((item) => item.supplier_id === supplierId);
  const relatedGrn = listGrns(tenantId).some((item) => item.supplier_id === supplierId);
  if (relatedAsn || relatedGrn) {
    return res.status(409).json({
      message: "Supplier is referenced by inbound documents. Deactivate instead of deleting.",
    });
  }
  const deleted = deleteSupplier(tenantId, supplierId);
  if (!deleted) {
    return res.status(404).json({ message: "Supplier not found" });
  }
  return res.status(204).send();
});

// ── WAREHOUSE ROUTES ──
router.get("/warehouses", (req, res) => {
  const warehouses = listWarehouses(req.tenant_id);
  return res.json({ data: warehouses });
});

router.post("/warehouses", (req, res) => {
  const warehouseName = String(req.body?.warehouse_name || "").trim();
  const city = String(req.body?.city || "").trim();
  const country = String(req.body?.country || "").trim();
  if (!warehouseName) {
    return res.status(400).json({ message: "warehouse_name is required" });
  }
  const created = createWarehouse(req.tenant_id, { warehouseName, city, country });
  return res.status(201).json({ data: created });
});

router.put("/warehouses/:warehouse_id", (req, res) => {
  const existing = getWarehouse(req.tenant_id, req.params.warehouse_id);
  if (!existing) {
    return res.status(404).json({ message: "Warehouse not found" });
  }
  const updated = updateWarehouse(req.tenant_id, req.params.warehouse_id, {
    warehouse_name: req.body?.warehouse_name,
    city: req.body?.city,
    country: req.body?.country,
    is_active: req.body?.is_active,
  });
  return res.json({ data: updated });
});

router.delete("/warehouses/:warehouse_id", (req, res) => {
  const existing = getWarehouse(req.tenant_id, req.params.warehouse_id);
  if (!existing) {
    return res.status(404).json({ message: "Warehouse not found" });
  }
  deleteWarehouse(req.tenant_id, req.params.warehouse_id);
  return res.status(204).send();
});

export default router;