import express from "express";
import { listShipments, db } from "../data/store.js";

const router = express.Router();

// LIST SHIPMENTS
router.get("/", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;

    const result = listShipments({
      tenantId,
      warehouseId,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 10,
      search: req.query.search || "",
      status: req.query.status || "",
      carrier: req.query.carrier || "",
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

// DISPATCH SHIPMENT
router.post("/:id/dispatch", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const { carrier, tracking_no } = req.body;

    if (!carrier) {
      return res.status(400).json({ success: false, message: "carrier is required" });
    }

    if (!tracking_no) {
      return res.status(400).json({ success: false, message: "tracking_no is required" });
    }

    const idx = db.shipments.findIndex(
      (s) => s.tenant_id === tenantId && s.shipment_id === req.params.id
    );

    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Shipment not found" });
    }

    if (db.shipments[idx].status === "dispatched") {
      return res.status(400).json({ success: false, message: "Shipment already dispatched" });
    }

    if (!["packed", "carton_generated"].includes(db.shipments[idx].status)) {
      return res.status(400).json({ success: false, message: `Cannot dispatch shipment with status ${db.shipments[idx].status}` });
    }

    const now = new Date().toISOString();
    db.shipments[idx] = {
      ...db.shipments[idx],
      carrier,
      tracking_no,
      status: "dispatched",
      dispatched_at: now,
      updated_at: now,
      updated_by: req.headers["x-user-id"] || "USR000001",
    };

    res.json({ success: true, data: db.shipments[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CLOSE SHIPMENT
router.post("/:id/close", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";

    const idx = db.shipments.findIndex(
      (s) => s.tenant_id === tenantId && s.shipment_id === req.params.id
    );

    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Shipment not found" });
    }

    if (db.shipments[idx].status !== "dispatched") {
      return res.status(400).json({ success: false, message: "Only dispatched shipments can be closed" });
    }

    const now = new Date().toISOString();
    db.shipments[idx] = {
      ...db.shipments[idx],
      status: "closed",
      updated_at: now,
      updated_by: req.headers["x-user-id"] || "USR000001",
    };

    res.json({ success: true, data: db.shipments[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CANCEL SHIPMENT
router.post("/:id/cancel", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: "reason is required" });
    }

    const idx = db.shipments.findIndex(
      (s) => s.tenant_id === tenantId && s.shipment_id === req.params.id
    );

    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Shipment not found" });
    }

    const cancelable = ["pending", "packed", "carton_generated"];
    if (!cancelable.includes(db.shipments[idx].status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel shipment with status ${db.shipments[idx].status}`,
      });
    }

    const now = new Date().toISOString();
    db.shipments[idx] = {
      ...db.shipments[idx],
      status: "cancelled",
      cancellation_reason: reason.trim(),
      updated_at: now,
      updated_by: req.headers["x-user-id"] || "USR000001",
    };

    res.json({ success: true, data: db.shipments[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;