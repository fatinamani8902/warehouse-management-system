import assert from "node:assert/strict";
import test from "node:test";
import { getPackingConfirmState, normalizeCartonId } from "../utils/packingConfirm.ts";

test("warehouseoperator can confirm a pending pack when carton is verified and type and weight are present", () => {
  const state = getPackingConfirmState({
    roleId: "warehouseoperator",
    packStatus: "pending",
    cartonId: "CTN000001",
    cartonVerified: true,
    packagingType: "Standard Box",
    weight: "3",
  });

  assert.equal(state.hasPermission, true);
  assert.equal(state.formValid, true);
  assert.equal(state.confirmDisabled, false);
  assert.equal(state.disabledReason, "");
});

test("storeoperator can confirm a pending pack when carton is verified and type and weight are present", () => {
  const state = getPackingConfirmState({
    roleId: "storeoperator",
    packStatus: "pending",
    cartonId: "CTN000001",
    cartonVerified: true,
    packagingType: "Standard Box",
    weight: "3",
  });

  assert.equal(state.hasPermission, true);
  assert.equal(state.formValid, true);
  assert.equal(state.confirmDisabled, false);
});

test("missing packaging type keeps packing confirm disabled", () => {
  const state = getPackingConfirmState({
    roleId: "warehouseoperator",
    packStatus: "pending",
    cartonId: "CTN000001",
    cartonVerified: true,
    packagingType: "",
    weight: "3",
  });

  assert.equal(state.formValid, false);
  assert.equal(state.confirmDisabled, true);
  assert.equal(state.disabledReason, "Select a packaging type before confirming.");
});

test("carton generated packs remain confirmable for the assigned operator", () => {
  const state = getPackingConfirmState({
    roleId: "warehouseoperator",
    packStatus: "carton_generated",
    cartonId: "CTN000001",
    cartonVerified: true,
    packagingType: "Standard Box",
    weight: "3",
    currentUserId: "USR000015",
    assignedOperatorUserId: "USR000015",
    requireAssignedOperator: true,
  });

  assert.equal(state.hasPermission, true);
  assert.equal(state.hasOwnership, true);
  assert.equal(state.confirmDisabled, false);
});

test("normalizeCartonId trims scanned carton values", () => {
  assert.equal(normalizeCartonId("  PAC000002  "), "PAC000002");
});

test("missing carton id keeps packing confirm disabled", () => {
  const state = getPackingConfirmState({
    roleId: "warehouseoperator",
    packStatus: "pending",
    cartonId: "",
    cartonVerified: false,
    packagingType: "Standard Box",
    weight: "3",
  });

  assert.equal(state.formValid, false);
  assert.equal(state.confirmDisabled, true);
  assert.equal(state.disabledReason, "Generate a carton label before confirming.");
});

test("unverified carton keeps packing confirm disabled", () => {
  const state = getPackingConfirmState({
    roleId: "warehouseoperator",
    packStatus: "pending",
    cartonId: "CTN000001",
    cartonVerified: false,
    packagingType: "Standard Box",
    weight: "3",
  });

  assert.equal(state.formValid, false);
  assert.equal(state.confirmDisabled, true);
  assert.equal(state.disabledReason, "Scan and verify the carton QR before confirming.");
});

test("non-assigned manager cannot confirm an operator packing task", () => {
  const state = getPackingConfirmState({
    roleId: "warehousemanager",
    packStatus: "pending",
    cartonId: "CTN000001",
    cartonVerified: true,
    packagingType: "Standard Box",
    weight: "3",
    currentUserId: "USR000002",
    assignedOperatorUserId: "USR000015",
    requireAssignedOperator: true,
  });

  assert.equal(state.hasPermission, false);
  assert.equal(state.hasOwnership, false);
  assert.equal(state.confirmDisabled, true);
  assert.equal(state.disabledReason, "Only the assigned operator can confirm this packing task.");
});

test("assigned operator can confirm an operator packing task", () => {
  const state = getPackingConfirmState({
    roleId: "warehouseoperator",
    packStatus: "pending",
    cartonId: "CTN000001",
    cartonVerified: true,
    packagingType: "Standard Box",
    weight: "3",
    currentUserId: "USR000015",
    assignedOperatorUserId: "USR000015",
    requireAssignedOperator: true,
  });

  assert.equal(state.hasPermission, true);
  assert.equal(state.hasOwnership, true);
  assert.equal(state.confirmDisabled, false);
});
