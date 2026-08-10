import express from "express";
import { getShipment } from "../repositories/OutboundRepository.js";
import {
  createRmaForReturn,
  rmasForReturns,
} from "../repositories/RmaRepository.js";
import {
  createReturnRecord,
  getReturn as getPostgresReturn,
  listReturns as listPostgresReturns,
  updateReturnStatus,
} from "../repositories/ReturnsRepository.js";
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
  confirm: { from: "created",   to: "closed"    },
  close:   { from: "confirmed", to: "closed"    },
};

function auditContext(req) {
  return {
    userId: String(req.user_id || "").trim(),
    roleId: String(req.role_id || "").toLowerCase(),
    requestId: req.requestId || req.headers["x-request-id"] || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.headers["user-agent"] || null,
  };
}

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
  const rmas = record.rmas || [];
  const activeRma = rmas.find((rma) => rma.status !== "cancelled");

  return {
    ...record,
    rma_count: rmas.length,
    active_rma_id: activeRma?.rma_id || null,
    rma_id: activeRma?.rma_id || record.rma_id || null,
    rma_status: activeRma?.status || record.rma_status || null,
    rma_created_by: activeRma?.created_by || record.rma_created_by || null,
    rma_created_by_name: activeRma?.created_by_name || record.rma_created_by_name || null,
    rma_created_by_display: activeRma?.created_by_display || record.rma_created_by_display || null,
    rma_created_at: activeRma?.created_at || record.rma_created_at || null,
    linked_rma: activeRma || record.linked_rma || null,
  };
}

