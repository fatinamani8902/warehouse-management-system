import express from "express";
import {
  listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier,
  listSkus, getSkuById, createSku, updateSku, deleteSku,
  listInventoryLocations, getInventoryLocation,
  listInventoryZones,
  listWarehouses, getWarehouse, createWarehouse, updateWarehouse, deleteWarehouse,
  db,
} from "../../data/store.js";

const router = express.Router();

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

router.get("/suppliers", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const suppliers = listSuppliers(tenantId);
    res.json({ success: true, data: suppliers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/suppliers/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const supplier = getSupplier(tenantId, req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });
    res.json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/suppliers", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const { supplier_name, is_active } = req.body;
    if (!supplier_name) return res.status(400).json({ success: false, message: "supplier_name is required" });
    const supplier = createSupplier(tenantId, supplier_name, is_active ?? true);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/suppliers/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const supplier = updateSupplier(tenantId, req.params.id, req.body);
    if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });
    res.json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/suppliers/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const deleted = deleteSupplier(tenantId, req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Supplier not found" });
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SKU MASTER ───────────────────────────────────────────────────────────────

router.get("/skus", (req, res) => {
  try {
    const result = listSkus({
      search: req.query.search || "",
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
    });
    res.json({ success: true, data: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/skus/:id", (req, res) => {
  try {
    const sku = getSkuById(req.params.id);
    if (!sku) return res.status(404).json({ success: false, message: "SKU not found" });
    res.json({ success: true, data: sku });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/skus", (req, res) => {
  try {
    const { sku_id, description, uom_id, epc_value } = req.body;
    const result = createSku({ skuId: sku_id, description, uomId: uom_id, epcValue: epc_value });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    res.status(201).json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/skus/:id", (req, res) => {
  try {
    const { description, uom_id, epc_value } = req.body;
    const updated = updateSku(req.params.id, { description, uomId: uom_id, epcValue: epc_value });
    if (!updated) return res.status(404).json({ success: false, message: "SKU not found" });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/skus/:id", (req, res) => {
  try {
    const deleted = deleteSku(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "SKU not found" });
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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