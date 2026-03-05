import { buildPagination } from "../utils/pagination.js";
import { nowIso } from "../utils/mock.js";

/**
 * In-memory store
 */
const memoryStore = {};

/**
 * LIST
 */
function buildList(resource, prefix, tenantId, page, pageSize) {
  const items = memoryStore[resource] || [];

  return {
    items,
    pagination: buildPagination(page, pageSize, items.length),
  };
}

/**
 * GET
 */
function buildEntity(resource, prefix, id, tenantId) {
  const items = memoryStore[resource] || [];
  return items.find((item) => item.id === id) || null;
}

/**
 * CREATE
 */
function buildCreate(resource, prefix, tenantId, payload = {}, extra = {}) {
  if (!memoryStore[resource]) {
    memoryStore[resource] = [];
  }

  // Auto increment ID
  const nextNumber = memoryStore[resource].length + 1;
  const id = `${prefix}${String(nextNumber).padStart(4, "0")}`;

  const idField = `${resource.slice(0, -1)}_id`;

  const newItem = {
    [idField]: id,
    id,
    tenantId,
    resource,
    status: extra.status || "ACTIVE",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...payload,
  };

  memoryStore[resource].push(newItem);

  return newItem;
}

/**
 * UPDATE
 */
function buildUpdate(resource, prefix, id, tenantId, payload = {}) {
  const items = memoryStore[resource] || [];
  const index = items.findIndex((item) => item.id === id);

  if (index === -1) {
    return null;
  }

  const updated = {
    ...items[index],
    ...payload,
    updatedAt: nowIso(),
  };

  items[index] = updated;
  return updated;
}

/**
 * DELETE
 */
function buildDelete(resource, id, tenantId) {
  if (!memoryStore[resource]) return null;

  const index = memoryStore[resource].findIndex((item) => item.id === id);
  if (index === -1) return null;

  const deleted = memoryStore[resource][index];
  memoryStore[resource].splice(index, 1);

  return deleted;
}

export {
  buildList,
  buildEntity,
  buildCreate,
  buildUpdate,
  buildDelete,
};