import express from "express";
import {
  listInventoryZones,
  listInventoryLocations,
  listInventoryReasonCodes,
  getInventoryConfig,
  listInventorySummary,
  listSkus,
  listAdjustmentRequests,
  getAdjustmentRequest,
  createAdjustmentRequest,
  submitAdjustmentRequest,
  approveAdjustmentRequest,
  rejectAdjustmentRequest,
  cancelAdjustmentRequest,
} from "../../data/store.js";

const router = express.Router();

/* =========================
   OPTIONS
========================= */

router.get("/options", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const zones = listInventoryZones(tenantId, warehouseId);
    const locations = listInventoryLocations(tenantId, warehouseId);
    const reasonCodes = listInventoryReasonCodes(tenantId);
    const config = getInventoryConfig(tenantId);
    const skus = listSkus(tenantId, { pageSize: 999 })?.items || [];

    res.json({
      zones,
      locations,
      reason_codes: reasonCodes,
      count_config: config,
      skus,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* =========================
   SUMMARY
========================= */

router.get("/summary", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 10;

    const result = listInventorySummary({
      tenantId,
      warehouseId,
      page,
      pageSize,
      search: req.query.search || "",
      skuId: req.query.sku_id || "",
      locationId: req.query.location_id || "",
      zoneId: req.query.zone_id || "",
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* =========================
   COUNT PLANS
========================= */

// ✅ GET COUNT PLAN BY ID — mesti sebelum /:id/action routes
/* =========================
   ADJUSTMENTS
========================= */

router.get("/adjustments", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const result = listAdjustmentRequests({
      tenantId,
      warehouseId,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 10,
      search: req.query.search || "",
      status: req.query.status || "",
      skuId: req.query.sku_id || "",
      locationId: req.query.location_id || "",
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/adjustments/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const adj = getAdjustmentRequest(tenantId, req.params.id);
    if (!adj) return res.status(404).json({ message: "Adjustment not found" });
    res.json(adj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/adjustments", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const result = createAdjustmentRequest({
      tenantId,
      warehouseId,
      requestedBy: req.user_id || "USR000001",
      skuId: req.body.sku_id,
      locationId: req.body.location_id,
      qtyDelta: req.body.qty_delta,
      reasonCode: req.body.reason_code,
    });

    if (result.error) return res.status(400).json({ message: result.error });
    res.status(201).json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/adjustments/:id/submit", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const result = submitAdjustmentRequest({ tenantId, adjId: req.params.id });
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/adjustments/:id/approve", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const result = approveAdjustmentRequest({
      tenantId,
      adjId: req.params.id,
      approvedBy: req.user_id || "USR000001",
      approvalNote: req.body.approval_note || "",
    });
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/adjustments/:id/reject", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const result = rejectAdjustmentRequest({
      tenantId,
      adjId: req.params.id,
      approvedBy: req.user_id || "USR000001",
      reason: req.body.reason || "",
    });
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/adjustments/:id/cancel", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const result = cancelAdjustmentRequest({
      tenantId,
      adjId: req.params.id,
      cancelledBy: req.user_id || "USR000001",
      reason: req.body.reason || "",
    });
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
