import express from "express";
import { getTaxonomyResource } from "../../repositories/MasterDataReadRepository.js";
import {
  createWarehouse,
  createTaxonomyResource,
  deleteWarehouse,
  deleteTaxonomyResource,
  updateWarehouse,
  updateTaxonomyResource,
} from "../../repositories/MasterDataWriteRepository.js";
import { requireRole } from "../../middlewares/auth.js";

const router = express.Router();
const managerRoles = ["superadmin", "hqadmin", "storemanager"];
const writeResources = new Set(["warehouses", "zones", "aisles", "bays", "levels", "bins"]);

function tenantId(req) {
  return req.context?.tenantId || req.tenant_id;
}

function sendError(res, error) {
  const status = error?.statusCode || error?.status || 500;
  const uniqueViolation =
    error?.name === "SequelizeUniqueConstraintError" || error?.parent?.code === "23505";

  if (uniqueViolation) {
    return res.status(409).json({
      success: false,
      message: "Code already exists under the selected parent",
    });
  }

  return res.status(status).json({
    success: false,
    message: error?.message || "Unexpected server error",
  });
}

router.post("/taxonomy/:resource", requireRole(managerRoles), async (req, res, next) => {
  const { resource } = req.params;
  if (!writeResources.has(resource)) return next();

  try {
    const created = resource === "warehouses"
      ? await createWarehouse(tenantId(req), req.body || {})
      : await createTaxonomyResource(resource, tenantId(req), req.body || {});
    const idField = `${resource.slice(0, -1)}_id`;
    const enriched = await getTaxonomyResource(resource, created[idField], { tenantId: tenantId(req) });
    return res.status(201).json({ success: true, data: enriched || created });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/taxonomy/:resource/:id", requireRole(managerRoles), async (req, res, next) => {
  const { resource, id } = req.params;
  if (!writeResources.has(resource)) return next();

  try {
    const updated = resource === "warehouses"
      ? await updateWarehouse(tenantId(req), id, req.body || {})
      : await updateTaxonomyResource(resource, id, tenantId(req), req.body || {});
    if (!updated) {
      return res.status(404).json({ success: false, message: `${resource.slice(0, -1)} not found` });
    }
    const enriched = await getTaxonomyResource(resource, id, { tenantId: tenantId(req) });
    return res.json({ success: true, data: enriched || updated });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/taxonomy/:resource/:id", requireRole(managerRoles), async (req, res, next) => {
  const { resource, id } = req.params;
  if (!writeResources.has(resource)) return next();

  if (req.body?.confirmDelete !== true && req.query?.confirmDelete !== "true") {
    return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
  }

  try {
    const existing = await getTaxonomyResource(resource, id, { tenantId: tenantId(req) });
    const result = resource === "warehouses"
      ? await deleteWarehouse(tenantId(req), id)
      : await deleteTaxonomyResource(resource, id, tenantId(req));
    if (!result) {
      return res.status(404).json({ success: false, message: `${resource.slice(0, -1)} not found` });
    }
    const softDeleted = result.deletionMode === "soft";
    const data = softDeleted
      ? await getTaxonomyResource(resource, id, { tenantId: tenantId(req) })
      : existing || result.row;
    const label = result.label || resource.slice(0, -1);
    return res.json({
      success: true,
      data,
      softDeleted,
      message: softDeleted
        ? `${label} is referenced and has been set to inactive.`
        : `${label} deleted successfully.`,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
