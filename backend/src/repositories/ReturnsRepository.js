import { QueryTypes } from "sequelize";
import { Return, ReturnItem, Sku, User, sequelize } from "../models/index.js";
import { recordReturnRmaAuditEvent } from "./ReturnRmaAuditRepository.js";
import { ApiError } from "../utils/errors.js";

function requiredScope(tenantId, warehouseId = null) {
  const tenant = String(tenantId || "").trim();
  const warehouse = String(warehouseId || "").trim();
  if (!tenant) throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  return { tenantId: tenant, warehouseId: warehouse };
}

function returnsWorkflowScopeCte(alias = "returns_with_workflow") {
  return `${alias} AS (
       SELECT
         return_row.*,
         linked_rma.rma_id AS linked_rma_id,
         lower(linked_rma.status) AS linked_rma_status,
         CASE
           WHEN lower(return_row.status) = 'closed' THEN 'Closed'
           WHEN lower(return_row.status) = 'cancelled' THEN 'Cancelled'
           WHEN lower(linked_rma.status) IN ('created', 'open') THEN 'RMA Opened'
           WHEN lower(linked_rma.status) = 'processing' THEN 'RMA Processing'
           WHEN lower(linked_rma.status) = 'completed' THEN 'RMA Completed'
           WHEN lower(linked_rma.status) = 'cancelled' THEN 'Cancelled'
           WHEN lower(return_row.status) = 'created' THEN 'Return Created'
           ELSE initcap(replace(lower(return_row.status), '_', ' '))
         END AS workflow_status
       FROM public.returns return_row
       LEFT JOIN LATERAL (
         SELECT rma_id, status
         FROM public.rma rma_row
         WHERE rma_row.tenant_id = return_row.tenant_id
           AND rma_row.return_id = return_row.return_id
         ORDER BY rma_row.created_at DESC, rma_row.rma_id DESC
         LIMIT 1
       ) linked_rma ON true
       WHERE return_row.tenant_id = $1
         AND return_row.warehouse_id = $2
     )`;
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function number(value) {
  return Number(value || 0);
}

async function nextReturnId(transaction) {
  await sequelize.query(
    "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
    { replacements: { key: "returns-id:RTN" }, transaction }
  );
  const rows = await Return.findAll({ attributes: ["return_id"], transaction, raw: true });
  const max = rows.reduce((current, row) => {
    const match = /^RTN(\d+)$/.exec(String(row.return_id || ""));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `RTN${String(max + 1).padStart(6, "0")}`;
}

async function nextReturnItemId(transaction) {
  await sequelize.query(
    "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
    { replacements: { key: "returns-id:RMI" }, transaction }
  );
  const rows = await ReturnItem.findAll({ attributes: ["rmi_id"], transaction, raw: true });
  const max = rows.reduce((current, row) => {
    const match = /^RMI(\d+)$/.exec(String(row.rmi_id || ""));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `RMI${String(max + 1).padStart(6, "0")}`;
}

function userDisplay(userId, usersById = new Map()) {
  const id = String(userId || "").trim();
  if (!id) return { name: null, display: null };
  const user = usersById.get(id);
  const name = user?.user_name || null;
  return {
    name,
    display: name ? `${name} (${id})` : id,
  };
}

function auditActor(payload = {}) {
  return {
    performedByUserId: payload.userId || payload.auditContext?.userId || null,
    performedByDisplayName: payload.auditContext?.displayName || null,
    performedByRoleId: payload.auditContext?.roleId || null,
    requestId: payload.auditContext?.requestId || null,
    ipAddress: payload.auditContext?.ipAddress || null,
    userAgent: payload.auditContext?.userAgent || null,
  };
}

function linkedReturnCancellationMessage(returnId, reason) {
  return `Cancelled because linked Return ${returnId} was cancelled.\n\nReason: ${String(reason || "").trim() || "-"}`;
}

function mapReturn(row, rmas = [], usersById = new Map()) {
  const record = plain(row);
  const createdBy = userDisplay(record.created_by, usersById);
  const items = (record.items || []).map((item) => {
    const line = plain(item);
    const sku = plain(line.sku);
    return {
      ...line,
      return_item_id: line.rmi_id,
      qty: number(line.qty),
      reason_code: line.reason_code || line.reason || record.reason_code || "",
      sku_name: sku?.description || line.sku_name || null,
      product_name: sku?.description || line.product_name || null,
      sku_description: sku?.description || line.sku_description || null,
    };
  });
  const relatedRmas = rmas.filter((rma) => rma.return_id === record.return_id);
  const activeRma = relatedRmas.find((rma) => rma.status !== "cancelled") || null;
  const linkedRma = activeRma || relatedRmas[0] || null;
  const first = items[0] || {};
  return {
    ...record,
    qty: number(record.qty ?? first.qty),
    sku_id: record.sku_id || first.sku_id || "",
    sku_name: first.sku_name || record.sku_name || null,
    product_name: first.product_name || record.product_name || null,
    sku_description: first.sku_description || record.sku_description || null,
    reason_code: record.reason_code || first.reason_code || "",
    created_by_name: createdBy.name,
    created_by_display: createdBy.display,
    items,
    rma_count: relatedRmas.length,
    active_rma_id: activeRma?.rma_id || null,
    rma_id: linkedRma?.rma_id || null,
    rma_status: linkedRma?.status || null,
    rma_created_by: linkedRma?.created_by || null,
    rma_created_by_name: linkedRma?.created_by_name || null,
    rma_created_by_display: linkedRma?.created_by_display || null,
    rma_created_at: linkedRma?.created_at || null,
    linked_rma: linkedRma ? {
      rma_id: linkedRma.rma_id,
      return_id: linkedRma.return_id,
      status: linkedRma.status,
      created_by: linkedRma.created_by,
      created_by_name: linkedRma.created_by_name,
      created_by_display: linkedRma.created_by_display,
      created_at: linkedRma.created_at,
    } : null,
  };
}

async function rmasForReturns(tenantId, returnIds, transaction = null) {
  if (!returnIds.length) return [];
  return sequelize.query(
    `SELECT
       r.rma_id,
       r.return_id,
       r.status,
       r.created_by,
       u.user_name AS created_by_name,
       CASE
         WHEN u.user_name IS NOT NULL AND r.created_by IS NOT NULL
         THEN u.user_name || ' (' || r.created_by || ')'
         ELSE r.created_by
       END AS created_by_display,
       r.created_at
       FROM public.rma r
       LEFT JOIN public.users u
         ON u.tenant_id = r.tenant_id
        AND u.user_id = r.created_by
      WHERE r.tenant_id = :tenantId
        AND return_id IN (:returnIds)
      ORDER BY created_at DESC`,
    { replacements: { tenantId, returnIds }, type: QueryTypes.SELECT, transaction }
  ).catch(() => []);
}

async function usersForReturns(tenantId, rows, transaction = null) {
  const userIds = [...new Set(rows
    .map((row) => plain(row)?.created_by)
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean))];
  if (!userIds.length) return new Map();

  const users = await User.findAll({
    where: { tenant_id: tenantId, user_id: userIds },
    attributes: ["user_id", "user_name"],
    raw: true,
    transaction,
  });

  return new Map(users.map((user) => [user.user_id, user]));
}

async function listReturns({ tenantId, warehouseId }) {
  requiredScope(tenantId, warehouseId);
  const rows = await Return.findAll({
    where: { tenant_id: tenantId, warehouse_id: warehouseId },
    include: [{
      model: ReturnItem,
      as: "items",
      required: false,
      include: [{ model: Sku, as: "sku", attributes: ["sku_id", "description", "category"], required: false }],
    }],
    order: [["created_at", "DESC"], ["return_id", "DESC"]],
  });
  const returnIds = rows.map((row) => row.return_id);
  const rmas = await rmasForReturns(tenantId, returnIds);
  const usersById = await usersForReturns(tenantId, rows);
  return rows.map((row) => mapReturn(row, rmas, usersById));
}

async function getReturn({ tenantId, warehouseId, returnId, transaction = null }) {
  requiredScope(tenantId, warehouseId);
  const row = await Return.findOne({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, return_id: returnId },
    include: [{
      model: ReturnItem,
      as: "items",
      required: false,
      include: [{ model: Sku, as: "sku", attributes: ["sku_id", "description", "category"], required: false }],
    }],
    transaction,
  });
  if (!row) return null;
  const rmas = await rmasForReturns(tenantId, [returnId], transaction);
  const usersById = await usersForReturns(tenantId, [row], transaction);
  return {
    ...mapReturn(row, rmas, usersById),
    rmas,
  };
}

async function createReturnRecord(payload) {
  const { tenantId, warehouseId } = requiredScope(payload.tenantId, payload.warehouseId);
  return sequelize.transaction(async (transaction) => {
    const now = new Date();
    const returnId = await nextReturnId(transaction);
    const itemId = await nextReturnItemId(transaction);
    await Return.create({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      return_id: returnId,
      shipment_id: payload.shipmentId,
      so_id: payload.salesOrderId || null,
      customer_id: payload.customerId || null,
      customer_name: payload.customerName || "",
      status: "created",
      created_at: now,
      created_by: payload.userId || null,
      updated_at: now,
      sku_id: payload.skuId,
      qty: payload.qty,
      reason_code: payload.reasonCode || "",
      reason_description: payload.reasonDescription || "",
      notes: payload.notes || "",
    }, { transaction });
    await ReturnItem.create({
      tenant_id: tenantId,
      rmi_id: itemId,
      return_id: returnId,
      sku_id: payload.skuId,
      qty: payload.qty,
      reason: payload.reasonDescription || payload.reasonCode || "",
      reason_code: payload.reasonCode || "",
      disposition: "quarantine",
      received_qty: 0,
      notes: payload.notes || "",
    }, { transaction });

    await recordReturnRmaAuditEvent({
      tenantId,
      entityType: "return",
      entityId: returnId,
      returnId,
      actionCode: "return_created",
      previousStatus: null,
      newStatus: "created",
      remarks: payload.notes || payload.reasonDescription || null,
      metadata: {
        shipment_id: payload.shipmentId || null,
        sales_order_id: payload.salesOrderId || null,
        customer_id: payload.customerId || null,
        sku_id: payload.skuId || null,
        qty: payload.qty || null,
        reason_code: payload.reasonCode || null,
        item_count: 1,
      },
      transaction,
      ...auditActor(payload),
    });

    return getReturn({ tenantId, warehouseId, returnId, transaction });
  });
}

async function updateReturnStatus({
  tenantId,
  warehouseId,
  returnId,
  status,
  userId,
  cancellationReason = null,
  cancellationReasonCode = null,
  auditContext = {},
}) {
  const scope = requiredScope(tenantId, warehouseId);
  return sequelize.transaction(async (transaction) => {
    const row = await Return.findOne({
      where: {
        tenant_id: scope.tenantId,
        warehouse_id: scope.warehouseId,
        return_id: returnId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!row) return null;

    const now = new Date();
    const previousStatus = row.status;
    const updates = {
      status,
      updated_at: now,
    };

    if (status === "cancelled") {
      updates.cancelled_by = userId || null;
      updates.cancelled_at = now;
      updates.cancellation_reason = cancellationReason || "";
      updates.cancellation_reason_code = cancellationReasonCode || null;
    }

    if (status === "closed") {
      updates.closed_at = now;
    }

    await row.update(updates, { transaction });
    let cancelledRmas = [];
    if (status === "cancelled") {
      const linkedCancellationReason = linkedReturnCancellationMessage(returnId, cancellationReason);
      cancelledRmas = await sequelize.query(
        `WITH target AS (
           SELECT rma_id, return_id, status
             FROM public.rma
            WHERE tenant_id = :tenantId
              AND return_id = :returnId
              AND status IN ('created', 'open', 'processing')
            FOR UPDATE
         ),
         updated AS (
           UPDATE public.rma r
              SET status = 'cancelled',
                  updated_at = :now,
                  cancellation_reason_code = :cancellationReasonCode,
                  cancellation_reason = :cancellationReason,
                  cancelled_by = :cancelledBy,
                  cancelled_at = :now
             FROM target
            WHERE r.tenant_id = :tenantId
              AND r.rma_id = target.rma_id
            RETURNING r.rma_id, target.return_id, target.status AS previous_status, r.status AS new_status
         )
         SELECT * FROM updated`,
        {
          replacements: {
            tenantId: scope.tenantId,
            returnId,
            now,
            cancellationReasonCode: cancellationReasonCode || null,
            cancellationReason: linkedCancellationReason,
            cancelledBy: userId || null,
          },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
    }

    const actor = auditActor({ userId, auditContext });
    await recordReturnRmaAuditEvent({
      tenantId: scope.tenantId,
      entityType: "return",
      entityId: returnId,
      returnId,
      actionCode: status === "cancelled" ? "return_cancelled" : "return_closed",
      previousStatus,
      newStatus: status,
      remarks: status === "cancelled" ? cancellationReason : null,
      metadata: {
        transition_source: status === "cancelled" ? "return_cancel" : "return_transition",
        cancellation_reason_code: cancellationReasonCode || null,
      },
      transaction,
      ...actor,
    });

    for (const rma of cancelledRmas) {
      await recordReturnRmaAuditEvent({
        tenantId: scope.tenantId,
        entityType: "rma",
        entityId: rma.rma_id,
        returnId,
        rmaId: rma.rma_id,
        actionCode: "rma_cancelled",
        previousStatus: rma.previous_status,
        newStatus: rma.new_status,
        remarks: linkedReturnCancellationMessage(returnId, cancellationReason),
        metadata: {
          transition_source: "return_cancel_cascade",
          cancellation_reason_code: cancellationReasonCode || null,
        },
        transaction,
        ...actor,
      });
    }

    return getReturn({
      tenantId: scope.tenantId,
      warehouseId: scope.warehouseId,
      returnId,
      transaction,
    });
  });
}

export {
  createReturnRecord,
  getReturn,
  listReturns,
  returnsWorkflowScopeCte,
  updateReturnStatus,
};
