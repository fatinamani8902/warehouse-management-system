import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/client.js";

let server;
let baseUrl;
const fixture = {
  tenant: "TNT000001",
  warehouse: "WH000001",
  returnId: "RTNRMA901",
  rmaId: "RMARMA901",
  rmaItemId: "RMIRMA901",
  skuId: "SKU000006",
  userId: "USR000005",
};

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "TNT000001",
      "x-warehouse-id": "WH000001",
      "x-user-id": "USR000005",
      "x-roles": "hqadmin",
      "x-client-source": "PORTAL",
    },
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function cleanup() {
  await pool.query("DELETE FROM public.rma_items WHERE tenant_id = $1 AND rma_id = $2", [fixture.tenant, fixture.rmaId]);
  await pool.query("DELETE FROM public.rma WHERE tenant_id = $1 AND rma_id = $2", [fixture.tenant, fixture.rmaId]);
  await pool.query("DELETE FROM public.return_items WHERE tenant_id = $1 AND return_id = $2", [fixture.tenant, fixture.returnId]);
  await pool.query("DELETE FROM public.returns WHERE tenant_id = $1 AND return_id = $2", [fixture.tenant, fixture.returnId]);
}

async function seedRma() {
  await cleanup();
  await pool.query(
    `INSERT INTO public.returns (
       tenant_id, return_id, warehouse_id, shipment_id, status, created_at,
       created_by, sku_id, qty, reason_code, reason_description
     ) VALUES ($1,$2,$3,'SHIRMA901','created',now(),$4,$5,1,'damaged_in_transit','Damaged In Transit')`,
    [fixture.tenant, fixture.returnId, fixture.warehouse, fixture.userId, fixture.skuId]
  );
  await pool.query(
    `INSERT INTO public.return_items (
       tenant_id, rmi_id, return_id, sku_id, qty, reason, reason_code, disposition, received_qty
     ) VALUES ($1,'RTIRMA901',$2,$3,1,'Damaged In Transit','damaged_in_transit','quarantine',0)`,
    [fixture.tenant, fixture.returnId, fixture.skuId]
  );
  await pool.query(
    `INSERT INTO public.rma (
       rma_id, tenant_id, return_id, status, notes, created_by, created_at, updated_at
     ) VALUES ($1,$2,$3,'created','PostgreSQL RMA test',$4,now(),now())`,
    [fixture.rmaId, fixture.tenant, fixture.returnId, fixture.userId]
  );
  await pool.query(
    `INSERT INTO public.rma_items (
       rma_item_id, tenant_id, rma_id, sku_id, qty, reason_code
     ) VALUES ($1,$2,$3,$4,1,'damaged_in_transit')`,
    [fixture.rmaItemId, fixture.tenant, fixture.rmaId, fixture.skuId]
  );
}

before(async () => {
  await seedRma();
  const app = createApp();
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await cleanup();
  await pool.end();
});

test("GET /api/v1/rma returns created-by display fields", async () => {
  const list = await request("/api/v1/rma");
  assert.equal(list.status, 200);
  const listed = list.payload.find((row) => row.rma_id === fixture.rmaId);
  assert.ok(listed);
  assert.equal(listed.created_by, fixture.userId);
  assert.equal(listed.created_by_name, "HQ Admin");
  assert.equal(listed.created_by_display, "HQ Admin (USR000005)");
  assert.equal(listed.items[0].sku_id, fixture.skuId);
  assert.equal(listed.items[0].reason_code, "damaged_in_transit");
  assert.ok(listed.items[0].sku_name || listed.items[0].product_name);

  const detail = await request(`/api/v1/rma/${fixture.rmaId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.created_by, fixture.userId);
  assert.equal(detail.payload.created_by_name, "HQ Admin");
  assert.equal(detail.payload.created_by_display, "HQ Admin (USR000005)");
  assert.equal(detail.payload.items[0].sku_id, fixture.skuId);
  assert.equal(detail.payload.items[0].reason_code, "damaged_in_transit");
  assert.ok(detail.payload.items[0].sku_name || detail.payload.items[0].product_name);
});
