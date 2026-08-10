import express from "express";
import { query } from "express-validator";
import {
  createAsn,
  createGrn,
  getAsn,
  getGrn,
  listAsns,
  listGrns,
  updateAsn,
  updateGrn,
} from "../data/store.js";
import { handleValidationResult } from "../middleware/validation.js";
import { recordStatusTransitionAudit } from "../services/auditLog.js";
import { canCancelDocument, canTransition } from "../services/rbac.js";

const router = express.Router();

const ASN_LOCKED = ["closed", "cancelled"];
const GRN_LOCKED = ["posted", "cancelled"];
const ASN_LIST_STATUSES = ["draft", "pending", "in_transit", "arrived", "closed", "cancelled", "open"];
const GRN_LIST_STATUSES = ["draft", "receiving", "completed", "posted", "cancelled", "open"];

const asnActionTransitions = {
  submit: { from: "draft", to: "pending" },
  mark_in_transit: { from: "pending", to: "in_transit" },
  mark_arrived: { from: "in_transit", to: "arrived" },
  close: { from: "arrived", to: "closed" },
};

const grnActionTransitions = {
  start_receiving: { from: "draft", to: "receiving" },
  complete: { from: "receiving", to: "completed" },
  post: { from: "completed", to: "posted" },
};

function getAsnTransition(currentStatus, action) {
  const transition = asnActionTransitions[action];
  if (!transition) {
    return { error: "Invalid ASN transition action" };
  }

  if (currentStatus !== transition.from) {
    return { error: `Action ${action} not allowed from ${currentStatus}` };
  }

  return { to: transition.to };
}

function getGrnTransition(grn, action) {
  const transition = grnActionTransitions[action];
  if (!transition) {
    return { error: "Invalid GRN transition action" };
  }

  if (grn.status !== transition.from) {
    return { error: `Action ${action} not allowed from ${grn.status}` };
  }

  if (action === "complete") {
    const hasLines = Array.isArray(grn.lines) && grn.lines.length > 0;
    if (!hasLines) {
      return { error: "Cannot complete GRN without line items" };
    }

    const allReceived = grn.lines.every((line) => {
      const expected = Number(line.expected_qty || 0);
      const received = Number(line.received_qty);
      return Number.isFinite(received) && received >= expected;
    });

    if (!allReceived) {
      return { error: "Cannot complete GRN until all expected quantities are received" };
    }
  }

  return { to: transition.to };
}

function validateCancelPayload(body) {
  const documentId = String(body?.document_id || "").trim();
  const documentType = String(body?.document_type || "").trim().toLowerCase();
  const cancellationReason = String(body?.cancellation_reason || "").trim();

  if (!documentId) {
    return { error: "document_id is required" };
  }

  if (!["asn", "grn"].includes(documentType)) {
    return { error: "document_type must be \"asn\" or \"grn\"" };
  }

  if (!cancellationReason) {
    return { error: "cancellation_reason is required" };
  }

  if (cancellationReason.length < 5) {
    return { error: "cancellation_reason must be at least 5 characters" };
  }

  return { documentId, documentType, cancellationReason };
}

function isToday(value) {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const now = new Date();
  return parsed.getFullYear() === now.getFullYear()
    && parsed.getMonth() === now.getMonth()
    && parsed.getDate() === now.getDate();
}

function paginate(rows, page, pageSize) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const total = rows.length;
  const offset = (safePage - 1) * safePageSize;

  return {
    items: rows.slice(offset, offset + safePageSize),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

router.get(
  "/asn",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
    query("pageSize").optional().isInt({ min: 1, max: 200 }).withMessage("pageSize must be between 1 and 200"),
    query("status")
      .optional()
      .trim()
      .toLowerCase()
      .isIn(ASN_LIST_STATUSES)
      .withMessage(`status must be one of: ${ASN_LIST_STATUSES.join(", ")}`),
    query("date")
      .optional()
      .trim()
      .toLowerCase()
      .isIn(["today"])
      .withMessage("date must be today"),
    handleValidationResult,
  ],
  (req, res) => {
    const status = String(req.query.status || "").toLowerCase();
    const date = String(req.query.date || "").toLowerCase();
    let rows = listAsns(req.tenant_id);

    if (status === "open") {
      rows = rows.filter((item) => !ASN_LOCKED.includes(String(item.status || "").toLowerCase()));
    } else if (status) {
      rows = rows.filter((item) => String(item.status || "").toLowerCase() === status);
    }

    if (date === "today") {
      rows = rows.filter((item) => isToday(item.created_at));
    }

    return res.json(paginate(rows, req.query.page || 1, req.query.pageSize || 10));
  },
);

