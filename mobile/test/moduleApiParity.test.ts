import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const apiSource = source("services/api.ts");
const shippingSource = source("app/(app)/shipping/index.tsx");
const inventorySource = source("app/(app)/inventory/index.tsx");
const countPlanSource = source("app/(app)/inventory/count-plan/[id].tsx");
const inboundSource = source("app/(app)/inbound/index.tsx");
const putawaySource = source("app/(app)/putaway/index.tsx");
const packingSource = source("app/(app)/packing/index.tsx");

test("mobile module services use the same canonical Portal API endpoints", () => {
  for (const endpoint of [
    "/dashboard/summary",
    "/inbound/asn",
    "/inbound/grn",
    "/putaway-tasks",
    "/inventory/summary",
    "/inventory/count-plans",
    "/inventory/adjustments",
    "/picking/pick-lists",
    "/shipping",
  ]) {
    assert.match(apiSource, new RegExp(`apiClient\\.get\\("${endpoint.replace(/\//g, "\\/")}`));
  }
  assert.match(packingSource, /"\/packing\/orders"/);

  assert.match(apiSource, /fetchPickingOperators\s*=\s*\(\)\s*=>\s*[\s\S]*apiClient\.get\("\/picking\/operators"\)/);
  assert.doesNotMatch(apiSource, /fetchPickingOperators\s*=\s*\(\)\s*=>\s*[\s\S]*apiClient\.get\("\/putaway-tasks\/operators"\)/);
});

test("mobile Shipping displays Portal shipping labels, Required Ship By, and overdue state", () => {
  assert.match(shippingSource, /label: "Ready to Dispatch"/);
  assert.match(shippingSource, /Required Ship By/);
  assert.match(shippingSource, /required_ship_by \|\| item\?\.ship_by \|\| item\?\.dispatch_due_at/);
  assert.match(shippingSource, /function isShipmentOverdue/);
  assert.match(shippingSource, /status === "closed" \|\| status === "cancelled"/);
  assert.match(shippingSource, /formatDate\(requiredShipBy\)/);
  assert.match(shippingSource, /formatDateTime\(item\.dispatched_at\)/);
  assert.match(shippingSource, /formatDateTime\(item\.created_at\)/);
});

test("mobile Inventory uses Portal date formatting and enriched location fields", () => {
  assert.match(apiSource, /fetchAdjustments\s*=\s*\(params\?: object\)\s*=>\s*[\s\S]*apiClient\.get\("\/inventory\/adjustments", \{ params \}\)/);
  assert.match(inventorySource, /fetchAdjustments\(\{[\s\S]*page,[\s\S]*pageSize: PAGE_SIZE/);
  assert.match(inventorySource, /status: statusFilter/);
  assert.match(inventorySource, /data\?\.items \?\? data\?\.data \?\? data\?\.rows/);
  assert.match(inventorySource, /Unable to load adjustments/);
  assert.match(inventorySource, /Retry/);
  assert.match(inventorySource, /options=\{\["draft", "submitted", "approved", "rejected", "cancelled"\]\}/);
  assert.match(inventorySource, /formatDate\(item\.planned_date\)/);
  assert.match(inventorySource, /item\.location_code \|\| item\.location_name \|\| item\.location_id \|\| "-"/);
  assert.match(countPlanSource, /formatDate\(record\.planned_date\)/);
  assert.match(countPlanSource, /formatDateTime\(record\.approved_at\)/);
  assert.match(countPlanSource, /formatDateTime\(record\.submitted_at\)/);
  assert.doesNotMatch(countPlanSource, /new Date\(record\.(approved_at|submitted_at)\)\.toLocaleString/);
});

test("mobile Inbound uses shared Portal-style date formatting", () => {
  assert.match(inboundSource, /formatDate\(item\.eta\)/);
  assert.match(inboundSource, /formatDate\(item\.received_date\)/);
});

test("mobile Putaway has assigned status mapping and no sensitive debug logging", () => {
  assert.match(putawaySource, /assigned:\s*\{[\s\S]*label: "Assigned"/);
  assert.match(putawaySource, /STATUS_OPTIONS\s*=\s*\["pending", "assigned", "in_progress", "completed", "exception"\]/);
  assert.doesNotMatch(putawaySource, /console\.log\("user_id:"/);
  assert.doesNotMatch(putawaySource, /console\.log\("all assigned_to:"/);
});
