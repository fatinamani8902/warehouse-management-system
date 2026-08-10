const roleAliases = {
  warehousemanager: "storemanager",
  storekeeper: "storeoperator",
};

const transitionPermissions = {
  asn: {
    submit: ["superadmin", "hqadmin", "storemanager", "storeoperator"],
    mark_in_transit: ["superadmin", "hqadmin", "storemanager"],
    mark_arrived: ["superadmin", "hqadmin", "storemanager"],
    close: ["superadmin", "hqadmin", "storemanager"],
    cancel: ["superadmin", "hqadmin", "storemanager"],
  },
  grn: {
    start_receiving: ["superadmin", "hqadmin", "storemanager", "storeoperator"],
    complete: ["superadmin", "hqadmin", "storemanager", "storeoperator"],
    post: ["superadmin", "hqadmin", "storemanager"],
    cancel: ["superadmin", "hqadmin", "storemanager"],
  },
};

const rolePermissions = {
  superadmin: [
    "audit.view",
    "returns.view",
    "returns.create",
    "returns.cancel",
    "returns.create_rma",
    "rma.view",
    "rma.cancel",
    "putaway.view",
    "putaway.assign",
    "putaway.recompute_bin",
    "putaway.mark_exception",
    "putaway.view_history",
    "inventory.view_summary",
    "inventory.view_count_plans",
    "inventory.create_count_plan",
    "inventory.execute_count_plan",
    "inventory.submit_count_plan",
    "inventory.approve_count_plan",
    "inventory.reject_count_plan",
    "inventory.cancel_count_plan",
    "inventory.view_adjustments",
    "inventory.create_adjustment",
    "inventory.submit_adjustment",
    "inventory.approve_adjustment",
    "inventory.reject_adjustment",
    "inventory.cancel_adjustment",
    "inventory.view_transactions",
    "trace.view",
    "picking.view",
    "picking.update_mobile_status",
    "packing.view",
    "packing.manage",
    "shipping.view",
  ],
  hqadmin: [
    "audit.view",
    "returns.view",
    "returns.create",
    "returns.cancel",
    "returns.create_rma",
    "rma.view",
    "rma.cancel",
    "putaway.view",
    "putaway.assign",
    "putaway.recompute_bin",
    "putaway.mark_exception",
    "putaway.view_history",
    "inventory.view_summary",
    "inventory.view_count_plans",
    "inventory.create_count_plan",
    "inventory.execute_count_plan",
    "inventory.submit_count_plan",
    "inventory.approve_count_plan",
    "inventory.reject_count_plan",
    "inventory.cancel_count_plan",
    "inventory.view_adjustments",
    "inventory.create_adjustment",
    "inventory.submit_adjustment",
    "inventory.approve_adjustment",
    "inventory.reject_adjustment",
    "inventory.cancel_adjustment",
    "inventory.view_transactions",
    "trace.view",
    "picking.view",
    "picking.update_mobile_status",
    "packing.view",
    "packing.manage",
    "shipping.view",
  ],
  storemanager: [
    "audit.view",
    "returns.view",
    "returns.create",
    "returns.cancel",
    "returns.create_rma",
    "rma.view",
    "rma.cancel",
    "putaway.view",
    "putaway.assign",
    "putaway.mark_exception",
    "putaway.view_history",
    "inventory.view_summary",
    "inventory.view_count_plans",
    "inventory.create_count_plan",
    "inventory.execute_count_plan",
    "inventory.submit_count_plan",
    "inventory.approve_count_plan",
    "inventory.reject_count_plan",
    "inventory.cancel_count_plan",
    "inventory.view_adjustments",
    "inventory.create_adjustment",
    "inventory.submit_adjustment",
    "inventory.approve_adjustment",
    "inventory.reject_adjustment",
    "inventory.cancel_adjustment",
    "inventory.view_transactions",
    "trace.view",
    "picking.view",
    "picking.update_mobile_status",
    "packing.view",
    "packing.manage",
    "shipping.view",
  ],
  storeoperator: [
    "returns.view",
    "rma.view",
    "putaway.view",
    "putaway.view_history",
    "inventory.view_summary",
    "inventory.view_count_plans",
    "inventory.create_count_plan",
    "inventory.execute_count_plan",
    "inventory.submit_count_plan",
    "inventory.view_adjustments",
    "inventory.create_adjustment",
    "inventory.submit_adjustment",
    "inventory.view_transactions",
    "trace.view",
    "picking.view",
    "picking.update_mobile_status",
    "packing.view",
    "shipping.view",
  ],
  auditor: [
    "returns.view",
    "rma.view",
    "putaway.view",
    "putaway.view_history",
    "inventory.view_summary",
    "inventory.view_count_plans",
    "inventory.view_adjustments",
    "inventory.view_transactions",
    "trace.view",
    "picking.view",
    "packing.view",
    "shipping.view",
  ],
  readonly: [
    "returns.view",
    "rma.view",
    "putaway.view",
    "inventory.view_summary",
    "inventory.view_count_plans",
    "inventory.view_adjustments",
    "trace.view",
    "picking.view",
    "packing.view",
    "shipping.view",
  ],
};

