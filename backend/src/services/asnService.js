import { withTenantContext } from "../db/withTenantContext.js";
import {
  createAsn as createAsnRecord,
  getAsnById,
  listAsns as listAsnRecords,
  updateAsnStatus,
} from "../repositories/AsnRepository.js";
import { ApiError } from "../utils/errors.js";

const ASN_TRANSITIONS = {
  submit: { from: ["draft"], to: "pending" },
  "mark-in-transit": { from: ["pending"], to: "in_transit" },
  mark_in_transit: { from: ["pending"], to: "in_transit" },
  "mark-arrived": { from: ["pending", "in_transit"], to: "arrived" },
  mark_arrived: { from: ["pending", "in_transit"], to: "arrived" },
  close: { from: ["arrived"], to: "closed" },
  cancel: { from: ["draft", "pending"], to: "cancelled" },
};

function requiredText(value, message) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new ApiError(400, "ASN_VALIDATION_ERROR", message);
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ApiError(400, "ASN_VALIDATION_ERROR", "Add at least one SKU line");
  }

  const skuIds = new Set();
  return lines.map((line, index) => {
    const lineNo = index + 1;
    const skuId = requiredText(line?.sku_id, `Select a SKU for line ${lineNo}`);
    const expectedQty = Number(line?.expected_qty);

    if (!Number.isFinite(expectedQty) || expectedQty <= 0) {
      throw new ApiError(
        400,
        "ASN_VALIDATION_ERROR",
        `Quantity for line ${lineNo} must be greater than 0`,
      );
    }
    if (skuIds.has(skuId)) {
      throw new ApiError(400, "ASN_VALIDATION_ERROR", `SKU ${skuId} is selected more than once`);
    }

    skuIds.add(skuId);
    return { lineNo, skuId, expectedQty };
  });
}

function mapAsnRow(row) {
  if (!row) return null;
  return {
    asn_id: row.asn_id,
    tenant_id: row.tenant_id,
    warehouse_id: row.warehouse_id,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    eta: row.eta,
    status: row.status,
    notes: row.notes || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    created_by_display: row.created_by_display || row.created_by,
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    cancellation_reason: row.cancellation_reason,
    lines_count: Number(row.lines_count || 0),
    lines: Array.isArray(row.lines)
      ? row.lines.map((line) => ({
          asn_line_id: line.asn_line_id,
          line_no: Number(line.line_no),
          sku_id: line.sku_id,
          sku_code: line.sku_code,
          sku_name: line.description,
          description: line.description,
          expected_qty: Number(line.expected_qty),
          uom: line.uom,
          lot_no: line.lot_no,
          serial_no: line.serial_no,
          notes: line.notes,
        }))
      : [],
  };
}

const asnSelectSql = `
  SELECT
    a.tenant_id,
    a.asn_id,
    a.warehouse_id,
    a.supplier_id,
    s.supplier_name,
    a.eta,
    a.status,
    a.notes,
    a.created_at,
    a.updated_at,
    a.created_by,
    u.user_name AS created_by_name,
    CASE
      WHEN u.user_name IS NOT NULL AND a.created_by IS NOT NULL
      THEN u.user_name || ' (' || a.created_by || ')'
      ELSE a.created_by
    END AS created_by_display,
    a.cancelled_at,
    a.cancelled_by,
    a.cancellation_reason,
    count(al.asn_line_id)::int AS lines_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'asn_line_id', al.asn_line_id,
          'line_no', al.line_no,
          'sku_id', al.sku_id,
          'sku_code', sk.sku_code,
          'description', sk.description,
          'expected_qty', al.expected_qty,
          'uom', al.uom,
          'lot_no', al.lot_no,
          'serial_no', al.serial_no,
          'notes', al.notes
        )
        ORDER BY al.line_no
      ) FILTER (WHERE al.asn_line_id IS NOT NULL),
      '[]'::jsonb
    ) AS lines
  FROM public.asns a
  JOIN public.suppliers s
    ON s.tenant_id = a.tenant_id
   AND s.supplier_id = a.supplier_id
  LEFT JOIN public.users u
    ON u.tenant_id = a.tenant_id
   AND u.user_id = a.created_by
  LEFT JOIN public.asn_lines al
    ON al.tenant_id = a.tenant_id
   AND al.asn_id = a.asn_id
  LEFT JOIN public.skus sk
    ON sk.tenant_id = al.tenant_id
   AND sk.sku_id = al.sku_id
`;

const asnGroupSql = `
  GROUP BY
    a.tenant_id,
    a.asn_id,
    a.warehouse_id,
    a.supplier_id,
    s.supplier_name,
    a.eta,
    a.status,
    a.notes,
    a.created_at,
    a.updated_at,
    a.created_by,
    u.user_name,
    a.cancelled_at,
    a.cancelled_by,
    a.cancellation_reason
`;

async function selectAsn(client, tenantId, asnId) {
  const result = await client.query(
    `${asnSelectSql}
     WHERE a.tenant_id = $1
       AND a.asn_id = $2
     ${asnGroupSql}`,
    [tenantId, asnId],
  );
  return mapAsnRow(result.rows[0]);
}

async function listAsns(tenantId) {
  return listAsnRecords(tenantId);
}

async function getAsn(tenantId, asnId) {
  return getAsnById(tenantId, asnId);
}

async function createAsn(context, payload) {
  const tenantId = requiredText(context?.tenantId, "Tenant context is required");
  const warehouseId = requiredText(
    payload?.warehouse_id || context?.warehouseId,
    "Warehouse is required",
  );
  const userId = requiredText(context?.userId, "Created by user is required");
  const supplierId = requiredText(payload?.supplier_id, "Select a supplier");
  const eta = requiredText(payload?.eta, "Expected arrival date is required");
  const notes = optionalText(payload?.notes);
  const lines = normalizeLines(payload?.lines);

  return createAsnRecord({
    tenantId,
    warehouseId,
    userId,
    supplierId,
    eta,
    notes,
    lines,
  });
}

