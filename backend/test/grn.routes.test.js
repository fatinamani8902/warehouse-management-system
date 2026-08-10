import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { db } from "../src/data/store.js";
import { pool } from "../src/db/client.js";
import { withTenantContext } from "../src/db/withTenantContext.js";
import { createApp } from "../src/server.js";

const tenantId = "TNT000001";
const warehouseId = "WH000001";
const userId = "USR000001";
const createdGrnIds = [];
const createdAsnIds = [];
let server;
let baseUrl;
let supplierId;
let eligibleAsnId;
let linkedAsnId;
let linkedGrnId;
let receiveGrnId;

async function createDraftGrnFixture(client, note = "Receive fixture") {
  const grn = await client.query(
    `INSERT INTO public.grns (
       tenant_id, warehouse_id, supplier_id, received_date,
       status, received_by, notes, created_at, updated_at
     )
     VALUES ($1, $2, $3, CURRENT_DATE, 'draft', $4, $5, now(), now())
     RETURNING grn_id`,
    [tenantId, warehouseId, supplierId, userId, note],
  );
  const grnId = grn.rows[0].grn_id;
  await client.query(
    `INSERT INTO public.grn_lines (
       tenant_id, grn_id, line_no, sku_id, expected_qty, received_qty,
       uom, qc_status, putaway_qty
     )
     VALUES ($1, $2, 1, 'SKU000006', 2, 0, 'EA', 'pending', 0)`,
    [tenantId, grnId],
  );
  return grnId;
}

