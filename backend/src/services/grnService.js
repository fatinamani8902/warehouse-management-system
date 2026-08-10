import { withTenantContext } from "../db/withTenantContext.js";
import {
  getGrnById,
  listEligibleGrnAsns as listEligibleGrnAsnRecords,
  listGrns as listGrnRecords,
  markGrnPosted as markGrnPostedRecord,
  transitionGrn as transitionGrnRecord,
  updateGrnLines as updateGrnLineRecords,
} from "../repositories/GrnRepository.js";
import { ApiError } from "../utils/errors.js";

const TRANSITIONS = {
  start_receiving: { from: ["draft"], to: "receiving" },
  complete: { from: ["receiving"], to: "completed" },
};

function requiredText(value, message) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new ApiError(400, "GRN_VALIDATION_ERROR", message);
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function mapGrnRow(row) {
  if (!row) return null;
  return {
    grn_id: row.grn_id,
    tenant_id: row.tenant_id,
    warehouse_id: row.warehouse_id,
    asn_id: row.asn_id,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    received_date: row.received_date,
    status: row.status,
    received_by: row.received_by,
    created_by: row.received_by,
    created_by_name: row.created_by_name,
    created_by_display: row.created_by_display || row.received_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    notes: row.notes || "",
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    cancellation_reason: row.cancellation_reason,
    posted_at: row.posted_at,
    posted_by: row.posted_by,
    lines_count: Number(row.lines_count || 0),
    lines: Array.isArray(row.lines)
      ? row.lines.map((line) => ({
          grn_line_id: line.grn_line_id,
          asn_line_id: line.asn_line_id,
          line_no: Number(line.line_no),
          sku_id: line.sku_id,
          sku_code: line.sku_code,
          sku_name: line.description,
          description: line.description,
          expected_qty: Number(line.expected_qty),
          received_qty: Number(line.received_qty),
          uom: line.uom,
          lot_no: line.lot_no,
          serial_no: line.serial_no,
          qc_status: line.qc_status,
          putaway_qty: Number(line.putaway_qty),
          notes: line.notes,
        }))
      : [],
  };
}

const selectSql = `
  SELECT
    g.tenant_id,
    g.grn_id,
    g.warehouse_id,
    g.asn_id,
    COALESCE(g.supplier_id, a.supplier_id) AS supplier_id,
    s.supplier_name,
    g.received_date,
    g.status,
    g.received_by,
    u.user_name AS created_by_name,
    CASE
      WHEN u.user_name IS NOT NULL AND g.received_by IS NOT NULL
      THEN u.user_name || ' (' || g.received_by || ')'
      ELSE g.received_by
    END AS created_by_display,
    g.created_at,
    g.updated_at,
    g.notes,
    g.cancelled_at,
    g.cancelled_by,
    g.cancellation_reason,
    g.posted_at,
    g.posted_by,
    count(gl.grn_line_id)::int AS lines_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'grn_line_id', gl.grn_line_id,
          'asn_line_id', gl.asn_line_id,
          'line_no', gl.line_no,
          'sku_id', gl.sku_id,
          'sku_code', sk.sku_code,
          'description', sk.description,
          'expected_qty', gl.expected_qty,
          'received_qty', gl.received_qty,
          'uom', gl.uom,
          'lot_no', gl.lot_no,
          'serial_no', gl.serial_no,
          'qc_status', gl.qc_status,
          'putaway_qty', gl.putaway_qty,
          'notes', gl.notes
        )
        ORDER BY gl.line_no
      ) FILTER (WHERE gl.grn_line_id IS NOT NULL),
      '[]'::jsonb
    ) AS lines
  FROM public.grns g
  LEFT JOIN public.asns a
    ON a.tenant_id = g.tenant_id
   AND a.asn_id = g.asn_id
  LEFT JOIN public.suppliers s
    ON s.tenant_id = g.tenant_id
   AND s.supplier_id = COALESCE(g.supplier_id, a.supplier_id)
  LEFT JOIN public.grn_lines gl
    ON gl.tenant_id = g.tenant_id
   AND gl.grn_id = g.grn_id
  LEFT JOIN public.skus sk
    ON sk.tenant_id = gl.tenant_id
   AND sk.sku_id = gl.sku_id
  LEFT JOIN public.users u
    ON u.tenant_id = g.tenant_id
   AND u.user_id = g.received_by
`;

const groupSql = `
  GROUP BY
    g.tenant_id, g.grn_id, g.warehouse_id, g.asn_id,
    g.supplier_id, a.supplier_id, s.supplier_name,
    g.received_date, g.status, g.received_by, u.user_name,
    g.created_at, g.updated_at, g.notes,
    g.cancelled_at, g.cancelled_by, g.cancellation_reason,
    g.posted_at, g.posted_by
`;

async function selectGrn(client, tenantId, grnId) {
  const result = await client.query(
    `${selectSql}
     WHERE g.tenant_id = $1
       AND g.grn_id = $2
     ${groupSql}`,
    [tenantId, grnId],
  );
  return mapGrnRow(result.rows[0]);
}