router.post("/asn", (req, res) => {
  const supplierId = String(req.body?.supplier_id || "").trim();
  if (!supplierId) {
    return res.status(400).json({ message: "supplier_id is required" });
  }

  const result = createAsn({
    tenantId: req.tenant_id,
    warehouseId: req.session.warehouse_id,
    userId: req.session.user_id,
    supplierId,
    eta: req.body?.eta,
    notes: req.body?.notes,
    linesCount: req.body?.lines_count,
  });

  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  return res.status(201).json(result.data);
});

router.post("/asn/:asn_id/transition", (req, res) => {
  const tenantId = req.tenant_id;
  const asnId = req.params.asn_id;
  const action = String(req.body?.action || "").trim();

  if (!action) {
    return res.status(400).json({ message: "action is required" });
  }

  if (action === "cancel") {
    return res.status(400).json({
      message: "Use POST /api/inbound/cancel with cancellation_reason for cancellation.",
    });
  }

  if (!canTransition(req.session.role_id, "asn", action)) {
    return res.status(403).json({ message: "You do not have permission for this ASN action" });
  }

  const current = getAsn(tenantId, asnId);
  if (!current) {
    return res.status(404).json({ message: "ASN not found" });
  }

  const transition = getAsnTransition(current.status, action);
  if (transition.error) {
    return res.status(400).json({ message: transition.error });
  }

  const now = new Date().toISOString();
  const updated = updateAsn(tenantId, asnId, (asn) => ({
    ...asn,
    status: transition.to,
    updated_at: now,
  }));

  recordStatusTransitionAudit({
    tenant_id: tenantId,
    user_id: req.session.user_id,
    entity_type: "asn",
    entity_id: asnId,
    from_status: current.status,
    to_status: transition.to,
    action,
    source: "PORTAL",
  });

  return res.json(updated);
});

router.get(
  "/grn",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
    query("pageSize").optional().isInt({ min: 1, max: 200 }).withMessage("pageSize must be between 1 and 200"),
    query("status")
      .optional()
      .trim()
      .toLowerCase()
      .isIn(GRN_LIST_STATUSES)
      .withMessage(`status must be one of: ${GRN_LIST_STATUSES.join(", ")}`),
    query("date")
      .optional()
      .trim()
      .toLowerCase()
      .isIn(["today"])
      .withMessage("date must be today"),
    handleValidationResult,
  ],
  (req, res) => {
    const status = String(req.query.status || "").toLowerCase();
    const date = String(req.query.date || "").toLowerCase();
    let rows = listGrns(req.tenant_id);

    if (status === "open") {
      rows = rows.filter((item) => !GRN_LOCKED.includes(String(item.status || "").toLowerCase()));
    } else if (status) {
      rows = rows.filter((item) => String(item.status || "").toLowerCase() === status);
    }

    if (date === "today") {
      rows = rows.filter((item) => isToday(item.created_at));
    }

    return res.json(paginate(rows, req.query.page || 1, req.query.pageSize || 10));
  },
);

router.post("/grn", (req, res) => {
  const asnId = req.body?.asn_id ? String(req.body.asn_id).trim() : "";
  const supplierId = req.body?.supplier_id ? String(req.body.supplier_id).trim() : "";

  if (!asnId && !supplierId) {
    return res.status(400).json({ message: "supplier_id is required when asn_id is not provided" });
  }

  const result = createGrn({
    tenantId: req.tenant_id,
    warehouseId: req.session.warehouse_id,
    userId: req.session.user_id,
    asnId: asnId || null,
    supplierId: supplierId || null,
    receivedDate: req.body?.received_date,
    notes: req.body.notes || null,
    lines: req.body?.lines,
  });

  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  return res.status(201).json(result.data);
});

