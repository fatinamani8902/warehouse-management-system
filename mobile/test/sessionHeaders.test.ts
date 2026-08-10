import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionHeaders } from "../utils/sessionHeaders.ts";

test("buildSessionHeaders maps canonical user, role, tenant and warehouse ids", () => {
  assert.deepEqual(
    buildSessionHeaders({
      tenant_id: "TNT000001",
      warehouse_ids: ["WH000001", "WH000002"],
      user_id: "USR000015",
      role_id: "warehouseoperator",
    }),
    {
      "x-tenant-id": "TNT000001",
      "x-warehouse-id": "WH000001",
      "x-user-id": "USR000015",
      "x-roles": "warehouseoperator",
    },
  );
});

test("buildSessionHeaders prefers explicit warehouse_id over warehouse list", () => {
  assert.deepEqual(
    buildSessionHeaders({
      tenant_id: "TNT000001",
      warehouse_id: "WH000009",
      warehouse_ids: ["WH000001"],
      user_id: "USR000015",
      role_id: "warehouseoperator",
    }),
    {
      "x-tenant-id": "TNT000001",
      "x-warehouse-id": "WH000009",
      "x-user-id": "USR000015",
      "x-roles": "warehouseoperator",
    },
  );
});
