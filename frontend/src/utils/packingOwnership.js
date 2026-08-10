const packingRoleAliases = {
  superadmin: "superadmin",
  hqadmin: "hqadmin",
  admin: "admin",
  manager: "warehousemanager",
  whmanager: "warehousemanager",
  warehousemanager: "warehousemanager",
  storemanager: "storemanager",
  storeoperator: "storeoperator",
  warehouseoperator: "warehouseoperator",
  warehouseclerk: "warehouseoperator",
  storekeeper: "storeoperator",
  auditor: "auditor",
  readonly: "readonly",
};

const packingOperatorRoles = new Set([
  "storeoperator",
  "warehouseoperator",
  "warehouseclerk",
  "storekeeper",
]);

const confirmablePackingStatuses = new Set(["pending", "in_progress", "carton_generated"]);

export function normalizePackingRole(roleId) {
  return packingRoleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

export function getPackingOwnershipState({
  roleId,
  currentUserId,
  assignedOperatorId,
  packStatus,
}) {
  const normalizedRole = normalizePackingRole(roleId);
  const normalizedUserId = String(currentUserId || "").trim();
  const normalizedAssignedOperatorId = String(assignedOperatorId || "").trim();
  const ownershipMatches =
    Boolean(normalizedUserId) &&
    Boolean(normalizedAssignedOperatorId) &&
    normalizedUserId === normalizedAssignedOperatorId;
  const status = String(packStatus || "").trim().toLowerCase();
  const hasPermission = packingOperatorRoles.has(normalizedRole);
  const canConfirm = ownershipMatches && hasPermission && confirmablePackingStatuses.has(status);
  const disabledReason = !hasPermission
    ? "Only packing operators can confirm packing."
    : !ownershipMatches
    ? "Only the assigned operator can confirm this packing task."
    : !confirmablePackingStatuses.has(status)
      ? "Packing can only be confirmed while status is pending, in progress, or carton generated."
      : "";

  return {
    normalizedRole,
    currentUserId: normalizedUserId,
    assignedOperatorId: normalizedAssignedOperatorId,
    hasOwnership: ownershipMatches,
    hasPermission,
    canConfirm,
    disabledReason,
  };
}
