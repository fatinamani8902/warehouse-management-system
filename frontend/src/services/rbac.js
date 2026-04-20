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
    // Inbound
    "inbound.view", "inbound.create", "inbound.cancel",
    // Returns
    "audit.view",
    "returns.view", "returns.create", "returns.cancel", "returns.create_rma",
    "rma.view", "rma.cancel",
    // Putaway
    "putaway.view", "putaway.assign", "putaway.recompute_bin",
    "putaway.mark_exception", "putaway.view_history",
    // Inventory
    "inventory.view_summary", "inventory.view_transactions",
    "inventory.view_count_plans", "inventory.create_count_plan",
    "inventory.execute_count_plan", "inventory.submit_count_plan",
    "inventory.approve_count_plan", "inventory.reject_count_plan", "inventory.cancel_count_plan",
    "inventory.view_adjustments", "inventory.create_adjustment",
    "inventory.submit_adjustment", "inventory.approve_adjustment",
    "inventory.reject_adjustment", "inventory.cancel_adjustment",
    // Picking / Packing / Shipping
    "picking.view", "picking.update_status",
    "packing.view", "packing.confirm",
    "shipping.view", "shipping.dispatch", "shipping.close", "shipping.cancel",
    // Outbound
    "outbound.view", "outbound.create", "outbound.release", "outbound.cancel",
    // Trace
    "trace.view",
    // Admin
    "masterdata.view", "masterdata.edit", "masterdata.delete",
    "lov.view", "lov.edit", "lov.delete",
    "users.view", "users.edit", "users.delete",
    "settings.view", "settings.edit",
  ],
  hqadmin: [
    // Inbound
    "inbound.view", "inbound.create", "inbound.cancel",
    // Returns
    "audit.view",
    "returns.view", "returns.create", "returns.cancel", "returns.create_rma",
    "rma.view", "rma.cancel",
    // Putaway
    "putaway.view", "putaway.assign", "putaway.recompute_bin",
    "putaway.mark_exception", "putaway.view_history",
    // Inventory
    "inventory.view_summary", "inventory.view_transactions",
    "inventory.view_count_plans", "inventory.create_count_plan",
    "inventory.execute_count_plan", "inventory.submit_count_plan",
    "inventory.approve_count_plan", "inventory.reject_count_plan", "inventory.cancel_count_plan",
    "inventory.view_adjustments", "inventory.create_adjustment",
    "inventory.submit_adjustment", "inventory.approve_adjustment",
    "inventory.reject_adjustment", "inventory.cancel_adjustment",
    // Picking / Packing / Shipping
    "picking.view", "picking.update_status",
    "packing.view", "packing.confirm",
    "shipping.view", "shipping.dispatch", "shipping.close", "shipping.cancel",
    // Outbound
    "outbound.view", "outbound.create", "outbound.release", "outbound.cancel",
    // Trace
    "trace.view",
    // Admin (no settings, no delete users)
    "masterdata.view", "masterdata.edit", "masterdata.delete",
    "lov.view", "lov.edit", "lov.delete",
    "users.view", "users.edit",
  ],
  storemanager: [
    // Inbound
    "inbound.view", "inbound.create", "inbound.cancel",
    // Returns
    "audit.view",
    "returns.view", "returns.create", "returns.cancel", "returns.create_rma",
    "rma.view", "rma.cancel",
    // Putaway
    "putaway.view", "putaway.assign", "putaway.mark_exception", "putaway.view_history",
    // Inventory
    "inventory.view_summary", "inventory.view_transactions",
    "inventory.view_count_plans", "inventory.create_count_plan",
    "inventory.execute_count_plan", "inventory.submit_count_plan",
    "inventory.approve_count_plan", "inventory.reject_count_plan", "inventory.cancel_count_plan",
    "inventory.view_adjustments", "inventory.create_adjustment",
    "inventory.submit_adjustment", "inventory.approve_adjustment",
    "inventory.reject_adjustment", "inventory.cancel_adjustment",
    // Picking / Packing / Shipping
    "picking.view", "picking.update_status",
    "packing.view", "packing.confirm",
    "shipping.view", "shipping.dispatch", "shipping.close", "shipping.cancel",
    // Outbound
    "outbound.view", "outbound.create", "outbound.release", "outbound.cancel",
    // Trace
    "trace.view",
    // Master data (no delete, no LOV edit, no users manage)
    "masterdata.view", "masterdata.edit",
    "lov.view",
    "users.view",
  ],
  storeoperator: [
    // Inbound
    "inbound.view", "inbound.create",
    // Returns
    "returns.view", "returns.create",
    "rma.view",
    // Putaway
    "putaway.view", "putaway.recompute_bin", "putaway.mark_exception", "putaway.view_history",
    // Inventory
    "inventory.view_summary", "inventory.view_transactions",
    "inventory.view_count_plans", "inventory.execute_count_plan", "inventory.submit_count_plan",
    "inventory.view_adjustments", "inventory.create_adjustment", "inventory.submit_adjustment",
    // Picking / Packing / Shipping / Outbound / Trace
    "picking.view", "picking.update_status",
    "packing.view", "packing.confirm",
    "shipping.view", "shipping.dispatch",
    "outbound.view",
    "trace.view",
  ],
  auditor: [
    "audit.view",
    "inbound.view",
    "returns.view", "rma.view",
    "putaway.view", "putaway.view_history",
    "inventory.view_summary", "inventory.view_transactions",
    "inventory.view_count_plans", "inventory.view_adjustments",
    "picking.view",
    "packing.view",
    "shipping.view",
    "outbound.view",
    "trace.view",
    "masterdata.view",
    "lov.view",
    "users.view",
  ],
  readonly: [
    "inbound.view",
    "returns.view", "rma.view",
    "putaway.view",
    "inventory.view_summary", "inventory.view_count_plans", "inventory.view_adjustments",
    "picking.view", "packing.view", "shipping.view", "outbound.view",
    "trace.view",
  ],
};

