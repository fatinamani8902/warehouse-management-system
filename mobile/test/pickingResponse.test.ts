import assert from "node:assert/strict";
import test from "node:test";
import { unwrapPickListRecord } from "../utils/pickingResponse.ts";

test("completed pick wave response unwraps to the actual pick list record", () => {
  const pickList = {
    wave_id: "WAV000001",
    status: "completed",
    assigned_to_user_id: "USR000015",
    assigned_to_user_name: "Mike Operator",
    assigned_to_user_display: "Mike Operator (USR000015)",
    lines: [
      {
        line_id: "PIC000002",
        sku_id: "SKU000006",
        location_id: "LOC000002",
        qty_required: 5,
        qty_picked: 5,
      },
    ],
  };

  const wrapped = {
    pick_list: pickList,
    packing_task: { pack_task_id: "PAC000001" },
  };

  const unwrapped = unwrapPickListRecord(wrapped);
  assert.equal(unwrapped, pickList);
  assert.equal(unwrapped?.assigned_to_user_display, "Mike Operator (USR000015)");
  assert.equal(unwrapped?.lines?.length, 1);
  assert.equal(unwrapped?.lines?.[0]?.sku_id, "SKU000006");
});
