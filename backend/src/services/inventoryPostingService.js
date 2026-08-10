import { withTenantContext } from "../db/withTenantContext.js";
import { ApiError } from "../utils/errors.js";

const supportedTransactionTypes = new Set([
  "receipt",
  "adjustment",
  "adjustment_in",
  "adjustment_out",
  "adjustment_override",
  "transfer",
  "putaway",
  "issue",
]);

const legacyTransactionTypes = {
  receipt: "RECEIPT",
  adjustment: "ADJUST",
  adjustment_in: "ADJUST",
  adjustment_out: "ADJUST",
  adjustment_override: "ADJUST",
  transfer: "MOVE",
  putaway: "MOVE",
  issue: "SHIP",
};

function requiredText(value, label) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new ApiError(400, "INVENTORY_POSTING_VALIDATION_ERROR", `${label} is required`);
  }
  return result;
}

function optionalText(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizePayload(context, payload = {}) {
  const tenantId = requiredText(context?.tenantId || context?.tenant_id, "Tenant context");
  const warehouseId = requiredText(payload.warehouse_id, "Warehouse");
  const skuId = requiredText(payload.sku_id, "SKU");
  const transactionType = requiredText(payload.transaction_type, "Transaction type").toLowerCase();
  const fromLocationId = optionalText(payload.from_location_id);
  const toLocationId = optionalText(payload.to_location_id);
  const referenceType = requiredText(payload.reference_type, "Reference type");
  const referenceId = requiredText(payload.reference_id, "Reference ID");
  const postingKey = requiredText(payload.posting_key, "Posting key");
  const lotNo = optionalText(payload.lot_no);
  const serialNo = optionalText(payload.serial_no);
  const reasonCode = optionalText(payload.reason_code);
  const remarks = optionalText(payload.remarks);
  const qty = Number(payload.qty);

  if (!Number.isFinite(qty)) {
    throw new ApiError(400, "INVENTORY_POSTING_VALIDATION_ERROR", "Quantity is required");
  }
  if (qty <= 0) {
    throw new ApiError(400, "INVENTORY_POSTING_VALIDATION_ERROR", "Quantity must be greater than 0");
  }
  if (!supportedTransactionTypes.has(transactionType)) {
    throw new ApiError(
      400,
      "INVENTORY_POSTING_VALIDATION_ERROR",
      "Transaction type must be receipt, adjustment, adjustment_in, adjustment_out, adjustment_override, transfer, putaway, or issue"
    );
  }
  if (!fromLocationId && !toLocationId) {
    throw new ApiError(
      400,
      "INVENTORY_POSTING_VALIDATION_ERROR",
      "A source or destination location is required"
    );
  }
  if (fromLocationId && toLocationId && fromLocationId === toLocationId) {
    throw new ApiError(
      400,
      "INVENTORY_POSTING_VALIDATION_ERROR",
      "Source and destination locations must be different"
    );
  }
  if (["receipt", "adjustment_in"].includes(transactionType) && !toLocationId) {
    throw new ApiError(400, "INVENTORY_POSTING_VALIDATION_ERROR", "Destination location is required");
  }
  if (["receipt", "adjustment_in"].includes(transactionType) && fromLocationId) {
    throw new ApiError(
      400,
      "INVENTORY_POSTING_VALIDATION_ERROR",
      "Inbound transactions cannot have a source location"
    );
  }
  if (["adjustment_out", "adjustment_override", "issue"].includes(transactionType) && !fromLocationId) {
    throw new ApiError(400, "INVENTORY_POSTING_VALIDATION_ERROR", "Source location is required");
  }
  if (["adjustment_out", "adjustment_override", "issue"].includes(transactionType) && toLocationId) {
    throw new ApiError(
      400,
      "INVENTORY_POSTING_VALIDATION_ERROR",
      "Outbound transactions cannot have a destination location"
    );
  }
  if (["transfer", "putaway"].includes(transactionType) && (!fromLocationId || !toLocationId)) {
    throw new ApiError(
      400,
      "INVENTORY_POSTING_VALIDATION_ERROR",
      `${transactionType === "putaway" ? "Putaway" : "Transfer"} requires both source and destination locations`
    );
  }

  return {
    tenantId,
    warehouseId,
    skuId,
    fromLocationId,
    toLocationId,
    lotNo,
    serialNo,
    qty,
    transactionType,
    referenceType,
    referenceId,
    postingKey,
    reasonCode,
    remarks,
    createdBy: optionalText(context?.userId || context?.user_id),
    allowNegativeInventory:
      transactionType === "adjustment_override"
      || context?.inventoryConfig?.allowNegativeInventory === true,
  };
}

async function validateMasterData(client, posting) {
  const warehouse = await client.query(
    `SELECT warehouse_id
     FROM public.warehouses
     WHERE tenant_id = $1 AND warehouse_id = $2`,
    [posting.tenantId, posting.warehouseId]
  );
  if (!warehouse.rowCount) {
    throw new ApiError(400, "INVALID_WAREHOUSE", "Warehouse is invalid for this tenant");
  }

  const sku = await client.query(
    `SELECT sku_id
     FROM public.skus
     WHERE tenant_id = $1 AND sku_id = $2`,
    [posting.tenantId, posting.skuId]
  );
  if (!sku.rowCount) {
    throw new ApiError(400, "INVALID_SKU", "SKU is invalid for this tenant");
  }

  const locationIds = [...new Set(
    [posting.fromLocationId, posting.toLocationId].filter(Boolean)
  )];
  if (!locationIds.length) return;

  const locations = await client.query(
    `SELECT location_id
     FROM public.locations
     WHERE tenant_id = $1
       AND warehouse_id = $2
       AND location_id = ANY($3::text[])`,
    [posting.tenantId, posting.warehouseId, locationIds]
  );
  if (locations.rowCount !== locationIds.length) {
    throw new ApiError(400, "INVALID_LOCATION", "Location is invalid for this tenant and warehouse");
  }
}

async function findExistingPosting(client, posting) {
  const result = await client.query(
    `SELECT *
     FROM public.inventory_transactions
     WHERE tenant_id = $1
       AND reference_type = $2
       AND reference_id = $3
       AND posting_key = $4
     LIMIT 1`,
    [
      posting.tenantId,
      posting.referenceType,
      posting.referenceId,
      posting.postingKey,
    ]
  );
  return result.rows[0] || null;
}

async function lockBalance(client, posting, locationId, createIfMissing) {
  const parameters = [
    posting.tenantId,
    posting.warehouseId,
    posting.skuId,
    locationId,
    posting.lotNo,
    posting.serialNo,
  ];

  if (createIfMissing) {
    await client.query(
      `INSERT INTO public.inventory_balances (
         tenant_id,
         warehouse_id,
         sku_id,
         location_id,
         lot_no,
         serial_no,
         qty_on_hand,
         qty_reserved,
         qty_quarantine
       )
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0)
       ON CONFLICT (
         tenant_id,
         warehouse_id,
         sku_id,
         location_id,
         (COALESCE(lot_no, '')),
         (COALESCE(serial_no, ''))
       )
       DO NOTHING`,
      parameters
    );
  }

  const result = await client.query(
    `SELECT *
     FROM public.inventory_balances
     WHERE tenant_id = $1
       AND warehouse_id = $2
       AND sku_id = $3
       AND location_id = $4
       AND COALESCE(lot_no, '') = COALESCE($5, '')
       AND COALESCE(serial_no, '') = COALESCE($6, '')
     FOR UPDATE`,
    parameters
  );
  return result.rows[0] || null;
}

async function applyBalanceDelta(client, posting, locationId, delta, createIfMissing) {
  const balance = await lockBalance(client, posting, locationId, createIfMissing);
  const currentQty = Number(balance?.qty_on_hand || 0);
  const nextQty = currentQty + delta;

  if (!balance && delta < 0) {
    throw new ApiError(400, "INSUFFICIENT_STOCK", "Insufficient stock at the source location");
  }
  if (!posting.allowNegativeInventory && nextQty < 0) {
    throw new ApiError(400, "INSUFFICIENT_STOCK", "Insufficient stock at the source location");
  }

  const result = await client.query(
    `UPDATE public.inventory_balances
     SET qty_on_hand = $1, updated_at = now()
     WHERE inv_balance_id = $2
       AND tenant_id = $3
     RETURNING *`,
    [nextQty, balance.inv_balance_id, posting.tenantId]
  );
  return result.rows[0];
}

async function postWithClient(client, posting) {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended($1 || '|' || $2 || '|' || $3 || '|' || $4, 0)
     )`,
    [
      posting.tenantId,
      posting.referenceType,
      posting.referenceId,
      posting.postingKey,
    ]
  );

  const existing = await findExistingPosting(client, posting);
  if (existing) {
    return { transaction: existing, balances: [], idempotent: true };
  }

  await validateMasterData(client, posting);
  const balances = [];

  if (posting.fromLocationId) {
    balances.push(await applyBalanceDelta(
      client,
      posting,
      posting.fromLocationId,
      -posting.qty,
      posting.transactionType === "adjustment_override"
    ));
  }
  if (posting.toLocationId) {
    balances.push(await applyBalanceDelta(
      client,
      posting,
      posting.toLocationId,
      posting.qty,
      true
    ));
  }

  const inserted = await client.query(
    `INSERT INTO public.inventory_transactions (
       tenant_id,
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
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10,
       $11, $12, $11, $12, $13, $14, $15, $16, now(), now()
     )
     RETURNING *`,
    [
      posting.tenantId,
      posting.warehouseId,
      posting.skuId,
      posting.fromLocationId,
      posting.toLocationId,
      posting.lotNo,
      posting.serialNo,
      posting.qty,
      posting.transactionType,
      legacyTransactionTypes[posting.transactionType],
      posting.referenceType,
      posting.referenceId,
      posting.postingKey,
      posting.reasonCode,
      posting.remarks,
      posting.createdBy,
    ]
  );

  return { transaction: inserted.rows[0], balances, idempotent: false };
}

async function postInventoryTransaction(context, payload, dbClient = null) {
  const posting = normalizePayload(context, payload);

  if (dbClient) {
    return postWithClient(dbClient, posting);
  }

  return withTenantContext(posting.tenantId, (client) => postWithClient(client, posting));
}

async function postInventoryMovement({
  tenantId,
  warehouseId,
  skuId,
  fromLocationId = null,
  toLocationId = null,
  lotNo = null,
  serialNo = null,
  qty,
  transactionType,
  referenceType,
  referenceId,
  postingKey,
  userId = null,
  reasonCode = null,
  notes = null,
  dbClient = null,
} = {}) {
  const posting = normalizePayload(
    { tenantId, userId },
    {
      warehouse_id: warehouseId,
      sku_id: skuId,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      lot_no: lotNo,
      serial_no: serialNo,
      qty,
      transaction_type: transactionType,
      reference_type: referenceType,
      reference_id: referenceId,
      posting_key: postingKey,
      reason_code: reasonCode,
      remarks: notes,
    }
  );

  if (dbClient) {
    return postWithClient(dbClient, posting);
  }

  return withTenantContext(posting.tenantId, (client) => postWithClient(client, posting));
}

export {
  postInventoryMovement,
  postInventoryTransaction,
  supportedTransactionTypes,
};
