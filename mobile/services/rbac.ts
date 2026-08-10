// services/rbac.ts

const roleAliases: Record<string, string> = {
  warehousemanager: "storemanager",
  storekeeper: "storeoperator",
  warehouseoperator: "storeoperator",
  warehouseclerk: "storeoperator",
};

const rolePermissions: Record<string, string[]> = {
  superadmin: [
    "audit.view",
    "returns.view", "returns.create", "returns.cancel", "returns.create_rma",
    "rma.view", "rma.cancel",
    "putaway.view", "putaway.assign", "putaway.recompute_bin", "putaway.mark_exception", "putaway.view_history",
    "inventory.view_summary", "inventory.view_count_plans", "inventory.create_count_plan",
    "inventory.execute_count_plan", "inventory.submit_count_plan", "inventory.approve_count_plan",
    "inventory.reject_count_plan", "inventory.cancel_count_plan", "inventory.view_adjustments",
    "inventory.create_adjustment", "inventory.submit_adjustment", "inventory.approve_adjustment",
    "inventory.reject_adjustment", "inventory.cancel_adjustment", "inventory.view_transactions",
    "trace.view",
    "picking.view", "picking.update_mobile_status",
    "packing.view", "packing.manage",
    "shipping.view",
  ],
  hqadmin: [
    "audit.view",
    "returns.view", "returns.create", "returns.cancel", "returns.create_rma",
    "rma.view", "rma.cancel",
    "putaway.view", "putaway.assign", "putaway.recompute_bin", "putaway.mark_exception", "putaway.view_history",
    "inventory.view_summary", "inventory.view_count_plans", "inventory.create_count_plan",
    "inventory.execute_count_plan", "inventory.submit_count_plan", "inventory.approve_count_plan",
    "inventory.reject_count_plan", "inventory.cancel_count_plan", "inventory.view_adjustments",
    "inventory.create_adjustment", "inventory.submit_adjustment", "inventory.approve_adjustment",
    "inventory.reject_adjustment", "inventory.cancel_adjustment", "inventory.view_transactions",
    "trace.view",
    "picking.view", "picking.update_mobile_status",
    "packing.view", "packing.manage",
    "shipping.view",
  ],
  storemanager: [
    "audit.view",
    "returns.view", "returns.create", "returns.cancel", "returns.create_rma",
    "rma.view", "rma.cancel",
    "putaway.view", "putaway.assign", "putaway.mark_exception", "putaway.view_history",
    "inventory.view_summary", "inventory.view_count_plans", "inventory.create_count_plan",
    "inventory.execute_count_plan", "inventory.submit_count_plan", "inventory.approve_count_plan",
    "inventory.reject_count_plan", "inventory.cancel_count_plan", "inventory.view_adjustments",
    "inventory.create_adjustment", "inventory.submit_adjustment", "inventory.approve_adjustment",
    "inventory.reject_adjustment", "inventory.cancel_adjustment", "inventory.view_transactions",
    "trace.view",
    "picking.view", "picking.update_mobile_status",
    "packing.view", "packing.manage",
    "shipping.view",
  ],
  storeoperator: [
    "returns.view", "returns.create", "returns.create_rma",
    "rma.view",
    "putaway.view", "putaway.view_history",
    "inventory.view_summary", "inventory.view_count_plans", "inventory.create_count_plan",
    "inventory.execute_count_plan", "inventory.submit_count_plan", "inventory.view_adjustments",
    "inventory.create_adjustment", "inventory.submit_adjustment", "inventory.view_transactions",
    "trace.view",
    "picking.view", "picking.update_mobile_status",
    "packing.view", "packing.manage",
    "shipping.view",
  ],
  auditor: [
    "returns.view", "rma.view",
    "putaway.view", "putaway.view_history",
    "inventory.view_summary", "inventory.view_count_plans", "inventory.view_adjustments", "inventory.view_transactions",
    "trace.view",
    "picking.view",
    "packing.view",
    "shipping.view",
  ],
  readonly: [
    "returns.view", "rma.view",
    "putaway.view",
    "inventory.view_summary", "inventory.view_count_plans", "inventory.view_adjustments",
    "trace.view",
    "picking.view",
    "packing.view",
    "shipping.view",
  ],
};

const transitionPermissions: Record<string, Record<string, string[]>> = {
  asn: {
    submit:         ["superadmin", "hqadmin", "storemanager", "storeoperator"],
    mark_in_transit:["superadmin", "hqadmin", "storemanager"],
    mark_arrived:   ["superadmin", "hqadmin", "storemanager"],
    close:          ["superadmin", "hqadmin", "storemanager"],
    cancel:         ["superadmin", "hqadmin", "storemanager"],
  },
  grn: {
    start_receiving:["superadmin", "hqadmin", "storemanager", "storeoperator"],
    complete:       ["superadmin", "hqadmin", "storemanager", "storeoperator"],
    post:           ["superadmin", "hqadmin", "storemanager"],
    cancel:         ["superadmin", "hqadmin", "storemanager"],
  },
};

