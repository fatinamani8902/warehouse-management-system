import { withTenantContext } from "../db/withTenantContext.js";
import { ApiError } from "../utils/errors.js";
import { postInventoryMovement } from "./inventoryPostingService.js";

function requiredText(value, label) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new ApiError(400, "GRN_POSTING_VALIDATION_ERROR", `${label} is required`);
  }
  return result;
}

function optionalText(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizeLines(grn) {
  if (!Array.isArray(grn?.lines) || grn.lines.length === 0) {
    throw new ApiError(400, "GRN_POSTING_VALIDATION_ERROR", "GRN must contain at least one line");
  }

  return grn.lines.map((line, index) => {
    const lineNo = Number(line.line_no ?? index + 1);
    const qty = Number(line.received_qty);

    if (!Number.isInteger(lineNo) || lineNo <= 0) {
      throw new ApiError(400, "GRN_POSTING_VALIDATION_ERROR", "GRN line number is invalid");
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new ApiError(
        400,
        "GRN_POSTING_VALIDATION_ERROR",
        `Received quantity must be greater than 0 for line ${lineNo}`
      );
    }

    return {
      grnLineId: requiredText(line.grn_line_id, `Persisted GRN line ID for line ${lineNo}`),
      lineNo,
      skuId: requiredText(line.sku_id, `SKU for line ${lineNo}`),
      qty,
      uom: optionalText(line.uom || line.uom_id) || "EA",
      lotNo: optionalText(line.lot_no || line.lot),
      serialNo: optionalText(line.serial_no || line.serial),
      notes: optionalText(line.notes),
    };
  });
}

async function findReceivingLocation(client, tenantId, warehouseId) {
  const result = await client.query(
    `SELECT location_id, location_code, warehouse_id
     FROM public.locations
     WHERE tenant_id = $1
       AND warehouse_id = $2
       AND location_type = 'receiving'
       AND is_active = true
     ORDER BY is_default_receiving DESC, location_id
     LIMIT 1`,
    [tenantId, warehouseId]
  );

  if (!result.rowCount) {
    throw new ApiError(
      400,
      "RECEIVING_LOCATION_REQUIRED",
      "No active receiving location configured for this warehouse."
    );
  }
  return result.rows[0];
}

async function findSuggestedStorageLocation(client, tenantId, warehouseId) {
  const result = await client.query(
    `SELECT location_id, location_code
     FROM public.locations
     WHERE tenant_id = $1
       AND warehouse_id = $2
       AND location_type = 'storage'
       AND is_active = true
       AND bin_id IS NOT NULL
     ORDER BY location_code, location_id
     LIMIT 1`,
    [tenantId, warehouseId]
  );
  return result.rows[0] || null;
}

async function validatePostingMasters(client, tenantId, warehouseId, lines) {
  const warehouse = await client.query(
    `SELECT warehouse_id
     FROM public.warehouses
     WHERE tenant_id = $1
       AND warehouse_id = $2`,
    [tenantId, warehouseId]
  );
  if (!warehouse.rowCount) {
    throw new ApiError(400, "INVALID_WAREHOUSE", "Warehouse is invalid for this tenant");
  }

  const skuIds = [...new Set(lines.map((line) => line.skuId))];
  const skus = await client.query(
    `SELECT sku_id
     FROM public.skus
     WHERE tenant_id = $1
       AND sku_id = ANY($2::text[])`,
    [tenantId, skuIds]
  );
  if (skus.rowCount !== skuIds.length) {
    throw new ApiError(400, "INVALID_SKU", "One or more GRN SKUs are invalid for this tenant");
  }
}

function putawayGroupKey(line) {
  return [
    line.skuId,
    line.lotNo || "",
    line.serialNo || "",
  ].join("|");
}

async function createPutawayTasks(
  client,
  context,
  grn,
  receivingLocation,
  suggestedLocation,
  lines
) {
  const groups = new Map();
  for (const line of lines) {
    const key = putawayGroupKey(line);
    const current = groups.get(key);
    if (current) {
      current.qty += line.qty;
    } else {
      groups.set(key, { ...line });
    }
  }

  const tasks = [];
  for (const line of groups.values()) {
    const postingKey = [
      grn.grn_id,
      receivingLocation.location_id,
      line.skuId,
      line.lotNo || "NOLOT",
      line.serialNo || "NOSERIAL",
    ].join(":");

    const result = await client.query(
      `INSERT INTO public.putaway_tasks (
         tenant_id, warehouse_id, grn_id, grn_line_id, sku_id,
         from_location_id, to_location_id,
         source_location_id, destination_location_id,
         qty, status, priority, lot_no, serial_no,
         reference_type, reference_id, posting_key, notes
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $6, $7,
         $8, 'pending', 3, $9, $10,
         'grn', $3, $11, 'Created automatically from posted GRN'
       )
       ON CONFLICT (
         tenant_id, reference_type, reference_id, posting_key
       ) WHERE reference_type IS NOT NULL
         AND reference_id IS NOT NULL
         AND posting_key IS NOT NULL
       DO UPDATE SET posting_key = EXCLUDED.posting_key
       RETURNING *`,
      [
        context.tenantId,
        grn.warehouse_id,
        grn.grn_id,
        line.grnLineId,
        line.skuId,
        receivingLocation.location_id,
        suggestedLocation?.location_id || null,
        line.qty,
        line.lotNo,
        line.serialNo,
        postingKey,
      ]
    );
    tasks.push(result.rows[0]);
  }
  return tasks;
}

async function postGrnReceipt(context, grn) {
  const tenantId = requiredText(context?.tenantId, "Tenant context");
  const userId = optionalText(context?.userId);
  const grnId = requiredText(grn?.grn_id, "GRN ID");
  const warehouseId = requiredText(grn?.warehouse_id, "Warehouse");
  const lines = normalizeLines(grn);

  if (grn.tenant_id !== tenantId) {
    throw new ApiError(404, "GRN_NOT_FOUND", "GRN not found");
  }
  return withTenantContext(tenantId, async (client) => {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${tenantId}|grn|${grnId}`]
    );

    const existing = await client.query(
      `SELECT *
       FROM public.inventory_transactions
       WHERE tenant_id = $1
         AND reference_type = 'grn'
         AND reference_id = $2
       ORDER BY created_at, itx_id`,
      [tenantId, grnId]
    );
    if (existing.rowCount) {
      const tasks = await client.query(
        `SELECT *
         FROM public.putaway_tasks
         WHERE tenant_id = $1
           AND reference_type = 'grn'
           AND reference_id = $2
         ORDER BY created_at, putaway_task_id`,
        [tenantId, grnId]
      );
      return {
        idempotent: true,
        receivingLocation: existing.rows[0].to_location_id
          ? { location_id: existing.rows[0].to_location_id }
          : null,
        transactions: existing.rows,
        balances: [],
        putawayTasks: tasks.rows,
      };
    }

    if (grn.status === "posted") {
      throw new ApiError(
        409,
        "GRN_ALREADY_POSTED",
        "GRN is marked posted but no inventory posting record was found"
      );
    }
    if (grn.status !== "completed") {
      throw new ApiError(400, "GRN_NOT_COMPLETED", "GRN must be completed before it can be posted");
    }

    await validatePostingMasters(client, tenantId, warehouseId, lines);
    const receivingLocation = await findReceivingLocation(client, tenantId, warehouseId);
    const suggestedLocation = await findSuggestedStorageLocation(client, tenantId, warehouseId);
    const transactions = [];
    const balances = [];

    for (const line of lines) {
      const posted = await postInventoryMovement({
        tenantId,
        warehouseId,
        skuId: line.skuId,
        fromLocationId: null,
        toLocationId: receivingLocation.location_id,
        lotNo: line.lotNo,
        serialNo: line.serialNo,
        qty: line.qty,
        transactionType: "receipt",
        referenceType: "grn",
        referenceId: grnId,
        postingKey: `${grnId}:${line.grnLineId}`,
        userId,
        reasonCode: null,
        notes: `Receipt posted from ${grnId} line ${line.lineNo}`,
        dbClient: client,
      });
      transactions.push(posted.transaction);
      balances.push(...posted.balances);
    }

    const putawayTasks = await createPutawayTasks(
      client,
      { tenantId, userId },
      grn,
      receivingLocation,
      suggestedLocation,
      lines
    );

    await client.query(
      `UPDATE public.grns
       SET status = 'posted',
           posted_at = COALESCE(posted_at, now()),
           posted_by = COALESCE(posted_by, $3),
           updated_at = now()
       WHERE tenant_id = $1
         AND grn_id = $2`,
      [tenantId, grnId, userId]
    );

    return {
      idempotent: false,
      receivingLocation,
      transactions,
      balances,
      putawayTasks,
    };
  });
}

export { postGrnReceipt };
