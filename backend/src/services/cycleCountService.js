import { withTenantContext } from "../db/withTenantContext.js";
import { ApiError } from "../utils/errors.js";

const UI_STATUS = {
  planned: "DRAFT",
  assigned: "ASSIGNED",
  in_progress: "COUNTING",
  submitted: "SUBMITTED",
  approved: "APPROVED",
  reconciled: "APPROVED",
  closed: "APPROVED",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
};

const OPERATOR_ROLES = ["operator", "storeoperator", "warehouseoperator"];
const APPROVER_VISIBLE_STATUSES = ["submitted", "approved", "rejected"];

function clean(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function required(value, message) {
  const result = clean(value);
  if (!result) throw new ApiError(400, "CYCLE_COUNT_VALIDATION_ERROR", message);
  return result;
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

function contextHasRole(context, roles) {
  const allowed = new Set(roles);
  return Array.isArray(context?.roles)
    && context.roles.some((role) => allowed.has(String(role).toLowerCase()));
}

function mapLine(row) {
  const expectedQty = Number(row.expected_qty);
  const countedQty = row.counted_qty === null ? null : Number(row.counted_qty);
  return {
    line_id: row.ccl_id,
    ccl_id: row.ccl_id,
    count_id: row.cc_id,
    cc_id: row.cc_id,
    tenant_id: row.tenant_id,
    sku_id: row.sku_id,
    sku_code: row.sku_code,
    sku_description: row.description,
    description: row.description,
    category: row.category,
    location_id: row.location_id,
    location_code: row.location_code,
    display_name: row.display_name || row.location_code,
    zone_id: row.line_zone_id,
    zone_code: row.line_zone_code,
    zone_name: row.line_zone_name,
    system_qty: expectedQty,
    expected_qty: expectedQty,
    counted_qty: countedQty,
    variance_qty: countedQty === null ? null : countedQty - expectedQty,
    status: String(row.line_status || "pending").toUpperCase(),
    notes: row.line_notes,
  };
}

function mapPlan(row, lines = undefined) {
  const result = {
    count_id: row.cc_id,
    cc_id: row.cc_id,
    tenant_id: row.tenant_id,
    warehouse_id: row.warehouse_id,
    zone_id: row.zone_id,
    zone_code: row.zone_code,
    zone_name: row.zone_name,
    planned_date: row.planned_date || row.scheduled_at,
    status: UI_STATUS[row.status] || String(row.status || "").toUpperCase(),
    scope_type: row.scope_type,
    scope_location_id: row.scope_location_id,
    scope_sku_ids: row.scope_sku_ids || [],
    created_at: row.created_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    created_by_display: row.created_by_display || row.created_by,
    assigned_to_user_id: row.assigned_to_user_id,
    assigned_to: row.assigned_to_user_id,
    assigned_to_name: row.assigned_to_name,
    assigned_to_display: row.assigned_to_display || row.assigned_to_user_id,
    assigned_by: row.assigned_by,
    assigned_by_name: row.assigned_by_name,
    assigned_by_display: row.assigned_by_display || row.assigned_by,
    assigned_at: row.assigned_at,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    submitted_by_name: row.submitted_by_name,
    submitted_by_display: row.submitted_by_display || row.submitted_by,
    approved_at: row.approved_at,
    approved_by: row.approved_by,
    approved_by_name: row.approved_by_name,
    approved_by_display: row.approved_by_display || row.approved_by,
    approval_reason_code: row.approval_reason_code,
    approval_note: row.approval_note,
    rejected_at: row.rejected_at,
    rejected_by: row.rejected_by,
    rejected_by_name: row.rejected_by_name,
    rejected_by_display: row.rejected_by_display || row.rejected_by,
    cancellation_reason: row.cancellation_reason,
    lines_count: Number(row.lines_count || 0),
  };
  if (lines) result.lines = lines.map(mapLine);
  return result;
}

const planSelect = `
  SELECT
    cc.*,
    zone.zone_code,
    zone.zone_name,
    max(created_user.user_name) AS created_by_name,
    max(
      CASE
        WHEN created_user.user_name IS NOT NULL THEN created_user.user_name || ' (' || cc.created_by || ')'
        ELSE cc.created_by
      END
    ) AS created_by_display,
    max(assigned_to_user.user_name) AS assigned_to_name,
    max(
      CASE
        WHEN assigned_to_user.user_name IS NOT NULL THEN assigned_to_user.user_name || ' (' || cc.assigned_to_user_id || ')'
        ELSE cc.assigned_to_user_id
      END
    ) AS assigned_to_display,
    max(assigned_by_user.user_name) AS assigned_by_name,
    max(
      CASE
        WHEN assigned_by_user.user_name IS NOT NULL THEN assigned_by_user.user_name || ' (' || cc.assigned_by || ')'
        ELSE cc.assigned_by
      END
    ) AS assigned_by_display,
    max(submitted_user.user_name) AS submitted_by_name,
    max(
      CASE
        WHEN submitted_user.user_name IS NOT NULL THEN submitted_user.user_name || ' (' || cc.submitted_by || ')'
        ELSE cc.submitted_by
      END
    ) AS submitted_by_display,
    max(approved_user.user_name) AS approved_by_name,
    max(
      CASE
        WHEN approved_user.user_name IS NOT NULL THEN approved_user.user_name || ' (' || cc.approved_by || ')'
        ELSE cc.approved_by
      END
    ) AS approved_by_display,
    max(rejected_user.user_name) AS rejected_by_name,
    max(
      CASE
        WHEN rejected_user.user_name IS NOT NULL THEN rejected_user.user_name || ' (' || cc.rejected_by || ')'
        ELSE cc.rejected_by
      END
    ) AS rejected_by_display,
    count(ccl.ccl_id)::int AS lines_count
  FROM public.cycle_counts cc
  LEFT JOIN public.warehouse_zones zone
    ON zone.tenant_id = cc.tenant_id
   AND zone.zone_id = cc.zone_id
  LEFT JOIN public.users created_user
    ON created_user.tenant_id = cc.tenant_id
   AND created_user.user_id = cc.created_by
  LEFT JOIN public.users assigned_to_user
    ON assigned_to_user.tenant_id = cc.tenant_id
   AND assigned_to_user.user_id = cc.assigned_to_user_id
  LEFT JOIN public.users assigned_by_user
    ON assigned_by_user.tenant_id = cc.tenant_id
   AND assigned_by_user.user_id = cc.assigned_by
  LEFT JOIN public.users submitted_user
    ON submitted_user.tenant_id = cc.tenant_id
   AND submitted_user.user_id = cc.submitted_by
  LEFT JOIN public.users approved_user
    ON approved_user.tenant_id = cc.tenant_id
   AND approved_user.user_id = cc.approved_by
  LEFT JOIN public.users rejected_user
    ON rejected_user.tenant_id = cc.tenant_id
   AND rejected_user.user_id = cc.rejected_by
  LEFT JOIN public.cycle_count_lines ccl
    ON ccl.tenant_id = cc.tenant_id
   AND ccl.cc_id = cc.cc_id
`;

const planGroup = `
  GROUP BY cc.cc_id, zone.zone_code, zone.zone_name
`;

async function selectPlan(client, tenantId, warehouseId, countId) {
  const result = await client.query(
    `${planSelect}
     WHERE cc.tenant_id = $1
       AND cc.warehouse_id = $2
       AND cc.cc_id = $3
     ${planGroup}`,
    [tenantId, warehouseId, countId]
  );
  return result.rows[0] || null;
}

async function selectLines(client, tenantId, warehouseId, countId) {
  const result = await client.query(
    `SELECT
       ccl.*,
       sku.sku_code,
       sku.description,
       sku.category,
       location.location_code,
       CASE
         WHEN location.bin_id IS NOT NULL THEN concat_ws(
           '-', warehouse.warehouse_code, zone.zone_code, aisle.aisle_code,
           bay.bay_code, level.level_code, bin.bin_code
         )
         ELSE location.location_code
       END AS display_name,
       zone.zone_id AS line_zone_id,
       zone.zone_code AS line_zone_code,
       zone.zone_name AS line_zone_name,
       ccl.status AS line_status,
       ccl.notes AS line_notes
     FROM public.cycle_count_lines ccl
     JOIN public.cycle_counts cc
       ON cc.tenant_id = ccl.tenant_id
      AND cc.cc_id = ccl.cc_id
     JOIN public.skus sku
       ON sku.tenant_id = ccl.tenant_id
      AND sku.sku_id = ccl.sku_id
     JOIN public.locations location
       ON location.tenant_id = ccl.tenant_id
      AND location.location_id = ccl.location_id
     JOIN public.warehouses warehouse
       ON warehouse.tenant_id = cc.tenant_id
      AND warehouse.warehouse_id = cc.warehouse_id
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
     WHERE ccl.tenant_id = $1
       AND cc.warehouse_id = $2
       AND ccl.cc_id = $3
     ORDER BY ccl.ccl_id`,
    [tenantId, warehouseId, countId]
  );
  return result.rows;
}

function isOperatorContext(context) {
  return contextHasRole(context, OPERATOR_ROLES);
}

function isApprovalViewerContext(context) {
  return contextHasRole(context, ["warehousemanager", "manager", "storemanager"]);
}

function assertAssignedOperator(plan, context) {
  const userId = required(context?.userId, "User context is required");
  if (!plan.assigned_to_user_id) {
    throw new ApiError(400, "CYCLE_COUNT_NOT_ASSIGNED", "Cycle count must be assigned before counting.");
  }
  if (plan.assigned_to_user_id !== userId) {
    throw new ApiError(403, "CYCLE_COUNT_ASSIGNEE_REQUIRED", "Only the assigned operator can update this cycle count.");
  }
}

async function validateAssignableOperator(client, tenantId, warehouseId, operatorId) {
  const result = await client.query(
    `SELECT
       u.user_id,
       u.user_name,
       max(ur.role_id) FILTER (WHERE ur.role_id = ANY($4::text[])) AS role_id
     FROM public.users u
     JOIN public.user_roles ur
       ON ur.tenant_id = u.tenant_id
      AND ur.user_id = u.user_id
     JOIN public.user_warehouses uw
       ON uw.tenant_id = u.tenant_id
      AND uw.user_id = u.user_id
      AND uw.warehouse_id = $2
     WHERE u.tenant_id = $1
       AND u.user_id = $3
       AND COALESCE(u.is_active, true) = true
       AND ur.role_id = ANY($4::text[])
     GROUP BY u.user_id, u.user_name`,
    [tenantId, warehouseId, operatorId, OPERATOR_ROLES]
  );
  if (!result.rowCount) {
    throw new ApiError(400, "INVALID_CYCLE_COUNT_OPERATOR", "Selected user must be an operational warehouse user.");
  }
  return result.rows[0];
}

async function postCycleCountVariance(client, {
  tenantId,
  warehouseId,
  countId,
  lineId,
  skuId,
  locationId,
  variance,
  userId,
  reasonCode,
  approvalNote,
}) {
  const postingKey = `${countId}:${lineId}`;
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`${tenantId}|cycle-count-posting|${postingKey}`]
  );

  const existing = await client.query(
    `SELECT *
     FROM public.inventory_transactions
     WHERE tenant_id = $1
       AND reference_type = 'cycle_count'
       AND reference_id = $2
       AND posting_key = $3
     LIMIT 1`,
    [tenantId, countId, postingKey]
  );
  if (existing.rowCount) {
    return { transaction: existing.rows[0], idempotent: true };
  }

  const target = await client.query(
    `SELECT
       sku.sku_id,
       sku.status AS sku_status,
       location.location_id,
       location.is_active
     FROM public.skus sku
     JOIN public.locations location
       ON location.tenant_id = sku.tenant_id
      AND location.location_id = $4
      AND location.warehouse_id = $2
     WHERE sku.tenant_id = $1
       AND sku.sku_id = $3`,
    [tenantId, warehouseId, skuId, locationId]
  );
  if (!target.rowCount) {
    throw new ApiError(400, "INVALID_INVENTORY_TARGET", "Cycle count line has invalid SKU or location for this tenant and warehouse");
  }
  if (String(target.rows[0].sku_status || "").toLowerCase() !== "active" || !target.rows[0].is_active) {
    throw new ApiError(400, "INACTIVE_INVENTORY_TARGET", "Cycle count line has inactive SKU or location");
  }

  await client.query(
    `INSERT INTO public.inventory_balances (
       tenant_id,
       inv_balance_id,
       warehouse_id,
       sku_id,
       location_id,
       lot_no,
       serial_no,
       qty_on_hand,
       qty_reserved,
       qty_quarantine
     )
     SELECT
       $1,
       'INV' || lpad(nextval('inv_balance_id_seq')::text, 6, '0'),
       $2,
       $3,
       $4,
       NULL,
       NULL,
       0,
       0,
       0
     WHERE NOT EXISTS (
       SELECT 1
       FROM public.inventory_balances
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND sku_id = $3
         AND location_id = $4
         AND lot_no IS NULL
         AND serial_no IS NULL
     )`,
    [tenantId, warehouseId, skuId, locationId]
  );

  const balance = await client.query(
    `SELECT inv_balance_id, qty_on_hand
     FROM public.inventory_balances
     WHERE tenant_id = $1
       AND warehouse_id = $2
       AND sku_id = $3
       AND location_id = $4
       AND lot_no IS NULL
       AND serial_no IS NULL
     FOR UPDATE`,
    [tenantId, warehouseId, skuId, locationId]
  );
  if (!balance.rowCount) {
    throw new ApiError(500, "INVENTORY_BALANCE_NOT_FOUND", "Inventory balance could not be created for cycle count adjustment");
  }

  const nextQty = Number(balance.rows[0].qty_on_hand || 0) + variance;
  await client.query(
    `UPDATE public.inventory_balances
     SET qty_on_hand = $1,
         updated_at = now()
     WHERE tenant_id = $2
       AND inv_balance_id = $3`,
    [nextQty, tenantId, balance.rows[0].inv_balance_id]
  );

  const inserted = await client.query(
    `WITH next_transaction AS (
       SELECT 'ITX' || lpad(nextval('itx_id_seq')::text, 6, '0') AS itx_id
     )
     INSERT INTO public.inventory_transactions (
       tenant_id,
       itx_id,
       txn_id,
       warehouse_id,
       sku_id,
       from_location_id,
       to_location_id,
       lot_no,
       serial_no,
       qty,
       transaction_type,
       tx_type,
       txn_type,
       reference_type,
       reference_id,
       ref_type,
       ref_id,
       posting_key,
       reason_code,
       notes,
       created_by,
       created_at,
       tx_at
     )
     SELECT
       $1,
       next_transaction.itx_id,
       next_transaction.itx_id,
       $2,
       $3,
       CASE WHEN $5::numeric < 0 THEN $4 ELSE NULL END,
       CASE WHEN $5::numeric > 0 THEN $4 ELSE NULL END,
       NULL,
       NULL,
       $5,
       'adjustment',
       'ADJUSTMENT',
       'ADJUSTMENT',
       'cycle_count',
       $6,
       'cycle_count',
       $6,
       $7,
       $8,
       $9,
       $10,
       now(),
       now()
     FROM next_transaction
     RETURNING *`,
    [
      tenantId,
      warehouseId,
      skuId,
      locationId,
      variance,
      countId,
      postingKey,
      reasonCode,
      approvalNote || `Cycle count variance ${countId}`,
      userId,
    ]
  );
  return { transaction: inserted.rows[0], idempotent: false };
}

