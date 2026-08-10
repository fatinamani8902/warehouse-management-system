import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { createApp } from "../src/server.js";

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/inventory`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function request(path, { role, user = "USR000001", warehouse = "WH000001" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "x-tenant-id": "TNT000001",
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": warehouse,
    },
  });

  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

test("business admin, manager aliases, and auditor can read inventory approval queues", async () => {
  for (const role of ["hqadmin", "manager", "warehousemanager", "storemanager", "auditor"]) {
    const balances = await request("/balances?page=1&pageSize=1", { role });
    const adjustments = await request("/adjustments?page=1&pageSize=1", { role });
    const counts = await request("/count-plans?page=1&pageSize=1", { role });

    assert.equal(balances.status, 200, `${role} should read balances`);
    assert.equal(adjustments.status, 200, `${role} should read adjustments`);
    assert.equal(counts.status, 200, `${role} should read cycle counts`);
  }
});

test("unrelated role is denied inventory approval queues", async () => {
  const balances = await request("/balances?page=1&pageSize=1", { role: "supplier" });
  const adjustments = await request("/adjustments?page=1&pageSize=1", { role: "supplier" });
  const counts = await request("/count-plans?page=1&pageSize=1", { role: "supplier" });

  assert.equal(balances.status, 403);
  assert.equal(adjustments.status, 403);
  assert.equal(counts.status, 403);
});
