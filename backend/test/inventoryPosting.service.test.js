import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "../src/db/client.js";
import { postInventoryTransaction } from "../src/services/inventoryPostingService.js";

const suffix = Date.now().toString();
const referenceType = `POSTING_TEST_${suffix}`;
const context = {
  tenantId: "TNT000001",
  userId: null,
  inventoryConfig: { allowNegativeInventory: false },
};

function payload(overrides = {}) {
  return {
    warehouse_id: "WH000001",
    sku_id: "SKU000006",
    from_location_id: null,
    to_location_id: "LOC000002",
    lot_no: `LOT-${suffix}`,
    serial_no: null,
    qty: 10,
    transaction_type: "receipt",
    reference_type: referenceType,
    reference_id: `REF-${suffix}`,
    posting_key: `KEY-${suffix}`,
    reason_code: null,
    remarks: "Inventory posting service test",
    ...overrides,
  };
}

async function balance(locationId, lotNo) {
  const result = await pool.query(
    `SELECT *
     FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = $1
       AND COALESCE(lot_no, '') = COALESCE($2, '')
       AND serial_no IS NULL`,
    [locationId, lotNo]
  );
  return result.rows[0] || null;
}

after(async () => {
  await pool.query(
    `DELETE FROM public.inventory_transactions WHERE reference_type = $1`,
    [referenceType]
  );
  await pool.query(
    `DELETE FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND sku_id = 'SKU000006'
       AND lot_no LIKE $1`,
    [`LOT-${suffix}%`]
  );
  await pool.end();
});

test("receipt creates a transaction and increases a new destination balance", async () => {
  const lotNo = `LOT-${suffix}-RECEIPT`;
  const result = await postInventoryTransaction(context, payload({
    lot_no: lotNo,
    reference_id: `RECEIPT-${suffix}`,
    posting_key: "receipt",
    qty: 12,
  }));

  assert.equal(result.idempotent, false);
  assert.match(result.transaction.itx_id, /^ITX\d{6,}$/);
  assert.equal(result.transaction.transaction_type, "receipt");
  assert.equal(result.transaction.to_location_id, "LOC000002");

  const row = await balance("LOC000002", lotNo);
  assert.ok(row);
  assert.equal(Number(row.qty_on_hand), 12);
  assert.equal(Number(row.qty_reserved), 0);
  assert.equal(Number(row.qty_quarantine), 0);
});

test("issue decreases source balance", async () => {
  const lotNo = `LOT-${suffix}-ISSUE`;
  await postInventoryTransaction(context, payload({
    lot_no: lotNo,
    reference_id: `ISSUE-SEED-${suffix}`,
    posting_key: "seed",
    qty: 20,
  }));

  const result = await postInventoryTransaction(context, payload({
    from_location_id: "LOC000002",
    to_location_id: null,
    lot_no: lotNo,
    qty: 7,
    transaction_type: "issue",
    reference_id: `ISSUE-${suffix}`,
    posting_key: "issue",
  }));

  assert.equal(result.transaction.transaction_type, "issue");
  assert.equal(Number((await balance("LOC000002", lotNo)).qty_on_hand), 13);
});

test("transfer decreases source and increases destination atomically", async () => {
  const lotNo = `LOT-${suffix}-TRANSFER`;
  await postInventoryTransaction(context, payload({
    lot_no: lotNo,
    reference_id: `TRANSFER-SEED-${suffix}`,
    posting_key: "seed",
    qty: 15,
  }));

  const result = await postInventoryTransaction(context, payload({
    from_location_id: "LOC000002",
    to_location_id: "LOC000001",
    lot_no: lotNo,
    qty: 6,
    transaction_type: "transfer",
    reference_id: `TRANSFER-${suffix}`,
    posting_key: "transfer",
  }));

  assert.equal(result.balances.length, 2);
  assert.equal(Number((await balance("LOC000002", lotNo)).qty_on_hand), 9);
  assert.equal(Number((await balance("LOC000001", lotNo)).qty_on_hand), 6);
});

