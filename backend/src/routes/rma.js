import express from "express";
import { getRma, listRmas, updateRmaStatus } from "../repositories/RmaRepository.js";
import { listReturnRmaAuditEvents } from "../repositories/ReturnRmaAuditRepository.js";
import { canCancelRma, canViewRma } from "../services/rbac.js";

const router = express.Router();

const RMA_TRANSITION_MAP = {
  process:  { from: "created",    to: "processing" },
  complete: { from: "processing", to: "completed"  },
};

const BLOCKING_RETURN_STATUSES = new Set(["cancelled", "closed"]);

function toRmaRecord(tenantId, row) {
  return {
    ...row,
  };
}

function auditContext(req) {
  return {
    userId: String(req.user_id || "").trim(),
    roleId: String(req.role_id || "").toLowerCase(),
    requestId: req.requestId || req.headers["x-request-id"] || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.headers["user-agent"] || null,
  };
}

function canViewReturnRmaAudit(req) {
  return ["superadmin", "hqadmin", "storemanager"].includes(String(req.role_id || "").toLowerCase());
}

function validRmaId(value) {
  return /^RMA[A-Z0-9]{3,32}$/.test(String(value || "").trim());
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query?.pageSize, 10) || 10));
  return { page, pageSize };
}

router.get("/", async (req, res, next) => {
  if (!canViewRma(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view RMA records" });
  }

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const rows = await listRmas({ tenantId: req.tenant_id, warehouseId });
    return res.json(rows.map((row) => toRmaRecord(req.tenant_id, row)));
  } catch (error) {
    return next(error);
  }
});

router.get("/:rmaId", async (req, res, next) => {
  if (!canViewRma(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view RMA records" });
  }

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const row = await getRma({ tenantId: req.tenant_id, warehouseId, rmaId: req.params.rmaId });
    if (!row) {
      return res.status(404).json({ message: "RMA not found" });
    }

    return res.json(toRmaRecord(req.tenant_id, row));
  } catch (error) {
    return next(error);
  }
});

router.get("/:rmaId/audit-trail", async (req, res, next) => {
  if (!canViewReturnRmaAudit(req)) {
    return res.status(403).json({ message: "Insufficient role to access this resource" });
  }
  if (!validRmaId(req.params.rmaId)) {
    return res.status(400).json({ message: "Invalid RMA ID" });
  }

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const row = await getRma({ tenantId: req.tenant_id, warehouseId, rmaId: req.params.rmaId });
    if (!row) {
      return res.status(404).json({ message: "RMA not found" });
    }

    const result = await listReturnRmaAuditEvents({
      tenantId: req.tenant_id,
      entityType: "rma",
      entityId: row.rma_id,
      rmaId: row.rma_id,
      ...pagination(req.query),
    });
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:rmaId/transition", async (req, res, next) => {
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

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const row = await getRma({ tenantId: req.tenant_id, warehouseId, rmaId: req.params.rmaId });
    if (!row) {
      return res.status(404).json({ message: "RMA not found" });
    }

    if (row.status !== transition.from) {
      return res.status(409).json({
        message: `Cannot ${action} RMA from ${row.status} status`,
      });
    }

    const returnStatus = String(row.return_status || "").toLowerCase();
    if (BLOCKING_RETURN_STATUSES.has(returnStatus)) {
      return res.status(409).json({
        message: `Cannot ${action} RMA because the linked return is ${returnStatus}`,
      });
    }

    const now = new Date().toISOString();
    const updated = await updateRmaStatus({
      tenantId: req.tenant_id,
      warehouseId,
      rmaId: row.rma_id,
      updater: (current) => ({
        ...current,
        status: transition.to,
        updated_at: now,
      }),
      auditContext: auditContext(req),
      actionCode: action === "process" ? "rma_processing_started" : "rma_completed",
      remarks: row.notes || null,
      metadata: {
        transition_source: "rma_transition",
        action,
      },
    });

    return res.json({
      success: true,
      message: `RMA ${action}ed successfully`,
      document: toRmaRecord(req.tenant_id, updated),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:rmaId/cancel", async (req, res, next) => {
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

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const row = await getRma({ tenantId: req.tenant_id, warehouseId, rmaId: req.params.rmaId });
    if (!row) {
      return res.status(404).json({ message: "RMA not found" });
    }

    if (["cancelled", "completed"].includes(row.status)) {
      return res.status(409).json({ message: `RMA cannot be cancelled from ${row.status} status` });
    }

    const now = new Date().toISOString();
    const updated = await updateRmaStatus({
      tenantId: req.tenant_id,
      warehouseId,
      rmaId: row.rma_id,
      updater: (current) => ({
        ...current,
        status: "cancelled",
        cancellation_reason_code: cancellationReasonCode,
        cancellation_reason: cancellationReason,
        cancelled_by: req.user_id,
        cancelled_at: now,
        updated_at: now,
      }),
      auditContext: auditContext(req),
      actionCode: "rma_cancelled",
      remarks: cancellationReason,
      metadata: {
        transition_source: "rma_cancel",
        cancellation_reason_code: cancellationReasonCode,
      },
    });

    return res.json({
      success: true,
      message: "RMA cancelled successfully",
      document: toRmaRecord(req.tenant_id, updated),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
