import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
const migrationUrl = new URL(
  "../migrations/20260609_004_canonicalize_locations.sql",
  import.meta.url
);

before(async () => {
  const migrationSql = await readFile(migrationUrl, "utf8");
  await pool.query(migrationSql);
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/locations`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

async function request(path = "", tenant = "TNT000001") {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "x-tenant-id": tenant,
      "x-user-id": "USR000001",
      "x-roles": "viewer",
    },
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

test("location bridge migration is idempotent and backfills every taxonomy bin once", async () => {
  const migrationSql = await readFile(migrationUrl, "utf8");
  await pool.query(migrationSql);
  const before = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.locations
     WHERE bin_id IS NOT NULL`
  );

  await pool.query(migrationSql);

  const after = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.locations
     WHERE bin_id IS NOT NULL`
  );
  const missing = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.warehouse_bins bin
     LEFT JOIN public.locations location
       ON location.tenant_id = bin.tenant_id
      AND location.bin_id = bin.bin_id
     WHERE location.location_id IS NULL`
  );

  assert.equal(after.rows[0].count, before.rows[0].count);
  assert.equal(missing.rows[0].count, 0);
});

test("location list is paginated, searchable, and type filtered", async () => {
  const response = await request("?page=1&pageSize=5&type=storage&search=WH");

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.data), true);
  assert.equal(response.payload.page, 1);
  assert.equal(response.payload.pageSize, 5);
  assert.equal(typeof response.payload.total, "number");
  assert.equal(typeof response.payload.totalPages, "number");
  assert.equal(
    response.payload.data.every((row) => row.location_type === "storage"),
    true
  );
});

test("location lookup returns active canonical locations and compact display names", async () => {
  const response = await request("/lookup?type=storage");

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.data), true);
  assert.equal(response.payload.data.every((row) => row.status === "active"), true);

  const binBacked = response.payload.data.find((row) => row.bin_id);
  assert.ok(binBacked);
  assert.match(binBacked.display_name, /^WH[^-]*-.+-.+-.+-L\d{2,}-B\d{3,}$/);
  assert.equal(binBacked.location_code, binBacked.display_name);
});

test("location lookup enforces tenant isolation", async () => {
  const tenantOne = await request("/lookup?search=WH", "TNT000001");
  const tenantTwo = await request("/lookup?search=WH", "TNT000002");

  assert.equal(tenantOne.status, 200);
  assert.equal(tenantTwo.status, 200);

  const tenantOneIds = new Set(tenantOne.payload.data.map((row) => row.location_id));
  assert.equal(
    tenantTwo.payload.data.some((row) => tenantOneIds.has(row.location_id)),
    false
  );
});

test("database rejects duplicate bin-backed locations", async () => {
  const existing = await pool.query(
    `SELECT tenant_id, warehouse_id, bin_id
     FROM public.locations
     WHERE bin_id IS NOT NULL
     ORDER BY location_id
     LIMIT 1`
  );
  assert.equal(existing.rowCount, 1);

  await assert.rejects(
    pool.query(
      `INSERT INTO public.locations (
         tenant_id, warehouse_id, bin_id, location_code, label, location_type
       )
       VALUES ($1, $2, $3, $4, $4, 'storage')`,
      [
        existing.rows[0].tenant_id,
        existing.rows[0].warehouse_id,
        existing.rows[0].bin_id,
        `DUPLICATE-${Date.now()}`,
      ]
    ),
    (error) => error.code === "23505"
  );
});

test("database requires bin_id for new storage locations but permits operational locations", async () => {
  const warehouse = await pool.query(
    `SELECT tenant_id, warehouse_id
     FROM public.warehouses
     ORDER BY tenant_id, warehouse_id
     LIMIT 1`
  );
  assert.equal(warehouse.rowCount, 1);
  const code = `TEST-${Date.now()}`;

  await assert.rejects(
    pool.query(
      `INSERT INTO public.locations (
         tenant_id, warehouse_id, location_code, label, location_type
       )
       VALUES ($1, $2, $3, $3, 'storage')`,
      [warehouse.rows[0].tenant_id, warehouse.rows[0].warehouse_id, code]
    ),
    (error) => error.code === "23514"
  );

  const operational = await pool.query(
    `INSERT INTO public.locations (
       tenant_id, warehouse_id, location_code, label, location_type
     )
     VALUES ($1, $2, $3, $3, 'adjustment')
     RETURNING location_id`,
    [warehouse.rows[0].tenant_id, warehouse.rows[0].warehouse_id, `${code}-OP`]
  );
  await pool.query(
    `DELETE FROM public.locations WHERE location_id = $1`,
    [operational.rows[0].location_id]
  );
});

test("invalid location type returns a friendly 400", async () => {
  const response = await request("/lookup?type=dock");
  assert.equal(response.status, 400);
  assert.equal(response.payload.error.message, "Location type is invalid");
});
