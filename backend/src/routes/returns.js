import express from "express";
import {
  createReturn,
  createRma,
  getReturn,
  listRmaItems,
  listRmas,
  listReturns,
  updateReturn,
} from "../data/store.js";
import { recordAuditEvent, recordStatusTransitionAudit } from "../services/auditLog.js";
import {
  canCancelReturn,
  canCreateReturn,
  canCreateRma,
  canViewReturns,
} from "../services/rbac.js";

const router = express.Router();

const CANCELLABLE_RETURN_STATUSES = new Set(["created"]);
const RETURN_TERMINAL_STATUSES = new Set(["confirmed", "closed", "cancelled"]);
const RETURN_TRANSITION_MAP = {
  confirm: { from: "created",   to: "confirmed" },
  close:   { from: "confirmed", to: "closed"    },
};

function validateCancelBody(body) {
  const cancellationReason = String(body?.cancellation_reason || "").trim();
  const cancellationReasonCode = body?.cancellation_reason_code
    ? String(body.cancellation_reason_code).trim()
    : null;

  if (!cancellationReason) {
    return { error: "cancellation_reason is required" };
  }

  if (cancellationReason.length < 5) {
    return { error: "cancellation_reason must be at least 5 characters" };
  }

  return {
    cancellationReason,
    cancellationReasonCode: cancellationReasonCode || null,
  };
}

function toReturnSummary(record, tenantId) {
  const rmas = listRmas(tenantId).filter((rma) => rma.return_id === record.return_id);
  const activeRma = rmas.find((rma) => rma.status !== "cancelled");

  return {
    ...record,
    rma_count: rmas.length,
    active_rma_id: activeRma?.rma_id || null,
  };
}

function validateCreateReturnBody(body) {
  const shipmentId = String(body?.shipment_id || "").trim();
  const customerId = String(body?.customer_id || "").trim();
  const customerName = String(body?.customer_name || "").trim();
  const skuId = String(body?.sku_id || "").trim();
  const reasonCode = String(body?.reason_code || "").trim();
  const qty = Number(body?.qty);

  if (!shipmentId) return { error: "shipment_id is required" };
  if (!customerId) return { error: "customer_id is required" };
  if (!customerName) return { error: "customer_name is required" };
  if (!skuId) return { error: "sku_id is required" };
  if (!reasonCode) return { error: "reason_code is required" };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "qty must be greater than 0" };

  return {
    shipmentId,
    customerId,
    customerName,
    skuId,
    reasonCode,
    qty,
    reasonDescription: String(body?.reason_description || "").trim(),
    notes: String(body?.notes || "").trim(),
  };
}

function validateRmaItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { data: [] };
  }

  for (const item of items) {
    const skuId = String(item?.sku_id || "").trim();
    const qty = Number(item?.qty);
    if (!skuId) return { error: "Each RMA item must include sku_id" };
    if (!Number.isFinite(qty) || qty <= 0) return { error: "Each RMA item must include qty greater than 0" };
  }

  return {
    data: items.map((item) => ({
      sku_id: String(item.sku_id).trim(),
      qty: Number(item.qty),
      reason_code: item.reason_code ? String(item.reason_code).trim() : "",
    })),
  };
}

function toRmaDetail(tenantId, rma) {
  return {
    ...rma,
    items: listRmaItems(tenantId, rma.rma_id),
  };
}

