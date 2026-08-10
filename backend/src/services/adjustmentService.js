import { withTenantContext } from "../db/withTenantContext.js";
import { ApiError } from "../utils/errors.js";
import { postInventoryMovement } from "./inventoryPostingService.js";

function clean(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function required(value, message) {
  const result = clean(value);
  if (!result) throw new ApiError(400, "ADJUSTMENT_VALIDATION_ERROR", message);
  return result;
}

function contextValues(context) {
  return {
    tenantId: required(context?.tenantId, "Tenant context is required"),
    warehouseId: required(context?.warehouseId, "Warehouse context is required"),
    userId: required(context?.userId, "User context is required"),
  };
}

function enforceMakerChecker({ userId, createdBy, submittedBy = null }) {
  if (userId && (userId === createdBy || userId === submittedBy)) {
    throw new ApiError(
      403,
      "MAKER_CHECKER_VIOLATION",
      "Maker-checker violation: creator/submitter cannot approve their own document."
    );
  }
}

const allowedAdjustmentStatuses = new Set(["draft", "submitted", "approved", "rejected", "cancelled"]);
const manualAdjustmentLocationTypes = new Set(["storage", "picking", "adjustment", "quarantine"]);

const adjustmentSelect = `
  SELECT
    adjustment.tenant_id,
    adjustment.adj_id,
    adjustment.warehouse_id,
    adjustment.reason AS reason_code,
    upper(adjustment.status) AS status,
    adjustment.created_at AS requested_at,
    adjustment.created_by AS requested_by,
    requested_user.user_name AS requested_by_name,
    CASE
      WHEN requested_user.user_name IS NOT NULL THEN requested_user.user_name || ' (' || adjustment.created_by || ')'
      ELSE adjustment.created_by
    END AS requested_by_display,
    adjustment.submitted_at,
    adjustment.approved_at,
    adjustment.approved_by,
    approved_user.user_name AS approved_by_name,
    CASE
      WHEN approved_user.user_name IS NOT NULL THEN approved_user.user_name || ' (' || adjustment.approved_by || ')'
      ELSE adjustment.approved_by
    END AS approved_by_display,
    adjustment.approval_note,
    adjustment.rejected_at,
    adjustment.rejected_by,
    rejected_user.user_name AS rejected_by_name,
    CASE
      WHEN rejected_user.user_name IS NOT NULL THEN rejected_user.user_name || ' (' || adjustment.rejected_by || ')'
      ELSE adjustment.rejected_by
    END AS rejected_by_display,
    adjustment.rejection_reason,
    adjustment.cancelled_at,
    adjustment.cancelled_by,
    cancelled_user.user_name AS cancelled_by_name,
    CASE
      WHEN cancelled_user.user_name IS NOT NULL THEN cancelled_user.user_name || ' (' || adjustment.cancelled_by || ')'
      ELSE adjustment.cancelled_by
    END AS cancelled_by_display,
    adjustment.cancellation_reason,
    line.adj_line_id,
    line.sku_id,
    sku.sku_code,
    sku.description,
    sku.description AS sku_description,
    sku.category,
    sku.uom,
    line.location_id,
    location.location_code,
    location.location_type,
    location.bin_id,
    line.qty_change AS qty_delta,
    line.lot_no,
    line.serial_no,
    line.notes,
    zone.zone_id,
    zone.zone_code,
    zone.zone_name,
    CASE
      WHEN location.bin_id IS NOT NULL THEN concat_ws(
        '-', warehouse.warehouse_code, zone.zone_code, aisle.aisle_code,
        bay.bay_code, level.level_code, bin.bin_code
      )
      ELSE location.location_code
    END AS display_name
  FROM public.adjustments adjustment
  JOIN public.adjustment_lines line
    ON line.tenant_id = adjustment.tenant_id
   AND line.adj_id = adjustment.adj_id
  JOIN public.skus sku
    ON sku.tenant_id = line.tenant_id
   AND sku.sku_id = line.sku_id
  JOIN public.locations location
    ON location.tenant_id = line.tenant_id
   AND location.location_id = line.location_id
  JOIN public.warehouses warehouse
    ON warehouse.tenant_id = adjustment.tenant_id
   AND warehouse.warehouse_id = adjustment.warehouse_id
  LEFT JOIN public.users requested_user
    ON requested_user.tenant_id = adjustment.tenant_id
   AND requested_user.user_id = adjustment.created_by
  LEFT JOIN public.users approved_user
    ON approved_user.tenant_id = adjustment.tenant_id
   AND approved_user.user_id = adjustment.approved_by
  LEFT JOIN public.users rejected_user
    ON rejected_user.tenant_id = adjustment.tenant_id
   AND rejected_user.user_id = adjustment.rejected_by
  LEFT JOIN public.users cancelled_user
    ON cancelled_user.tenant_id = adjustment.tenant_id
   AND cancelled_user.user_id = adjustment.cancelled_by
  LEFT JOIN public.warehouse_bins bin
    ON bin.tenant_id = location.tenant_id AND bin.bin_id = location.bin_id
  LEFT JOIN public.warehouse_levels level
    ON level.tenant_id = bin.tenant_id AND level.level_id = bin.level_id
  LEFT JOIN public.warehouse_bays bay
    ON bay.tenant_id = level.tenant_id AND bay.bay_id = level.bay_id
  LEFT JOIN public.warehouse_aisles aisle
    ON aisle.tenant_id = bay.tenant_id AND aisle.aisle_id = bay.aisle_id
  LEFT JOIN public.warehouse_zones zone
    ON zone.tenant_id = aisle.tenant_id AND zone.zone_id = aisle.zone_id
`;

async function selectAdjustment(client, tenantId, warehouseId, adjustmentId, lock = false) {
  const result = await client.query(
    `${adjustmentSelect}
     WHERE adjustment.tenant_id = $1
       AND adjustment.warehouse_id = $2
       AND adjustment.adj_id = $3
     ${lock ? "FOR UPDATE OF adjustment, line" : ""}`,
    [tenantId, warehouseId, adjustmentId]
  );
  return result.rows[0] || null;
}

async function listAdjustments(context, filters = {}) {
  const { tenantId, warehouseId } = contextValues(context);
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(10000, Math.max(1, Number(filters.pageSize) || 10));
  const values = [tenantId, warehouseId];
  const clauses = [
    "adjustment.tenant_id = $1",
    "adjustment.warehouse_id = $2",
  ];
  const status = clean(filters.status)?.toLowerCase();
  if (status) {
    if (!allowedAdjustmentStatuses.has(status)) {
      throw new ApiError(400, "ADJUSTMENT_STATUS_INVALID", "Invalid adjustment status filter");
    }
    values.push(status);
    clauses.push(`adjustment.status = $${values.length}`);
  }
  for (const [column, value] of [
    ["line.sku_id", filters.sku_id || filters.skuId],
    ["line.location_id", filters.location_id || filters.locationId],
  ]) {
    const normalized = clean(value);
    if (normalized) {
      values.push(normalized);
      clauses.push(`${column} = $${values.length}`);
    }
  }
  const search = clean(filters.search);
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(
      adjustment.adj_id ILIKE $${values.length}
      OR line.sku_id ILIKE $${values.length}
      OR sku.sku_code ILIKE $${values.length}
      OR line.location_id ILIKE $${values.length}
      OR location.location_code ILIKE $${values.length}
      OR adjustment.reason ILIKE $${values.length}
    )`);
  }

  return withTenantContext(tenantId, async (client) => {
    const where = clauses.join(" AND ");
    const countResult = await client.query(
      `SELECT count(*)::int AS total
       FROM public.adjustments adjustment
       JOIN public.adjustment_lines line
         ON line.tenant_id = adjustment.tenant_id AND line.adj_id = adjustment.adj_id
       JOIN public.skus sku
         ON sku.tenant_id = line.tenant_id AND sku.sku_id = line.sku_id
       JOIN public.locations location
         ON location.tenant_id = line.tenant_id AND location.location_id = line.location_id
       WHERE ${where}`,
      values
    );
    const offset = (page - 1) * pageSize;
    const rows = await client.query(
      `${adjustmentSelect}
       WHERE ${where}
       ORDER BY adjustment.created_at DESC, adjustment.adj_id DESC
       OFFSET $${values.length + 1}
       LIMIT $${values.length + 2}`,
      [...values, offset, pageSize]
    );
    return {
      items: rows.rows,
      total: countResult.rows[0].total,
      page,
      pageSize,
    };
  });
}

async function getAdjustment(context, adjustmentId) {
  const { tenantId, warehouseId } = contextValues(context);
  return withTenantContext(tenantId, async (client) => {
    const adjustment = await selectAdjustment(client, tenantId, warehouseId, adjustmentId);
    if (!adjustment) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Adjustment not found");
    return adjustment;
  });
}

async function validateMasterData(
  client,
  tenantId,
  warehouseId,
  skuId,
  locationId,
  { requireAdjustmentLocationType = false } = {}
) {
  const result = await client.query(
    `SELECT
       sku.sku_id,
       location.location_id,
       location.location_type
     FROM public.skus sku
     CROSS JOIN public.locations location
     WHERE sku.tenant_id = $1
       AND sku.sku_id = $2
       AND sku.status = 'active'
       AND location.tenant_id = $1
       AND location.warehouse_id = $3
       AND location.location_id = $4
       AND location.is_active = true`,
    [tenantId, skuId, warehouseId, locationId]
  );
  if (!result.rowCount) {
    throw new ApiError(
      400,
      "ADJUSTMENT_MASTER_DATA_INVALID",
      "SKU and location must be active and belong to the selected tenant and warehouse"
    );
  }

  if (
    requireAdjustmentLocationType
    && !manualAdjustmentLocationTypes.has(String(result.rows[0].location_type || "").toLowerCase())
  ) {
    throw new ApiError(
      400,
      "ADJUSTMENT_LOCATION_INVALID",
      "Location is not valid for manual inventory adjustment"
    );
  }
}

async function validateReasonCode(client, tenantId, reasonCode) {
  const result = await client.query(
    `SELECT 1
     FROM public.lov_groups reason_group
     JOIN public.lov_values reason
       ON reason.tenant_id = reason_group.tenant_id
      AND reason.lov_group_id = reason_group.lov_group_id
     WHERE reason_group.tenant_id = $1
       AND reason_group.group_code = 'ADJUSTMENT_REASON'
       AND reason.value_code = $2
       AND reason.is_active = true
     LIMIT 1`,
    [tenantId, reasonCode]
  );
  if (!result.rowCount) {
    throw new ApiError(
      400,
      "ADJUSTMENT_REASON_INVALID",
      "A valid adjustment reason code is required"
    );
  }
}

async function createAdjustment(context, payload = {}) {
  const { tenantId, warehouseId, userId } = contextValues(context);
  const skuId = required(payload.sku_id, "SKU is required");
  const locationId = required(payload.location_id, "Location is required");
  const reasonCode = required(payload.reason_code, "Reason code is required").toUpperCase();
  const qtyDelta = Number(payload.qty_delta);
  if (!Number.isFinite(qtyDelta) || qtyDelta === 0) {
    throw new ApiError(400, "ADJUSTMENT_VALIDATION_ERROR", "Adjustment quantity must be non-zero");
  }

  return withTenantContext(tenantId, async (client) => {
    await validateMasterData(
      client,
      tenantId,
      warehouseId,
      skuId,
      locationId,
      { requireAdjustmentLocationType: true }
    );
    await validateReasonCode(client, tenantId, reasonCode);
    const header = await client.query(
      `INSERT INTO public.adjustments (
         tenant_id, warehouse_id, reason, status, created_at, created_by
       )
       VALUES ($1, $2, $3, 'draft', now(), $4)
       RETURNING adj_id`,
      [tenantId, warehouseId, reasonCode, userId]
    );
    const adjustmentId = header.rows[0].adj_id;
    await client.query(
      `INSERT INTO public.adjustment_lines (
         tenant_id, adj_id, sku_id, location_id, qty_change,
         lot_no, serial_no, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        adjustmentId,
        skuId,
        locationId,
        qtyDelta,
        clean(payload.lot_no),
        clean(payload.serial_no),
        clean(payload.notes),
      ]
    );
    return selectAdjustment(client, tenantId, warehouseId, adjustmentId);
  });
}

