import { withTenantContext } from "../db/withTenantContext.js";
import {
  getDashboardSummary,
  validateDashboardWarehouseAccess,
} from "../repositories/DashboardRepository.js";
import { ApiError } from "../utils/errors.js";

function clean(value) {
  return String(value ?? "").trim();
}

function requireContext(context = {}) {
  const tenantId = clean(context.tenantId);
  const warehouseId = clean(context.warehouseId);
  const userId = clean(context.userId);
  const roles = Array.isArray(context.roles)
    ? context.roles.map((role) => clean(role).toLowerCase()).filter(Boolean)
    : [];

  if (!tenantId) {
    throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  }
  if (!warehouseId) {
    throw new ApiError(403, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required");
  }
  if (!userId) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  return { tenantId, warehouseId, userId, roles };
}

async function getDashboardSummaryForContext(context) {
  const scope = requireContext(context);

  return withTenantContext(scope.tenantId, async (client) => {
    const hasWarehouseAccess = await validateDashboardWarehouseAccess(client, scope);
    if (!hasWarehouseAccess) {
      throw new ApiError(
        403,
        "WAREHOUSE_ACCESS_DENIED",
        "User is not authorized for the selected warehouse"
      );
    }

    return getDashboardSummary(client, scope);
  });
}

export { getDashboardSummaryForContext };
