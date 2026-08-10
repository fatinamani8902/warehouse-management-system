import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
const created = {
  warehouses: [],
  zones: [],
  aisles: [],
  bays: [],
  levels: [],
  bins: [],
};
let hierarchy;
const compactCodeMigration = new URL(
  "../migrations/20260609_003_standardize_level_bin_codes.sql",
  import.meta.url
);

before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/master/taxonomy`;
});

after(async () => {
  for (const resource of ["bins", "levels", "bays", "aisles", "zones", "warehouses"]) {
    const ids = created[resource];
    if (!ids.length) continue;
    const table = resource === "warehouses" ? "warehouses" : `warehouse_${resource}`;
    const idField = resource === "warehouses" ? "warehouse_id" : `${resource.slice(0, -1)}_id`;
    await pool.query(
      `DELETE FROM public.${table} WHERE tenant_id = $1 AND ${idField} = ANY($2::text[])`,
      ["TNT000001", ids]
    );
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path, {
  method = "GET",
  body,
  tenant = "TNT000001",
  role = "superadmin",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": "USR000001",
      "x-roles": role,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

async function create(resource, payload) {
  const response = await request(`/${resource}`, { method: "POST", body: payload });
  assert.equal(response.status, 201, JSON.stringify(response.payload));
  const idField = resource === "warehouses" ? "warehouse_id" : `${resource.slice(0, -1)}_id`;
  created[resource].push(response.payload.data[idField]);
  return response.payload.data;
}

test("compact code migration is idempotent and preserves valid compact codes", async () => {
  const beforeLevels = await pool.query(
    `SELECT level_id, level_code
     FROM public.warehouse_levels
     WHERE level_code ~ '^L[0-9]{2,}$'
     ORDER BY level_id`
  );
  const beforeBins = await pool.query(
    `SELECT bin_id, bin_code
     FROM public.warehouse_bins
     WHERE bin_code ~ '^B[0-9]{3,}$'
     ORDER BY bin_id`
  );
  const migrationSql = await readFile(compactCodeMigration, "utf8");

  await pool.query(migrationSql);
  const afterFirstRun = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM public.warehouse_levels WHERE level_code !~ '^L[0-9]{2,}$') AS invalid_levels,
       (SELECT count(*)::int FROM public.warehouse_bins WHERE bin_code !~ '^B[0-9]{3,}$') AS invalid_bins`
  );
  assert.deepEqual(afterFirstRun.rows[0], { invalid_levels: 0, invalid_bins: 0 });

  await pool.query(migrationSql);
  const afterLevels = await pool.query(
    `SELECT level_id, level_code
     FROM public.warehouse_levels
     WHERE level_id = ANY($1::text[])
     ORDER BY level_id`,
    [beforeLevels.rows.map((row) => row.level_id)]
  );
  const afterBins = await pool.query(
    `SELECT bin_id, bin_code
     FROM public.warehouse_bins
     WHERE bin_id = ANY($1::text[])
     ORDER BY bin_id`,
    [beforeBins.rows.map((row) => row.bin_id)]
  );
  assert.deepEqual(afterLevels.rows, beforeLevels.rows);
  assert.deepEqual(afterBins.rows, beforeBins.rows);
});