async function ensureArrivalGrn(client, { tenantId, asnId, userId }) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`${tenantId}|asn-arrival-grn|${asnId}`],
  );

  const existing = await client.query(
    `SELECT grn_id
     FROM public.grns
     WHERE tenant_id = $1
       AND asn_id = $2
     LIMIT 1`,
    [tenantId, asnId],
  );
  if (existing.rowCount) return existing.rows[0].grn_id;

  const asn = await client.query(
    `SELECT tenant_id, asn_id, warehouse_id, supplier_id, created_by
     FROM public.asns
     WHERE tenant_id = $1
       AND asn_id = $2
       AND status = 'arrived'
     FOR UPDATE`,
    [tenantId, asnId],
  );
  if (!asn.rowCount) {
    throw new ApiError(409, "ASN_NOT_ARRIVED", "ASN must be arrived before creating a GRN");
  }

  const actor = await client.query(
    `SELECT user_id
     FROM public.users
     WHERE tenant_id = $1
       AND user_id = $2
       AND is_active = true`,
    [tenantId, userId],
  );
  if (!actor.rowCount) {
    throw new ApiError(
      400,
      "INVALID_RECEIVED_BY",
      "Current user is not a valid active PostgreSQL user for this tenant",
      { tenant_id: tenantId, user_id: userId, asn_id: asnId },
    );
  }

  const asnLines = await client.query(
    `SELECT asn_line_id, line_no, sku_id, expected_qty, uom, lot_no, serial_no, notes
     FROM public.asn_lines
     WHERE tenant_id = $1
       AND asn_id = $2
     ORDER BY line_no`,
    [tenantId, asnId],
  );
  if (!asnLines.rowCount) {
    throw new ApiError(409, "ASN_LINES_REQUIRED", "Arrived ASN has no lines to receive");
  }

  const inserted = await client.query(
    `INSERT INTO public.grns (
       tenant_id, warehouse_id, asn_id, supplier_id, received_date,
       status, received_by, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, CURRENT_DATE, 'draft', $5, now(), now())
     ON CONFLICT (tenant_id, asn_id) WHERE asn_id IS NOT NULL
     DO NOTHING
     RETURNING grn_id`,
    [tenantId, asn.rows[0].warehouse_id, asnId, asn.rows[0].supplier_id, userId],
  );

  let grnId = inserted.rows[0]?.grn_id;
  if (!grnId) {
    const concurrent = await client.query(
      `SELECT grn_id
       FROM public.grns
       WHERE tenant_id = $1
         AND asn_id = $2`,
      [tenantId, asnId],
    );
    grnId = concurrent.rows[0]?.grn_id;
  }
  if (!grnId) {
    throw new ApiError(409, "GRN_HANDOFF_CONFLICT", "Unable to create GRN for arrived ASN");
  }

  for (const line of asnLines.rows) {
    await client.query(
      `INSERT INTO public.grn_lines (
         tenant_id, grn_id, asn_line_id, line_no, sku_id,
         expected_qty, received_qty, uom, lot_no, serial_no,
         qc_status, putaway_qty, notes
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, 0, $7, $8, $9,
         'passed', 0, $10
       )
       ON CONFLICT (grn_id, line_no)
       DO NOTHING`,
      [
        tenantId,
        grnId,
        line.asn_line_id,
        line.line_no,
        line.sku_id,
        line.expected_qty,
        line.uom,
        line.lot_no,
        line.serial_no,
        line.notes,
      ],
    );
  }

  return grnId;
}

async function transitionAsn(context, asnId, action, payload = {}) {
  const tenantId = requiredText(context?.tenantId, "Tenant context is required");
  const userId = requiredText(context?.userId, "User context is required");
  const transition = ASN_TRANSITIONS[action];
  if (!transition) {
    throw new ApiError(400, "INVALID_ASN_TRANSITION", `Unknown action: ${action}`);
  }

  if (transition.to === "arrived") {
    return withTenantContext(tenantId, async (client) => {
      const current = await client.query(
        `SELECT asn_id, status
         FROM public.asns
         WHERE tenant_id = $1
           AND asn_id = $2
         FOR UPDATE`,
        [tenantId, asnId],
      );
      if (!current.rowCount) throw new ApiError(404, "ASN_NOT_FOUND", "ASN not found");

      const currentStatus = current.rows[0].status;
      if (currentStatus === "arrived") {
        await ensureArrivalGrn(client, { tenantId, asnId, userId });
        return selectAsn(client, tenantId, asnId);
      }
      if (!transition.from.includes(currentStatus)) {
        throw new ApiError(
          400,
          "INVALID_ASN_TRANSITION",
          `Cannot ${action} ASN with status '${currentStatus}'`,
        );
      }

      await client.query(
        `UPDATE public.asns
         SET status = $3,
             updated_at = now()
         WHERE tenant_id = $1
           AND asn_id = $2`,
        [tenantId, asnId, transition.to],
      );
      await ensureArrivalGrn(client, { tenantId, asnId, userId });

      return selectAsn(client, tenantId, asnId);
    });
  }

  const cancellationReason = action === "cancel"
    ? requiredText(
        payload?.cancellation_reason || payload?.reason,
        "Cancellation reason is required",
      )
    : null;

  return updateAsnStatus({
    tenantId,
    asnId,
    status: transition.to,
    userId,
    cancellationReason,
    allowedFrom: transition.from,
    action,
  });
}

export { createAsn, getAsn, listAsns, transitionAsn };