const cancellationRoles = ["superadmin", "hqadmin", "storemanager"];

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || roleId;
}

function hasPermission(roleId, permissionId) {
  const normalizedRole = normalizeRole(roleId);
  const permissions = rolePermissions[normalizedRole] || [];
  return permissions.includes(permissionId);
}

// Shorthand helper — same as hasPermission but named "can" for new pages
function can(roleId, permissionId) {
  return hasPermission(roleId, permissionId);
}

function canTransition(roleId, entityType, action) {
  const normalizedRole = normalizeRole(roleId);
  const entityMap = transitionPermissions[entityType] || {};
  const allowedRoles = entityMap[action] || [];
  return allowedRoles.includes(normalizedRole);
}

function canCancelDocument(roleId) {
  return cancellationRoles.includes(normalizeRole(roleId));
}

// ── Inbound ───────────────────────────────────────────────────────────────────
function canCreateInbound(roleId) { return hasPermission(roleId, "inbound.create"); }
function canCancelInbound(roleId) { return hasPermission(roleId, "inbound.cancel"); }

// ── Returns ───────────────────────────────────────────────────────────────────
function canViewReturns(roleId) { return hasPermission(roleId, "returns.view"); }
function canCreateReturn(roleId) { return hasPermission(roleId, "returns.create"); }
function canCancelReturn(roleId) { return hasPermission(roleId, "returns.cancel"); }
function canCreateRma(roleId) { return hasPermission(roleId, "returns.create_rma"); }
function canViewRma(roleId) { return hasPermission(roleId, "rma.view"); }
function canCancelRma(roleId) { return hasPermission(roleId, "rma.cancel"); }

// ── Putaway ───────────────────────────────────────────────────────────────────
function canViewPutaway(roleId) { return hasPermission(roleId, "putaway.view"); }
function canAssignPutaway(roleId) { return hasPermission(roleId, "putaway.assign"); }
function canRecomputePutawayBin(roleId) { return hasPermission(roleId, "putaway.recompute_bin"); }
function canMarkPutawayException(roleId) { return hasPermission(roleId, "putaway.mark_exception"); }
function canViewPutawayHistory(roleId) { return hasPermission(roleId, "putaway.view_history"); }

// ── Inventory ─────────────────────────────────────────────────────────────────
function canViewInventorySummary(roleId) { return hasPermission(roleId, "inventory.view_summary"); }
function canViewCountPlans(roleId) { return hasPermission(roleId, "inventory.view_count_plans"); }
function canCreateCountPlan(roleId) { return hasPermission(roleId, "inventory.create_count_plan"); }
function canExecuteCountPlan(roleId) { return hasPermission(roleId, "inventory.execute_count_plan"); }
function canSubmitCountPlan(roleId) { return hasPermission(roleId, "inventory.submit_count_plan"); }
function canApproveCountPlan(roleId) { return hasPermission(roleId, "inventory.approve_count_plan"); }
function canRejectCountPlan(roleId) { return hasPermission(roleId, "inventory.reject_count_plan"); }
function canCancelCountPlan(roleId) { return hasPermission(roleId, "inventory.cancel_count_plan"); }
function canViewAdjustments(roleId) { return hasPermission(roleId, "inventory.view_adjustments"); }
function canCreateAdjustment(roleId) { return hasPermission(roleId, "inventory.create_adjustment"); }
function canSubmitAdjustment(roleId) { return hasPermission(roleId, "inventory.submit_adjustment"); }
function canApproveAdjustment(roleId) { return hasPermission(roleId, "inventory.approve_adjustment"); }
function canRejectAdjustment(roleId) { return hasPermission(roleId, "inventory.reject_adjustment"); }
function canCancelAdjustment(roleId) { return hasPermission(roleId, "inventory.cancel_adjustment"); }
function canViewInventoryTransactions(roleId) { return hasPermission(roleId, "inventory.view_transactions"); }