async function listGrns(tenantId, filters = {}) {
  return listGrnRecords({ tenantId, filters });
}

async function getGrn(tenantId, grnId) {
  return getGrnById({ tenantId, grnId });
}

async function listEligibleGrnAsns(context) {
  const tenantId = requiredText(context?.tenantId, "Tenant context is required");
  const warehouseId = requiredText(context?.warehouseId, "Warehouse is required");
  return listEligibleGrnAsnRecords({ tenantId, warehouseId });
}

async function createGrn(context, payload) {
  const tenantId = requiredText(context?.tenantId, "Tenant context is required");
  const warehouseId = requiredText(context?.warehouseId, "Warehouse is required");
  const userId = requiredText(context?.userId, "Created by user is required");
  const asnId = optionalText(payload?.asn_id);
  let supplierId = optionalText(payload?.supplier_id);
  const receivedDate = requiredText(payload?.received_date, "Receiving date is required");
  const notes = optionalText(payload?.notes);

  return withTenantContext(tenantId, async (client) => {
    let asnLines = [];
    if (asnId) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${tenantId}|create-grn|${asnId}`],
      );
      const asn = await client.query(
        `SELECT supplier_id, warehouse_id, status
         FROM public.asns
         WHERE tenant_id = $1
           AND asn_id = $2
         FOR UPDATE`,
        [tenantId, asnId],
      );
      if (!asn.rowCount) throw new ApiError(404, "ASN_NOT_FOUND", "ASN not found");
      supplierId = asn.rows[0].supplier_id;
      if (asn.rows[0].warehouse_id !== warehouseId) {
        throw new ApiError(400, "INVALID_WAREHOUSE", "ASN belongs to another warehouse");
      }
      const existing = await client.query(
        `SELECT grn_id FROM public.grns WHERE tenant_id = $1 AND asn_id = $2`,
        [tenantId, asnId],
      );
      if (existing.rowCount) {
        throw new ApiError(409, "GRN_ALREADY_EXISTS", `GRN ${existing.rows[0].grn_id} already exists for this ASN`);
      }
      if (asn.rows[0].status !== "arrived") {
        throw new ApiError(409, "ASN_NOT_ARRIVED", "ASN must be arrived before creating a GRN");
      }
      asnLines = (await client.query(
        `SELECT asn_line_id, line_no, sku_id, expected_qty, uom, lot_no, serial_no, notes
         FROM public.asn_lines
         WHERE tenant_id = $1 AND asn_id = $2
         ORDER BY line_no`,
        [tenantId, asnId],
      )).rows;
    }

    supplierId = requiredText(supplierId, "Supplier is required");
    const supplier = await client.query(
      `SELECT supplier_id FROM public.suppliers
       WHERE tenant_id = $1 AND supplier_id = $2 AND status = 'active'`,
      [tenantId, supplierId],
    );
    if (!supplier.rowCount) throw new ApiError(400, "INVALID_SUPPLIER", "Select an active supplier");

    const header = await client.query(
      `INSERT INTO public.grns (
         tenant_id, warehouse_id, asn_id, supplier_id, received_date,
         status, received_by, notes, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5::date, 'draft', $6, $7, now(), now())
       RETURNING grn_id`,
      [tenantId, warehouseId, asnId, supplierId, receivedDate, userId, notes],
    );
    const grnId = header.rows[0].grn_id;

    for (const line of asnLines) {
      await client.query(
        `INSERT INTO public.grn_lines (
           tenant_id, grn_id, asn_line_id, line_no, sku_id,
           expected_qty, received_qty, uom, lot_no, serial_no, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10)`,
        [
          tenantId, grnId, line.asn_line_id, line.line_no, line.sku_id,
          line.expected_qty, line.uom, line.lot_no, line.serial_no, line.notes,
        ],
      );
    }
    return selectGrn(client, tenantId, grnId);
  });
}

async function updateGrnLines(context, grnId, lines) {
  const tenantId = requiredText(context?.tenantId, "Tenant context is required");
  if (!Array.isArray(lines)) throw new ApiError(400, "GRN_VALIDATION_ERROR", "lines must be an array");

  return updateGrnLineRecords({
    tenantId,
    warehouseId: context?.warehouseId,
    grnId,
    lines,
  });
}

async function transitionGrn(context, grnId, action, payload = {}) {
  const tenantId = requiredText(context?.tenantId, "Tenant context is required");
  const userId = requiredText(context?.userId, "User context is required");
  const transition = TRANSITIONS[action];
  if (!transition) throw new ApiError(400, "INVALID_GRN_TRANSITION", `Unknown action: ${action}`);

  return transitionGrnRecord({
    tenantId,
    warehouseId: context?.warehouseId,
    grnId,
    transition,
    action,
    userId,
  });
}

async function markGrnPosted(tenantId, grnId, userId) {
  return markGrnPostedRecord({ tenantId, grnId, userId });
}

export {
  createGrn,
  getGrn,
  listEligibleGrnAsns,
  listGrns,
  markGrnPosted,
  transitionGrn,
  updateGrnLines,
};