async function getCycleCount(context, countId) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const userId = clean(context?.userId);
  return withTenantContext(tenantId, async (client) => {
    const plan = await selectPlan(client, tenantId, warehouseId, countId);
    if (!plan) throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    if (isOperatorContext(context) && plan.assigned_to_user_id !== userId) {
      throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    }
    if (isApprovalViewerContext(context) && !APPROVER_VISIBLE_STATUSES.includes(plan.status)) {
      throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    }
    const lines = await selectLines(client, tenantId, warehouseId, countId);
    return mapPlan(plan, lines);
  });
}

async function listCycleCounts(context, filters = {}) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  return withTenantContext(tenantId, async (client) => {
    const params = [tenantId, warehouseId];
    let where = "WHERE cc.tenant_id = $1 AND cc.warehouse_id = $2";
    const search = clean(filters.search);
    const status = clean(filters.status)?.toLowerCase();
    const zoneId = clean(filters.zoneId || filters.zone_id);
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (cc.cc_id ILIKE $${params.length} OR zone.zone_name ILIKE $${params.length})`;
    }
    if (status) {
      const dbStatus = Object.entries(UI_STATUS).find(([, ui]) => ui.toLowerCase() === status)?.[0] || status;
      params.push(dbStatus);
      where += ` AND cc.status = $${params.length}`;
    }
    if (zoneId) {
      params.push(zoneId);
      where += ` AND cc.zone_id = $${params.length}`;
    }
    if (isOperatorContext(context)) {
      const userId = required(context?.userId, "User context is required");
      params.push(userId);
      where += ` AND cc.assigned_to_user_id = $${params.length}`;
    } else if (isApprovalViewerContext(context)) {
      params.push(APPROVER_VISIBLE_STATUSES);
      where += ` AND cc.status = ANY($${params.length}::text[])`;
    }
    const result = await client.query(
      `${planSelect} ${where} ${planGroup} ORDER BY cc.created_at DESC, cc.cc_id DESC`,
      params
    );
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.max(1, Number(filters.pageSize) || 10);
    const items = result.rows.map((row) => mapPlan(row));
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    };
  });
}

async function createCycleCount(context, payload = {}) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const userId = required(context?.userId, "User context is required");
  const zoneId = required(payload.zone_id, "Zone is required");
  const scopeType = clean(payload.scope_type || "FULL_ZONE").toUpperCase();
  const scopeLocationId = clean(payload.scope_location_id);
  const scopeSkuIds = Array.isArray(payload.scope_sku_ids)
    ? [...new Set(payload.scope_sku_ids.map(clean).filter(Boolean))]
    : [];
  const plannedDate = clean(payload.planned_date) || new Date().toISOString().slice(0, 10);

  if (!["FULL_ZONE", "BY_LOCATION", "BY_SKU"].includes(scopeType)) {
    throw new ApiError(400, "INVALID_SCOPE_TYPE", "Scope type is invalid");
  }
  if (scopeType === "BY_LOCATION" && !scopeLocationId) {
    throw new ApiError(400, "INVALID_SCOPE", "Location is required for this scope");
  }
  if (scopeType === "BY_SKU" && !scopeSkuIds.length) {
    throw new ApiError(400, "INVALID_SCOPE", "At least one SKU is required for this scope");
  }

  return withTenantContext(tenantId, async (client) => {
    const zone = await client.query(
      `SELECT zone_id, warehouse_id, status
       FROM public.warehouse_zones
       WHERE tenant_id = $1
         AND zone_id = $2`,
      [tenantId, zoneId]
    );
    if (!zone.rowCount) {
      throw new ApiError(400, "INVALID_ZONE", "Selected zone does not exist.");
    }
    if (zone.rows[0].warehouse_id !== warehouseId) {
      throw new ApiError(400, "INVALID_ZONE_WAREHOUSE", "Selected zone does not belong to the current warehouse.");
    }
    if (zone.rows[0].status !== "active") {
      throw new ApiError(400, "INACTIVE_ZONE", "Selected zone is inactive and cannot be used for cycle counting.");
    }

    const params = [tenantId, warehouseId, zoneId];
    let extra = "";
    if (scopeType === "BY_LOCATION") {
      params.push(scopeLocationId);
      extra += ` AND balance.location_id = $${params.length}`;
    }
    if (scopeType === "BY_SKU") {
      params.push(scopeSkuIds);
      extra += ` AND balance.sku_id = ANY($${params.length}::text[])`;
    }
    const balances = await client.query(
      `SELECT
         balance.sku_id,
         balance.location_id,
         sum(balance.qty_on_hand)::numeric AS expected_qty
       FROM public.inventory_balances balance
       JOIN public.locations location
         ON location.tenant_id = balance.tenant_id
        AND location.location_id = balance.location_id
        AND location.warehouse_id = balance.warehouse_id
        AND location.is_active = true
       JOIN public.warehouse_bins bin
         ON bin.tenant_id = location.tenant_id AND bin.bin_id = location.bin_id
       JOIN public.warehouse_levels level
         ON level.tenant_id = bin.tenant_id AND level.level_id = bin.level_id
       JOIN public.warehouse_bays bay
         ON bay.tenant_id = level.tenant_id AND bay.bay_id = level.bay_id
       JOIN public.warehouse_aisles aisle
         ON aisle.tenant_id = bay.tenant_id AND aisle.aisle_id = bay.aisle_id
       WHERE balance.tenant_id = $1
         AND balance.warehouse_id = $2
         AND aisle.zone_id = $3
         ${extra}
       GROUP BY balance.sku_id, balance.location_id
       HAVING sum(balance.qty_on_hand) > 0
       ORDER BY balance.sku_id, balance.location_id`,
      params
    );
    if (!balances.rowCount) {
      throw new ApiError(400, "CYCLE_COUNT_EMPTY_SCOPE", "No PostgreSQL inventory balances found for the selected scope");
    }

    const header = await client.query(
      `INSERT INTO public.cycle_counts (
         tenant_id, warehouse_id, zone_id, planned_date, scheduled_at,
         status, scope_type, scope_location_id, scope_sku_ids,
         created_at, created_by
       )
       VALUES ($1, $2, $3, $4::date, $4::date, 'planned', $5, $6, $7, now(), $8)
       RETURNING cc_id`,
      [tenantId, warehouseId, zoneId, plannedDate, scopeType, scopeLocationId, scopeSkuIds, userId]
    );
    const countId = header.rows[0].cc_id;
    for (const row of balances.rows) {
      await client.query(
        `INSERT INTO public.cycle_count_lines (
           tenant_id, cc_id, sku_id, location_id, expected_qty,
           counted_qty, status
         )
         VALUES ($1, $2, $3, $4, $5, NULL, 'pending')`,
        [tenantId, countId, row.sku_id, row.location_id, row.expected_qty]
      );
    }
    const plan = await selectPlan(client, tenantId, warehouseId, countId);
    return mapPlan(plan, await selectLines(client, tenantId, warehouseId, countId));
  });
}

async function updateCycleCount(context, countId, payload = {}) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const zoneId = required(payload.zone_id, "Zone is required");
  const scopeType = clean(payload.scope_type || "FULL_ZONE").toUpperCase();
  const scopeLocationId = clean(payload.scope_location_id);
  const scopeSkuIds = Array.isArray(payload.scope_sku_ids)
    ? [...new Set(payload.scope_sku_ids.map(clean).filter(Boolean))]
    : [];
  const plannedDate = clean(payload.planned_date) || new Date().toISOString().slice(0, 10);

  if (!["FULL_ZONE", "BY_LOCATION", "BY_SKU"].includes(scopeType)) {
    throw new ApiError(400, "INVALID_SCOPE_TYPE", "Scope type is invalid");
  }
  if (scopeType === "BY_LOCATION" && !scopeLocationId) {
    throw new ApiError(400, "INVALID_SCOPE", "Location is required for this scope");
  }
  if (scopeType === "BY_SKU" && !scopeSkuIds.length) {
    throw new ApiError(400, "INVALID_SCOPE", "At least one SKU is required for this scope");
  }

  return withTenantContext(tenantId, async (client) => {
    const locked = await client.query(
      `SELECT status
       FROM public.cycle_counts
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND cc_id = $3
       FOR UPDATE`,
      [tenantId, warehouseId, countId]
    );
    if (!locked.rowCount) throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    if (locked.rows[0].status !== "planned") {
      throw new ApiError(400, "CYCLE_COUNT_STATUS_INVALID", "Only draft cycle counts can be edited");
    }

    const zone = await client.query(
      `SELECT zone_id, warehouse_id, status
       FROM public.warehouse_zones
       WHERE tenant_id = $1
         AND zone_id = $2`,
      [tenantId, zoneId]
    );
    if (!zone.rowCount) {
      throw new ApiError(400, "INVALID_ZONE", "Selected zone does not exist.");
    }
    if (zone.rows[0].warehouse_id !== warehouseId) {
      throw new ApiError(400, "INVALID_ZONE_WAREHOUSE", "Selected zone does not belong to the current warehouse.");
    }
    if (zone.rows[0].status !== "active") {
      throw new ApiError(400, "INACTIVE_ZONE", "Selected zone is inactive and cannot be used for cycle counting.");
    }

    const params = [tenantId, warehouseId, zoneId];
    let extra = "";
    if (scopeType === "BY_LOCATION") {
      params.push(scopeLocationId);
      extra += ` AND balance.location_id = $${params.length}`;
    }
    if (scopeType === "BY_SKU") {
      params.push(scopeSkuIds);
      extra += ` AND balance.sku_id = ANY($${params.length}::text[])`;
    }
    const balances = await client.query(
      `SELECT
         balance.sku_id,
         balance.location_id,
         sum(balance.qty_on_hand)::numeric AS expected_qty
       FROM public.inventory_balances balance
       JOIN public.locations location
         ON location.tenant_id = balance.tenant_id
        AND location.location_id = balance.location_id
        AND location.warehouse_id = balance.warehouse_id
        AND location.is_active = true
       JOIN public.warehouse_bins bin
         ON bin.tenant_id = location.tenant_id AND bin.bin_id = location.bin_id
       JOIN public.warehouse_levels level
         ON level.tenant_id = bin.tenant_id AND level.level_id = bin.level_id
       JOIN public.warehouse_bays bay
         ON bay.tenant_id = level.tenant_id AND bay.bay_id = level.bay_id
       JOIN public.warehouse_aisles aisle
         ON aisle.tenant_id = bay.tenant_id AND aisle.aisle_id = bay.aisle_id
       WHERE balance.tenant_id = $1
         AND balance.warehouse_id = $2
         AND aisle.zone_id = $3
         ${extra}
       GROUP BY balance.sku_id, balance.location_id
       HAVING sum(balance.qty_on_hand) > 0
       ORDER BY balance.sku_id, balance.location_id`,
      params
    );
    if (!balances.rowCount) {
      throw new ApiError(400, "CYCLE_COUNT_EMPTY_SCOPE", "No PostgreSQL inventory balances found for the selected scope");
    }

    await client.query(
      `UPDATE public.cycle_counts
       SET zone_id = $4,
           planned_date = $5::date,
           scheduled_at = $5::date,
           scope_type = $6,
           scope_location_id = $7,
           scope_sku_ids = $8
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND cc_id = $3`,
      [tenantId, warehouseId, countId, zoneId, plannedDate, scopeType, scopeLocationId, scopeSkuIds]
    );
    await client.query(
      `DELETE FROM public.cycle_count_lines
       WHERE tenant_id = $1
         AND cc_id = $2`,
      [tenantId, countId]
    );
    for (const row of balances.rows) {
      await client.query(
        `INSERT INTO public.cycle_count_lines (
           tenant_id, cc_id, sku_id, location_id, expected_qty,
           counted_qty, status
         )
         VALUES ($1, $2, $3, $4, $5, NULL, 'pending')`,
        [tenantId, countId, row.sku_id, row.location_id, row.expected_qty]
      );
    }
    return mapPlan(
      await selectPlan(client, tenantId, warehouseId, countId),
      await selectLines(client, tenantId, warehouseId, countId)
    );
  });
}

async function listCycleCountOperators(context) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  return withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `SELECT DISTINCT
         u.user_id,
         u.user_name,
         ur.role_id,
         u.user_name || ' (' || u.user_id || ')' AS display_name
       FROM public.users u
       JOIN public.user_roles ur
         ON ur.tenant_id = u.tenant_id
        AND ur.user_id = u.user_id
       JOIN public.user_warehouses uw
         ON uw.tenant_id = u.tenant_id
        AND uw.user_id = u.user_id
        AND uw.warehouse_id = $2
       WHERE u.tenant_id = $1
         AND COALESCE(u.is_active, true) = true
         AND ur.role_id = ANY($3::text[])
       ORDER BY u.user_name, u.user_id`,
      [tenantId, warehouseId, OPERATOR_ROLES]
    );
    return { items: result.rows };
  });
}

async function assignCycleCount(context, countId, payload = {}) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const userId = required(context?.userId, "User context is required");
  const operatorId = required(
    payload.assigned_to_user_id || payload.assignedToUserId || payload.operator_id || payload.user_id,
    "Operator is required"
  );

  return withTenantContext(tenantId, async (client) => {
    await validateAssignableOperator(client, tenantId, warehouseId, operatorId);
    const locked = await client.query(
      `SELECT status
       FROM public.cycle_counts
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND cc_id = $3
       FOR UPDATE`,
      [tenantId, warehouseId, countId]
    );
    if (!locked.rowCount) throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    if (!["planned", "assigned"].includes(locked.rows[0].status)) {
      throw new ApiError(400, "CYCLE_COUNT_STATUS_INVALID", "Only draft or assigned counts can be assigned");
    }

    await client.query(
      `UPDATE public.cycle_counts
       SET status = 'assigned',
           assigned_to_user_id = $4,
           assigned_by = $5,
           assigned_at = now()
       WHERE tenant_id = $1
         AND warehouse_id = $2
         AND cc_id = $3`,
      [tenantId, warehouseId, countId, operatorId, userId]
    );
    return mapPlan(
      await selectPlan(client, tenantId, warehouseId, countId),
      await selectLines(client, tenantId, warehouseId, countId)
    );
  });
}

async function startCycleCount(context, countId) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  return withTenantContext(tenantId, async (client) => {
    const locked = await client.query(
      `SELECT status, assigned_to_user_id
       FROM public.cycle_counts
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3
       FOR UPDATE`,
      [tenantId, warehouseId, countId]
    );
    if (!locked.rowCount) throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    assertAssignedOperator(locked.rows[0], context);
    if (locked.rows[0].status !== "assigned") {
      throw new ApiError(400, "CYCLE_COUNT_STATUS_INVALID", "Only assigned counts can be started");
    }
    await client.query(
      `UPDATE public.cycle_counts
       SET status = 'in_progress',
           started_at = COALESCE(started_at, now())
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3`,
      [tenantId, warehouseId, countId]
    );
    return mapPlan(
      await selectPlan(client, tenantId, warehouseId, countId),
      await selectLines(client, tenantId, warehouseId, countId)
    );
  });
}

async function addCycleCountEntry(context, countId, payload = {}) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const lineId = clean(payload.line_id);
  const scannedValue = clean(payload.scanned_value);
  const countedQty = Number(payload.qty_counted);
  if (!Number.isFinite(countedQty) || countedQty < 0) {
    throw new ApiError(400, "CYCLE_COUNT_VALIDATION_ERROR", "Counted quantity must be 0 or greater");
  }

  return withTenantContext(tenantId, async (client) => {
    const plan = await client.query(
      `SELECT status, created_by, submitted_by, assigned_to_user_id FROM public.cycle_counts
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3 FOR UPDATE`,
      [tenantId, warehouseId, countId]
    );
    if (!plan.rowCount) throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    assertAssignedOperator(plan.rows[0], context);
    if (!["assigned", "in_progress"].includes(plan.rows[0].status)) {
      throw new ApiError(400, "CYCLE_COUNT_STATUS_INVALID", "Only assigned or counting counts can be updated");
    }

    const line = await client.query(
      `SELECT ccl.ccl_id, ccl.expected_qty
       FROM public.cycle_count_lines ccl
       JOIN public.skus sku
         ON sku.tenant_id = ccl.tenant_id
        AND sku.sku_id = ccl.sku_id
       JOIN public.locations location
         ON location.tenant_id = ccl.tenant_id
        AND location.location_id = ccl.location_id
       WHERE ccl.tenant_id = $1
         AND ccl.cc_id = $2
         AND (
           ($3::text IS NOT NULL AND ccl.ccl_id = $3)
           OR (
             $3::text IS NULL
             AND $4::text IS NOT NULL
             AND upper($4) IN (
               upper(ccl.sku_id),
               upper(sku.sku_code),
               upper(COALESCE(sku.qr_payload, '')),
               upper(COALESCE(sku.rfid_epc, '')),
               upper(ccl.location_id),
               upper(location.location_code)
             )
           )
         )
       ORDER BY ccl.ccl_id
       LIMIT 2
       FOR UPDATE OF ccl`,
      [tenantId, countId, lineId, scannedValue]
    );
    if (!line.rowCount) throw new ApiError(400, "CYCLE_COUNT_LINE_NOT_FOUND", "Count line could not be resolved");
    if (!lineId && line.rowCount > 1) {
      throw new ApiError(
        400,
        "CYCLE_COUNT_LINE_AMBIGUOUS",
        "The scanned value matches multiple count lines. Select a specific line or scan its location."
      );
    }
    await client.query(
      `UPDATE public.cycle_count_lines
       SET counted_qty = $1, status = 'counted'
       WHERE tenant_id = $2 AND cc_id = $3 AND ccl_id = $4`,
      [countedQty, tenantId, countId, line.rows[0].ccl_id]
    );
    await client.query(
      `UPDATE public.cycle_counts
       SET status = 'in_progress', started_at = COALESCE(started_at, now())
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3`,
      [tenantId, warehouseId, countId]
    );
    const mappedPlan = await selectPlan(client, tenantId, warehouseId, countId);
    return { plan: mapPlan(mappedPlan, await selectLines(client, tenantId, warehouseId, countId)) };
  });
}

async function submitCycleCount(context, countId) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const userId = required(context?.userId, "User context is required");
  return withTenantContext(tenantId, async (client) => {
    const locked = await client.query(
      `SELECT status, assigned_to_user_id FROM public.cycle_counts
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3 FOR UPDATE`,
      [tenantId, warehouseId, countId]
    );
    if (!locked.rowCount) throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    assertAssignedOperator(locked.rows[0], context);
    const incomplete = await client.query(
      `SELECT count(*) FILTER (WHERE counted_qty IS NULL)::int AS incomplete
       FROM public.cycle_count_lines
       WHERE tenant_id = $1 AND cc_id = $2`,
      [tenantId, countId]
    );
    if (!["assigned", "in_progress"].includes(locked.rows[0].status)) {
      throw new ApiError(400, "CYCLE_COUNT_STATUS_INVALID", "Only assigned or counting counts can be submitted");
    }
    if (Number(incomplete.rows[0].incomplete) > 0) {
      throw new ApiError(400, "CYCLE_COUNT_INCOMPLETE", "Count every line before submitting");
    }
    await client.query(
      `UPDATE public.cycle_counts SET status = 'submitted', submitted_at = now(), submitted_by = $4
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3`,
      [tenantId, warehouseId, countId, userId]
    );
    return mapPlan(
      await selectPlan(client, tenantId, warehouseId, countId),
      await selectLines(client, tenantId, warehouseId, countId)
    );
  });
}

async function approveCycleCount(context, countId, payload = {}) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const userId = required(context?.userId, "User context is required");
  const reasonCode = clean(payload.reason_code);
  const approvalNote = clean(payload.approval_note);

  return withTenantContext(tenantId, async (client) => {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${tenantId}|cycle-count|${countId}`]
    );
    const plan = await client.query(
      `SELECT status, created_by, submitted_by FROM public.cycle_counts
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3 FOR UPDATE`,
      [tenantId, warehouseId, countId]
    );
    if (!plan.rowCount) throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    if (plan.rows[0].status === "approved") {
      return mapPlan(
        await selectPlan(client, tenantId, warehouseId, countId),
        await selectLines(client, tenantId, warehouseId, countId)
      );
    }
    if (plan.rows[0].status !== "submitted") {
      throw new ApiError(400, "CYCLE_COUNT_STATUS_INVALID", "Only submitted counts can be approved");
    }
    enforceMakerChecker({
      userId,
      createdBy: plan.rows[0].created_by,
      submittedBy: plan.rows[0].submitted_by,
    });
    const lockedLines = await client.query(
      `SELECT
         ccl.ccl_id,
         ccl.sku_id,
         ccl.location_id,
         ccl.expected_qty,
         ccl.counted_qty
       FROM public.cycle_count_lines ccl
       JOIN public.cycle_counts cc
         ON cc.tenant_id = ccl.tenant_id
        AND cc.cc_id = ccl.cc_id
       WHERE ccl.tenant_id = $1
         AND cc.warehouse_id = $2
         AND ccl.cc_id = $3
       ORDER BY ccl.ccl_id
       FOR UPDATE OF ccl`,
      [tenantId, warehouseId, countId]
    );
    const lines = lockedLines.rows.map((line) => ({
      ...line,
      variance_qty: Number(line.counted_qty) - Number(line.expected_qty),
    }));
    const hasVariance = lines.some((line) => line.variance_qty !== 0);
    if (hasVariance && !reasonCode) {
      throw new ApiError(
        400,
        "CYCLE_COUNT_REASON_REQUIRED",
        "Reason Code is required when cycle count contains inventory variance."
      );
    }

    for (const line of lines) {
      const variance = line.variance_qty;
      if (!variance) continue;
      await postCycleCountVariance(client, {
        tenantId,
        warehouseId,
        skuId: line.sku_id,
        locationId: line.location_id,
        countId,
        lineId: line.ccl_id,
        variance,
        userId,
        reasonCode,
        approvalNote,
      });
    }
    await client.query(
      `UPDATE public.cycle_count_lines SET status = 'verified'
       WHERE tenant_id = $1 AND cc_id = $2`,
      [tenantId, countId]
    );
    await client.query(
      `UPDATE public.cycle_counts
       SET status = 'approved', approved_at = now(), approved_by = $4,
           approval_reason_code = $5, approval_note = $6, completed_at = now()
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3`,
      [tenantId, warehouseId, countId, userId, reasonCode, approvalNote]
    );
    return mapPlan(
      await selectPlan(client, tenantId, warehouseId, countId),
      await selectLines(client, tenantId, warehouseId, countId)
    );
  });
}