router.post("/grn/:grn_id/transition", (req, res) => {
  const tenantId = req.tenant_id;
  const grnId = req.params.grn_id;
  const action = String(req.body?.action || "").trim();

  if (!action) {
    return res.status(400).json({ message: "action is required" });
  }

  if (action === "cancel") {
    return res.status(400).json({
      message: "Use POST /api/inbound/cancel with cancellation_reason for cancellation.",
    });
  }

  if (!canTransition(req.session.role_id, "grn", action)) {
    return res.status(403).json({ message: "You do not have permission for this GRN action" });
  }

  const current = getGrn(tenantId, grnId);
  if (!current) {
    return res.status(404).json({ message: "GRN not found" });
  }

  const transition = getGrnTransition(current, action);
  if (transition.error) {
    return res.status(400).json({ message: transition.error });
  }

  const now = new Date().toISOString();
  const updated = updateGrn(tenantId, grnId, (grn) => ({
    ...grn,
    status: transition.to,
    updated_at: now,
  }));

  recordStatusTransitionAudit({
    tenant_id: tenantId,
    user_id: req.session.user_id,
    entity_type: "grn",
    entity_id: grnId,
    from_status: current.status,
    to_status: transition.to,
    action,
    source: "PORTAL",
  });

  return res.json(updated);
});

router.post("/cancel", (req, res) => {
  const tenantId = req.tenant_id;
  const payload = validateCancelPayload(req.body);

  if (payload.error) {
    return res.status(400).json({ message: payload.error });
  }

  if (!canCancelDocument(req.session.role_id)) {
    return res.status(403).json({ message: "You do not have permission to cancel documents" });
  }

  const { documentId, documentType, cancellationReason } = payload;
  const now = new Date().toISOString();

  if (documentType === "asn") {
    const current = getAsn(tenantId, documentId);
    if (!current) {
      return res.status(404).json({ message: "ASN not found" });
    }

    if (ASN_LOCKED.includes(current.status)) {
      return res.status(409).json({ message: `ASN cannot be cancelled from ${current.status} status` });
    }

    const updated = updateAsn(tenantId, documentId, (asn) => ({
      ...asn,
      status: "cancelled",
      cancellation_reason: cancellationReason,
      cancelled_by: req.session.user_id,
      cancelled_at: now,
      updated_at: now,
      tenant_id: tenantId,
    }));

    recordStatusTransitionAudit({
      tenant_id: tenantId,
      user_id: req.session.user_id,
      entity_type: "asn",
      entity_id: documentId,
      from_status: current.status,
      to_status: "cancelled",
      action: "cancel",
      source: "PORTAL",
    });

    return res.json({
      success: true,
      message: "ASN cancelled successfully",
      document: updated,
    });
  }

  const current = getGrn(tenantId, documentId);
  if (!current) {
    return res.status(404).json({ message: "GRN not found" });
  }

  if (GRN_LOCKED.includes(current.status)) {
    return res.status(409).json({ message: `GRN cannot be cancelled from ${current.status} status` });
  }

  const updated = updateGrn(tenantId, documentId, (grn) => ({
    ...grn,
    status: "cancelled",
    cancellation_reason: cancellationReason,
    cancelled_by: req.session.user_id,
    cancelled_at: now,
    updated_at: now,
    tenant_id: tenantId,
  }));

  recordStatusTransitionAudit({
    tenant_id: tenantId,
    user_id: req.session.user_id,
    entity_type: "grn",
    entity_id: documentId,
    from_status: current.status,
    to_status: "cancelled",
    action: "cancel",
    source: "PORTAL",
  });

  return res.json({
    success: true,
    message: "GRN cancelled successfully",
    document: updated,
  });
});

export default router;
