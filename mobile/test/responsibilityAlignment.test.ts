import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function activeSource(relativePath: string) {
  const source = readFileSync(resolve(root, relativePath), "utf8");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

test("mobile putaway hides management actions and keeps execution actions", () => {
  const source = activeSource("app/(app)/putaway/task/[id].tsx");

  assert.doesNotMatch(source, /assignPutawayTask|fetchPutawayOperators|recomputePutawayBin/);
  assert.doesNotMatch(source, />Assign</);
  assert.doesNotMatch(source, /Recompute Bin/);

  assert.match(source, /completePutawayTask/);
  assert.match(source, /markPutawayException/);
  assert.match(source, /Complete Putaway/);
  assert.match(source, /Mark Exception/);
});

test("mobile picking hides management actions and keeps execution actions", () => {
  const source = activeSource("app/(app)/picking/[pickListId].tsx");

  assert.doesNotMatch(source, /fetchPickingOperators|assignPickList/);
  assert.doesNotMatch(source, /Assign Pick List/);
  assert.doesNotMatch(source, /Cancel Pick List/);
  assert.doesNotMatch(source, /\/picking\/pick-lists\/\$\{pickListId\}\/cancel/);

  assert.match(source, /scanPickListUnit/);
  assert.match(source, /manualPickLine/);
  assert.match(source, /undo-scan/);
  assert.match(source, /Complete Pick List/);
  assert.match(source, /Short Pick/);
});

test("mobile cycle count hides planning and approval management actions", () => {
  const indexSource = activeSource("app/(app)/inventory/index.tsx");
  const detailSource = activeSource("app/(app)/inventory/count-plan/[id].tsx");

  assert.doesNotMatch(indexSource, /count-plan\/create/);
  assert.doesNotMatch(detailSource, /approveCountPlan|rejectCountPlan|cancelCountPlan/);
  assert.doesNotMatch(detailSource, /Approve Count Plan|Reject Count Plan|Cancel Count Plan/);

  assert.match(detailSource, /addCountEntry/);
  assert.match(detailSource, /submitCountPlan/);
  assert.match(detailSource, /Add Count Entry/);
  assert.match(detailSource, /Submit/);
});

test("mobile adjustments hide approval actions and keep requester actions", () => {
  const source = activeSource("app/(app)/inventory/adjustment/[id].tsx");

  assert.doesNotMatch(source, /approveAdjustment|rejectAdjustment/);
  assert.doesNotMatch(source, /Approve Adjustment|Reject Adjustment/);
  assert.doesNotMatch(source, />Approve</);
  assert.doesNotMatch(source, />Reject</);

  assert.match(source, /submitAdjustment/);
  assert.match(source, /cancelAdjustment/);
  assert.match(source, /Submit/);
  assert.match(source, /Cancel/);
});