// ── Picking ───────────────────────────────────────────────────────────────────
function canViewPicking(roleId) { return hasPermission(roleId, "picking.view"); }
function canUpdatePickingStatus(roleId) { return hasPermission(roleId, "picking.update_status"); }
function canUpdatePickingMobileStatus(roleId) { return hasPermission(roleId, "picking.update_status"); }

// ── Packing ───────────────────────────────────────────────────────────────────
function canViewPacking(roleId) { return hasPermission(roleId, "packing.view"); }
function canManagePacking(roleId) { return hasPermission(roleId, "packing.confirm"); }
function canConfirmPacking(roleId) { return hasPermission(roleId, "packing.confirm"); }

// ── Shipping ──────────────────────────────────────────────────────────────────
function canViewShipping(roleId) { return hasPermission(roleId, "shipping.view"); }
function canDispatchShipment(roleId) { return hasPermission(roleId, "shipping.dispatch"); }
function canCloseShipment(roleId) { return hasPermission(roleId, "shipping.close"); }
function canCancelShipment(roleId) { return hasPermission(roleId, "shipping.cancel"); }

// ── Outbound ──────────────────────────────────────────────────────────────────
function canViewOutbound(roleId) { return hasPermission(roleId, "outbound.view"); }
function canCreateOutbound(roleId) { return hasPermission(roleId, "outbound.create"); }
function canReleaseOutbound(roleId) { return hasPermission(roleId, "outbound.release"); }
function canCancelOutbound(roleId) { return hasPermission(roleId, "outbound.cancel"); }

// ── Trace ─────────────────────────────────────────────────────────────────────
function canViewTrace(roleId) { return hasPermission(roleId, "trace.view"); }

// ── Master Data ───────────────────────────────────────────────────────────────
function canViewMasterData(roleId) { return hasPermission(roleId, "masterdata.view"); }
function canEditMasterData(roleId) { return hasPermission(roleId, "masterdata.edit"); }
function canDeleteMasterData(roleId) { return hasPermission(roleId, "masterdata.delete"); }

// ── LOV ───────────────────────────────────────────────────────────────────────
function canViewLov(roleId) { return hasPermission(roleId, "lov.view"); }
function canEditLov(roleId) { return hasPermission(roleId, "lov.edit"); }
function canDeleteLov(roleId) { return hasPermission(roleId, "lov.delete"); }

// ── Users ─────────────────────────────────────────────────────────────────────
function canViewUsers(roleId) { return hasPermission(roleId, "users.view"); }
function canEditUsers(roleId) { return hasPermission(roleId, "users.edit"); }
function canDeleteUsers(roleId) { return hasPermission(roleId, "users.delete"); }

// ── Settings ──────────────────────────────────────────────────────────────────
function canViewSettings(roleId) { return hasPermission(roleId, "settings.view"); }

export {
  can,
  hasPermission,
  normalizeRole,
  rolePermissions,
  transitionPermissions,
  canTransition,
  canCancelDocument,
  // Inbound
  canCreateInbound, canCancelInbound,
  // Returns
  canViewReturns, canCreateReturn, canCancelReturn,
  canCreateRma, canViewRma, canCancelRma,
  // Putaway
  canViewPutaway, canAssignPutaway, canRecomputePutawayBin,
  canMarkPutawayException, canViewPutawayHistory,
  // Inventory
  canViewInventorySummary, canViewInventoryTransactions,
  canViewCountPlans, canCreateCountPlan, canExecuteCountPlan,
  canSubmitCountPlan, canApproveCountPlan, canRejectCountPlan, canCancelCountPlan,
  canViewAdjustments, canCreateAdjustment, canSubmitAdjustment,
  canApproveAdjustment, canRejectAdjustment, canCancelAdjustment,
  // Picking
  canViewPicking, canUpdatePickingStatus, canUpdatePickingMobileStatus,
  // Packing
  canViewPacking, canManagePacking, canConfirmPacking,
  // Shipping
  canViewShipping, canDispatchShipment, canCloseShipment, canCancelShipment,
  // Outbound
  canViewOutbound, canCreateOutbound, canReleaseOutbound, canCancelOutbound,
  // Trace
  canViewTrace,
  // Master Data
  canViewMasterData, canEditMasterData, canDeleteMasterData,
  // LOV
  canViewLov, canEditLov, canDeleteLov,
  // Users
  canViewUsers, canEditUsers, canDeleteUsers,
  // Settings
  canViewSettings,
};