test("creates, lists, reads, and updates the complete location hierarchy", async () => {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await create("warehouses", {
    warehouse_code: `WH-${suffix}`,
    warehouse_name: `Warehouse ${suffix}`,
    status: "active",
  });
  assert.match(warehouse.warehouse_id, /^WH\d{6}$/);

  const zone = await create("zones", {
    warehouse_id: warehouse.warehouse_id,
    zone_code: `ZA-${suffix}`,
    zone_name: `Zone A ${suffix}`,
    zone_type: "storage",
    status: "active",
  });
  assert.match(zone.zone_id, /^ZON\d{6}$/);
  assert.equal(zone.status, "active");
  assert.equal(zone.zone_type, "storage");

  const aisle = await create("aisles", {
    zone_id: zone.zone_id,
    aisle_name: `Aisle 01 ${suffix}`,
    status: "active",
  });
  assert.match(aisle.aisle_id, /^AIS\d{6}$/);
  assert.equal(aisle.aisle_code, "01");
  assert.equal(aisle.aisle_name, `Aisle 01 ${suffix}`);
  assert.equal(aisle.zone_name, zone.zone_name);
  assert.equal(aisle.location_code, `${warehouse.warehouse_code}-${zone.zone_code}-01`);
  assert.equal(aisle.status, "active");

  const bay = await create("bays", {
    zone_id: zone.zone_id,
    aisle_id: aisle.aisle_id,
    bay_name: `Bay 001 ${suffix}`,
    width_cm: 220,
    depth_cm: 60,
    level_height_cm: 55,
    level_count: 5,
    max_weight_kg: 750,
    status: "active",
  });
  assert.match(bay.bay_id, /^BAY\d{6}$/);
  assert.equal(bay.bay_code, "001");
  assert.equal(bay.bay_name, `Bay 001 ${suffix}`);
  assert.equal(bay.aisle_name, aisle.aisle_name);
  assert.equal(bay.zone_id, zone.zone_id);
  assert.equal(bay.zone_name, zone.zone_name);
  assert.equal(bay.location_code, `${warehouse.warehouse_code}-${zone.zone_code}-01-001`);
  assert.equal(bay.status, "active");
  assert.equal(Number(bay.width_cm), 220);
  assert.equal(Number(bay.depth_cm), 60);
  assert.equal(Number(bay.level_height_cm), 55);
  assert.equal(bay.level_count, 5);
  assert.equal(Number(bay.max_weight_kg), 750);

  const level = await create("levels", {
    bay_id: bay.bay_id,
    level_code: "CLIENT-OVERRIDE",
    status: "active",
  });
  assert.match(level.level_id, /^LVL\d{6}$/);
  assert.equal(level.level_code, "L01");
  assert.equal(level.bay_id, bay.bay_id);
  assert.equal(level.bay_name, bay.bay_name);
  assert.equal(
    level.location_code,
    `${warehouse.warehouse_code}-${zone.zone_code}-01-001-L01`
  );

  const secondLevel = await create("levels", {
    bay_id: bay.bay_id,
    status: "active",
  });
  assert.equal(secondLevel.level_code, "L02");

  const levelList = await request(
    `/levels?bay_id=${bay.bay_id}&search=${encodeURIComponent(level.location_code)}&page=1&pageSize=10`
  );
  assert.equal(levelList.status, 200);
  assert.equal(levelList.payload.data[0].level_id, level.level_id);
  assert.equal(levelList.payload.data[0].location_code, level.location_code);

  const levelDetail = await request(`/levels/${level.level_id}`);
  assert.equal(levelDetail.status, 200);
  assert.equal(levelDetail.payload.data.location_code, level.location_code);

  const updatedLevel = await request(`/levels/${level.level_id}`, {
    method: "PUT",
    body: {
      bay_id: bay.bay_id,
      level_code: "L99",
      status: "inactive",
    },
  });
  assert.equal(updatedLevel.status, 200);
  assert.equal(updatedLevel.payload.data.status, "inactive");
  assert.equal(updatedLevel.payload.data.level_code, "L01");
  level.status = "inactive";

  const bin = await create("bins", {
    level_id: level.level_id,
    bin_code: "CLIENT-OVERRIDE",
    max_weight: 250,
    max_volume: 12.5,
    status: "active",
  });
  assert.match(bin.bin_id, /^BIN\d{6}$/);
  assert.equal(bin.bin_code, "B001");
  assert.equal(bin.level_id, level.level_id);
  assert.equal(bin.level_code, level.level_code);
  assert.equal(bin.bay_id, bay.bay_id);
  assert.equal(bin.location_code, `${level.location_code}-B001`);

  const secondBin = await create("bins", {
    level_id: level.level_id,
    status: "active",
  });
  assert.equal(secondBin.bin_code, "B002");

  hierarchy = { warehouse, zone, aisle, bay, level, bin };

  const list = await request(
    `/bins?page=1&pageSize=1&search=${encodeURIComponent(bin.location_code)}`
  );
  assert.equal(list.status, 200);
  assert.equal(list.payload.page, 1);
  assert.equal(list.payload.pageSize, 1);
  assert.equal(list.payload.total, 1);
  assert.equal(list.payload.totalPages, 1);

  const detail = await request(`/bins/${bin.bin_id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.data.level_id, level.level_id);
  assert.equal(detail.payload.data.location_code, bin.location_code);

  const updated = await request(`/bins/${bin.bin_id}`, {
    method: "PUT",
    body: {
      level_id: level.level_id,
      bin_code: "B999",
      max_weight: 300,
      max_volume: 15,
      status: "inactive",
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.data.bin_code, "B001");
  assert.equal(updated.payload.data.status, "inactive");
  assert.equal(updated.payload.data.location_code, `${level.location_code}-B001`);

  const tree = await request("/tree");
  assert.equal(tree.status, 200);
  const treeWarehouse = tree.payload.data.find((item) => item.warehouse_id === warehouse.warehouse_id);
  assert.equal(treeWarehouse.zones[0].status, "active");
  assert.equal(treeWarehouse.zones[0].zone_type, "storage");
  assert.equal(treeWarehouse.zones[0].aisles[0].aisle_code, "01");
  assert.equal(treeWarehouse.zones[0].aisles[0].aisle_name, `Aisle 01 ${suffix}`);
  assert.equal(treeWarehouse.zones[0].aisles[0].location_code, `${warehouse.warehouse_code}-${zone.zone_code}-01`);
  assert.equal(treeWarehouse.zones[0].aisles[0].bays[0].bay_code, "001");
  assert.equal(treeWarehouse.zones[0].aisles[0].bays[0].bay_name, `Bay 001 ${suffix}`);
  assert.equal(treeWarehouse.zones[0].aisles[0].bays[0].location_code, `${warehouse.warehouse_code}-${zone.zone_code}-01-001`);
  assert.equal(treeWarehouse.zones[0].aisles[0].bays[0].levels[0].location_code, level.location_code);
  assert.equal(
    treeWarehouse.zones[0].aisles[0].bays[0].levels[0].bins[0].location_code,
    `${level.location_code}-B001`
  );
  assert.equal(treeWarehouse.zones[0].aisles[0].bays[0].levels[0].bins[0].bin_id, bin.bin_id);

  const searchedTree = await request(`/tree?search=${encodeURIComponent(bin.location_code)}`);
  assert.equal(searchedTree.status, 200);
  assert.ok(searchedTree.payload.data.some((item) => item.warehouse_id === warehouse.warehouse_id));
});

test("bay list filters by zone and aisle and validates required aisle", async () => {
  for (const query of [
    `zone_id=${hierarchy.zone.zone_id}`,
    `aisle_id=${hierarchy.aisle.aisle_id}`,
  ]) {
    const response = await request(`/bays?${query}&page=1&pageSize=10`);
    assert.equal(response.status, 200);
    const bay = response.payload.data.find((item) => item.bay_id === hierarchy.bay.bay_id);
    assert.ok(bay);
    assert.equal(bay.bay_code, "001");
    assert.equal(bay.bay_name, hierarchy.bay.bay_name);
    assert.equal(bay.aisle_name, hierarchy.aisle.aisle_name);
    assert.equal(bay.zone_id, hierarchy.zone.zone_id);
    assert.equal(bay.zone_name, hierarchy.zone.zone_name);
    assert.equal(
      bay.location_code,
      `${hierarchy.warehouse.warehouse_code}-${hierarchy.zone.zone_code}-01-001`
    );
    assert.equal(bay.status, "active");
  }

  const missingAisle = await request("/bays", {
    method: "POST",
    body: {
      zone_id: hierarchy.zone.zone_id,
      bay_name: "Missing aisle",
      width_cm: 200,
      depth_cm: 50,
      level_height_cm: 50,
      level_count: 4,
      max_weight_kg: 500,
      status: "active",
    },
  });
  assert.equal(missingAisle.status, 400);
  assert.equal(missingAisle.payload.message, "Aisle is required");
});

test("aisle list and detail preserve generated code, name, location, and status", async () => {
  const suffix = randomUUID().slice(0, 8);
  const aisle = await create("aisles", {
    zone_id: hierarchy.zone.zone_id,
    aisle_name: `Inactive Aisle ${suffix}`,
    status: "inactive",
  });
  assert.equal(aisle.aisle_code, "02");
  assert.equal(aisle.status, "inactive");

  const expectedLocation = `${hierarchy.warehouse.warehouse_code}-${hierarchy.zone.zone_code}-02`;
  const list = await request(`/aisles?search=${suffix}&page=1&pageSize=10`);
  assert.equal(list.status, 200);
  assert.equal(list.payload.data.length, 1);
  assert.equal(list.payload.data[0].aisle_code, "02");
  assert.equal(list.payload.data[0].aisle_name, `Inactive Aisle ${suffix}`);
  assert.equal(list.payload.data[0].zone_name, hierarchy.zone.zone_name);
  assert.equal(list.payload.data[0].location_code, expectedLocation);
  assert.equal(list.payload.data[0].status, "inactive");

  const detail = await request(`/aisles/${aisle.aisle_id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.data.aisle_code, "02");
  assert.equal(detail.payload.data.aisle_name, `Inactive Aisle ${suffix}`);
  assert.equal(detail.payload.data.location_code, expectedLocation);
  assert.equal(detail.payload.data.status, "inactive");
});

test("zone list and detail preserve inactive status and zone type", async () => {
  const suffix = randomUUID().slice(0, 8);
  const zone = await create("zones", {
    warehouse_id: hierarchy.warehouse.warehouse_id,
    zone_code: `ZI-${suffix}`,
    zone_name: `Inactive Zone ${suffix}`,
    zone_type: "quarantine",
    status: "inactive",
  });

  const list = await request(`/zones?search=${suffix}&page=1&pageSize=10`);
  assert.equal(list.status, 200);
  assert.equal(list.payload.data.length, 1);
  assert.equal(list.payload.data[0].status, "inactive");
  assert.equal(list.payload.data[0].zone_type, "quarantine");

  const detail = await request(`/zones/${zone.zone_id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.data.status, "inactive");
  assert.equal(detail.payload.data.zone_type, "quarantine");

  const updated = await request(`/zones/${zone.zone_id}`, {
    method: "PUT",
    body: {
      warehouse_id: hierarchy.warehouse.warehouse_id,
      zone_code: zone.zone_code,
      zone_name: zone.zone_name,
      zone_type: "receiving",
      status: "active",
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.data.status, "active");
  assert.equal(updated.payload.data.zone_type, "receiving");
});

test("enforces tenant isolation and parent-child tenant validation", async () => {
  const hidden = await request(`/zones/${hierarchy.zone.zone_id}`, { tenant: "TNT000002" });
  assert.equal(hidden.status, 404);

  const invalidParent = await request("/aisles", {
    method: "POST",
    tenant: "TNT000002",
    body: {
      zone_id: hierarchy.zone.zone_id,
      aisle_code: "CROSS-TENANT",
      aisle_name: "Cross tenant aisle",
      status: "active",
    },
  });
  assert.equal(invalidParent.status, 400);
  assert.equal(invalidParent.payload.message, "Zone not found for this tenant");

  const invalidBinParent = await request("/bins", {
    method: "POST",
    body: {
      level_id: "LVL999999",
      status: "active",
    },
  });
  assert.equal(invalidBinParent.status, 400);
  assert.equal(invalidBinParent.payload.message, "Level not found for this tenant");
});

test("validates mandatory fields, status, numeric capacity, and RBAC", async () => {
  const missingCode = await request("/zones", {
    method: "POST",
    body: {
      warehouse_id: hierarchy.warehouse.warehouse_id,
      zone_name: "No code",
      status: "active",
    },
  });
  assert.equal(missingCode.status, 400);
  assert.equal(missingCode.payload.message, "Zone code is required");

  const missingStatus = await request("/zones", {
    method: "POST",
    body: {
      warehouse_id: hierarchy.warehouse.warehouse_id,
      zone_code: "NO-STATUS",
      zone_name: "Missing status",
      zone_type: "storage",
    },
  });
  assert.equal(missingStatus.status, 400);
  assert.equal(missingStatus.payload.message, "Status is required");

  const invalidStatus = await request(`/aisles/${hierarchy.aisle.aisle_id}`, {
    method: "PUT",
    body: {
      zone_id: hierarchy.zone.zone_id,
      aisle_code: hierarchy.aisle.aisle_code,
      aisle_name: hierarchy.aisle.aisle_name,
      status: "archived",
    },
  });
  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.payload.message, "Status must be active or inactive");

  const invalidWeight = await request("/bins", {
    method: "POST",
    body: {
      level_id: hierarchy.level.level_id,
      max_weight: -1,
      status: "active",
    },
  });
  assert.equal(invalidWeight.status, 400);

  const viewerList = await request("/zones?page=1&pageSize=10", { role: "viewer" });
  assert.equal(viewerList.status, 200);

  const viewerCreate = await request("/zones", {
    method: "POST",
    role: "viewer",
    body: {
      warehouse_id: hierarchy.warehouse.warehouse_id,
      zone_code: "VIEWER",
      zone_name: "Viewer zone",
      zone_type: "storage",
      status: "active",
    },
  });
  assert.equal(viewerCreate.status, 403);
});

test("requires confirmation, hard deletes unreferenced rows, and soft deletes referenced rows", async () => {
  const noConfirmation = await request(`/bins/${hierarchy.bin.bin_id}`, { method: "DELETE" });
  assert.equal(noConfirmation.status, 400);
  assert.equal(noConfirmation.payload.message, "confirmDelete=true is required");

  const hardDelete = await request(`/bins/${hierarchy.bin.bin_id}`, {
    method: "DELETE",
    body: { confirmDelete: true },
  });
  assert.equal(hardDelete.status, 200);
  assert.equal(hardDelete.payload.softDeleted, false);
  created.bins = created.bins.filter((id) => id !== hierarchy.bin.bin_id);

  const softDelete = await request(`/zones/${hierarchy.zone.zone_id}`, {
    method: "DELETE",
    body: { confirmDelete: true },
  });
  assert.equal(softDelete.status, 200);
  assert.equal(softDelete.payload.softDeleted, true);
  assert.equal(softDelete.payload.data.status, "inactive");
  assert.match(softDelete.payload.message, /set to inactive/i);
});

test("hard deletes unreferenced aisle, bay, and level records", async () => {
  const suffix = randomUUID().slice(0, 8);
  const aisle = await create("aisles", {
    zone_id: hierarchy.zone.zone_id,
    aisle_name: `Delete Aisle ${suffix}`,
    status: "active",
  });
  const bay = await create("bays", {
    aisle_id: aisle.aisle_id,
    bay_name: `Delete Bay ${suffix}`,
    status: "active",
  });
  const level = await create("levels", {
    bay_id: bay.bay_id,
    status: "active",
  });

  const deletedLevel = await request(`/levels/${level.level_id}`, {
    method: "DELETE",
    body: { confirmDelete: true },
  });
  assert.equal(deletedLevel.status, 200);
  assert.equal(deletedLevel.payload.softDeleted, false);
  created.levels = created.levels.filter((id) => id !== level.level_id);

  const deletedBay = await request(`/bays/${bay.bay_id}`, {
    method: "DELETE",
    body: { confirmDelete: true },
  });
  assert.equal(deletedBay.status, 200);
  assert.equal(deletedBay.payload.softDeleted, false);
  created.bays = created.bays.filter((id) => id !== bay.bay_id);

  const deletedAisle = await request(`/aisles/${aisle.aisle_id}`, {
    method: "DELETE",
    body: { confirmDelete: true },
  });
  assert.equal(deletedAisle.status, 200);
  assert.equal(deletedAisle.payload.softDeleted, false);
  created.aisles = created.aisles.filter((id) => id !== aisle.aisle_id);
});
