import express from "express";
import {
  listPackOrders,
  getPackOrder,
  getPickList,
  listPackagingTypes,
  confirmPackingOrder,
} from "../data/store.js";

const router = express.Router();

router.get("/orders", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const result = listPackOrders({
      tenantId,
      warehouseId,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 10,
      search: req.query.search || "",
      status: req.query.status || "",
      pickListId: req.query.pickListId || "",
    });

    res.json({
      success: true,
      data: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/orders/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const item = getPackOrder(tenantId, req.params.id, warehouseId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Pack order not found" });
    }

    const pickList = getPickList(tenantId, item.pick_list_id, warehouseId);
    const hydrated = {
      ...item,
      pick_list_status: pickList?.status || null,
      lines: pickList?.lines || [],
    };

    res.json({ success: true, data: hydrated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/options", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const types = listPackagingTypes(tenantId);
    res.json({ success: true, packaging_types: types });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CONFIRM PACKING — handle semua dalam satu route
router.post("/orders/:id/confirm-pack", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const userId = req.headers["x-user-id"] || "USR000001";
    const { weight_kg, packaging_type } = req.body;

    if (!weight_kg || Number(weight_kg) <= 0) {
      return res.status(400).json({ success: false, message: "weight_kg is required and must be positive" });
    }

    if (!packaging_type) {
      return res.status(400).json({ success: false, message: "packaging_type is required" });
    }

    const result = confirmPackingOrder({
    tenantId,
    warehouseId,
    packId: req.params.id,
    weightKg: weight_kg,
    packagingType: packaging_type,  // TAMBAH
    source: "PORTAL",
    userId,
    warehouseId,
    });

    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;