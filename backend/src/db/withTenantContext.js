import { pool } from "./client.js";
import { ApiError } from "../utils/errors.js";

async function withTenantContext(tenantId, callback) {
  const safeTenantId = String(tenantId || "").trim();

  if (!safeTenantId) {
    throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required for database access");
  }

  if (typeof callback !== "function") {
    throw new TypeError("withTenantContext callback must be a function");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [safeTenantId]);

    const result = await callback(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }

    throw error;
  } finally {
    client.release();
  }
}

export { withTenantContext };
