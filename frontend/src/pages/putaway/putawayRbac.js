const roleAliases = {
  manager: "storemanager",
  warehousemanager: "storemanager",
  warehouseoperator: "storeoperator",
  warehouseclerk: "storeoperator",
  storekeeper: "storeoperator",
};

function normalizePutawayRole(roleId) {
  const normalized = String(roleId || "readonly").trim().toLowerCase();
  return roleAliases[normalized] || normalized;
}

function canAssignPutawayRole(roleId) {
  return ["superadmin", "hqadmin", "storemanager"].includes(normalizePutawayRole(roleId));
}

function canCompletePutawayRole(roleId) {
  return normalizePutawayRole(roleId) === "storeoperator";
}

function normalizePutawayStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function canCompletePutawayTask(roleId, task) {
  return (
    canCompletePutawayRole(roleId)
    && ["assigned", "in_progress"].includes(normalizePutawayStatus(task?.status))
    && Boolean(task?.assigned_to_user_id)
  );
}

function putawayAssignedToLabel(task) {
  if (!task?.assigned_to_user_id && normalizePutawayStatus(task?.status) === "completed") {
    return "Unassigned (Historical)";
  }
  return (
    task?.assigned_to_user_display
    || task?.execution?.assigned_to
    || task?.assigned_to_user_name
    || task?.assigned_to_user_id
    || "Unassigned"
  );
}

function canViewPutawayHistoryRole(roleId) {
  return [
    "superadmin",
    "hqadmin",
    "storemanager",
    "storeoperator",
    "auditor",
  ].includes(normalizePutawayRole(roleId));
}

export {
  canAssignPutawayRole,
  canCompletePutawayRole,
  canCompletePutawayTask,
  canViewPutawayHistoryRole,
  normalizePutawayRole,
  normalizePutawayStatus,
  putawayAssignedToLabel,
};
