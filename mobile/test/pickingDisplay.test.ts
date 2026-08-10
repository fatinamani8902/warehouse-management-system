import assert from "node:assert/strict";
import test from "node:test";
import { getAssignedUserDisplay } from "../utils/pickingDisplay.ts";

test("assigned mobile pick card displays operator name and ID", () => {
  assert.equal(
    getAssignedUserDisplay({
      assigned_to_user_id: "USR000015",
      assigned_to_user_name: "Mike Operator",
    }),
    "Mike Operator (USR000015)",
  );
});

test("assigned mobile pick card falls back to canonical user ID", () => {
  assert.equal(
    getAssignedUserDisplay({ assigned_to_user_id: "USR000015" }),
    "USR000015",
  );
});
