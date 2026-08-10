import express from "express";
import { getShipment } from "../repositories/OutboundRepository.js";
import {
  createReturnRecord,
  getReturn,
  listReturns,
} from "../repositories/ReturnsRepository.js";
import { listReturnRmaAuditEvents } from "../repositories/ReturnRmaAuditRepository.js";
import { canCreateReturn, canViewReturns } from "../services/rbac.js";
import { ApiError } from "../utils/errors.js";

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function roleId(req) {
  return String(req.role_id || req.context?.roles?.[0] || "").toLowerCase();
}

function scopedContext(req) {
  const tenantId = String(req.tenant_id || req.context?.tenantId || "").trim();
  const warehouseId = String(req.warehouse_id || req.context?.warehouseId || req.headers["x-warehouse-id"] || "").trim();
  const userId = String(req.user_id || req.context?.userId || "").trim();
  if (!tenantId) throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  if (!warehouseId) throw new ApiError(403, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required");
  return { tenantId, warehouseId, userId };
}

function auditContext(req) {
  return {
    userId: String(req.user_id || req.context?.userId || "").trim(),
    roleId: roleId(req),
    requestId: req.requestId || req.headers["x-request-id"] || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.headers["user-agent"] || null,
  };
}

function canViewReturnRmaAudit(req) {
  return ["superadmin", "hqadmin", "storemanager"].includes(roleId(req));
}

function validReturnId(value) {
  return /^RTN[A-Z0-9]{3,32}$/.test(String(value || "").trim());
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query?.pageSize, 10) || 10));
  return { page, pageSize };
}

function number(value) {
  return Number(value || 0);
}

function deliveredQty(line) {
  return number(line?.delivered_qty ?? line?.shipped_qty ?? line?.qty ?? line?.qty_picked ?? line?.qty_required);
}

function selectedSkuId(body) {
  return String(body?.sku_id || body?.skuId || body?.item_sku_id || "").trim();
}

function selectedShipmentId(body) {
  return String(body?.shipment_id || body?.shipmentId || "").trim();
}

function selectedQty(body) {
  return number(body?.qty ?? body?.return_qty ?? body?.quantity);
}

async function returnedQtyForShipmentSku({ tenantId, warehouseId, shipmentId, skuId }) {
  const returns = await listReturns({ tenantId, warehouseId });
  return returns
    .filter((item) => String(item.shipment_id || "") === shipmentId)
    .filter((item) => String(item.sku_id || "") === skuId)
    .filter((item) => String(item.status || "").toLowerCase() !== "cancelled")
    .reduce((sum, item) => sum + number(item.qty), 0);
}

async function validateReturnEligibility({ tenantId, warehouseId, shipmentId, skuId, qty }) {
  if (!shipmentId) throw new ApiError(400, "SHIPMENT_REQUIRED", "Shipment is required");
  if (!skuId) throw new ApiError(400, "SKU_REQUIRED", "Shipped item is required");
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ApiError(400, "INVALID_RETURN_QTY", "Return quantity must be greater than zero");
  }

  const shipment = await getShipment(tenantId, warehouseId, shipmentId);
  if (!shipment) throw new ApiError(404, "SHIPMENT_NOT_FOUND", "Shipment was not found");
  if (String(shipment.status || "").toLowerCase() !== "closed") {
    throw new ApiError(400, "SHIPMENT_NOT_CLOSED", "Return can only be created from a closed shipment");
  }

  const line = (shipment.items || []).find((item) => String(item.sku_id || "") === skuId);
  if (!line) {
    throw new ApiError(400, "RETURN_SKU_NOT_SHIPPED", "Selected item was not shipped on this shipment");
  }

  const delivered = deliveredQty(line);
  const previouslyReturned = await returnedQtyForShipmentSku({ tenantId, warehouseId, shipmentId, skuId });
  const available = Math.max(0, delivered - previouslyReturned);
  if (available <= 0) {
    throw new ApiError(400, "RETURN_ITEM_UNAVAILABLE", "Selected item has no quantity available to return");
  }
  if (qty > available) {
    throw new ApiError(
      400,
      "RETURN_QTY_EXCEEDS_AVAILABLE",
      `Return quantity cannot exceed available quantity (${available}).`
    );
  }

  return {
    shipment,
    line,
    delivered,
    previouslyReturned,
    available,
  };
}

router.get("/", asyncRoute(async (req, res, next) => {
  if (!canViewReturns(roleId(req))) {
    return next(new ApiError(403, "FORBIDDEN", "Insufficient role to access this resource"));
  }
  const { tenantId, warehouseId } = scopedContext(req);
  const rows = await listReturns({ tenantId, warehouseId });
  return res.json(rows);
}));

router.post("/", asyncRoute(async (req, res, next) => {
  if (!canCreateReturn(roleId(req))) {
    return next(new ApiError(403, "FORBIDDEN", "Insufficient role to access this resource"));
  }
  const { tenantId, warehouseId, userId } = scopedContext(req);
  const shipmentId = selectedShipmentId(req.body);
  const skuId = selectedSkuId(req.body);
  const qty = selectedQty(req.body);
  const eligibility = await validateReturnEligibility({ tenantId, warehouseId, shipmentId, skuId, qty });

  const created = await createReturnRecord({
    tenantId,
    warehouseId,
    userId,
    auditContext: auditContext(req),
    shipmentId,
    salesOrderId: eligibility.shipment.sales_order_id || eligibility.shipment.so_id || req.body?.so_id || null,
    customerId: req.body?.customer_id || eligibility.shipment.customer_id || null,
    customerName: req.body?.customer_name || eligibility.shipment.customer_name || "",
    skuId,
    qty,
    reasonCode: req.body?.reason_code || req.body?.reasonCode || "",
    reasonDescription: req.body?.reason_description || req.body?.reasonDescription || "",
    notes: req.body?.notes || "",
  });
  return res.status(201).json(created);
}));

router.get("/:returnId/audit-trail", asyncRoute(async (req, res, next) => {
  if (!canViewReturnRmaAudit(req)) {
    return next(new ApiError(403, "FORBIDDEN", "Insufficient role to access this resource"));
  }
  if (!validReturnId(req.params.returnId)) {
    return next(new ApiError(400, "INVALID_RETURN_ID", "Invalid Return ID"));
  }
  const { tenantId, warehouseId } = scopedContext(req);
  const row = await getReturn({ tenantId, warehouseId, returnId: req.params.returnId });
  if (!row) return next(new ApiError(404, "RETURN_NOT_FOUND", "Return not found"));
  const result = await listReturnRmaAuditEvents({
    tenantId,
    returnId: row.return_id,
    ...pagination(req.query),
  });
  return res.json({ data: result });
}));

router.get("/:returnId", asyncRoute(async (req, res, next) => {
  if (!canViewReturns(roleId(req))) {
    return next(new ApiError(403, "FORBIDDEN", "Insufficient role to access this resource"));
  }
  const { tenantId, warehouseId } = scopedContext(req);
  const row = await getReturn({ tenantId, warehouseId, returnId: req.params.returnId });
  if (!row) return next(new ApiError(404, "RETURN_NOT_FOUND", "Return not found"));
  return res.json(row);
}));

export default router;
