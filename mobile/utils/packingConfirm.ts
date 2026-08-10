export type PackingConfirmStateInput = {
  roleId?: string | null;
  packStatus?: string | null;
  cartonId?: string | null;
  cartonVerified?: boolean;
  packagingType?: string | null;
  weight?: string | number | null;
  submitting?: boolean;
  currentUserId?: string | null;
  assignedOperatorUserId?: string | null;
  requireAssignedOperator?: boolean;
};

export function normalizeCartonId(value?: string | null): string {
  return String(value ?? "").trim();
}

const packingOperatorRoles = new Set([
  "storeoperator",
  "warehouseoperator",
  "warehouseclerk",
  "storekeeper",
]);

const confirmablePackingStatuses = new Set(["pending", "in_progress", "carton_generated"]);

export function getPackingConfirmState(input: PackingConfirmStateInput) {
  const roleId = String(input.roleId ?? "").trim().toLowerCase();
  const packStatus = String(input.packStatus ?? "").trim().toLowerCase();
  const cartonId = normalizeCartonId(input.cartonId);
  const cartonVerified = Boolean(input.cartonVerified);
  const packagingType = String(input.packagingType ?? "").trim();
  const weightValue = Number(String(input.weight ?? "").trim());
  const currentUserId = String(input.currentUserId ?? "").trim();
  const assignedOperatorUserId = String(input.assignedOperatorUserId ?? "").trim();
  const hasOwnership = !input.requireAssignedOperator ||
    Boolean(currentUserId && assignedOperatorUserId && currentUserId === assignedOperatorUserId);
  const hasPermission = packingOperatorRoles.has(roleId);
  const formValid =
    confirmablePackingStatuses.has(packStatus) &&
    Boolean(cartonId) &&
    cartonVerified &&
    Boolean(packagingType) &&
    Number.isFinite(weightValue) &&
    weightValue > 0;

  let disabledReason = "";
  if (input.submitting) {
    disabledReason = "Confirming packing...";
  } else if (!hasOwnership) {
    disabledReason = "Only the assigned operator can confirm this packing task.";
  } else if (!hasPermission) {
    disabledReason = "Only packing operators can confirm packing.";
  } else if (!confirmablePackingStatuses.has(packStatus)) {
    disabledReason = "Packing can only be confirmed while status is pending, in progress, or carton generated.";
  } else if (!cartonId) {
    disabledReason = "Generate a carton label before confirming.";
  } else if (!cartonVerified) {
    disabledReason = "Scan and verify the carton QR before confirming.";
  } else if (!packagingType) {
    disabledReason = "Select a packaging type before confirming.";
  } else if (!Number.isFinite(weightValue) || weightValue <= 0) {
    disabledReason = "Enter a valid positive weight.";
  }

  return {
    roleId,
    packStatus,
    cartonId,
    cartonVerified,
    packagingType,
    weightValue,
    currentUserId,
    assignedOperatorUserId,
    hasOwnership,
    hasPermission,
    formValid,
    confirmDisabled: !formValid || !hasPermission || !hasOwnership || Boolean(input.submitting),
    disabledReason,
  };
}