async function rejectCycleCount(context, countId, payload = {}) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const userId = required(context?.userId, "User context is required");
  const reason = required(payload.reason, "Rejection reason is required");
  return withTenantContext(tenantId, async (client) => {
    const plan = await client.query(
      `SELECT status, created_by, submitted_by
       FROM public.cycle_counts
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3
       FOR UPDATE`,
      [tenantId, warehouseId, countId]
    );
    if (!plan.rowCount) throw new ApiError(404, "CYCLE_COUNT_NOT_FOUND", "Cycle count not found");
    if (plan.rows[0].status !== "submitted") {
      throw new ApiError(400, "CYCLE_COUNT_STATUS_INVALID", "Only submitted counts can be rejected");
    }
    enforceMakerChecker({
      userId,
      createdBy: plan.rows[0].created_by,
      submittedBy: plan.rows[0].submitted_by,
    });

    await client.query(
      `UPDATE public.cycle_counts
       SET status = 'rejected', rejected_at = now(), rejected_by = $4, approval_note = $5
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3`,
      [tenantId, warehouseId, countId, userId, reason]
    );
    return mapPlan(
      await selectPlan(client, tenantId, warehouseId, countId),
      await selectLines(client, tenantId, warehouseId, countId)
    );
  });
}

async function cancelCycleCount(context, countId, payload = {}) {
  const tenantId = required(context?.tenantId, "Tenant context is required");
  const warehouseId = required(context?.warehouseId, "Warehouse context is required");
  const reason = required(payload.reason, "Cancellation reason is required");
  const allowedStatuses = ["planned", "assigned"];
  return withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE public.cycle_counts
       SET status = 'cancelled', cancellation_reason = $4, completed_at = now()
       WHERE tenant_id = $1 AND warehouse_id = $2 AND cc_id = $3
         AND status = ANY($5::text[])
       RETURNING cc_id`,
      [tenantId, warehouseId, countId, reason, allowedStatuses]
    );
    if (!result.rowCount) throw new ApiError(400, "CYCLE_COUNT_STATUS_INVALID", "Cycle count cannot be cancelled");
    return mapPlan(
      await selectPlan(client, tenantId, warehouseId, countId),
      await selectLines(client, tenantId, warehouseId, countId)
    );
  });
}

export {
  addCycleCountEntry,
  approveCycleCount,
  assignCycleCount,
  cancelCycleCount,
  createCycleCount,
  getCycleCount,
  listCycleCountOperators,
  listCycleCounts,
  rejectCycleCount,
  startCycleCount,
  submitCycleCount,
  updateCycleCount,
};
