import express from "express";
import {
  listPickLists,
  getPickList,
  updatePickListStatusBySource,
} from "../data/store.js";

const router = express.Router();

// LIST PICK LISTS
router.get("/pick-lists", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const result = listPickLists({
      tenantId,
      warehouseId,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 10,
      search: req.query.search || "",
      status: req.query.status || "",
      waveId: req.query.wave_id || "",
      assignedUser: req.query.assigned_user || "",
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

// GET PICK LIST DETAIL
router.get("/pick-lists/:pickListId", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const pickList = getPickList(tenantId, req.params.pickListId, warehouseId);
    if (!pickList) {
      return res.status(404).json({ success: false, message: "Pick list not found" });
    }

    res.json({ success: true, data: pickList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE PICK LIST STATUS
router.post("/pick-lists/:pickListId/status", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const { status, source } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: "status is required" });
    }

    const result = updatePickListStatusBySource({
      tenantId,
      pickListId: req.params.pickListId,
      status,
      source: source || "PORTAL",
      userId: req.user_id || "USR000001",
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