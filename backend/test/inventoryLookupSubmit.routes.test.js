import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { db } from "../src/data/store.js";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
const createdAdjustmentIds = [];
const createdCountIds = [];
const originalLocationZones = new Map();
const testBalanceId = `INVLOOKUP${Date.now()}`;

before(async () => {
  for (const location of db.inventory_locations) {
    originalLocationZones.set(
      `${location.tenant_id}:${location.location_id}`,
      location.zone_id
    );
  }

  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (createdAdjustmentIds.length) {
    await pool.query(
      `DELETE FROM public.inventory_transactions
       WHERE tenant_id = 'TNT000001'
         AND reference_type = 'adjustment'
         AND reference_id = ANY($1::text[])`,
      [createdAdjustmentIds]
    );
    await pool.query(
      `DELETE FROM public.adjustment_lines
       WHERE tenant_id = 'TNT000001'
         AND adj_id = ANY($1::text[])`,
      [createdAdjustmentIds]
    );
    await pool.query(
      `DELETE FROM public.adjustments
       WHERE tenant_id = 'TNT000001'
         AND adj_id = ANY($1::text[])`,
      [createdAdjustmentIds]
    );
  }
  if (createdCountIds.length) {
    await pool.query(
      `DELETE FROM public.inventory_transactions
       WHERE tenant_id = 'TNT000001'
         AND reference_type = 'cycle_count'
         AND reference_id = ANY($1::text[])`,
      [createdCountIds]
    );
    await pool.query(
      `DELETE FROM public.cycle_count_lines
       WHERE tenant_id = 'TNT000001' AND cc_id = ANY($1::text[])`,
      [createdCountIds]
    );
    await pool.query(
      `DELETE FROM public.cycle_counts
       WHERE tenant_id = 'TNT000001' AND cc_id = ANY($1::text[])`,
      [createdCountIds]
    );
  }
  await pool.query(
    `DELETE FROM public.inventory_balances WHERE inv_balance_id = $1`,
    [testBalanceId]
  );
  db.inventory_zones = db.inventory_zones.filter(
    (item) => item.zone_id !== "ZON000012"
  );
  db.skus = db.skus.filter(
    (item) => item.sku_id !== "SKU000006"
  );
  for (const location of db.inventory_locations) {
    const original = originalLocationZones.get(
      `${location.tenant_id}:${location.location_id}`
    );
    if (original !== undefined) location.zone_id = original;
  }

  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path, {
  method = "GET",
  body,
  role = "superadmin",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "TNT000001",
      "x-user-id": "USR000001",
      "x-roles": role,
      "x-warehouse-id": "WH000001",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

test("adjustment creation accepts the database sku_id returned by lookup", async () => {
  const lookup = await request("/master/skus/lookup?search=TEST-BRG-001");
  assert.equal(lookup.status, 200);
  const selectedSku = lookup.payload.data.find((item) => item.sku_id === "SKU000006");
  assert.ok(selectedSku);
  assert.equal(selectedSku.sku_code, "TEST-BRG-001");

  const locations = await request("/locations/lookup?type=storage");
  assert.equal(locations.status, 200);
  const selectedLocation = locations.payload.data.find(
    (item) => item.location_id === "LOC000002"
  );
  assert.ok(selectedLocation);

  const created = await request("/inventory/adjustments", {
    method: "POST",
    role: "storeoperator",
    body: {
      sku_id: selectedSku.sku_id,
      location_id: selectedLocation.location_id,
      qty_delta: 1,
      reason_code: "MISCOUNTED",
    },
  });

  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.sku_id, selectedSku.sku_id);
  assert.equal(created.payload.location_id, selectedLocation.location_id);
  createdAdjustmentIds.push(created.payload.adj_id);

  const list = await request(`/inventory/adjustments?search=${created.payload.adj_id}`);
  assert.equal(list.status, 200);
  const adjustment = list.payload.items.find(
    (item) => item.adj_id === created.payload.adj_id
  );
  assert.ok(adjustment);
  assert.equal(adjustment.sku_description, "Test Bearing");
  assert.equal(adjustment.description, "Test Bearing");
  assert.equal(adjustment.category, "Bearings");
  assert.equal(adjustment.display_name, "WH000001-B-01-001-L01-B001");
  assert.equal(adjustment.zone_id, "ZON000012");
  assert.equal(adjustment.zone_code, "B");
  assert.equal(adjustment.zone_name, "Zone B - Pick Face");
});

test("cycle count creation accepts the database zone_id returned by options", async () => {
  const options = await request("/inventory/options");
  assert.equal(options.status, 200);
  const selectedZone = options.payload.zones.find(
    (item) => item.zone_id === "ZON000012"
  );
  assert.ok(selectedZone);
  assert.equal(selectedZone.zone_code, "B");

  await pool.query(
    `INSERT INTO public.inventory_balances (
       tenant_id, inv_balance_id, warehouse_id, sku_id, location_id,
       lot_no, serial_no, qty_on_hand, qty_reserved, qty_quarantine
     )
     VALUES (
       'TNT000001', $1, 'WH000001', 'SKU000006', 'LOC000002',
       'COUNT-LOOKUP', NULL, 5, 0, 0
     )`,
    [testBalanceId]
  );

  const created = await request("/inventory/count-plans", {
    method: "POST",
    body: {
      zone_id: selectedZone.zone_id,
      planned_date: "2026-06-10",
      scope_type: "FULL_ZONE",
    },
  });

  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.zone_id, selectedZone.zone_id);
  assert.equal(created.payload.error, undefined);
  assert.equal(created.payload.warning, undefined);
  createdCountIds.push(created.payload.count_id);

  const detail = await request(`/inventory/count-plans/${created.payload.count_id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.zone_id, selectedZone.zone_id);
  assert.equal(detail.payload.zone_code, "B");
  assert.equal(detail.payload.zone_name, "Zone B - Pick Face");

  const skuLine = detail.payload.lines.find((line) => line.sku_id === "SKU000006");
  assert.ok(skuLine);
  assert.equal(skuLine.sku_description, "Test Bearing");
  assert.equal(skuLine.description, "Test Bearing");
  assert.equal(skuLine.category, "Bearings");
  assert.equal(skuLine.display_name, "WH000001-B-01-001-L01-B001");
});

test("legacy JSON count detail cannot appear in the PostgreSQL workflow", async () => {
  const detail = await request("/inventory/count-plans/CC000017");

  assert.equal(detail.status, 404);
});

test("cycle count creation rejects a scope with no PostgreSQL inventory", async () => {
  const response = await request("/inventory/count-plans", {
    method: "POST",
    body: {
      zone_id: "ZON000012",
      planned_date: "2026-06-10",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000001"],
    },
  });

  assert.equal(response.status, 400);
  assert.equal(
    response.payload.error.message,
    "No PostgreSQL inventory balances found for the selected scope"
  );
});
