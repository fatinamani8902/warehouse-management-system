import { buildList, buildEntity, buildCreate, buildUpdate, buildDelete } from "./sharedService.js";

const ROLE_NAMES = {
  superadmin:       "Super Admin",
  hqadmin:          "HQ Admin",
  storemanager:     "Store Manager",
  warehousemanager: "Warehouse Manager",
  storeoperator:    "Store Operator",
  storekeeper:      "Store Keeper",
  auditor:          "Auditor",
  readonly:         "Read Only",
};

function getMe(context) {
  const roleId = context.roles?.[0] || "";
  return {
    userId:      context.userId,
    tenantId:    context.tenantId,
    roles:       context.roles,
    permissions: context.permissions,
    role_id:     roleId,
    role_name:   ROLE_NAMES[roleId.toLowerCase()] || roleId,
  };
}

function getLov(context, type) {
  const normalizedType = String(type).toLowerCase();
  const valuesByType = {
    suppliers: [
      { value: "SUP000001", label: "Supplier One" },
      { value: "SUP000002", label: "Supplier Two" },
    ],
    statuses: [
      { value: "DRAFT", label: "Draft" },
      { value: "COMPLETED", label: "Completed" },
      { value: "PUTAWAY_PENDING", label: "Putaway Pending" },
    ],
    roles: [
      { value: "superadmin", label: "Super Admin" },
      { value: "hqadmin", label: "HQ Admin" },
      { value: "storemanager", label: "Store Manager" },
    ],
  };

  return {
    tenantId: context.tenantId,
    type: normalizedType,
    values: valuesByType[normalizedType] || [{ value: "GENERIC", label: "Generic Item" }],
  };
}

function listUsers(context, { page, pageSize }) {
  return buildList("users", "USR", context.tenantId, page, pageSize, {
    email: "demo.user@company.example",
    roleId: context.roles[0] || "storemanager",
    status: "ACTIVE",
  });
}

function getUser(context, id) {
  return buildEntity("users", "USR", id, context.tenantId, {
    email: "demo.user@company.example",
    roleId: "storemanager",
    status: "ACTIVE",
  });
}

function createUser(context, payload) {
  return buildCreate("users", "USR", context.tenantId, payload, {
    status: "ACTIVE",
  });
}

function updateUser(context, id, payload) {
  return buildUpdate("users", "USR", id, context.tenantId, payload, {
    status: "ACTIVE",
  });
}

function deleteUser(context, id) {
  return buildDelete("users", id, context.tenantId);
}

function listRoles(context, { page, pageSize }) {
  return buildList("roles", "ROL", context.tenantId, page, pageSize, {
    role_id: "storemanager",
    permissions: ["users:read", "inventory:read"],
    status: "ACTIVE",
  });
}

function getRole(context, id) {
  return buildEntity("roles", "ROL", id, context.tenantId, {
    role_id: String(id).toLowerCase(),
    permissions: ["users:read", "inventory:read"],
    status: "ACTIVE",
  });
}

function createRole(context, payload) {
  return buildCreate("roles", "ROL", context.tenantId, {
    ...payload,
    role_id: String(payload.role_id || "storemanager").toLowerCase(),
  }, {
    status: "ACTIVE",
  });
}

function updateRole(context, id, payload) {
  return buildUpdate("roles", "ROL", id, context.tenantId, {
    ...payload,
    ...(payload.role_id ? { role_id: String(payload.role_id).toLowerCase() } : {}),
  }, {
    status: "ACTIVE",
  });
}

function deleteRole(context, id) {
  return buildDelete("roles", id, context.tenantId);
}

function listPermissions(context, { page, pageSize }) {
  return buildList("permissions", "PRM", context.tenantId, page, pageSize, {
    permission_id: "inventory:read",
    status: "ACTIVE",
  });
}

function getPermission(context, id) {
  return buildEntity("permissions", "PRM", id, context.tenantId, {
    permission_id: "inventory:read",
    status: "ACTIVE",
  });
}

function createPermission(context, payload) {
  return buildCreate("permissions", "PRM", context.tenantId, payload, {
    status: "ACTIVE",
  });
}

function updatePermission(context, id, payload) {
  return buildUpdate("permissions", "PRM", id, context.tenantId, payload, {
    status: "ACTIVE",
  });
}

function deletePermission(context, id) {
  return buildDelete("permissions", id, context.tenantId);
}

export {
  getMe,
  getLov,
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
  getPermission,
  createPermission,
  updatePermission,
  deletePermission,
};
