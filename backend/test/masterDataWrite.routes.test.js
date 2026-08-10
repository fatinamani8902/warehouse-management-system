import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
const cleanup = {
  suppliers: [],
  customers: [],
  warehouses: [],
  lovGroups: [],
  lovValues: [],
};

before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (cleanup.lovValues.length) {
    await pool.query(`DELETE FROM public.lov_values WHERE lov_value_id = ANY($1::text[])`, [cleanup.lovValues]);
  }
  if (cleanup.lovGroups.length) {
    await pool.query(`DELETE FROM public.lov_groups WHERE lov_group_id = ANY($1::text[])`, [cleanup.lovGroups]);
  }
  if (cleanup.customers.length) {
    await pool.query(`DELETE FROM public.customers WHERE customer_id = ANY($1::text[])`, [cleanup.customers]);
  }
  if (cleanup.suppliers.length) {
    await pool.query(`DELETE FROM public.suppliers WHERE supplier_id = ANY($1::text[])`, [cleanup.suppliers]);
  }
  if (cleanup.warehouses.length) {
    await pool.query(`DELETE FROM public.warehouses WHERE warehouse_id = ANY($1::text[])`, [cleanup.warehouses]);
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "TNT000001",
      "x-user-id": "USR000001",
      "x-roles": "superadmin",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

test("supplier, customer, warehouse, and LOV writes use PostgreSQL", async () => {
  const suffix = randomUUID().slice(0, 8);

  const supplier = await request("/master/suppliers", {
    method: "POST",
    body: {
      supplier_name: `Supplier ${suffix}`,
      supplier_code: `SUP-${suffix}`,
      contact_person: "Contact",
      email: `sup-${suffix}@example.com`,
      phone: "123456",
      address: "Warehouse street",
      status: "active",
    },
  });
  assert.equal(supplier.status, 201, JSON.stringify(supplier.payload));
  cleanup.suppliers.push(supplier.payload.data.supplier_id);

  const supplierUpdated = await request(`/master/suppliers/${supplier.payload.data.supplier_id}`, {
    method: "PUT",
    body: {
      supplier_name: `Supplier ${suffix} updated`,
      supplier_code: `SUP-${suffix}`,
      contact_person: "Contact",
      email: `sup-${suffix}@example.com`,
      phone: "123456",
      address: "Warehouse street",
      status: "inactive",
    },
  });
  assert.equal(supplierUpdated.status, 200);
  assert.equal(supplierUpdated.payload.data.status, "inactive");

  const customer = await request("/master/customers", {
    method: "POST",
    body: {
      customer_name: `Customer ${suffix}`,
      customer_code: `CUS-${suffix}`,
      email: `cus-${suffix}@example.com`,
      phone: "987654",
      address: "Customer lane",
      status: "active",
    },
  });
  assert.equal(customer.status, 201);
  cleanup.customers.push(customer.payload.data.customer_id);

  const customerUpdated = await request(`/master/customers/${customer.payload.data.customer_id}`, {
    method: "PUT",
    body: {
      customer_name: `Customer ${suffix} updated`,
      customer_code: `CUS-${suffix}`,
      email: `cus-${suffix}@example.com`,
      phone: "987654",
      address: "Customer lane",
      status: "inactive",
    },
  });
  assert.equal(customerUpdated.status, 200);
  assert.equal(customerUpdated.payload.data.status, "inactive");

  const warehouse = await request("/master/warehouses", {
    method: "POST",
    body: {
      warehouse_code: `WH-${suffix}`,
      warehouse_name: `Warehouse ${suffix}`,
      city: "Kuala Lumpur",
      country: "MY",
      status: "active",
    },
  });
  assert.equal(warehouse.status, 201);
  cleanup.warehouses.push(warehouse.payload.data.warehouse_id);

  const warehouseUpdated = await request(`/master/warehouses/${warehouse.payload.data.warehouse_id}`, {
    method: "PUT",
    body: {
      warehouse_code: `WH-${suffix}`,
      warehouse_name: `Warehouse ${suffix} updated`,
      city: "Kuala Lumpur",
      country: "MY",
      status: "inactive",
    },
  });
  assert.equal(warehouseUpdated.status, 200);
  assert.equal(warehouseUpdated.payload.data.status, "inactive");

  const lovGroup = await request("/lov/groups", {
    method: "POST",
    body: {
      group_code: `GRP_${suffix}`,
      group_name: `Group ${suffix}`,
      description: "Route test",
      is_system: false,
    },
  });
  assert.equal(lovGroup.status, 201, JSON.stringify(lovGroup.payload));
  cleanup.lovGroups.push(lovGroup.payload.data.lov_group_id);

  const lovValue = await request(`/lov/groups/${lovGroup.payload.data.lov_group_id}/values`, {
    method: "POST",
    body: {
      value_code: `VAL_${suffix}`,
      value_label: `Value ${suffix}`,
      sort_order: 1,
      is_active: true,
    },
  });
  assert.equal(lovValue.status, 201);
  cleanup.lovValues.push(lovValue.payload.data.lov_value_id);

  const lovValueUpdated = await request(
    `/lov/groups/${lovGroup.payload.data.lov_group_id}/values/${lovValue.payload.data.lov_value_id}`,
    {
      method: "PUT",
      body: {
        value_code: `VAL_${suffix}`,
        value_label: `Value ${suffix} updated`,
        sort_order: 2,
        is_active: false,
      },
    }
  );
  assert.equal(lovValueUpdated.status, 200);
  assert.equal(lovValueUpdated.payload.data.is_active, false);

  const deleteValue = await request(
    `/lov/groups/${lovGroup.payload.data.lov_group_id}/values/${lovValue.payload.data.lov_value_id}`,
    {
      method: "DELETE",
      body: { confirmDelete: true },
    }
  );
  assert.equal(deleteValue.status, 200);

  const deleteGroup = await request(`/lov/groups/${lovGroup.payload.data.lov_group_id}`, {
    method: "DELETE",
    body: { confirmDelete: true },
  });
  assert.equal(deleteGroup.status, 200);
});