router.get("/", (req, res) => {
  if (!canViewReturns(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view returns" });
  }

  const records = listReturns(req.tenant_id).map((record) => toReturnSummary(record, req.tenant_id));
  return res.json(records);
});

router.post("/", (req, res) => {
  if (!canCreateReturn(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to create returns" });
  }

  const payload = validateCreateReturnBody(req.body);
  if (payload.error) {
    return res.status(400).json({ message: payload.error });
  }

  const userId = req.user_id || "USR000001";
  const warehouseId = req.headers["x-warehouse-id"] || null;

  const created = createReturn({
    tenantId: req.tenant_id,
    userId,
    warehouseId,
    shipmentId: payload.shipmentId,
    customerId: payload.customerId,
    customerName: payload.customerName,
    skuId: payload.skuId,
    qty: payload.qty,
    reasonCode: payload.reasonCode,
    reasonDescription: payload.reasonDescription,
    notes: payload.notes,
  });

  recordAuditEvent({
    tenant_id: req.tenant_id,
    user_id: userId,
    entity_type: "return",
    entity_id: created.return_id,
    action: "create",
    message: `Return ${created.return_id} created`,
  });

  return res.status(201).json(toReturnSummary(created, req.tenant_id));
});

router.get("/:returnId", (req, res) => {
  if (!canViewReturns(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view returns" });
  }

  const record = getReturn(req.tenant_id, req.params.returnId);
  if (!record) {
    return res.status(404).json({ message: "Return not found" });
  }

  const relatedRmas = listRmas(req.tenant_id)
    .filter((rma) => rma.return_id === record.return_id)
    .map((rma) => toRmaDetail(req.tenant_id, rma));

  return res.json({
    ...toReturnSummary(record, req.tenant_id),
    rmas: relatedRmas,
  });
});

router.patch("/:returnId/cancel", (req, res) => {
  if (!canCancelReturn(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to cancel returns" });
  }

  const validation = validateCancelBody(req.body);
  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  const record = getReturn(req.tenant_id, req.params.returnId);
  if (!record) {
    return res.status(404).json({ message: "Return not found" });
  }

  if (record.status === "cancelled") {
    return res.status(409).json({ message: "Return is already cancelled" });
  }

  if (!CANCELLABLE_RETURN_STATUSES.has(record.status) || RETURN_TERMINAL_STATUSES.has(record.status)) {
    return res.status(409).json({
      message: `Return cannot be cancelled from ${record.status} status`,
    });
  }

  const userId = req.user_id || "USR000001";
  const now = new Date().toISOString();

  const updated = updateReturn(req.tenant_id, req.params.returnId, (current) => ({
    ...current,
    status: "cancelled",
    cancellation_reason_code: validation.cancellationReasonCode,
    cancellation_reason: validation.cancellationReason,
    cancelled_by: userId,
    cancelled_at: now,
    updated_at: now,
    tenant_id: req.tenant_id,
  }));

  recordStatusTransitionAudit({
    tenant_id: req.tenant_id,
    user_id: userId,
    entity_type: "return",
    entity_id: record.return_id,
    from_status: record.status,
    to_status: "cancelled",
    action: "cancel",
  });

  return res.json({
    success: true,
    message: "Return cancelled successfully",
    document: toReturnSummary(updated, req.tenant_id),
  });
});

router.patch("/:returnId/transition", (req, res) => {
  const action = String(req.body?.action || "").trim();
  if (!action) {
    return res.status(400).json({ message: "action is required" });
  }

  const transition = RETURN_TRANSITION_MAP[action];
  if (!transition) {
    return res.status(400).json({ message: `Invalid action: ${action}` });
  }

  const record = getReturn(req.tenant_id, req.params.returnId);
  if (!record) {
    return res.status(404).json({ message: "Return not found" });
  }

  if (record.status !== transition.from) {
    return res.status(409).json({
      message: `Cannot ${action} return from ${record.status} status`,
    });
  }

  const userId = req.user_id || "USR000001";
  const now = new Date().toISOString();

  const updated = updateReturn(req.tenant_id, req.params.returnId, (current) => ({
    ...current,
    status: transition.to,
    updated_at: now,
  }));

  recordStatusTransitionAudit({
    tenant_id: req.tenant_id,
    user_id: userId,
    entity_type: "return",
    entity_id: record.return_id,
    from_status: record.status,
    to_status: transition.to,
    action,
  });

  return res.json({
    success: true,
    message: `Return ${action}ed successfully`,
    document: toReturnSummary(updated, req.tenant_id),
  });
});


router.post("/:returnId/rma", (req, res) => {
  if (!canCreateRma(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to create RMAs" });
  }

  const returnRecord = getReturn(req.tenant_id, req.params.returnId);
  if (!returnRecord) {
    return res.status(404).json({ message: "Return not found" });
  }

  if (returnRecord.status === "cancelled") {
    return res.status(409).json({ message: "Cannot create RMA for a cancelled return" });
  }

  if (["received", "closed"].includes(returnRecord.status)) {
    return res.status(409).json({ message: `Cannot create RMA for return in ${returnRecord.status} status` });
  }

  const existingActiveRma = listRmas(req.tenant_id).find(
    (rma) => rma.return_id === returnRecord.return_id && rma.status !== "cancelled",
  );
  if (existingActiveRma) {
    return res.status(409).json({ message: `Return already linked to active RMA ${existingActiveRma.rma_id}` });
  }

  const validatedItems = validateRmaItems(req.body?.items);
  if (validatedItems.error) {
    return res.status(400).json({ message: validatedItems.error });
  }

  const userId = req.user_id || "USR000001";
  const now = new Date().toISOString();

  const creation = createRma({
    tenantId: req.tenant_id,
    userId,
    returnRecord,
    notes: String(req.body?.notes || "").trim(),
    items: validatedItems.data,
  });

  const shouldMarkCreated = returnRecord.status !== "created";
  const updatedReturn = updateReturn(req.tenant_id, returnRecord.return_id, (current) => ({
    ...current,
    status: shouldMarkCreated ? "created" : current.status,
    updated_at: now,
  }));

  if (shouldMarkCreated) {
    recordStatusTransitionAudit({
      tenant_id: req.tenant_id,
      user_id: userId,
      entity_type: "return",
      entity_id: returnRecord.return_id,
      from_status: returnRecord.status,
      to_status: "created",
      action: "create_rma",
    });
  }

  recordAuditEvent({
    tenant_id: req.tenant_id,
    user_id: userId,
    entity_type: "rma",
    entity_id: creation.rma.rma_id,
    action: "create",
    message: `RMA ${creation.rma.rma_id} created for return ${returnRecord.return_id}`,
  });

  return res.status(201).json({
    ...creation.rma,
    items: creation.items,
    return: toReturnSummary(updatedReturn || returnRecord, req.tenant_id),
  });
});

export default router;