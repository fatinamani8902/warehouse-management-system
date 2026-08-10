import { describe, expect, it } from "vitest";
import {
  canAssignPutawayRole,
  canCompletePutawayRole,
  canCompletePutawayTask,
  canViewPutawayHistoryRole,
  normalizePutawayRole,
  putawayAssignedToLabel,
} from "./putawayRbac";

describe("putaway RBAC helpers", () => {
  it("allows manager roles to assign and monitor but not complete", () => {
    for (const role of ["manager", "warehousemanager", "storemanager"]) {
      expect(canAssignPutawayRole(role)).toBe(true);
      expect(canViewPutawayHistoryRole(role)).toBe(true);
      expect(canCompletePutawayRole(role)).toBe(false);
    }
  });

  it("allows operational warehouse roles to complete but not assign", () => {
    for (const role of ["storeoperator", "warehouseoperator", "warehouseclerk", "storekeeper"]) {
      expect(normalizePutawayRole(role)).toBe("storeoperator");
      expect(canCompletePutawayRole(role)).toBe(true);
      expect(canAssignPutawayRole(role)).toBe(false);
    }
  });

  it("keeps auditor view-only", () => {
    expect(canViewPutawayHistoryRole("auditor")).toBe(true);
    expect(canAssignPutawayRole("auditor")).toBe(false);
    expect(canCompletePutawayRole("auditor")).toBe(false);
  });

  it("requires assigned operational tasks before showing completion", () => {
    expect(canCompletePutawayTask("storeoperator", {
      status: "assigned",
      assigned_to_user_id: "USR000015",
    })).toBe(true);
    expect(canCompletePutawayTask("storeoperator", {
      status: "in_progress",
      assigned_to_user_id: "USR000015",
    })).toBe(true);
    expect(canCompletePutawayTask("storeoperator", {
      status: "assigned",
      assigned_to_user_id: null,
    })).toBe(false);
    expect(canCompletePutawayTask("storeoperator", {
      status: "pending",
      assigned_to_user_id: "USR000015",
    })).toBe(false);
    expect(canCompletePutawayTask("manager", {
      status: "assigned",
      assigned_to_user_id: "USR000015",
    })).toBe(false);
  });

  it("formats assigned user labels without hiding historical unassigned records", () => {
    expect(putawayAssignedToLabel({
      status: "assigned",
      assigned_to_user_display: "Mike Operator (USR000015)",
      assigned_to_user_id: "USR000015",
    })).toBe("Mike Operator (USR000015)");
    expect(putawayAssignedToLabel({
      status: "pending",
      assigned_to_user_id: null,
    })).toBe("Unassigned");
    expect(putawayAssignedToLabel({
      status: "completed",
      assigned_to_user_id: null,
    })).toBe("Unassigned (Historical)");
  });
});