test("insufficient stock is rejected without creating a transaction", async () => {
  const lotNo = `LOT-${suffix}-INSUFFICIENT`;
  const referenceId = `INSUFFICIENT-${suffix}`;

  await assert.rejects(
    postInventoryTransaction(context, payload({
      from_location_id: "LOC000002",
      to_location_id: null,
      lot_no: lotNo,
      qty: 1,
      transaction_type: "adjustment_out",
      reference_id: referenceId,
      posting_key: "out",
    })),
    (error) => error.statusCode === 400 && error.code === "INSUFFICIENT_STOCK"
  );

  const transaction = await pool.query(
    `SELECT 1 FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = $1
       AND reference_id = $2`,
    [referenceType, referenceId]
  );
  assert.equal(transaction.rowCount, 0);
});

test("duplicate posting is idempotent and does not double-update balance", async () => {
  const lotNo = `LOT-${suffix}-IDEMPOTENT`;
  const request = payload({
    lot_no: lotNo,
    qty: 8,
    reference_id: `IDEMPOTENT-${suffix}`,
    posting_key: "line-1",
  });

  const first = await postInventoryTransaction(context, request);
  const second = await postInventoryTransaction(context, request);

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.transaction.itx_id, first.transaction.itx_id);
  assert.equal(Number((await balance("LOC000002", lotNo)).qty_on_hand), 8);
});

test("tenant isolation rejects SKU and location from another tenant context", async () => {
  await assert.rejects(
    postInventoryTransaction(
      { tenantId: "TNT000002", userId: null },
      payload({
        reference_id: `TENANT-${suffix}`,
        posting_key: "tenant",
      })
    ),
    (error) => error.statusCode === 400
      && ["INVALID_WAREHOUSE", "INVALID_SKU", "INVALID_LOCATION"].includes(error.code)
  );
});

test("invalid SKU and invalid location return friendly validation errors", async () => {
  await assert.rejects(
    postInventoryTransaction(context, payload({
      sku_id: "SKU999999",
      reference_id: `BAD-SKU-${suffix}`,
      posting_key: "bad-sku",
    })),
    (error) => error.statusCode === 400
      && error.code === "INVALID_SKU"
      && error.message === "SKU is invalid for this tenant"
  );

  await assert.rejects(
    postInventoryTransaction(context, payload({
      to_location_id: "LOC999999",
      reference_id: `BAD-LOCATION-${suffix}`,
      posting_key: "bad-location",
    })),
    (error) => error.statusCode === 400
      && error.code === "INVALID_LOCATION"
      && error.message === "Location is invalid for this tenant and warehouse"
  );
});

test("payload validation rejects invalid quantities, types, and locations", async () => {
  const invalidCases = [
    [{ qty: 0 }, "Quantity must be greater than 0"],
    [{ qty: undefined }, "Quantity is required"],
    [{ transaction_type: "unknown" }, "Transaction type must be receipt, adjustment, adjustment_in, adjustment_out, adjustment_override, transfer, putaway, or issue"],
    [{ from_location_id: null, to_location_id: null }, "A source or destination location is required"],
    [{ from_location_id: "LOC000002", to_location_id: "LOC000002", transaction_type: "transfer" }, "Source and destination locations must be different"],
    [{ from_location_id: "LOC000001", transaction_type: "receipt" }, "Inbound transactions cannot have a source location"],
    [{ from_location_id: "LOC000001", to_location_id: "LOC000002", transaction_type: "issue" }, "Outbound transactions cannot have a destination location"],
  ];

  for (const [override, message] of invalidCases) {
    await assert.rejects(
      postInventoryTransaction(context, payload({
        ...override,
        reference_id: `VALIDATION-${suffix}-${message}`,
        posting_key: message,
      })),
      (error) => error.statusCode === 400 && error.message === message
    );
  }
});