function activeLinkedRma(record) {
  const linked = record?.linked_rma;
  if (linked?.rma_id && String(linked.status || "").toLowerCase() !== "cancelled") return linked;
  return (record?.rmas || []).find((rma) => String(rma.status || "").toLowerCase() !== "cancelled") || null;
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

async function returnedQtyForShipmentSku(tenantId, warehouseId, shipmentId, skuId) {
  const records = await listPostgresReturns({ tenantId, warehouseId });
  return records
    .filter((record) =>
      record.shipment_id === shipmentId &&
      record.sku_id === skuId &&
      String(record.status || "").toLowerCase() !== "cancelled"
    )
    .reduce((total, record) => total + Number(record.qty || 0), 0);
}

function shipmentLineDeliveredQty(item) {
  return Number(item?.delivered_qty ?? item?.shipped_qty ?? item?.qty ?? item?.qty_picked ?? item?.qty_required ?? 0);
}

async function validateReturnEligibility({ tenantId, warehouseId, shipmentId, skuId, qty }) {
  const shipment = await getShipment(tenantId, warehouseId, shipmentId);
  if (!shipment) {
    return { error: "Shipment does not exist for the current warehouse." };
  }
  if (String(shipment.status || "").toLowerCase() !== "closed") {
    return { error: "Return can only be created from a closed shipment." };
  }

  const line = (shipment.items || []).find((item) => item.sku_id === skuId);
  if (!line) {
    return { error: "Selected item was not shipped on this shipment." };
  }

  const deliveredQty = shipmentLineDeliveredQty(line);
  const previouslyReturnedQty = await returnedQtyForShipmentSku(tenantId, warehouseId, shipmentId, skuId);
  const availableToReturn = Math.max(0, deliveredQty - previouslyReturnedQty);

  if (availableToReturn <= 0) {
    return { error: "Selected item has no available quantity to return." };
  }
  if (qty > availableToReturn) {
    return { error: `Return quantity cannot exceed ${availableToReturn}` };
  }

  return { shipment, line, deliveredQty, previouslyReturnedQty, availableToReturn };
}

router.get("/", async (req, res, next) => {
  if (!canViewReturns(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view returns" });
  }

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const records = await listPostgresReturns({ tenantId: req.tenant_id, warehouseId });
    return res.json(records.map((record) => toReturnSummary(record, req.tenant_id)));
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  if (!canCreateReturn(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to create returns" });
  }

  const payload = validateCreateReturnBody(req.body);
  if (payload.error) {
    return res.status(400).json({ message: payload.error });
  }

  const userId = req.user_id || "USR000001";
  const warehouseId = req.headers["x-warehouse-id"] || null;
  let eligibility;
  try {
    eligibility = await validateReturnEligibility({
      tenantId: req.tenant_id,
      warehouseId,
      shipmentId: payload.shipmentId,
      skuId: payload.skuId,
      qty: payload.qty,
    });
    if (eligibility.error) {
      return res.status(400).json({ message: eligibility.error });
    }
  } catch (error) {
    return next(error);
  }

  const created = await createReturnRecord({
    tenantId: req.tenant_id,
    userId,
    auditContext: auditContext(req),
    warehouseId,
    shipmentId: payload.shipmentId,
    salesOrderId: eligibility.shipment?.sales_order_id || eligibility.shipment?.so_id || null,
    customerId: payload.customerId,
    customerName: payload.customerName,
    skuId: payload.skuId,
    qty: payload.qty,
    reasonCode: payload.reasonCode,
    reasonDescription: payload.reasonDescription,
    notes: payload.notes,
  });

  return res.status(201).json(toReturnSummary(created, req.tenant_id));
});

router.get("/:returnId", async (req, res, next) => {
  if (!canViewReturns(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view returns" });
  }

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const record = await getPostgresReturn({ tenantId: req.tenant_id, warehouseId, returnId: req.params.returnId });
    if (!record) {
      return res.status(404).json({ message: "Return not found" });
    }

    const relatedRmas = await rmasForReturns({ tenantId: req.tenant_id, warehouseId, returnIds: [record.return_id] });

    return res.json({
      ...toReturnSummary(record, req.tenant_id),
      rmas: relatedRmas,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:returnId/cancel", async (req, res, next) => {
  if (!canCancelReturn(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to cancel returns" });
  }

  const validation = validateCancelBody(req.body);
  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const record = await getPostgresReturn({ tenantId: req.tenant_id, warehouseId, returnId: req.params.returnId });
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
    const linkedRma = activeLinkedRma(record);
    if (String(linkedRma?.status || "").toLowerCase() === "completed") {
      return res.status(409).json({ message: "Return cannot be cancelled after the linked RMA is completed" });
    }

    let updated = await updateReturnStatus({
      tenantId: req.tenant_id,
      warehouseId,
      returnId: req.params.returnId,
      status: "cancelled",
      userId,
      cancellationReason: validation.cancellationReason,
      cancellationReasonCode: validation.cancellationReasonCode,
      auditContext: auditContext(req),
    });

    updated = await getPostgresReturn({ tenantId: req.tenant_id, warehouseId, returnId: req.params.returnId }) || updated;

    return res.json({
      success: true,
      message: "Return cancelled successfully",
      document: toReturnSummary(updated, req.tenant_id),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:returnId/transition", async (req, res, next) => {
  const action = String(req.body?.action || "").trim();
  if (!action) {
    return res.status(400).json({ message: "action is required" });
  }

  const transition = RETURN_TRANSITION_MAP[action];
  if (!transition) {
    return res.status(400).json({ message: `Invalid action: ${action}` });
  }

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const record = await getPostgresReturn({ tenantId: req.tenant_id, warehouseId, returnId: req.params.returnId });
    if (!record) {
      return res.status(404).json({ message: "Return not found" });
    }

    if (record.status !== transition.from) {
      return res.status(409).json({
        message: `Cannot ${action} return from ${record.status} status`,
      });
    }

    if (action === "confirm") {
      const linkedRma = activeLinkedRma(record);
      if (!linkedRma) {
        return res.status(409).json({ message: "Return must have a linked RMA before closing" });
      }
      if (String(linkedRma.status || "").toLowerCase() !== "completed") {
        return res.status(409).json({ message: "Return can only be closed after the linked RMA is completed" });
      }
    }

    const userId = req.user_id || "USR000001";
    const updated = await updateReturnStatus({
      tenantId: req.tenant_id,
      warehouseId,
      returnId: req.params.returnId,
      status: transition.to,
      userId,
      auditContext: auditContext(req),
    });

    return res.json({
      success: true,
      message: action === "confirm" ? "Return closed successfully" : `Return ${action}ed successfully`,
      document: toReturnSummary(updated, req.tenant_id),
    });
  } catch (error) {
    return next(error);
  }
});


router.post("/:returnId/rma", async (req, res, next) => {
  if (!canCreateRma(req.role_id)) {
    return res.status(403).json({ message: "You do not have permission to create RMAs" });
  }

  const userId = req.user_id || "USR000001";
  const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
  try {
    const beforeReturn = await getPostgresReturn({ tenantId: req.tenant_id, warehouseId, returnId: req.params.returnId });
    if (!beforeReturn) {
      return res.status(404).json({ message: "Return not found" });
    }
    const rma = await createRmaForReturn({
      tenantId: req.tenant_id,
      warehouseId,
      returnId: req.params.returnId,
      userId,
      auditContext: auditContext(req),
      notes: String(req.body?.notes || "").trim() || `Created from Return ${req.params.returnId}`,
    });
    const updatedReturn = await getPostgresReturn({ tenantId: req.tenant_id, warehouseId, returnId: req.params.returnId });

    return res.status(201).json({
      ...rma,
      return: toReturnSummary(updatedReturn || beforeReturn, req.tenant_id),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