before(async () => {
  const supplier = await pool.query(
    `SELECT supplier_id
     FROM public.suppliers
     WHERE tenant_id = $1
       AND status = 'active'
     ORDER BY supplier_id
     LIMIT 1`,
    [tenantId],
  );
  supplierId = supplier.rows[0].supplier_id;

  const fixtures = await withTenantContext(tenantId, async (client) => {
    const asns = await client.query(
      `INSERT INTO public.asns (
         tenant_id, warehouse_id, supplier_id, eta, status,
         notes, created_by, created_at, updated_at
       )
       VALUES
         ($1, $2, $3, CURRENT_DATE, 'arrived', 'Eligible GRN option fixture', $4, now(), now()),
         ($1, $2, $3, CURRENT_DATE, 'arrived', 'Linked GRN option fixture', $4, now(), now())
       RETURNING asn_id
       `,
      [tenantId, warehouseId, supplierId, userId],
    );
    const [eligible, linked] = asns.rows;
    await client.query(
      `INSERT INTO public.asn_lines (
         tenant_id, asn_id, line_no, sku_id, expected_qty, uom
       )
       VALUES
         ($1, $2, 1, 'SKU000006', 4, 'EA'),
         ($1, $3, 1, 'SKU000006', 5, 'EA')`,
      [tenantId, eligible.asn_id, linked.asn_id],
    );
    const grn = await client.query(
      `INSERT INTO public.grns (
         tenant_id, warehouse_id, asn_id, supplier_id, received_date,
         status, received_by, notes, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, CURRENT_DATE, 'draft', $5, 'Linked fixture', now(), now())
       RETURNING grn_id`,
      [tenantId, warehouseId, linked.asn_id, supplierId, userId],
    );
    return {
      eligibleAsnId: eligible.asn_id,
      linkedAsnId: linked.asn_id,
      linkedGrnId: grn.rows[0].grn_id,
      receiveGrnId: await createDraftGrnFixture(client),
    };
  });
  eligibleAsnId = fixtures.eligibleAsnId;
  linkedAsnId = fixtures.linkedAsnId;
  linkedGrnId = fixtures.linkedGrnId;
  receiveGrnId = fixtures.receiveGrnId;
  createdAsnIds.push(eligibleAsnId, linkedAsnId);
  createdGrnIds.push(linkedGrnId, receiveGrnId);

  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/inbound/grn`;
});

after(async () => {
  await withTenantContext(tenantId, (client) => client.query(
    `DELETE FROM public.grns
     WHERE tenant_id = $1
       AND grn_id = ANY($2::text[])`,
    [tenantId, createdGrnIds],
  ));
  await withTenantContext(tenantId, (client) => client.query(
    `DELETE FROM public.asns
     WHERE tenant_id = $1
       AND asn_id = ANY($2::text[])`,
    [tenantId, createdAsnIds],
  ));
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path = "", {
  method = "GET",
  body,
  tenant = tenantId,
  role = "storemanager",
  user = userId,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": warehouseId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

test("PostgreSQL GRN000004 appears in list/detail and legacy JSON cannot override it", async () => {
  const legacy = db.grns.find((grn) => grn.grn_id === "GRN000004");
  assert.ok(legacy);
  assert.equal(legacy.asn_id, "ASN000006");
  assert.equal(legacy.status, "draft");

  const list = await request();
  assert.equal(list.status, 200);
  const listed = list.payload.data.find((grn) => grn.grn_id === "GRN000004");
  assert.ok(listed);
  assert.equal(listed.asn_id, "ASN000009");
  assert.notEqual(listed.status, legacy.status);
  assert.equal(listed.lines.length, 1);
  assert.equal(listed.lines[0].sku_id, "SKU000006");
  assert.equal(listed.lines[0].expected_qty, 10);
  assert.equal(listed.lines[0].received_qty, 10);

  const detail = await request("/GRN000004");
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.data.asn_id, "ASN000009");
  assert.equal(detail.payload.data.status, listed.status);
});

test("ASN to GRN handoff record is tenant isolated", async () => {
  const otherTenant = await request("/GRN000004", { tenant: "TNT000002" });
  assert.equal(otherTenant.status, 404);
});

test("eligible ASN options include arrived ASNs without GRNs and exclude linked ASNs", async () => {
  const response = await request("/eligible-asns");

  assert.equal(response.status, 200);
  const ids = response.payload.data.map((asn) => asn.asn_id);
  assert.equal(ids.includes(eligibleAsnId), true);
  assert.equal(ids.includes(linkedAsnId), false);
  const eligible = response.payload.data.find((asn) => asn.asn_id === eligibleAsnId);
  assert.equal(eligible.status, "arrived");
  assert.equal(eligible.tenant_id, tenantId);
  assert.equal(eligible.warehouse_id, warehouseId);
});

test("direct GRN creation remains unavailable", async () => {
  const response = await request("", {
    method: "POST",
    body: {
      asn_id: linkedAsnId,
      received_date: "2026-06-15",
    },
  });

  assert.equal(response.status, 404);
  assert.equal(response.payload.error.code, "NOT_FOUND");
});

test("GRN actions use PostgreSQL status instead of conflicting JSON status", async () => {
  const grnId = await withTenantContext(tenantId, (client) => createDraftGrnFixture(client, "PostgreSQL action-state test"));
  createdGrnIds.push(grnId);

  db.grns.push({
    grn_id: grnId,
    tenant_id: tenantId,
    status: "completed",
    asn_id: "ASN-LEGACY-CONFLICT",
  });
  try {
    const transitioned = await request(`/${grnId}/start_receiving`, {
      method: "POST",
      role: "storeoperator",
      body: {},
    });
    assert.equal(transitioned.status, 200);
    assert.equal(transitioned.payload.data.status, "receiving");

    const stored = await withTenantContext(tenantId, (client) => client.query(
      `SELECT status
       FROM public.grns
       WHERE tenant_id = $1
         AND grn_id = $2`,
      [tenantId, grnId],
    ));
    assert.equal(stored.rows[0].status, "receiving");
  } finally {
    db.grns = db.grns.filter((grn) => !(grn.grn_id === grnId && grn.asn_id === "ASN-LEGACY-CONFLICT"));
  }
});

test("storeoperator can update received quantities and complete GRN", async () => {
  const started = await request(`/${receiveGrnId}/start_receiving`, {
    method: "POST",
    role: "storeoperator",
  });
  assert.equal(started.status, 200, JSON.stringify(started.payload));
  assert.equal(started.payload.data.status, "receiving");

  const updated = await request(`/${receiveGrnId}/lines`, {
    method: "PATCH",
    role: "storeoperator",
    body: { lines: [{ line_no: 1, received_qty: 2 }] },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.payload));
  assert.equal(updated.payload.data.lines[0].received_qty, 2);

  const completed = await request(`/${receiveGrnId}/complete`, {
    method: "POST",
    role: "storeoperator",
  });
  assert.equal(completed.status, 200, JSON.stringify(completed.payload));
  assert.equal(completed.payload.data.status, "completed");
});
