import express from "express";
import { getRma, listRmaItems, listRmas, updateRma } from "../data/store.js";
import { recordStatusTransitionAudit } from "../services/auditLog.js";
import { canCancelRma, canViewRma } from "../services/rbac.js";

const router = express.Router();

const RMA_TRANSITION_MAP = {
  process:  { from: "created",    to: "processing" },
  complete: { from: "processing", to: "completed"  },
};

function toRmaRecord(tenantId, row) {
  return {
    ...row,
    items: listRmaItems(tenantId, row.rma_id),
  };
}

router.get("/", (req, res) => {
  if (!canViewRma(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view RMA records" });
  }

  return res.json(listRmas(req.tenant_id).map((row) => toRmaRecord(req.tenant_id, row)));
});

router.get("/:rmaId", (req, res) => {
  if (!canViewRma(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view RMA records" });
  }

  const row = getRma(req.tenant_id, req.params.rmaId);
  if (!row) {
    return res.status(404).json({ message: "RMA not found" });
  }

  return res.json(toRmaRecord(req.tenant_id, row));
});

router.patch("/:rmaId/transition", (req, res) => {
  if (!canViewRma(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to update RMA records" });
  }

  const action = String(req.body?.action || "").trim();
  if (!action) {
    return res.status(400).json({ message: "action is required" });
  }

  const transition = RMA_TRANSITION_MAP[action];
  if (!transition) {
    return res.status(400).json({ message: `Invalid action: ${action}` });
  }

  const row = getRma(req.tenant_id, req.params.rmaId);
  if (!row) {
    return res.status(404).json({ message: "RMA not found" });
  }

  if (row.status !== transition.from) {
    return res.status(409).json({
      message: `Cannot ${action} RMA from ${row.status} status`,
    });
  }

  const now = new Date().toISOString();
  const updated = updateRma(req.tenant_id, row.rma_id, (current) => ({
    ...current,
    status: transition.to,
    updated_at: now,
  }));

  recordStatusTransitionAudit({
    tenant_id: req.tenant_id,
    user_id: req.user_id,
    entity_type: "rma",
    entity_id: row.rma_id,
    from_status: row.status,
    to_status: transition.to,
    action,
  });

  return res.json({
    success: true,
    message: `RMA ${action}ed successfully`,
    document: toRmaRecord(req.tenant_id, updated),
  });
});

router.patch("/:rmaId/cancel", (req, res) => {
  console.log("RMA cancel - role_id:", req.role_id, "tenant:", req.tenant_id);
  if (!canCancelRma(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to cancel RMA records" });
  }

  const cancellationReason = String(req.body?.cancellation_reason || "").trim();
  const cancellationReasonCode = req.body?.cancellation_reason_code
    ? String(req.body.cancellation_reason_code).trim()
    : null;

  if (!cancellationReason) {
    return res.status(400).json({ message: "cancellation_reason is required" });
  }

  if (cancellationReason.length < 5) {
    return res.status(400).json({ message: "cancellation_reason must be at least 5 characters" });
  }

  const row = getRma(req.tenant_id, req.params.rmaId);
  if (!row) {
    return res.status(404).json({ message: "RMA not found" });
  }

  if (["cancelled", "completed"].includes(row.status)) {
    return res.status(409).json({ message: `RMA cannot be cancelled from ${row.status} status` });
  }

  const now = new Date().toISOString();
  const updated = updateRma(req.tenant_id, row.rma_id, (current) => ({
    ...current,
    status: "cancelled",
    cancellation_reason_code: cancellationReasonCode,
    cancellation_reason: cancellationReason,
    cancelled_by: req.user_id,
    cancelled_at: now,
    updated_at: now,
  }));

  recordStatusTransitionAudit({
    tenant_id: req.tenant_id,
    user_id: req.user_id,
    entity_type: "rma",
    entity_id: row.rma_id,
    from_status: row.status,
    to_status: "cancelled",
    action: "cancel",
  });

  return res.json({
    success: true,
    message: "RMA cancelled successfully",
    document: toRmaRecord(req.tenant_id, updated),
  });
});

export default router;