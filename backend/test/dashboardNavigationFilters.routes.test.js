import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { createApp } from "../src/server.js";

let server;
let baseUrl = "";

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) {
    return;
  }
  await new Promise((resolve) => server.close(resolve));
});

async function apiRequest(path, {
  method = "GET",
  body,
  tenant = "TNT000001",
  role = "storemanager",
  user = "USR000002",
  warehouse = "WH000001",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenant,
      "x-role-id": role,
      "x-user-id": user,
      "x-warehouse-id": warehouse,
      "x-client-source": "PORTAL",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

test("inbound ASN open filter excludes closed/cancelled", async () => {
  const response = await apiRequest("/api/inbound/asn?status=open&page=1&pageSize=100");

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.items), true);
  assert.equal(response.payload.items.some((item) => ["closed", "cancelled"].includes(item.status)), false);
});

test("putaway pending filter is enforced server-side", async () => {
  const response = await apiRequest("/api/putaway-tasks?status=pending&page=1&pageSize=50");

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.items), true);
  assert.equal(response.payload.items.some((item) => item.status !== "pending"), false);
});

test("picking open filter excludes terminal statuses", async () => {
  const response = await apiRequest("/api/picking/pick-lists?status=open&page=1&pageSize=50");

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.items), true);
  assert.equal(
    response.payload.items.some((item) => ["packed", "shipped", "cancelled"].includes(String(item.status || "").toLowerCase())),
    false,
  );
});

test("shipping overdue filter returns overdue shipments only", async () => {
  const response = await apiRequest("/api/shipping?status=overdue&page=1&pageSize=50", {
    role: "superadmin",
    user: "USR000001",
  });

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.items), true);
  assert.equal(response.payload.items.every((item) => item.is_overdue === true), true);
});

test("shipping list is tenant scoped", async () => {
  const response = await apiRequest("/api/shipping?page=1&pageSize=50", {
    tenant: "TNT000001",
    role: "superadmin",
    user: "USR000001",
  });

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.items), true);
  assert.equal(response.payload.items.some((item) => item.shipment_id === "SHP100001"), false);
});
