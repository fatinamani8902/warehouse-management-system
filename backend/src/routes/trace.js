import express from "express";
import { listTraceTimeline, searchTraceEvents } from "../data/store.js";

const router = express.Router();

// GET /trace/events
router.get("/events", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const mode = String(req.query.mode || "global").toLowerCase();
    const filterType = String(req.query.type || "").toLowerCase();
    const filterValue = String(req.query.value || "").trim();
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;

    const result = listTraceTimeline({
      tenantId,
      warehouseId,
      mode: mode === "filtered" && filterType && filterValue ? "filtered" : "global",
      filterType,
      filterValue,
      page,
      pageSize,
    });

    res.json({
      success: true,
      mode: result.mode,
      filter: result.filter,
      context: result.context,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /trace/search
router.get("/search", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const result = searchTraceEvents({
      tenantId,
      warehouseId,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      sku: req.query.sku || "",
      epc: req.query.epc || "",
      qrPayload: req.query.qrPayload || "",
      reference: req.query.reference || "",
    });

    res.json({
      success: true,
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;