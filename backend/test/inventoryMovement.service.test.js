import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "../src/db/client.js";
import { postInventoryMovement } from "../src/services/inventoryPostingService.js";

const suffix = Date.now().toString();
const referenceType = `MOVEMENT_TEST_${suffix}`;
const lots = [];

function movement(overrides = {}) {
  const lotNo = overrides.lotNo ?? `LOT-${suffix}`;
  if (lotNo) lots.push(lotNo);
  return {
    tenantId: "TNT000001",
    warehouseId: "WH000001",
    skuId: "SKU000006",
    fromLocationId: null,
    toLocationId: "LOC000002",
    lotNo,
    serialNo: null,
    qty: 10,
    transactionType: "receipt",
    referenceType,
    referenceId: `REF-${suffix}`,
    postingKey: `KEY-${suffix}`,
    userId: null,
    reasonCode: null,
    notes: "Atomic inventory movement test",
    ...overrides,
  };
}

async function getBalance(locationId, lotNo, serialNo = null) {
  const result = await pool.query(
    `SELECT *
     FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = $1
       AND COALESCE(lot_no, '') = COALESCE($2, '')
       AND COALESCE(serial_no, '') = COALESCE($3, '')`,
    [locationId, lotNo, serialNo]
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
       AND lot_no = ANY($1::text[])`,
    [[...new Set(lots)]]
  );
  await pool.end();
});

test("inbound movement creates a destination balance", async () => {
  const lotNo = `LOT-${suffix}-INBOUND`;
  const result = await postInventoryMovement(movement({
    lotNo,
    qty: 12,
    referenceId: `INBOUND-${suffix}`,
    postingKey: "line-1",
  }));

  assert.equal(result.idempotent, false);
  assert.equal(result.transaction.transaction_type, "receipt");
  assert.equal(result.transaction.from_location_id, null);
  assert.equal(result.transaction.to_location_id, "LOC000002");
  assert.equal(Number((await getBalance("LOC000002", lotNo)).qty_on_hand), 12);
});

test("outbound movement decrements the locked source balance", async () => {
  const lotNo = `LOT-${suffix}-OUTBOUND`;
  await postInventoryMovement(movement({
    lotNo,
    qty: 20,
    referenceId: `OUTBOUND-SEED-${suffix}`,
    postingKey: "seed",
  }));

  await postInventoryMovement(movement({
    fromLocationId: "LOC000002",
    toLocationId: null,
    lotNo,
    qty: 7,
    transactionType: "issue",
    referenceId: `OUTBOUND-${suffix}`,
    postingKey: "issue",
  }));

  assert.equal(Number((await getBalance("LOC000002", lotNo)).qty_on_hand), 13);
});

test("transfer atomically moves stock between locations", async () => {
  const lotNo = `LOT-${suffix}-TRANSFER`;
  await postInventoryMovement(movement({
    lotNo,
    qty: 15,
    referenceId: `TRANSFER-SEED-${suffix}`,
    postingKey: "seed",
  }));

  const result = await postInventoryMovement(movement({
    fromLocationId: "LOC000002",
    toLocationId: "LOC000001",
    lotNo,
    qty: 6,
    transactionType: "transfer",
    referenceId: `TRANSFER-${suffix}`,
    postingKey: "transfer",
  }));

  assert.equal(result.balances.length, 2);
  assert.equal(Number((await getBalance("LOC000002", lotNo)).qty_on_hand), 9);
  assert.equal(Number((await getBalance("LOC000001", lotNo)).qty_on_hand), 6);
});

test("duplicate posting key returns the existing transaction without double counting", async () => {
  const lotNo = `LOT-${suffix}-IDEMPOTENT`;
  const request = movement({
    lotNo,
    qty: 8,
    referenceId: `IDEMPOTENT-${suffix}`,
    postingKey: "same-line",
  });

  const first = await postInventoryMovement(request);
  const second = await postInventoryMovement(request);

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.transaction.itx_id, first.transaction.itx_id);
  assert.equal(Number((await getBalance("LOC000002", lotNo)).qty_on_hand), 8);
});

test("negative stock is prevented unless adjustment_override is explicit", async () => {
  const lotNo = `LOT-${suffix}-NEGATIVE`;
  await assert.rejects(
    postInventoryMovement(movement({
      fromLocationId: "LOC000002",
      toLocationId: null,
      lotNo,
      qty: 1,
      transactionType: "issue",
      referenceId: `NEGATIVE-${suffix}`,
      postingKey: "issue",
    })),
    (error) => error.statusCode === 400 && error.code === "INSUFFICIENT_STOCK"
  );

  const override = await postInventoryMovement(movement({
    fromLocationId: "LOC000002",
    toLocationId: null,
    lotNo,
    qty: 2,
    transactionType: "adjustment_override",
    referenceId: `OVERRIDE-${suffix}`,
    postingKey: "override",
  }));

  assert.equal(override.transaction.transaction_type, "adjustment_override");
  assert.equal(Number((await getBalance("LOC000002", lotNo)).qty_on_hand), -2);
});

test("tenant isolation rejects master data from another tenant", async () => {
  await assert.rejects(
    postInventoryMovement(movement({
      tenantId: "TNT000002",
      lotNo: `LOT-${suffix}-TENANT`,
      referenceId: `TENANT-${suffix}`,
      postingKey: "tenant",
    })),
    (error) => error.statusCode === 400
      && ["INVALID_WAREHOUSE", "INVALID_SKU", "INVALID_LOCATION"].includes(error.code)
  );
});

test("lot and serial values create separate balance grains", async () => {
  const lotA = `LOT-${suffix}-A`;
  const lotB = `LOT-${suffix}-B`;

  await postInventoryMovement(movement({
    lotNo: lotA,
    serialNo: "SER-A",
    qty: 3,
    referenceId: `GRAIN-${suffix}`,
    postingKey: "lot-a-serial-a",
  }));
  await postInventoryMovement(movement({
    lotNo: lotA,
    serialNo: "SER-B",
    qty: 4,
    referenceId: `GRAIN-${suffix}`,
    postingKey: "lot-a-serial-b",
  }));
  await postInventoryMovement(movement({
    lotNo: lotB,
    serialNo: "SER-A",
    qty: 5,
    referenceId: `GRAIN-${suffix}`,
    postingKey: "lot-b-serial-a",
  }));

  assert.equal(Number((await getBalance("LOC000002", lotA, "SER-A")).qty_on_hand), 3);
  assert.equal(Number((await getBalance("LOC000002", lotA, "SER-B")).qty_on_hand), 4);
  assert.equal(Number((await getBalance("LOC000002", lotB, "SER-A")).qty_on_hand), 5);
});
