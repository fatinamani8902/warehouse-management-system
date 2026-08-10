import { describe, expect, it } from "vitest";
import {
  cycleCountProcessStatuses,
  getCycleCountProcessStatusLabel,
  normalizeCycleCountProcessStatus,
} from "./cycleCountStatus";

describe("cycleCountStatus", () => {
  it("exposes the canonical process filter labels", () => {
    expect(cycleCountProcessStatuses.map((status) => status.label)).toEqual([
      "Draft",
      "Assigned",
      "Counting",
      "Submitted",
      "Approved",
      "Rejected",
      "Cancelled",
    ]);
    expect(cycleCountProcessStatuses.map((status) => status.label)).not.toContain("In Progress");
  });

  it("maps backend in_progress to the Counting process label", () => {
    expect(normalizeCycleCountProcessStatus("in_progress")).toBe("counting");
    expect(normalizeCycleCountProcessStatus("COUNTING")).toBe("counting");
    expect(getCycleCountProcessStatusLabel("in_progress")).toBe("Counting");
    expect(getCycleCountProcessStatusLabel("counting")).toBe("Counting");
  });
});
