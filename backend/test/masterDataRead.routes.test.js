import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { closeSequelize } from "../src/db/sequelizeHealth.js";
import { createApp } from "../src/server.js";

let server;
let masterBaseUrl;
let lovBaseUrl;
let locationBaseUrl;
const cleanup = {
  suppliers: [],
  customers: [],
  warehouses: [],
  locations: [],
  lovGroups: [],
  lovValues: [],
  tenants: [],
};

before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  const port = server.address().port;
  masterBaseUrl = `http://127.0.0.1:${port}/api/v1/master`;
  lovBaseUrl = `http://127.0.0.1:${port}/api/v1/lov`;
  locationBaseUrl = `http://127.0.0.1:${port}/api/v1/locations`;
});

after(async () => {
  await pool.query(`DELETE FROM public.lov_values WHERE lov_value_id = ANY($1::text[])`, [cleanup.lovValues]);
  await pool.query(
    `DELETE FROM public.lov_groups WHERE lov_group_id = ANY($1::text[])`,
    [cleanup.lovGroups]
  );
  await pool.query(
    `DELETE FROM public.locations WHERE location_id = ANY($1::text[])`,
    [cleanup.locations]
  );
  await pool.query(
    `DELETE FROM public.customers WHERE customer_id = ANY($1::text[])`,
    [cleanup.customers]
  );
  await pool.query(
    `DELETE FROM public.suppliers WHERE supplier_id = ANY($1::text[])`,
    [cleanup.suppliers]
  );
  await pool.query(
    `DELETE FROM public.warehouses WHERE warehouse_id = ANY($1::text[])`,
    [cleanup.warehouses]
  );
  await new Promise((resolve) => server.close(resolve));
  await closeSequelize();
  await pool.end();
});

async function request(baseUrl, path = "", { method = "GET", body, tenant = "TNT000001", role = "superadmin", warehouse = "WH000001" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": "USR000001",
      "x-roles": role,
      "x-warehouse-id": warehouse,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

function uniqueCode(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

test("supplier list is Sequelize-backed, paginated, and tenant scoped", async () => {
  const suffix = uniqueCode("SUPREAD");
  const supplierId = `SUP${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const tenantOneSupplier = {
    supplier_id: supplierId,
    tenant_id: "TNT000001",
    supplier_name: `Supplier ${suffix}`,
    supplier_code: `SC-${suffix}`,
    email: `supplier-${suffix.toLowerCase()}@example.com`,
    phone: "0123456789",
    address: "Main Street",
    contact_person: "Alice",
    status: "active",
  };
  await pool.query(
    `INSERT INTO public.suppliers (
       supplier_id, tenant_id, supplier_name, supplier_code, email, phone, address,
       contact_person, status, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
    [
      tenantOneSupplier.supplier_id,
      tenantOneSupplier.tenant_id,
      tenantOneSupplier.supplier_name,
      tenantOneSupplier.supplier_code,
      tenantOneSupplier.email,
      tenantOneSupplier.phone,
      tenantOneSupplier.address,
      tenantOneSupplier.contact_person,
      tenantOneSupplier.status,
    ]
  );
  cleanup.suppliers.push(tenantOneSupplier.supplier_id);

  const response = await request(masterBaseUrl, `/suppliers?page=1&pageSize=1&search=${encodeURIComponent(suffix)}`);
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.data), true);
  assert.equal(response.payload.data.length, 1);
  assert.equal(response.payload.page, 1);
  assert.equal(response.payload.pageSize, 1);
  assert.equal(response.payload.total >= 1, true);
  assert.equal(response.payload.data[0].tenant_id, "TNT000001");
  assert.equal(response.payload.data[0].supplier_id, tenantOneSupplier.supplier_id);
});

test("customer list returns contact alias from PostgreSQL only", async () => {
  const suffix = uniqueCode("CUSREAD");
  const customerId = `CUS${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  await pool.query(
    `INSERT INTO public.customers (
       customer_id, tenant_id, customer_name, customer_code, email, phone, address,
       status, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
    [
      customerId,
      "TNT000001",
      `Customer ${suffix}`,
      `CC-${suffix}`,
      `customer-${suffix.toLowerCase()}@example.com`,
      "0987654321",
      "Market Street",
      "active",
    ]
  );
  cleanup.customers.push(customerId);

  const response = await request(masterBaseUrl, `/customers?search=${encodeURIComponent(suffix)}`);
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.data), true);
  assert.equal(response.payload.total >= 1, true);
  assert.equal(response.payload.data[0].customer_id, customerId);
  assert.equal(response.payload.data[0].contact, `customer-${suffix.toLowerCase()}@example.com`);
});