const cancellationRoles = ["superadmin", "hqadmin", "storemanager"];

function canTransition(roleId, entityType, action) {
  const entityMap = transitionPermissions[entityType] || {};
  const allowedRoles = entityMap[action] || [];
  return allowedRoles.includes(roleId);
}

function canCancelDocument(roleId) {
  return cancellationRoles.includes(roleId);
}

function hasPermission(roleId, permissionId) {
  const normalizedRole = roleAliases[roleId] || roleId;
  const permissions = rolePermissions[normalizedRole] || [];
  return permissions.includes(permissionId);
}

function canViewReturns(roleId) {
  return hasPermission(roleId, "returns.view");
}

function canCreateReturn(roleId) {
  return hasPermission(roleId, "returns.create");
}

function canCancelReturn(roleId) {
  return hasPermission(roleId, "returns.cancel");
}

function canCreateRma(roleId) {
  return hasPermission(roleId, "returns.create_rma");
}

function canViewRma(roleId) {
  return hasPermission(roleId, "rma.view");
}

function canCancelRma(roleId) {
  return hasPermission(roleId, "rma.cancel");
}

function canViewPutaway(roleId) {
  return hasPermission(roleId, "putaway.view");
}

function canAssignPutaway(roleId) {
  return hasPermission(roleId, "putaway.assign");
}

function canRecomputePutawayBin(roleId) {
  return hasPermission(roleId, "putaway.recompute_bin");
}

function canMarkPutawayException(roleId) {
  return hasPermission(roleId, "putaway.mark_exception");
}

function canViewPutawayHistory(roleId) {
  return hasPermission(roleId, "putaway.view_history");
}

function canViewInventorySummary(roleId) {
  return hasPermission(roleId, "inventory.view_summary");
}

function canViewCountPlans(roleId) {
  return hasPermission(roleId, "inventory.view_count_plans");
}

function canCreateCountPlan(roleId) {
  return hasPermission(roleId, "inventory.create_count_plan");
}

function canExecuteCountPlan(roleId) {
  return hasPermission(roleId, "inventory.execute_count_plan");
}

function canSubmitCountPlan(roleId) {
  return hasPermission(roleId, "inventory.submit_count_plan");
}

function canApproveCountPlan(roleId) {
  return hasPermission(roleId, "inventory.approve_count_plan");
}

function canRejectCountPlan(roleId) {
  return hasPermission(roleId, "inventory.reject_count_plan");
}

function canCancelCountPlan(roleId) {
  return hasPermission(roleId, "inventory.cancel_count_plan");
}

function canViewAdjustments(roleId) {
  return hasPermission(roleId, "inventory.view_adjustments");
}

function canCreateAdjustment(roleId) {
  return hasPermission(roleId, "inventory.create_adjustment");
}

function canSubmitAdjustment(roleId) {
  return hasPermission(roleId, "inventory.submit_adjustment");
}

function canApproveAdjustment(roleId) {
  return hasPermission(roleId, "inventory.approve_adjustment");
}

function canRejectAdjustment(roleId) {
  return hasPermission(roleId, "inventory.reject_adjustment");
}

function canCancelAdjustment(roleId) {
  return hasPermission(roleId, "inventory.cancel_adjustment");
}

function canViewInventoryTransactions(roleId) {
  return hasPermission(roleId, "inventory.view_transactions");
}

function canViewTrace(roleId) {
  return hasPermission(roleId, "trace.view");
}

function canViewPicking(roleId) {
  return hasPermission(roleId, "picking.view");
}

function canUpdatePickingMobileStatus(roleId) {
  return hasPermission(roleId, "picking.update_mobile_status");
}

function canViewPacking(roleId) {
  return hasPermission(roleId, "packing.view");
}

function canManagePacking(roleId) {
  return hasPermission(roleId, "packing.manage");
}

function canViewShipping(roleId) {
  return hasPermission(roleId, "shipping.view");
}

export {
  canApproveAdjustment,
  canApproveCountPlan,
  canAssignPutaway,
  canCancelAdjustment,
  canCancelCountPlan,
  canCancelDocument,
  canCancelReturn,
  canCancelRma,
  canCreateAdjustment,
  canCreateCountPlan,
  canCreateReturn,
  canCreateRma,
  canExecuteCountPlan,
  canMarkPutawayException,
  canRejectAdjustment,
  canRejectCountPlan,
  canRecomputePutawayBin,
  canSubmitAdjustment,
  canSubmitCountPlan,
  canTransition,
  canViewAdjustments,
  canViewCountPlans,
  canViewInventorySummary,
  canViewInventoryTransactions,
  canViewPutaway,
  canViewPutawayHistory,
  canViewReturns,
  canViewRma,
  canViewPicking,
  canUpdatePickingMobileStatus,
  canViewPacking,
  canManagePacking,
  canViewShipping,
  canViewTrace,
  hasPermission,
  rolePermissions,
  transitionPermissions,
};
