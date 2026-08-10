import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDashboardView } from "../utils/dashboardSummary.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenSource = readFileSync(resolve(root, "app/(app)/index.tsx"), "utf8");
const rootIndexSource = readFileSync(resolve(root, "app/index.tsx"), "utf8");
const apiSource = readFileSync(resolve(root, "services/api.ts"), "utf8");
const mappingSource = readFileSync(resolve(root, "utils/dashboardSummary.js"), "utf8");

function sourceWithoutComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const activeScreen = sourceWithoutComments(screenSource);

test("mobile dashboard uses the canonical dashboard summary endpoint", () => {
  assert.match(apiSource, /fetchDashboardSummary\s*=\s*\(\)\s*=>\s*[\s\S]*apiClient\.get\("\/dashboard\/summary"\)/);
  assert.match(activeScreen, /fetchDashboardSummary/);
  assert.doesNotMatch(activeScreen, /apiClient\.get\("\/inbound\/asn"/);
  assert.doesNotMatch(activeScreen, /apiClient\.get\("\/audit\/logs"/);
});

test("mobile dashboard renders only Today’s Operations and Need Attention sections", () => {
  assert.match(activeScreen, /title="Today's Operations"/);
  assert.match(activeScreen, /title="Need Attention"/);
  assert.doesNotMatch(activeScreen, /Recent Activities|Recent Activity|Inventory Aging|Alerts|trend|Quick Navigation/);
  assert.doesNotMatch(rootIndexSource, /Recent Activities|Recent Activity|Inventory Aging|Alerts|Today's Shipments|Picks Done/);
});

test("mobile dashboard defines exactly five Portal-aligned operation cards", () => {
  for (const key of ["inbound", "storage", "fulfilment", "outbound", "returns"]) {
    assert.match(mappingSource, new RegExp(`key: "${key}"`));
  }
  assert.equal((mappingSource.match(/key: "(inbound|storage|fulfilment|outbound|returns)"/g) || []).length, 5);
});

test("mobile dashboard maps counts from the same fields used by Portal", () => {
  assert.match(mappingSource, /pending_asn/);
  assert.match(mappingSource, /in_transit_asn/);
  assert.match(mappingSource, /arrived_asn/);
  assert.match(mappingSource, /receiving_grn/);
  assert.match(mappingSource, /active_putaway/);
  assert.match(mappingSource, /kpis\.picking\?\.active/);
  assert.match(mappingSource, /active_packing/);
  assert.match(mappingSource, /ready_to_dispatch/);
  assert.match(mappingSource, /returns_awaiting_closure/);
});

test("mobile dashboard operation totals equal the displayed breakdown fields", () => {
  const view = buildDashboardView({
    kpis: {
      pending_putaway: { total: 10, exception: 1 },
      picking: { active: 3 },
      shipping: { ready_to_dispatch: 4, dispatched: 5, overdue: 0 },
      approvals: { cycle_counts_submitted: 0, adjustments_submitted: 0 },
      returns: { return_created: 2, open_returns: 7, returns_awaiting_closure: 0 },
    },
    status_summary: {
      inbound: { pending_asn: 1, in_transit_asn: 2, arrived_asn: 3, receiving_grn: 4 },
      warehouse: { active_putaway: 10, active_packing: 6 },
    },
  });

  const byKey = Object.fromEntries(view.operations.map((item) => [item.key, item]));
  assert.equal(byKey.inbound.total, 10);
  assert.match(byKey.inbound.breakdown, /Pending 1 · In Transit 2 · Awaiting 3 · Receiving 4/);
  assert.equal(byKey.storage.total, 10);
  assert.match(byKey.storage.breakdown, /Active Putaway 10/);
  assert.equal(byKey.fulfilment.total, 9);
  assert.match(byKey.fulfilment.breakdown, /Picking 3 · Packing 6/);
  assert.equal(byKey.outbound.total, 9);
  assert.match(byKey.outbound.breakdown, /Ready 4 · Dispatched 5/);
  assert.equal(byKey.returns.total, 7);
  assert.match(byKey.returns.breakdown, /Awaiting RMA 2 · RMA Follow-up 5/);
});

test("mobile dashboard handles fulfilment and Portal-only Returns without unsupported workflow", () => {
  assert.match(activeScreen, /setFulfilmentOpen\(true\)/);
  assert.match(activeScreen, /View Picking/);
  assert.match(activeScreen, /View Packing/);
  assert.match(activeScreen, /Manage Returns and RMA in the Portal\./);
  assert.doesNotMatch(activeScreen, /router\.push\("\/(\(app\)\/)?returns/);
});

test("mobile dashboard Need Attention hides zero rows and has the Portal empty state", () => {
  assert.match(mappingSource, /\.filter\(\(item\) => item\.count > 0\)/);
  assert.match(activeScreen, /No operational issues requiring attention\./);
});

test("mobile dashboard keeps RMA created and open mapped to Opened", () => {
  assert.match(mappingSource, /key === "created" \|\| key === "open"\) return "Opened"/);
  assert.doesNotMatch(mappingSource, /return "Created"/);
});
