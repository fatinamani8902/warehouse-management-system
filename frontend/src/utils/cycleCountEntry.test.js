import { describe, expect, it } from "vitest";
import {
  canReviewCycleCount,
  cycleCountHasVariance,
  cycleCountLineLabel,
  getCycleCountVariance,
  isCycleCountMakerCheckerBlocked,
  validateCycleCountEntry,
} from "./cycleCountEntry";

const line = {
  line_id: "CCL000005",
  sku_id: "SKU000006",
  sku_code: "TEST-BRG-001",
  sku_description: "Test Bearing",
  display_name: "WH000001-B-01-001-L01-B001",
  system_qty: 10,
};

describe("Cycle Count entry helpers", () => {
  it("formats a line option with product, location, and system quantity context", () => {
    expect(cycleCountLineLabel(line)).toContain("CCL000005");
    expect(cycleCountLineLabel(line)).toContain("TEST-BRG-001 / SKU000006");
    expect(cycleCountLineLabel(line)).toContain("Test Bearing");
    expect(cycleCountLineLabel(line)).toContain("WH000001-B-01-001-L01-B001");
    expect(cycleCountLineLabel(line)).toContain("System Qty 10");
  });

  it("requires scan input only when no specific line is selected", () => {
    expect(validateCycleCountEntry({ line_id: "", scanned_value: "", qty_counted: "10" }))
      .toMatch(/required when using Auto Resolve/);
    expect(validateCycleCountEntry({ line_id: "CCL000005", scanned_value: "", qty_counted: "10" }))
      .toBe("");
  });

  it("rejects blank or negative quantities and keeps uncounted variance blank", () => {
    expect(validateCycleCountEntry({ line_id: "CCL000005", qty_counted: "" }))
      .toBe("Qty Counted is required");
    expect(validateCycleCountEntry({ line_id: "CCL000005", qty_counted: "-1" }))
      .toBe("Qty Counted must be zero or positive");
    expect(getCycleCountVariance({ system_qty: 10, counted_qty: null, variance_qty: -10 }))
      .toBeNull();
    expect(getCycleCountVariance({ system_qty: 10, counted_qty: 7 }))
      .toBe(-3);
  });

  it("requires a reason only when a derived variance is non-zero", () => {
    expect(cycleCountHasVariance([
      { system_qty: 10, counted_qty: 10, variance_qty: 99 },
    ])).toBe(false);
    expect(cycleCountHasVariance([
      { system_qty: 10, counted_qty: 12, variance_qty: 0 },
    ])).toBe(true);
    expect(cycleCountHasVariance([
      { system_qty: 10, counted_qty: 8, variance_qty: 0 },
    ])).toBe(true);
  });

  it("blocks creator and submitter from active review actions", () => {
    const submittedCount = {
      created_by: "USR000005",
      submitted_by: "USR000015",
    };

    expect(isCycleCountMakerCheckerBlocked(submittedCount, "USR000005")).toBe(true);
    expect(canReviewCycleCount(submittedCount, {
      roleAllowed: true,
      userId: "USR000005",
    })).toBe(false);

    expect(isCycleCountMakerCheckerBlocked(submittedCount, "USR000015")).toBe(true);
    expect(canReviewCycleCount(submittedCount, {
      roleAllowed: true,
      userId: "USR000015",
    })).toBe(false);
  });

  it("allows a different reviewer such as a warehouse manager", () => {
    const submittedCount = {
      created_by_user_id: "USR000005",
      submitted_by_user_id: "USR000015",
    };

    expect(isCycleCountMakerCheckerBlocked(submittedCount, "USR000002")).toBe(false);
    expect(canReviewCycleCount(submittedCount, {
      roleAllowed: true,
      userId: "USR000002",
    })).toBe(true);
  });
});
