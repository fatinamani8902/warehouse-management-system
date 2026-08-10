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

function number(value) {
  return Number(value || 0);
}

function userDisplay(userId, userName) {
  const id = String(userId || "").trim();
  if (!id) return { name: null, display: null };
  return {
    name: userName || null,
    display: userName ? `${userName} (${id})` : id,
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

function mapRma(row) {
  if (!row) return null;
  const createdBy = userDisplay(row.created_by, row.created_by_name);
  const items = Array.isArray(row.items) ? row.items.map((item) => ({
    ...item,
    qty: number(item.qty),
    sku_name: item.sku_name || item.sku_description || null,
    product_name: item.product_name || item.sku_name || item.sku_description || null,
    sku_description: item.sku_description || item.product_name || item.sku_name || null,
  })) : [];
  return {
    ...row,
    created_by_name: createdBy.name,
    created_by_display: createdBy.display,
    items,
  };
}

async function nextRmaId(transaction) {
  await sequelize.query(
    "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
    { replacements: { key: "rma-id:RMA" }, transaction }
  );
  const rows = await sequelize.query(
    "SELECT rma_id FROM public.rma",
    { type: QueryTypes.SELECT, transaction }
  );
  const max = rows.reduce((current, row) => {
    const match = /^RMA(\d+)$/.exec(String(row.rma_id || ""));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `RMA${String(max + 1).padStart(6, "0")}`;
}

async function nextRmaItemId(transaction) {
  await sequelize.query(
    "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
    { replacements: { key: "rma-id:RMI" }, transaction }
  );
  const rows = await sequelize.query(
    "SELECT rma_item_id FROM public.rma_items",
    { type: QueryTypes.SELECT, transaction }
  );
  const max = rows.reduce((current, row) => {
    const match = /^RMI(\d+)$/.exec(String(row.rma_item_id || ""));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `RMI${String(max + 1).padStart(6, "0")}`;
}

async function selectRmas({ tenantId, warehouseId = null, rmaId = null, returnIds = null, transaction = null }) {
  requiredScope(tenantId, warehouseId);
  const replacements = { tenantId, warehouseId, rmaId, returnIds };
  const rmas = await sequelize.query(
    `SELECT
       r.rma_id,
       r.tenant_id,
       r.return_id,
       ret.warehouse_id,
       ret.status AS return_status,
       r.status,
       r.notes,
       r.created_at,
       r.created_by,
       u.user_name AS created_by_name,
       r.updated_at,
       r.cancellation_reason_code,
       r.cancellation_reason,
       r.cancelled_by,
       r.cancelled_at,
       r.closed_at
     FROM public.rma r
     JOIN public.returns ret
       ON ret.tenant_id = r.tenant_id
      AND ret.return_id = r.return_id
     LEFT JOIN public.users u
       ON u.tenant_id = r.tenant_id
      AND u.user_id = r.created_by
     WHERE r.tenant_id = :tenantId
       AND (:warehouseId IS NULL OR ret.warehouse_id = :warehouseId)
       AND (:rmaId IS NULL OR r.rma_id = :rmaId)
       AND (:returnIds IS NULL OR r.return_id IN (:returnIds))
     ORDER BY r.created_at DESC, r.rma_id DESC`,
    { replacements, type: QueryTypes.SELECT, transaction }
  );

  if (!rmas.length) return [];
  const rmaIds = rmas.map((row) => row.rma_id);
  const itemRows = await sequelize.query(
    `SELECT
       ri.rma_item_id,
       ri.tenant_id,
       ri.rma_id,
       ri.sku_id,
       ri.qty,
       ri.reason_code,
       sk.description AS sku_name,
       sk.description AS product_name,
       sk.description AS sku_description
     FROM public.rma_items ri
     LEFT JOIN public.skus sk
       ON sk.tenant_id = ri.tenant_id
      AND sk.sku_id = ri.sku_id
     WHERE ri.tenant_id = :tenantId
       AND ri.rma_id IN (:rmaIds)
     ORDER BY ri.rma_item_id`,
    { replacements: { tenantId, rmaIds }, type: QueryTypes.SELECT, transaction }
  );
  const itemsByRma = new Map();
  itemRows.forEach((item) => {
    const rows = itemsByRma.get(item.rma_id) || [];
    rows.push(item);
    itemsByRma.set(item.rma_id, rows);
  });

  return rmas.map((row) => mapRma({ ...row, items: itemsByRma.get(row.rma_id) || [] }));
}

async function listRmas({ tenantId, warehouseId }) {
  return selectRmas({ tenantId, warehouseId });
}

async function getRma({ tenantId, warehouseId, rmaId, transaction = null }) {
  const rows = await selectRmas({ tenantId, warehouseId, rmaId, transaction });
  return rows[0] || null;
}

async function rmasForReturns({ tenantId, warehouseId, returnIds, transaction = null }) {
  if (!Array.isArray(returnIds) || !returnIds.length) return [];
  return selectRmas({ tenantId, warehouseId, returnIds, transaction });
}

async function createRmaForReturn({ tenantId, warehouseId, returnId, userId, notes = "", auditContext = {} }) {
  const { tenantId: scopedTenantId, warehouseId: scopedWarehouseId } = requiredScope(tenantId, warehouseId);
  return sequelize.transaction(async (transaction) => {
    const returnRecord = await Return.findOne({
      where: { tenant_id: scopedTenantId, warehouse_id: scopedWarehouseId, return_id: returnId },
      include: [{
        model: ReturnItem,
        as: "items",
        required: false,
        include: [{ model: Sku, as: "sku", attributes: ["sku_id", "description"], required: false }],
      }],
      transaction,
    });
    if (!returnRecord) return null;
    const plainReturn = returnRecord.get({ plain: true });

    if (plainReturn.status === "cancelled") {
      throw new ApiError(409, "RETURN_CANCELLED", "Cannot create RMA for a cancelled return");
    }
    if (["received", "closed"].includes(plainReturn.status)) {
      throw new ApiError(409, "RETURN_STATUS_NOT_ELIGIBLE", `Cannot create RMA for return in ${plainReturn.status} status`);
    }

    const existing = await sequelize.query(
      `SELECT rma_id
         FROM public.rma
        WHERE tenant_id = :tenantId
          AND return_id = :returnId
          AND status <> 'cancelled'
        LIMIT 1`,
      { replacements: { tenantId: scopedTenantId, returnId }, type: QueryTypes.SELECT, transaction }
    );
    if (existing[0]) {
      throw new ApiError(409, "RMA_ALREADY_EXISTS", `Return already linked to active RMA ${existing[0].rma_id}`);
    }

    const returnItems = Array.isArray(plainReturn.items) && plainReturn.items.length
      ? plainReturn.items
      : [{
          sku_id: plainReturn.sku_id,
          qty: plainReturn.qty,
          reason_code: plainReturn.reason_code,
        }];
    if (!returnItems.length || returnItems.some((item) => !item.sku_id || Number(item.qty || 0) <= 0)) {
      throw new ApiError(400, "RETURN_ITEMS_REQUIRED", "Return must have at least one valid item before creating RMA");
    }

    const now = new Date();
    const rmaId = await nextRmaId(transaction);
    await sequelize.query(
      `INSERT INTO public.rma (
         rma_id, tenant_id, return_id, status, notes, created_by, created_at, updated_at
       ) VALUES (
         :rmaId, :tenantId, :returnId, 'created', :notes, :createdBy, :now, :now
       )`,
      {
        replacements: { rmaId, tenantId: scopedTenantId, returnId, notes, createdBy: userId || null, now },
        transaction,
      }
    );

    for (const item of returnItems) {
      const itemId = await nextRmaItemId(transaction);
      await sequelize.query(
        `INSERT INTO public.rma_items (
           rma_item_id, tenant_id, rma_id, sku_id, qty, reason_code
         ) VALUES (
           :itemId, :tenantId, :rmaId, :skuId, :qty, :reasonCode
         )`,
        {
          replacements: {
            itemId,
            tenantId: scopedTenantId,
            rmaId,
            skuId: item.sku_id,
            qty: item.qty,
            reasonCode: item.reason_code || item.reason || plainReturn.reason_code || "",
          },
          transaction,
        }
      );
    }

    await recordReturnRmaAuditEvent({
      tenantId: scopedTenantId,
      entityType: "rma",
      entityId: rmaId,
      returnId,
      rmaId,
      actionCode: "rma_created",
      previousStatus: null,
      newStatus: "created",
      remarks: notes || null,
      metadata: {
        return_id: returnId,
        item_count: returnItems.length,
        transition_source: "return_create_rma",
      },
      transaction,
      ...auditActor({ userId, auditContext }),
    });

    const [created] = await selectRmas({ tenantId: scopedTenantId, warehouseId: scopedWarehouseId, rmaId, transaction });
    return created;
  });
}

async function updateRmaStatus({
  tenantId,
  warehouseId,
  rmaId,
  updater,
  auditContext = {},
  actionCode = null,
  remarks = null,
  metadata = {},
}) {
  const { tenantId: scopedTenantId, warehouseId: scopedWarehouseId } = requiredScope(tenantId, warehouseId);
  return sequelize.transaction(async (transaction) => {
    const current = await getRma({ tenantId: scopedTenantId, warehouseId: scopedWarehouseId, rmaId, transaction });
    if (!current) return null;
    const next = updater({ ...current });
    if (!next) return null;
    await sequelize.query(
      `UPDATE public.rma
          SET status = :status,
              updated_at = :updatedAt,
              cancellation_reason_code = :cancellationReasonCode,
              cancellation_reason = :cancellationReason,
              cancelled_by = :cancelledBy,
              cancelled_at = :cancelledAt
        WHERE tenant_id = :tenantId
          AND rma_id = :rmaId`,
      {
        replacements: {
          tenantId: scopedTenantId,
          rmaId,
          status: next.status,
          updatedAt: next.updated_at || new Date(),
          cancellationReasonCode: next.cancellation_reason_code || null,
          cancellationReason: next.cancellation_reason || null,
          cancelledBy: next.cancelled_by || null,
          cancelledAt: next.cancelled_at || null,
        },
        transaction,
      }
    );

    if (actionCode) {
      await recordReturnRmaAuditEvent({
        tenantId: scopedTenantId,
        entityType: "rma",
        entityId: rmaId,
        returnId: current.return_id,
        rmaId,
        actionCode,
        previousStatus: current.status,
        newStatus: next.status,
        remarks,
        metadata: {
          return_id: current.return_id,
          ...metadata,
        },
        transaction,
        ...auditActor({
          userId: auditContext.userId || next.cancelled_by || null,
          auditContext,
        }),
      });
    }

    return getRma({ tenantId: scopedTenantId, warehouseId: scopedWarehouseId, rmaId, transaction });
  });
}

export {
  createRmaForReturn,
  getRma,
  listRmas,
  rmasForReturns,
  updateRmaStatus,
};
