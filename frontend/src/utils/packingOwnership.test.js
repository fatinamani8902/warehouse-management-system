import { describe, expect, it } from "vitest";
import { getPackingOwnershipState, normalizePackingRole } from "./packingOwnership";

describe("packingOwnership", () => {
  it("normalizes manager aliases", () => {
    expect(normalizePackingRole("WHManager")).toBe("warehousemanager");
    expect(normalizePackingRole("manager")).toBe("warehousemanager");
  });

  it("allows only the assigned operator to confirm packing", () => {
    const state = getPackingOwnershipState({
      roleId: "warehousemanager",
      currentUserId: "USR000002",
      assignedOperatorId: "USR000015",
      packStatus: "pending",
    });

    expect(state.hasPermission).toBe(false);
    expect(state.hasOwnership).toBe(false);
    expect(state.canConfirm).toBe(false);
    expect(state.disabledReason).toBe("Only packing operators can confirm packing.");
  });

  it("allows the assigned operator when the pack is confirmable", () => {
    const state = getPackingOwnershipState({
      roleId: "warehouseoperator",
      currentUserId: "USR000015",
      assignedOperatorId: "USR000015",
      packStatus: "pending",
    });

    expect(state.hasPermission).toBe(true);
    expect(state.hasOwnership).toBe(true);
    expect(state.canConfirm).toBe(true);
    expect(state.disabledReason).toBe("");
  });

  it("keeps carton generated packs confirmable for the assigned operator", () => {
    const state = getPackingOwnershipState({
      roleId: "storeoperator",
      currentUserId: "USR000015",
      assignedOperatorId: "USR000015",
      packStatus: "carton_generated",
    });

    expect(state.hasPermission).toBe(true);
    expect(state.hasOwnership).toBe(true);
    expect(state.canConfirm).toBe(true);
    expect(state.disabledReason).toBe("");
  });
});
