import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
const suffix = Date.now().toString();
const balanceIds = [`INVREADA${suffix}`, `INVREADB${suffix}`];
const transactionIds = [`ITXREADA${suffix}`, `ITXREADB${suffix}`];
const adjustmentLocationIds = {
  valid: `LOCADJV${suffix}`,
  highStock: `LOCADJH${suffix}`,
  zeroStock: `LOCADJZ${suffix}`,
  receiving: `LOCADJR${suffix}`,
  shipping: `LOCADJS${suffix}`,
  staging: `LOCADJT${suffix}`,
  inactive: `LOCADJI${suffix}`,
};
const adjustmentBalanceIds = {
  valid: `INVADJLOC${suffix}`,
  highStock: `INVADJHI${suffix}`,
  zeroStock: `INVADJZERO${suffix}`,
};

before(async () => {
  await pool.query(
    `INSERT INTO public.inventory_balances (
       tenant_id, inv_balance_id, warehouse_id, sku_id, location_id,
       lot_no, serial_no, qty_on_hand, qty_reserved, qty_quarantine
     )
     VALUES
       ('TNT000001', $1, 'WH000001', 'SKU000006', 'LOC000002', 'LOT-READ', 'SER-READ', 25, 5, 2),
       ('TNT000001', $2, 'WH000001', 'SKU000006', 'LOC000001', NULL, NULL, 10, 1, 0)`,
    balanceIds
  );
  await pool.query(
    `INSERT INTO public.inventory_transactions (
       tenant_id, itx_id, warehouse_id, sku_id, from_location_id, to_location_id,
       qty, tx_type, ref_type, ref_id, tx_at, notes
     )
     VALUES
       ('TNT000001', $1, 'WH000001', 'SKU000006', 'LOC000001', 'LOC000002',
        4, 'MOVE', 'TEST', 'READ-1', now(), 'PostgreSQL read test'),
       ('TNT000001', $2, 'WH000001', 'SKU000006', NULL, 'LOC000002',
        3, 'RECEIPT', 'TEST', 'READ-2', now() - interval '1 minute', 'PostgreSQL pagination test')`,
    transactionIds
  );
  await pool.query(
    `INSERT INTO public.locations (
       tenant_id, location_id, warehouse_id, location_code, label, location_type, is_active
     )
     VALUES
       ('TNT000001', $1, 'WH000001', $2, $2, 'adjustment', true),
       ('TNT000001', $3, 'WH000001', $4, $4, 'adjustment', true),
       ('TNT000001', $5, 'WH000001', $6, $6, 'adjustment', true),
       ('TNT000001', $7, 'WH000001', $8, $8, 'receiving', true),
       ('TNT000001', $9, 'WH000001', $10, $10, 'shipping', true),
       ('TNT000001', $11, 'WH000001', $12, $12, 'staging', true),
       ('TNT000001', $13, 'WH000001', $14, $14, 'adjustment', false)`,
    [
      adjustmentLocationIds.valid,
      `ADJ-VALID-${suffix}`,
      adjustmentLocationIds.highStock,
      `ADJ-HIGH-${suffix}`,
      adjustmentLocationIds.zeroStock,
      `ADJ-ZERO-${suffix}`,
      adjustmentLocationIds.receiving,
      `ADJ-RECEIVING-${suffix}`,
      adjustmentLocationIds.shipping,
      `ADJ-SHIPPING-${suffix}`,
      adjustmentLocationIds.staging,
      `ADJ-STAGING-${suffix}`,
      adjustmentLocationIds.inactive,
      `ADJ-INACTIVE-${suffix}`,
    ]
  );
  await pool.query(
    `INSERT INTO public.inventory_balances (
       tenant_id, inv_balance_id, warehouse_id, sku_id, location_id,
       lot_no, serial_no, qty_on_hand, qty_reserved, qty_quarantine
     )
     VALUES
       ('TNT000001', $1, 'WH000001', 'SKU000006', $2, NULL, NULL, 10, 2, 0),
       ('TNT000001', $3, 'WH000001', 'SKU000006', $4, NULL, NULL, 30, 4, 0),
       ('TNT000001', $5, 'WH000001', 'SKU000006', $6, NULL, NULL, 0, 0, 0)`,
    [
      adjustmentBalanceIds.valid,
      adjustmentLocationIds.valid,
      adjustmentBalanceIds.highStock,
      adjustmentLocationIds.highStock,
      adjustmentBalanceIds.zeroStock,
      adjustmentLocationIds.zeroStock,
    ]
  );

  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/inventory`;
});

after(async () => {
  await pool.query(
    `DELETE FROM public.inventory_transactions WHERE itx_id = ANY($1::text[])`,
    [transactionIds]
  );
  await pool.query(
    `DELETE FROM public.inventory_balances WHERE inv_balance_id = ANY($1::text[])`,
    [[...balanceIds, ...Object.values(adjustmentBalanceIds)]]
  );
  await pool.query(
    `DELETE FROM public.locations WHERE location_id = ANY($1::text[])`,
    [Object.values(adjustmentLocationIds)]
  );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path, {
  tenant = "TNT000001",
  role = "manager",
  warehouse = "WH000001",
  userId = "USR000001",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "x-tenant-id": tenant,
      "x-user-id": userId,
      "x-roles": role,
      "x-warehouse-id": warehouse,
    },
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

test("inventory balances are read from PostgreSQL with joined master data", async () => {
  const response = await request("/balances?sku_code=TEST-BRG-001&lot=LOT-READ");

  assert.equal(response.status, 200);
  assert.equal(response.payload.total, 1);
  assert.equal(response.payload.data[0].inventory_id, balanceIds[0]);
  assert.equal(response.payload.data[0].inv_balance_id, balanceIds[0]);
  assert.equal(response.payload.data[0].sku_code, "TEST-BRG-001");
  assert.equal(response.payload.data[0].warehouse_code, "WH000001");
  assert.equal(response.payload.data[0].lot_no, "LOT-READ");
  assert.equal(Number(response.payload.data[0].qty_available), 20);
  assert.equal(Number(response.payload.data[0].available_qty), 20);
});

test("inventory balance pagination and search are database backed", async () => {
  const firstPage = await request("/balances?search=Test%20Bearing&page=1&pageSize=1");
  const secondPage = await request("/balances?search=Test%20Bearing&page=2&pageSize=1");

  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.payload.page, 1);
  assert.equal(firstPage.payload.pageSize, 1);
  assert.equal(firstPage.payload.total >= 2, true);
  assert.equal(firstPage.payload.totalPages >= 2, true);
  assert.equal(firstPage.payload.data.length, 1);
  assert.equal(secondPage.payload.data.length, 1);
  assert.notEqual(
    firstPage.payload.data[0].inv_balance_id,
    secondPage.payload.data[0].inv_balance_id
  );
});

test("inventory summary uses the same database-backed balance payload", async () => {
  const response = await request("/summary?search=Test%20Bearing&page=1&pageSize=1");

  assert.equal(response.status, 200);
  assert.equal(response.payload.page, 1);
  assert.equal(response.payload.pageSize, 1);
  assert.equal(response.payload.data.length, 1);
  assert.equal(response.payload.items.length, 1);
  assert.equal(response.payload.items[0].inv_balance_id, response.payload.data[0].inv_balance_id);
  assert.equal(response.payload.items[0].sku_code, "TEST-BRG-001");
});

test("inventory balances support warehouse and location filters", async () => {
  const response = await request(
    "/balances?warehouse_id=WH000001&location_id=LOC000002&page=1&pageSize=20"
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.payload.data.every(
      (row) => row.warehouse_id === "WH000001" && row.location_id === "LOC000002"
    ),
    true
  );
  assert.equal(
    response.payload.data.some((row) => row.inventory_id === balanceIds[0]),
    true
  );
});

test("bin-backed balances return taxonomy-aware location display names", async () => {
  const response = await request(`/balances?location_id=LOC000002&sku_id=SKU000006`);

  assert.equal(response.status, 200);
  const row = response.payload.data.find((item) => item.inv_balance_id === balanceIds[0]);
  assert.ok(row);
  assert.equal(row.bin_id, "BIN000005");
  assert.match(row.display_name, /^WH000001-.+-L\d{2,}-B\d{3,}$/);
  assert.equal(row.location_code, row.display_name);
});

test("inventory transactions are read from PostgreSQL with normalized fields", async () => {
  const response = await request("/transactions?search=READ-1&location_type=storage");

  assert.equal(response.status, 200);
  assert.equal(response.payload.data[0].sku_name, response.payload.data[0].description);
  assert.equal(response.payload.data[0].product_name, response.payload.data[0].description);
  assert.equal(response.payload.total, 1);
  assert.equal(response.payload.data[0].itx_id, transactionIds[0]);
  assert.equal(response.payload.data[0].tx_type, "MOVE");
  assert.equal(response.payload.data[0].reference_id, "READ-1");
  assert.match(response.payload.data[0].to_display_name, /^WH000001-.+-L\d{2,}-B\d{3,}$/);
});

test("inventory transaction pagination and type filter work", async () => {
  const response = await request("/transactions?status=RECEIPT&page=1&pageSize=1");

  assert.equal(response.status, 200);
  assert.equal(response.payload.page, 1);
  assert.equal(response.payload.pageSize, 1);
  assert.equal(response.payload.data.length, 1);
  assert.equal(response.payload.data[0].itx_id, transactionIds[1]);
});

test("inventory reads enforce tenant isolation", async () => {
  const balances = await request("/balances?search=TEST-BRG-001", {
    tenant: "TNT000002",
    warehouse: "",
  });
  const transactions = await request("/transactions?search=READ-", {
    tenant: "TNT000002",
    warehouse: "",
  });

  assert.equal(balances.status, 200);
  assert.equal(balances.payload.total, 0);
  assert.equal(transactions.status, 200);
  assert.equal(transactions.payload.total, 0);
});

test("adjustment location lookup returns only active adjustment-valid locations with SKU balance context", async () => {
  const response = await request("/adjustment-locations?sku_id=SKU000006");

  assert.equal(response.status, 200);
  const ids = new Set(response.payload.data.map((row) => row.location_id));
  assert.equal(ids.has(adjustmentLocationIds.valid), true);
  assert.equal(ids.has(adjustmentLocationIds.highStock), true);
  assert.equal(ids.has(adjustmentLocationIds.zeroStock), false);
  assert.equal(ids.has(adjustmentLocationIds.receiving), false);
  assert.equal(ids.has(adjustmentLocationIds.shipping), false);
  assert.equal(ids.has(adjustmentLocationIds.staging), false);
  assert.equal(ids.has(adjustmentLocationIds.inactive), false);
  assert.equal(ids.has("LOC000001"), false, "legacy seed/system storage location must be excluded");

  const valid = response.payload.data.find((row) => row.location_id === adjustmentLocationIds.valid);
  assert.equal(valid.display_name, `ADJ-VALID-${suffix}`);
  assert.equal(Number(valid.qty_on_hand), 10);
  assert.equal(Number(valid.qty_reserved), 2);
  assert.equal(Number(valid.qty_available), 8);
  assert.equal(Number(valid.available_qty), 8);

  const highIndex = response.payload.data.findIndex((row) => row.location_id === adjustmentLocationIds.highStock);
  const validIndex = response.payload.data.findIndex((row) => row.location_id === adjustmentLocationIds.valid);
  assert.equal(highIndex > -1, true);
  assert.equal(validIndex > -1, true);
  assert.equal(highIndex < validIndex, true, "higher on-hand quantity should sort first");
});

test("adjustment location lookup enforces tenant isolation", async () => {
  const response = await request("/adjustment-locations?sku_id=SKU000006", {
    tenant: "TNT000002",
    warehouse: "WH000001",
  });

  assert.equal(response.status, 403);
  assert.equal(response.payload.error.code, "WAREHOUSE_FORBIDDEN");
});

test("adjustment location lookup rejects inaccessible warehouse context", async () => {
  const response = await request("/adjustment-locations?sku_id=SKU000006", {
    userId: "USR000001",
    warehouse: "WH999999",
  });

  assert.equal(response.status, 403);
  assert.equal(response.payload.error.code, "WAREHOUSE_FORBIDDEN");
});

test("authorized inquiry roles can read inventory while an unrelated role is denied", async () => {
  const admin = await request("/balances?page=1&pageSize=1", { role: "admin" });
  const hqadmin = await request("/balances?page=1&pageSize=1", { role: "hqadmin" });
  const manager = await request("/balances?page=1&pageSize=1", { role: "manager" });
  const warehousemanager = await request("/balances?page=1&pageSize=1", { role: "warehousemanager" });
  const storeoperator = await request("/balances?page=1&pageSize=1", { role: "storeoperator" });
  const auditor = await request("/balances?page=1&pageSize=1", { role: "auditor" });
  const superadmin = await request("/balances?page=1&pageSize=1", { role: "superadmin" });
  const denied = await request("/balances?page=1&pageSize=1", { role: "supplier" });

  assert.equal(admin.status, 200);
  assert.equal(hqadmin.status, 200);
  assert.equal(manager.status, 200);
  assert.equal(warehousemanager.status, 200);
  assert.equal(storeoperator.status, 200);
  assert.equal(auditor.status, 200);
  assert.equal(superadmin.status, 200);
  assert.equal(denied.status, 403);
});

test("hqadmin can read all inventory read endpoints", async () => {
  const balances = await request("/balances?page=1&pageSize=1", { role: "hqadmin" });
  const summary = await request("/summary?page=1&pageSize=1", { role: "hqadmin" });
  const transactions = await request("/transactions?page=1&pageSize=1", { role: "hqadmin" });
  const options = await request("/options", { role: "hqadmin" });

  assert.equal(balances.status, 200);
  assert.equal(summary.status, 200);
  assert.equal(transactions.status, 200);
  assert.equal(options.status, 200);
});

test("inventory options use PostgreSQL warehouses, zones, and SKUs", async () => {
  const response = await request("/options");

  assert.equal(response.status, 200);
  assert.equal(response.payload.warehouses.some((row) => row.warehouse_id === "WH000001"), true);
  assert.equal(response.payload.zones.every((row) => row.status === "active"), true);
  assert.equal(response.payload.zones.every((row) => row.warehouse_id === "WH000001"), true);
  assert.equal(response.payload.zones.some((row) => row.zone_id === "ZON000012"), false);
  assert.equal(response.payload.skus.some((row) => row.sku_id === "SKU000006"), true);
});
