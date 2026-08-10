import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
let createdSkuId;

before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/master/skus`;
});

after(async () => {
  if (createdSkuId) {
    await request(`/${createdSkuId}`, {
      method: "DELETE",
      body: { confirmDelete: true },
    });
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path = "", {
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

test("SKU list is paginated and tenant scoped", async () => {
  const response = await request("?page=1&pageSize=2&status=active");

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.data), true);
  assert.equal(response.payload.page, 1);
  assert.equal(response.payload.pageSize, 2);
  assert.equal(typeof response.payload.total, "number");
  assert.equal(typeof response.payload.totalPages, "number");
  assert.equal(response.payload.data.every((sku) => sku.tenant_id === "TNT000001"), true);
});

test("SKU lookup returns active tenant SKUs searchable by code or description", async () => {
  const suffix = randomUUID();
  const createdIds = [];

  try {
    for (const status of ["active", "inactive"]) {
      const created = await request("", {
        method: "POST",
        body: {
          sku_code: `LOOKUP-${status}-${suffix}`,
          description: `Lookup ${status} ${suffix}`,
          uom: "EA",
          status,
        },
      });
      assert.equal(created.status, 201);
      createdIds.push(created.payload.data.sku_id);
    }

    const byCode = await request(`/lookup?search=${encodeURIComponent(`LOOKUP-active-${suffix}`)}`);
    assert.equal(byCode.status, 200);
    assert.equal(byCode.payload.data.length, 1);
    assert.deepEqual(
      Object.keys(byCode.payload.data[0]).sort(),
      ["description", "sku_code", "sku_id", "status", "uom"]
    );
    assert.equal(byCode.payload.data[0].status, "active");

    const byDescription = await request(`/lookup?search=${encodeURIComponent(`Lookup active ${suffix}`)}`);
    assert.equal(byDescription.status, 200);
    assert.equal(byDescription.payload.data.length, 1);

    const otherTenant = await request(`/lookup?search=${encodeURIComponent(suffix)}`, {
      tenant: "TNT000002",
    });
    assert.equal(otherTenant.status, 200);
    assert.equal(otherTenant.payload.data.length, 0);
  } finally {
    await pool.query(
      `DELETE FROM public.skus
       WHERE tenant_id = $1
         AND sku_id = ANY($2::text[])`,
      ["TNT000001", createdIds]
    );
  }
});

test("SKU create validates input and uses a database-generated ID", async () => {
  const validPayload = {
    sku_code: "VALID-CODE",
    description: "Valid description",
    uom: "EA",
    status: "active",
  };
  const requiredFields = [
    ["sku_code", "SKU code is required"],
    ["description", "Description is required"],
    ["uom", "UOM is required"],
    ["status", "Status is required"],
  ];

  for (const [field, message] of requiredFields) {
    const missingPayload = { ...validPayload };
    delete missingPayload[field];
    const missing = await request("", {
      method: "POST",
      body: missingPayload,
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.payload.message, message);

    const invalid = await request("", {
      method: "POST",
      body: { ...validPayload, [field]: "   " },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.payload.message, message);
  }

  const suffix = randomUUID();
  const created = await request("", {
    method: "POST",
    body: {
      sku_code: `  TEST-${suffix}  `,
      description: `  SKU route test ${suffix}  `,
      uom: "  EA  ",
      category: "  Test category  ",
      dimensions: "  10x10x10 cm  ",
      qr_payload: "  test-qr  ",
      rfid_epc: "  test-rfid  ",
      reorder_point: 2,
      reorder_qty: 5,
      status: "  active  ",
    },
  });

  assert.equal(created.status, 201);
  assert.match(created.payload.data.sku_id, /^SKU\d{6}$/);
  assert.equal(created.payload.data.sku_code, `TEST-${suffix}`);
  assert.equal(created.payload.data.description, `SKU route test ${suffix}`);
  assert.equal(created.payload.data.uom, "EA");
  assert.equal(created.payload.data.category, "Test category");
  assert.equal(created.payload.data.dimensions, "10x10x10 cm");
  assert.equal(created.payload.data.qr_payload, "test-qr");
  assert.equal(created.payload.data.rfid_epc, "test-rfid");
  createdSkuId = created.payload.data.sku_id;
});

test("SKU update rejects blank mandatory fields", async () => {
  const detail = await request(`/${createdSkuId}`);
  const requiredFields = [
    ["sku_code", "SKU code is required"],
    ["description", "Description is required"],
    ["uom", "UOM is required"],
    ["status", "Status is required"],
  ];

  for (const [field, message] of requiredFields) {
    const missingPayload = { ...detail.payload.data };
    delete missingPayload[field];
    const missing = await request(`/${createdSkuId}`, {
      method: "PUT",
      body: missingPayload,
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.payload.message, message);

    const invalid = await request(`/${createdSkuId}`, {
      method: "PUT",
      body: { ...detail.payload.data, [field]: "   " },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.payload.message, message);
  }
});

test("readonly role can view but cannot update SKU", async () => {
  const detail = await request(`/${createdSkuId}`, { role: "readonly" });
  assert.equal(detail.status, 200);

  const denied = await request(`/${createdSkuId}`, {
    method: "PUT",
    role: "readonly",
    body: { ...detail.payload.data, description: "Denied update" },
  });
  assert.equal(denied.status, 403);
});

test("SKU update and confirmed hard delete succeed", async () => {
  const detail = await request(`/${createdSkuId}`);
  const updated = await request(`/${createdSkuId}`, {
    method: "PUT",
    body: {
      ...detail.payload.data,
      description: `${detail.payload.data.description} updated`,
      weight: 1.25,
      status: "inactive",
    },
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.payload.data.status, "inactive");

  const unconfirmed = await request(`/${createdSkuId}`, {
    method: "DELETE",
    body: {},
  });
  assert.equal(unconfirmed.status, 400);

  const deleted = await request(`/${createdSkuId}`, {
    method: "DELETE",
    body: { confirmDelete: true },
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.payload.deletionMode, "hard");
  createdSkuId = null;
});

test("referenced SKU delete falls back to inactive", async () => {
  const suffix = randomUUID();
  const created = await request("", {
    method: "POST",
    body: {
      sku_code: `REF-${suffix}`,
      description: `Referenced SKU ${suffix}`,
      uom: "EA",
      status: "active",
    },
  });
  assert.equal(created.status, 201);

  const referencedSkuId = created.payload.data.sku_id;
  let adjustmentLineId;

  try {
    const fixture = await pool.query(
      `SELECT tenant_id, adj_id, location_id
       FROM public.adjustment_lines
       WHERE tenant_id = $1
       LIMIT 1`,
      ["TNT000001"]
    );
    assert.equal(fixture.rowCount, 1);

    const reference = await pool.query(
      `INSERT INTO public.adjustment_lines (
         tenant_id, adj_id, sku_id, location_id, qty_change, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING adj_line_id`,
      [
        fixture.rows[0].tenant_id,
        fixture.rows[0].adj_id,
        referencedSkuId,
        fixture.rows[0].location_id,
        1,
        "SKU soft-delete fallback test",
      ]
    );
    adjustmentLineId = reference.rows[0].adj_line_id;

    const deleted = await request(`/${referencedSkuId}`, {
      method: "DELETE",
      body: { confirmDelete: true },
    });

    assert.equal(deleted.status, 200);
    assert.equal(deleted.payload.deletionMode, "soft");
    assert.equal(deleted.payload.data.status, "inactive");
    assert.equal(
      deleted.payload.message,
      "SKU is referenced by transactions and has been set to inactive."
    );

    const stored = await pool.query(
      `SELECT status FROM public.skus WHERE tenant_id = $1 AND sku_id = $2`,
      ["TNT000001", referencedSkuId]
    );
    assert.equal(stored.rows[0].status, "inactive");
  } finally {
    if (adjustmentLineId) {
      await pool.query(
        `DELETE FROM public.adjustment_lines
         WHERE tenant_id = $1
           AND adj_line_id = $2`,
        ["TNT000001", adjustmentLineId]
      );
    }
    await pool.query(
      `DELETE FROM public.skus
       WHERE tenant_id = $1
         AND sku_id = $2`,
      ["TNT000001", referencedSkuId]
    );
  }
});