test("warehouse list reads from PostgreSQL", async () => {
  const warehouseId = `WH${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const warehouseCode = `WH-${randomUUID().slice(0, 6).toUpperCase()}`;
  await pool.query(
    `INSERT INTO public.warehouses (
       warehouse_id, tenant_id, warehouse_code, warehouse_name, city, country,
       status, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [warehouseId, "TNT000001", warehouseCode, `Warehouse ${warehouseId}`, "Kuala Lumpur", "MY", "active"]
  );
  cleanup.warehouses.push(warehouseId);

  const response = await request(masterBaseUrl, `/warehouses?search=${encodeURIComponent(warehouseCode)}`);
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.data), true);
  assert.equal(response.payload.data.some((row) => row.warehouse_id === warehouseId), true);
  assert.equal(response.payload.data.every((row) => row.tenant_id === "TNT000001"), true);
});

test("master locations and lookup remain tenant scoped", async () => {
  const warehouseId = `WH${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const locationId = `LOC${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const warehouseCode = `WH-${randomUUID().slice(0, 6).toUpperCase()}`;
  const warehouseName = `Location Warehouse ${randomUUID().slice(0, 6).toUpperCase()}`;
  await pool.query(
    `INSERT INTO public.warehouses (
       warehouse_id, tenant_id, warehouse_code, warehouse_name, city, country,
       status, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [warehouseId, "TNT000001", warehouseCode, warehouseName, "Shah Alam", "MY", "active"]
  );
  await pool.query(
    `INSERT INTO public.locations (
       location_id, tenant_id, warehouse_id, location_code, label, location_type,
       is_default_receiving, is_active, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'adjustment', false, true, now(), now())`,
    [locationId, "TNT000001", warehouseId, `LOC-READ-${randomUUID().slice(0, 6).toUpperCase()}`, "Adjustment Bay"]
  );
  cleanup.locations.push(locationId);
  cleanup.warehouses.push(warehouseId);

  const lookup = await request(locationBaseUrl, "/lookup?type=adjustment&search=LOC-READ", {
    warehouse: warehouseId,
  });
  assert.equal(lookup.status, 200, JSON.stringify(lookup.payload));
  assert.equal(Array.isArray(lookup.payload.data), true);
  assert.equal(lookup.payload.data.some((row) => row.location_id === locationId), true);
  assert.equal(lookup.payload.data.every((row) => row.status === "active"), true);

  const list = await request(locationBaseUrl, "?type=adjustment&page=1&pageSize=5&search=LOC-READ", {
    warehouse: warehouseId,
  });
  assert.equal(list.status, 200, JSON.stringify(list.payload));
  assert.equal(Array.isArray(list.payload.data), true);
  assert.equal(list.payload.data.some((row) => row.location_id === locationId), true);
  assert.equal(list.payload.total >= 1, true);
});

test("lov groups read returns nested values from PostgreSQL", async () => {
  const groupId = `LVG${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const valueOneId = `LVV${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const valueTwoId = `LVV${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

  await pool.query(
    `INSERT INTO public.lov_groups (
       lov_group_id, tenant_id, group_code, group_name, description, is_system,
       created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, false, now(), now())`,
    [groupId, "TNT000001", `GROUP-${groupId}`, `Group ${groupId}`, "Read test group"]
  );
  await pool.query(
    `INSERT INTO public.lov_values (
       lov_value_id, tenant_id, lov_group_id, value_code, value_label, sort_order,
       is_active, created_at, updated_at
     ) VALUES
       ($1, $2, $3, $4, $5, 1, true, now(), now()),
       ($6, $7, $8, $9, $10, 2, true, now(), now())`,
    [
      valueOneId, "TNT000001", groupId, "VALUE_ONE", "Value One",
      valueTwoId, "TNT000001", groupId, "VALUE_TWO", "Value Two",
    ]
  );
  cleanup.lovGroups.push(groupId);
  cleanup.lovValues.push(valueOneId, valueTwoId);

  const list = await request(lovBaseUrl, `/groups?page=1&pageSize=10&search=${encodeURIComponent(groupId)}`);
  assert.equal(list.status, 200);
  assert.equal(Array.isArray(list.payload.data), true);
  assert.equal(list.payload.data.some((row) => row.lov_group_id === groupId), true);
  assert.equal(list.payload.meta.pagination.page, 1);

  const detail = await request(lovBaseUrl, `/groups/${groupId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.data.lov_group_id, groupId);
  assert.equal(Array.isArray(detail.payload.data.values), true);
  assert.equal(detail.payload.data.values.length, 2);
  assert.equal(detail.payload.data.values[0].value_code, "VALUE_ONE");
});