const cancellationRoles = ["superadmin", "hqadmin", "storemanager"];

// ─── Core ─────────────────────────────────────────────────────────────────────

export function normalizeRole(roleId: string): string {
  const normalized = String(roleId || "").trim().toLowerCase();
  return roleAliases[normalized] || normalized;
}

export function hasPermission(roleId: string, permission: string): boolean {
  const normalized = normalizeRole(roleId);
  return (rolePermissions[normalized] || []).includes(permission);
}

export function canTransition(roleId: string, entityType: string, action: string): boolean {
  return (transitionPermissions[entityType]?.[action] || []).includes(roleId);
}

export function canCancelDocument(roleId: string): boolean {
  return cancellationRoles.includes(roleId);
}

// ─── Mobile page visibility ───────────────────────────────────────────────────
// inbound & shipping → semua roles boleh view (view only, no actions)
// lain → ikut rolePermissions

export function canViewMobilePage(roleId: string, page: string): boolean {
  if (page === "inbound" || page === "shipping") return true;
  if (page === "dashboard" || page === "") return true;
  const pagePermMap: Record<string, string> = {
    putaway:   "putaway.view",
    inventory: "inventory.view_summary",
    picking:   "picking.view",
    packing:   "packing.view",
  };
  return hasPermission(roleId, pagePermMap[page] || "");
}

// ─── Permission helpers ───────────────────────────────────────────────────────

export const canViewPutaway          = (r: string) => hasPermission(r, "putaway.view");
export const canAssignPutaway        = (r: string) => hasPermission(r, "putaway.assign");
export const canRecomputePutawayBin  = (r: string) => hasPermission(r, "putaway.recompute_bin");
export const canMarkPutawayException = (r: string) => hasPermission(r, "putaway.mark_exception");
export const canViewPutawayHistory   = (r: string) => hasPermission(r, "putaway.view_history");

export const canViewInventorySummary      = (r: string) => hasPermission(r, "inventory.view_summary");
export const canViewCountPlans            = (r: string) => hasPermission(r, "inventory.view_count_plans");
export const canCreateCountPlan           = (r: string) => hasPermission(r, "inventory.create_count_plan");
export const canExecuteCountPlan          = (r: string) => hasPermission(r, "inventory.execute_count_plan");
export const canSubmitCountPlan           = (r: string) => hasPermission(r, "inventory.submit_count_plan");
export const canApproveCountPlan          = (r: string) => hasPermission(r, "inventory.approve_count_plan");
export const canRejectCountPlan           = (r: string) => hasPermission(r, "inventory.reject_count_plan");
export const canCancelCountPlan           = (r: string) => hasPermission(r, "inventory.cancel_count_plan");
export const canViewAdjustments           = (r: string) => hasPermission(r, "inventory.view_adjustments");
export const canCreateAdjustment          = (r: string) => hasPermission(r, "inventory.create_adjustment");
export const canSubmitAdjustment          = (r: string) => hasPermission(r, "inventory.submit_adjustment");
export const canApproveAdjustment         = (r: string) => hasPermission(r, "inventory.approve_adjustment");
export const canRejectAdjustment          = (r: string) => hasPermission(r, "inventory.reject_adjustment");
export const canCancelAdjustment          = (r: string) => hasPermission(r, "inventory.cancel_adjustment");
export const canViewInventoryTransactions = (r: string) => hasPermission(r, "inventory.view_transactions");

export const canViewPicking               = (r: string) => hasPermission(r, "picking.view");
export const canUpdatePickingMobileStatus = (r: string) => hasPermission(r, "picking.update_mobile_status");
export const canViewPacking               = (r: string) => hasPermission(r, "packing.view");
export const canManagePacking             = (r: string) => hasPermission(r, "packing.manage");
export const canViewShipping              = (r: string) => hasPermission(r, "shipping.view");
export const canViewReturns               = (r: string) => hasPermission(r, "returns.view");
export const canCreateReturn              = (r: string) => hasPermission(r, "returns.create");
export const canCancelReturn              = (r: string) => hasPermission(r, "returns.cancel");
export const canCreateRma                 = (r: string) => hasPermission(r, "returns.create_rma");
export const canViewRma                   = (r: string) => hasPermission(r, "rma.view");
export const canCancelRma                 = (r: string) => hasPermission(r, "rma.cancel");
export const canViewTrace                 = (r: string) => hasPermission(r, "trace.view");
