import { createRemoteJWKSet, jwtVerify } from "jose";
import { ApiError } from "../utils/errors.js";

let cachedJwks;

function parseCsv(value) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRoles(value) {
  return parseCsv(value).map((role) => role.toLowerCase());
}

function parsePermissions(value) {
  return parseCsv(value);
}

function resolveTenantFromClaims(payload) {
  return payload.tenant_id || payload.tenantId || payload.org_id || payload.orgId || null;
}

function resolveRolesFromClaims(payload) {
  if (Array.isArray(payload.roles)) {
    return payload.roles.map((item) => String(item).toLowerCase());
  }

  if (typeof payload.roles === "string") {
    return parseRoles(payload.roles);
  }

  if (typeof payload.role === "string" && payload.role.trim()) {
    return [payload.role.trim().toLowerCase()];
  }

  return [];
}

function resolvePermissionsFromClaims(payload) {
  if (Array.isArray(payload.permissions)) {
    return payload.permissions.map((item) => String(item));
  }

  if (typeof payload.permissions === "string") {
    return parsePermissions(payload.permissions);
  }

  return [];
}

function isNonProduction() {
  return process.env.NODE_ENV !== "production";
}

function getJwks() {
  if (cachedJwks) {
    return cachedJwks;
  }

  const jwksUrl = process.env.CLERK_JWKS_URL;
  if (!jwksUrl) {
    throw new ApiError(500, "AUTH_CONFIG_ERROR", "Missing CLERK_JWKS_URL environment configuration");
  }

  cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
  return cachedJwks;
}

function applyStubContext(req) {
  const tenantId = typeof req.headers["x-tenant-id"] === "string" ? req.headers["x-tenant-id"].trim() : "";
  const userId = typeof req.headers["x-user-id"] === "string" ? req.headers["x-user-id"].trim() : "";

  if (!tenantId || !userId) {
    return false;
  }

  const roles = parseRoles(req.headers["x-roles"]);
  const permissions = parsePermissions(req.headers["x-permissions"]);

  req.context = {
    ...req.context,
    userId,
    tenantId,
    roles,
    permissions,
  };

  // Tambah flat fields untuk routes lama
  req.tenant_id = tenantId;
  req.user_id = userId;
  req.role_id = roles[0] || "superadmin";

  return true;
}

async function verifyClerkJwt(req, _res, next) {

  // DEVELOPMENT BYPASS
  if (process.env.NODE_ENV === "development") {
    const tenantId = req.headers["x-tenant-id"] || "TNT000001";
    const userId = req.headers["x-user-id"] || "USR000001";
    const roles = parseRoles(req.headers["x-roles"] || "superadmin");

    req.context = {
      ...req.context,
      userId,
      tenantId,
      roles,
      permissions: ["*"]
    };

    // Flat fields untuk routes lama (returns.js, rma.js dll)
    req.tenant_id = tenantId;
    req.user_id = userId;
    req.role_id = roles[0] || "superadmin";

    return next();
  }

  try {
    if (isNonProduction() && applyStubContext(req)) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid Authorization header");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new ApiError(401, "UNAUTHORIZED", "Bearer token is missing");
    }

    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;

    const verifyOptions = {
      ...(issuer ? { issuer } : {}),
      ...(audience ? { audience } : {}),
    };

    const { payload } = await jwtVerify(token, getJwks(), verifyOptions);

    const userId = payload.sub ? String(payload.sub) : "";
    const tenantId = resolveTenantFromClaims(payload);

    if (!userId || !tenantId) {
      throw new ApiError(401, "INVALID_TOKEN", "Token must include user and tenant context");
    }

    req.context = {
      ...req.context,
      userId,
      tenantId: String(tenantId),
      roles: resolveRolesFromClaims(payload),
      permissions: resolvePermissionsFromClaims(payload),
    };

    // Flat fields untuk routes lama
    req.tenant_id = String(tenantId);
    req.user_id = userId;
    req.role_id = resolveRolesFromClaims(payload)[0] || "";

    return next();
  } catch (error) {
    return next(
      error instanceof ApiError
        ? error
        : new ApiError(401, "INVALID_TOKEN", "Unable to verify Clerk JWT")
    );
  }
}

function requireRole(allowedRoles = []) {
  const normalizedAllowed = allowedRoles.map((role) => String(role).toLowerCase());

  return (req, _res, next) => {
    if (normalizedAllowed.length === 0) {
      return next();
    }

    const contextRoles = Array.isArray(req.context?.roles)
      ? req.context.roles.map((role) => String(role).toLowerCase())
      : [];

    const authorized = normalizedAllowed.some((role) => contextRoles.includes(role));

    if (!authorized) {
      return next(new ApiError(403, "FORBIDDEN", "Insufficient role to access this resource"));
    }

    return next();
  };
}

function requirePermission(requiredPermissions = []) {
  return (req, _res, next) => {
    if (!requiredPermissions.length) {
      return next();
    }

    const permissions = Array.isArray(req.context?.permissions)
      ? req.context.permissions.map((permission) => String(permission))
      : [];

    const hasAllPermissions = requiredPermissions.every((permission) => permissions.includes(permission));

    if (!hasAllPermissions) {
      return next(new ApiError(403, "FORBIDDEN", "Missing required permission"));
    }

    return next();
  };
}

export { verifyClerkJwt, requireRole, requirePermission };