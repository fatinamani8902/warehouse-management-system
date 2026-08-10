import { describe, expect, it } from "vitest";
import { returnWorkflowStatus } from "./returnWorkflowStatus";

describe("returnWorkflowStatus", () => {
  it("maps created return without RMA to Return Created", () => {
    expect(returnWorkflowStatus({ status: "created" })).toMatchObject({
      value: "return_created",
      label: "Return Created",
      badgeStatus: "created",
    });
  });

  it("maps created return with initial RMA to RMA Opened", () => {
    expect(returnWorkflowStatus({ status: "created", linked_rma: { status: "created" } })).toMatchObject({
      value: "rma_opened",
      label: "RMA Opened",
      badgeStatus: "open",
    });
  });

  it("maps processing RMA to RMA Processing", () => {
    expect(returnWorkflowStatus({ status: "created", rma_status: "processing" })).toMatchObject({
      value: "rma_processing",
      label: "RMA Processing",
      badgeStatus: "processing",
    });
  });

  it("maps completed RMA to RMA Completed", () => {
    expect(returnWorkflowStatus({ status: "created", rma_status: "completed" })).toMatchObject({
      value: "rma_completed",
      label: "RMA Completed",
      badgeStatus: "completed",
    });
  });

  it("lets closed and cancelled return statuses take priority over linked RMA state", () => {
    expect(returnWorkflowStatus({ status: "closed", rma_status: "processing" })).toMatchObject({
      value: "closed",
      label: "Closed",
    });
    expect(returnWorkflowStatus({ status: "cancelled", rma_status: "completed" })).toMatchObject({
      value: "cancelled",
      label: "Cancelled",
    });
  });
});