async function submitAdjustment(context, adjustmentId) {
  const { tenantId, warehouseId } = contextValues(context);
  return withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE public.adjustments
       SET status = 'submitted', submitted_at = now()
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND adj_id = $3
         AND status = 'draft'
       RETURNING adj_id`,
      [tenantId, warehouseId, adjustmentId]
    );
    if (!result.rowCount) {
      const current = await selectAdjustment(client, tenantId, warehouseId, adjustmentId);
      if (!current) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Adjustment not found");
      throw new ApiError(400, "ADJUSTMENT_STATUS_INVALID", `Cannot submit adjustment from ${current.status}`);
    }
    return selectAdjustment(client, tenantId, warehouseId, adjustmentId);
  });
}

async function approveAdjustment(context, adjustmentId, payload = {}) {
  const { tenantId, warehouseId, userId } = contextValues(context);
  const approvalNote = clean(payload.approval_note);
  return withTenantContext(tenantId, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${tenantId}|adjustment|${adjustmentId}`]
    );
    const adjustment = await selectAdjustment(
      client,
      tenantId,
      warehouseId,
      adjustmentId,
      true
    );
    if (!adjustment) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Adjustment not found");

    const existing = await client.query(
      `SELECT *
       FROM public.inventory_transactions
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND reference_type = 'adjustment'
         AND reference_id = $3
         AND posting_key = $4
       LIMIT 1`,
      [tenantId, warehouseId, adjustmentId, `${adjustmentId}:${adjustment.adj_line_id}`]
    );
    if (adjustment.status === "APPROVED" && existing.rowCount) {
      return {
        adjustment,
        transaction: existing.rows[0],
        balances: [],
        idempotent: true,
      };
    }
    if (adjustment.status !== "SUBMITTED") {
      throw new ApiError(
        400,
        "ADJUSTMENT_STATUS_INVALID",
        `Cannot approve adjustment from ${adjustment.status}`
      );
    }
    enforceMakerChecker({
      userId,
      createdBy: adjustment.requested_by,
    });

    const qtyDelta = Number(adjustment.qty_delta);
    if (!Number.isFinite(qtyDelta) || qtyDelta === 0) {
      throw new ApiError(400, "ADJUSTMENT_VALIDATION_ERROR", "Adjustment quantity must be non-zero");
    }
    await validateMasterData(
      client,
      tenantId,
      warehouseId,
      adjustment.sku_id,
      adjustment.location_id
    );
    const posting = await postInventoryMovement({
      tenantId,
      warehouseId,
      skuId: adjustment.sku_id,
      fromLocationId: qtyDelta < 0 ? adjustment.location_id : null,
      toLocationId: qtyDelta > 0 ? adjustment.location_id : null,
      lotNo: adjustment.lot_no,
      serialNo: adjustment.serial_no,
      qty: Math.abs(qtyDelta),
      transactionType: "adjustment",
      referenceType: "adjustment",
      referenceId: adjustmentId,
      postingKey: `${adjustmentId}:${adjustment.adj_line_id}`,
      userId,
      reasonCode: adjustment.reason_code,
      notes: approvalNote || `Approved inventory adjustment ${adjustmentId}`,
      dbClient: client,
    });
    await client.query(
      `UPDATE public.inventory_transactions
       SET qty = $1,
           tx_type = 'ADJUSTMENT',
           txn_type = 'ADJUSTMENT'
       WHERE tenant_id = $2
         AND warehouse_id = $3
         AND itx_id = $4`,
      [qtyDelta, tenantId, warehouseId, posting.transaction.itx_id]
    );
    await client.query(
      `UPDATE public.adjustments
       SET status = 'approved',
           approved_at = now(),
           approved_by = $4,
           approval_note = $5
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND adj_id = $3`,
      [tenantId, warehouseId, adjustmentId, userId, approvalNote]
    );
    return {
      adjustment: await selectAdjustment(client, tenantId, warehouseId, adjustmentId),
      transaction: { ...posting.transaction, qty: qtyDelta, tx_type: "ADJUSTMENT", txn_type: "ADJUSTMENT" },
      balances: posting.balances,
      idempotent: posting.idempotent,
    };
  });
}

