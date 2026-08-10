import { describe, expect, it } from "vitest";
import { rmaStatusLabel, stepperForRmaStatus } from "./rmaStatus";

describe("rmaStatus", () => {
  it("maps RMA status labels without changing stored values", () => {
    expect(rmaStatusLabel("created")).toBe("Opened");
    expect(rmaStatusLabel("open")).toBe("Opened");
    expect(rmaStatusLabel("processing")).toBe("Processing");
    expect(rmaStatusLabel("completed")).toBe("Completed");
    expect(rmaStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("does not show Processing as the active step for cancelled RMAs", () => {
    expect(stepperForRmaStatus("cancelled")).toEqual([
      { label: "Opened", status: "current" },
      { label: "Processing", status: "pending" },
      { label: "Completed", status: "pending" },
    ]);
  });

  it("keeps Opened, Processing, and Completed stepper behavior unchanged", () => {
    expect(stepperForRmaStatus("created")).toEqual([
      { label: "Opened", status: "current" },
      { label: "Processing", status: "pending" },
      { label: "Completed", status: "pending" },
    ]);
    expect(stepperForRmaStatus("processing")).toEqual([
      { label: "Opened", status: "completed" },
      { label: "Processing", status: "current" },
      { label: "Completed", status: "pending" },
    ]);
    expect(stepperForRmaStatus("completed")).toEqual([
      { label: "Opened", status: "completed" },
      { label: "Processing", status: "completed" },
      { label: "Completed", status: "current" },
    ]);
  });
});
