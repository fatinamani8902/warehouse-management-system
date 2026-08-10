import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let apiBase;
const created = {
  locations: [],
  bins: [],
  levels: [],
  bays: [],
  aisles: [],
  zones: [],
  warehouses: [],
};

before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  apiBase = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  for (const locationId of created.locations) {
    await pool.query(
      `DELETE FROM public.locations WHERE tenant_id = 'TNT000001' AND location_id = $1`,
      [locationId]
    );
  }
  for (const resource of ["bins", "levels", "bays", "aisles", "zones", "warehouses"]) {
    const ids = created[resource];
    if (!ids.length) continue;
    const table = resource === "warehouses" ? "warehouses" : `warehouse_${resource}`;
    const idField = resource === "warehouses" ? "warehouse_id" : `${resource.slice(0, -1)}_id`;
    await pool.query(
      `DELETE FROM public.${table} WHERE tenant_id = 'TNT000001' AND ${idField} = ANY($1::text[])`,
      [ids]
    );
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path, {
  method = "GET",
  body,
  tenant = "TNT000001",
  warehouse = "WH000001",
  role = "superadmin",
} = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenant,
      "x-warehouse-id": warehouse,
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

async function createTaxonomy(resource, payload) {
  const response = await request(`/master/taxonomy/${resource}`, { method: "POST", body: payload });
  assert.equal(response.status, 201, JSON.stringify(response.payload));
  const idField = resource === "warehouses" ? "warehouse_id" : `${resource.slice(0, -1)}_id`;
  created[resource].push(response.payload.data[idField]);
  return response.payload.data;
}

async function createHierarchy() {
  const suffix = randomUUID().slice(0, 8);
  const warehouse = await createTaxonomy("warehouses", {
    warehouse_code: `WHST${suffix}`,
    warehouse_name: `Storage Warehouse ${suffix}`,
    status: "active",
  });
  const zone = await createTaxonomy("zones", {
    warehouse_id: warehouse.warehouse_id,
    zone_code: `ZS${suffix}`,
    zone_name: `Storage Zone ${suffix}`,
    zone_type: "storage",
    status: "active",
  });
  const aisle = await createTaxonomy("aisles", {
    zone_id: zone.zone_id,
    aisle_name: `Aisle ${suffix}`,
    status: "active",
  });
  const bay = await createTaxonomy("bays", {
    aisle_id: aisle.aisle_id,
    bay_name: `Bay ${suffix}`,
    status: "active",
  });
  const level = await createTaxonomy("levels", {
    bay_id: bay.bay_id,
    status: "active",
  });
  const bin = await createTaxonomy("bins", {
    level_id: level.level_id,
    status: "active",
  });
  return { warehouse, zone, bin };
}

test("master UI path can create one active storage location from a taxonomy bin", async () => {
  const { warehouse, zone, bin } = await createHierarchy();

  const response = await request("/master/locations", {
    method: "POST",
    warehouse: warehouse.warehouse_id,
    body: {
      warehouse_id: warehouse.warehouse_id,
      location_code: bin.location_code,
      label: bin.location_code,
      location_type: "storage",
      zone_id: zone.zone_id,
      bin_id: bin.bin_id,
      is_active: true,
      is_default_receiving: false,
    },
  });

  assert.equal(response.status, 201, JSON.stringify(response.payload));
  assert.equal(response.payload.data.location_type, "storage");
  assert.equal(response.payload.data.bin_id, bin.bin_id);
  assert.equal(response.payload.data.warehouse_id, warehouse.warehouse_id);
  assert.equal(response.payload.data.zone, zone.zone_id);
  assert.equal(response.payload.data.is_active, true);
  created.locations.push(response.payload.data.location_id);

  const lookup = await request(`/locations/lookup?type=storage&search=${encodeURIComponent(bin.location_code)}`, {
    warehouse: warehouse.warehouse_id,
  });
  assert.equal(lookup.status, 200);
  assert.ok(lookup.payload.data.some((row) => row.bin_id === bin.bin_id));
});

test("storage location create rejects duplicate bin and wrong warehouse", async () => {
  const { warehouse, zone, bin } = await createHierarchy();
  const body = {
    warehouse_id: warehouse.warehouse_id,
    location_code: bin.location_code,
    label: bin.location_code,
    location_type: "storage",
    zone_id: zone.zone_id,
    bin_id: bin.bin_id,
    is_active: true,
    is_default_receiving: false,
  };

  const createdResponse = await request("/master/locations", {
    method: "POST",
    warehouse: warehouse.warehouse_id,
    body,
  });
  assert.equal(createdResponse.status, 201, JSON.stringify(createdResponse.payload));
  created.locations.push(createdResponse.payload.data.location_id);

  const duplicate = await request("/master/locations", {
    method: "POST",
    warehouse: warehouse.warehouse_id,
    body: { ...body, location_code: `${body.location_code}-DUP`, label: `${body.label}-DUP` },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.payload.message, "A storage location already exists for this bin.");

  const wrongWarehouse = await request("/master/locations", {
    method: "POST",
    warehouse: "WH000001",
    body: {
      ...body,
      warehouse_id: "WH000001",
      bin_id: bin.bin_id,
      location_code: `${body.location_code}-WRONG`,
      label: `${body.label}-WRONG`,
    },
  });
  assert.equal(wrongWarehouse.status, 400);
  assert.equal(wrongWarehouse.payload.message, "Selected bin does not belong to the current warehouse");
});

test("storage location create enforces master data RBAC", async () => {
  const { warehouse, zone, bin } = await createHierarchy();

  const denied = await request("/master/locations", {
    method: "POST",
    warehouse: warehouse.warehouse_id,
    role: "viewer",
    body: {
      warehouse_id: warehouse.warehouse_id,
      location_code: bin.location_code,
      label: bin.location_code,
      location_type: "storage",
      zone_id: zone.zone_id,
      bin_id: bin.bin_id,
      is_active: true,
      is_default_receiving: false,
    },
  });

  assert.equal(denied.status, 403);
});
