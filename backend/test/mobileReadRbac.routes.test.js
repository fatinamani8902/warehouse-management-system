import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { createApp } from "../src/server.js";

let server;
let baseUrl;

async function request(path, {
  role = "warehouseoperator",
  user = "USR000015",
  tenant = "TNT000001",
  warehouse = "WH000001",
  method = "GET",
  body,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": warehouse,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("warehouseoperator can read the Portal-aligned mobile module endpoints", async () => {
  const paths = [
    "/api/v1/dashboard/summary",
    "/api/v1/inbound/asn",
    "/api/v1/inbound/grn",
    "/api/v1/putaway-tasks?page=1&pageSize=1",
    "/api/v1/inventory/summary?page=1&pageSize=1",
    "/api/v1/inventory/count-plans?page=1&pageSize=1",
    "/api/v1/inventory/adjustments?page=1&pageSize=1",
    "/api/v1/picking/pick-lists?page=1&pageSize=1",
    "/api/v1/packing/orders?page=1&pageSize=1",
    "/api/v1/shipping?page=1&pageSize=1",
  ];

  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 200, `${path} should allow warehouseoperator read access`);
  }
});

test("warehouseoperator remains blocked from protected management actions", async () => {
  const protectedRequests = [
    { path: "/api/v1/inbound/asn", method: "POST", body: {} },
    { path: "/api/v1/putaway-tasks/operators" },
    { path: "/api/v1/putaway-tasks/PUT000001/assign", method: "POST", body: { assigned_to_user_id: "USR000015" } },
    { path: "/api/v1/inventory/adjustments/ADJ000001/approve", method: "POST", body: { approval_note: "blocked" } },
    { path: "/api/v1/shipping/SHP000001/dispatch", method: "POST", body: { carrier: "Carrier", tracking_no: "TRK" } },
  ];

  for (const item of protectedRequests) {
    const response = await request(item.path, item);
    assert.equal(response.status, 403, `${item.method || "GET"} ${item.path} should remain protected`);
  }
});
