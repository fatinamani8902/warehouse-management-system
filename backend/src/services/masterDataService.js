import { buildList, buildEntity, buildCreate, buildUpdate, buildDelete } from "./sharedService.js";

const resourceConfig = {
  suppliers: { prefix: "SUP", defaultStatus: "ACTIVE" },
  products: { prefix: "PRD", defaultStatus: "ACTIVE" },
  warehouses: { prefix: "WHS", defaultStatus: "ACTIVE" },
  locations: { prefix: "LOC", defaultStatus: "ACTIVE" },
};

function getConfig(resource) {
  return resourceConfig[resource];
}

function listResource(context, resource, { page, pageSize }) {
  const config = getConfig(resource);
  return buildList(resource, config.prefix, context.tenantId, page, pageSize);
}

function getResource(context, resource, id) {
  const config = getConfig(resource);
  return buildEntity(resource, config.prefix, id, context.tenantId);
}

function createResource(context, resource, payload) {
  const config = getConfig(resource);

  const created = buildCreate(resource, config.prefix, context.tenantId, payload, {
    status: config.defaultStatus,
  });

  // Fix supplier ID jadi SUP0001, SUP0002
  function createResource(context, resource, payload) {
  const config = getConfig(resource);

  return buildCreate(resource, config.prefix, context.tenantId, payload, {
    status: config.defaultStatus,
  });
}

  return created;
}

function updateResource(context, resource, id, payload) {
  const config = getConfig(resource);
  return buildUpdate(resource, config.prefix, id, context.tenantId, payload);
}

function deleteResource(context, resource, id) {
  return buildDelete(resource, id, context.tenantId);
}

export {
  listResource,
  getResource,
  createResource,
  updateResource,
  deleteResource,
};