async function rejectAdjustment(context, adjustmentId, payload = {}) {
  const { tenantId, warehouseId, userId } = contextValues(context);
  const reason = required(payload.reason, "Rejection reason is required");
  return withTenantContext(tenantId, async (client) => {
    const adjustment = await selectAdjustment(client, tenantId, warehouseId, adjustmentId, true);
    if (!adjustment) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Adjustment not found");
    if (adjustment.status !== "SUBMITTED") {
      throw new ApiError(400, "ADJUSTMENT_STATUS_INVALID", `Cannot reject adjustment from ${adjustment.status}`);
    }
    enforceMakerChecker({
      userId,
      createdBy: adjustment.requested_by,
    });

    await client.query(
      `UPDATE public.adjustments
       SET status = 'rejected',
           rejected_at = now(),
           rejected_by = $4,
           rejection_reason = $5
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND adj_id = $3`,
      [tenantId, warehouseId, adjustmentId, userId, reason]
    );
    return selectAdjustment(client, tenantId, warehouseId, adjustmentId);
  });
}

async function cancelAdjustment(context, adjustmentId, payload = {}) {
  const { tenantId, warehouseId, userId } = contextValues(context);
  if (payload.confirmed !== true) {
    throw new ApiError(
      400,
      "CANCELLATION_CONFIRMATION_REQUIRED",
      "Cancellation confirmation is required"
    );
  }
  const reason = required(payload.reason, "Cancellation reason is required");
  if (reason.length < 5) {
    throw new ApiError(
      400,
      "ADJUSTMENT_VALIDATION_ERROR",
      "Cancellation reason must be at least 5 characters"
    );
  }
  return withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE public.adjustments
       SET status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = $4,
           cancellation_reason = $5
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND adj_id = $3
         AND status IN ('draft', 'submitted')
       RETURNING adj_id`,
      [tenantId, warehouseId, adjustmentId, userId, reason]
    );
    if (!result.rowCount) {
      const current = await selectAdjustment(client, tenantId, warehouseId, adjustmentId);
      if (!current) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Adjustment not found");
      throw new ApiError(400, "ADJUSTMENT_STATUS_INVALID", `Cannot cancel adjustment from ${current.status}`);
    }
    return selectAdjustment(client, tenantId, warehouseId, adjustmentId);
  });
}

export {
  approveAdjustment,
  cancelAdjustment,
  createAdjustment,
  getAdjustment,
  listAdjustments,
  rejectAdjustment,
  submitAdjustment,
};
