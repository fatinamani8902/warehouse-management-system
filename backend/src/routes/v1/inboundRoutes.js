import express from "express";
import {
  listAsns,
  getAsn,
  createAsn,
  updateAsn,
  listGrns,
  getGrn,
  createGrn,
  updateGrn
} from "../../data/store.js";

const router = express.Router();

/* =======================================
   ASN ROUTES
======================================= */

router.get("/asn", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const asns = listAsns(tenantId);
    res.json({ success: true, data: asns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/asn/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const asn = getAsn(tenantId, req.params.id);
    if (!asn) return res.status(404).json({ success: false, message: "ASN not found" });
    res.json({ success: true, data: asn });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/asn", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const result = createAsn({
      tenantId,
      warehouseId: req.body.warehouse_id || null,
      userId: "USR000001",
      supplierId: req.body.supplier_id,
      eta: req.body.eta,
      notes: req.body.notes,
      linesCount: req.body.lines_count
    });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =======================================
   ASN TRANSITIONS
======================================= */

const ASN_TRANSITIONS = {
  "submit":            { from: ["draft"],                          to: "pending" },
  "mark-in-transit":   { from: ["pending"],                        to: "in_transit" },
  "mark_in_transit":   { from: ["pending"],                        to: "in_transit" },
  "mark-arrived":      { from: ["pending", "in_transit"],          to: "arrived" },
  "mark_arrived":      { from: ["pending", "in_transit"],          to: "arrived" },
  "close":             { from: ["arrived"],                        to: "closed" },
  "cancel":            { from: ["draft", "pending", "in_transit"], to: "cancelled" },
};

router.post("/asn/:id/:action", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const { id, action } = req.params;

    const transition = ASN_TRANSITIONS[action];
    if (!transition) return res.status(400).json({ success: false, message: `Unknown action: ${action}` });

    const asn = getAsn(tenantId, id);
    if (!asn) return res.status(404).json({ success: false, message: "ASN not found" });

    if (!transition.from.includes(asn.status)) {
      return res.status(400).json({ success: false, message: `Cannot ${action} ASN with status '${asn.status}'` });
    }

    const updated = updateAsn(tenantId, id, (current) => ({
      ...current,
      status: transition.to,
      cancellation_reason: action === "cancel" ? (req.body.cancellation_reason || req.body.reason || null) : current.cancellation_reason,
      cancelled_by: action === "cancel" ? "USR000001" : current.cancelled_by,
      cancelled_at: action === "cancel" ? new Date().toISOString() : current.cancelled_at,
      updated_at: new Date().toISOString(),
    }));

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =======================================
   GRN ROUTES
======================================= */

router.get("/grn", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const grns = listGrns(tenantId);
    res.json({ success: true, data: grns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/grn/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const grn = getGrn(tenantId, req.params.id);
    if (!grn) return res.status(404).json({ success: false, message: "GRN not found" });
    res.json({ success: true, data: grn });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/grn", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const { asn_id } = req.body;
    if (!asn_id) return res.status(400).json({ success: false, message: "asn_id is required" });

    const asn = getAsn(tenantId, asn_id);
    if (!asn) return res.status(400).json({ success: false, message: "ASN not found" });

    const result = createGrn({
      tenantId,
      warehouseId: asn.warehouse_id || null,
      userId: "USR000001",
      asnId: asn.asn_id
    });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =======================================
   GRN TRANSITIONS
======================================= */

const GRN_TRANSITIONS = {
  "start_receiving": { from: ["draft"],      to: "receiving" },
  "complete":        { from: ["receiving"],  to: "completed" },
  "post":            { from: ["completed"],  to: "posted" },
  "cancel":          { from: ["draft", "receiving", "completed"], to: "cancelled" },
};

router.post("/grn/:id/:action", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const { id, action } = req.params;

    const transition = GRN_TRANSITIONS[action];
    if (!transition) return res.status(400).json({ success: false, message: `Unknown action: ${action}` });

    const grn = getGrn(tenantId, id);
    if (!grn) return res.status(404).json({ success: false, message: "GRN not found" });

    if (!transition.from.includes(grn.status)) {
      return res.status(400).json({ success: false, message: `Cannot ${action} GRN with status '${grn.status}'` });
    }

    const updated = updateGrn(tenantId, id, (current) => ({
      ...current,
      status: transition.to,
      cancellation_reason: action === "cancel" ? (req.body.cancellation_reason || req.body.reason || null) : current.cancellation_reason,
      cancelled_by: action === "cancel" ? "USR000001" : current.cancelled_by,
      cancelled_at: action === "cancel" ? new Date().toISOString() : current.cancelled_at,
      updated_at: new Date().toISOString(),
    }));

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/grn/:id/lines", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const { lines } = req.body;

    if (!Array.isArray(lines)) {
      return res.status(400).json({ success: false, message: "lines must be an array" });
    }

    const grn = getGrn(tenantId, req.params.id);
    if (!grn) return res.status(404).json({ success: false, message: "GRN not found" });

    if (grn.status !== "receiving") {
      return res.status(400).json({ success: false, message: "GRN must be in receiving status to update lines" });
    }

    const updated = updateGrn(tenantId, req.params.id, (current) => ({
      ...current,
      lines: current.lines.map((line) => {
        const incoming = lines.find((l) => l.line_no === line.line_no);
        if (!incoming) return line;
        return {
          ...line,
          received_qty: Number(incoming.received_qty) ?? line.received_qty,
        };
      }),
      updated_at: new Date().toISOString(),
    }));

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;