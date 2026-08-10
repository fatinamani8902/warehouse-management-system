import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import { ApiError } from "../../utils/errors.js";
import {
  createAsn,
  getAsn,
  listAsns,
  transitionAsn,
} from "../../services/asnService.js";
import {
  getGrn,
  listEligibleGrnAsns,
  listGrns,
  transitionGrn,
  updateGrnLines,
} from "../../services/grnService.js";

const router = express.Router();

const viewRoles = [
  "superadmin",
  "hqadmin",
  "storeoperator",
  "warehouseoperator",
  "manager",
  "warehousemanager",
  "storemanager",
  "auditor",
];
const asnCreateRoles = ["superadmin", "hqadmin"];
const asnManagementRoles = ["superadmin", "hqadmin", "storemanager"];
const storeOperatorOnly = ["storeoperator"];

const asnActionRoles = {
  submit: asnManagementRoles,
  "mark-in-transit": asnManagementRoles,
  mark_in_transit: asnManagementRoles,
  "mark-arrived": asnManagementRoles,
  mark_arrived: asnManagementRoles,
  close: asnManagementRoles,
  cancel: asnManagementRoles,
};

function tenantId(req) {
  return req.context?.tenantId || req.tenant_id;
}

function contextWithWarehousePayload(req) {
  return {
    ...req.context,
    tenantId: tenantId(req),
    userId: req.context?.userId || req.user_id,
    warehouseId: req.context?.warehouseId || req.warehouse_id,
  };
}

function withActionRole(action) {
  return requireRole(asnActionRoles[action] || []);
}

function scopedRows(req, rows) {
  const warehouseId = req.context?.warehouseId || req.warehouse_id || null;
  if (!warehouseId) return rows;
  return rows.filter((row) => !row.warehouse_id || row.warehouse_id === warehouseId);
}

function assertWarehouseScope(req, row, type) {
  const warehouseId = req.context?.warehouseId || req.warehouse_id || null;
  if (warehouseId && row?.warehouse_id && row.warehouse_id !== warehouseId) {
    throw new ApiError(404, `${type}_NOT_FOUND`, `${type} not found`);
  }
}

router.get("/asn", requireRole(viewRoles), async (req, res, next) => {
  try {
    const rows = await listAsns(tenantId(req));
    return res.json({ success: true, data: scopedRows(req, rows) });
  } catch (error) {
    return next(error);
  }
});

router.get("/asn/:id", requireRole(viewRoles), async (req, res, next) => {
  try {
    const row = await getAsn(tenantId(req), req.params.id);
    if (!row) throw new ApiError(404, "ASN_NOT_FOUND", "ASN not found");
    assertWarehouseScope(req, row, "ASN");
    return res.json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

router.post("/asn", requireRole(asnCreateRoles), async (req, res, next) => {
  try {
    const row = await createAsn(contextWithWarehousePayload(req), req.body || {});
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

router.post("/asn/:id/:action", (req, res, next) => {
  const middleware = withActionRole(req.params.action);
  return middleware(req, res, next);
}, async (req, res, next) => {
  try {
    if (!asnActionRoles[req.params.action]) {
      throw new ApiError(400, "INVALID_ASN_TRANSITION", `Unknown action: ${req.params.action}`);
    }
    const row = await transitionAsn(
      contextWithWarehousePayload(req),
      req.params.id,
      req.params.action,
      req.body || {},
    );
    return res.json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

router.get("/grn", requireRole(viewRoles), async (req, res, next) => {
  try {
    const rows = await listGrns(tenantId(req), req.query || {});
    return res.json({ success: true, data: scopedRows(req, rows) });
  } catch (error) {
    return next(error);
  }
});

router.get("/grn/eligible-asns", requireRole(viewRoles), async (req, res, next) => {
  try {
    return res.json({
      success: true,
      data: await listEligibleGrnAsns(contextWithWarehousePayload(req)),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/grn/:id", requireRole(viewRoles), async (req, res, next) => {
  try {
    const row = await getGrn(tenantId(req), req.params.id);
    if (!row) throw new ApiError(404, "GRN_NOT_FOUND", "GRN not found");
    assertWarehouseScope(req, row, "GRN");
    return res.json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

router.post("/grn", (_req, _res, next) => {
  return next(new ApiError(404, "NOT_FOUND", "Direct GRN creation is not available"));
});

router.patch("/grn/:id/lines", requireRole(storeOperatorOnly), async (req, res, next) => {
  try {
    const row = await updateGrnLines(contextWithWarehousePayload(req), req.params.id, req.body?.lines);
    return res.json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

router.post("/grn/:id/start_receiving", requireRole(storeOperatorOnly), async (req, res, next) => {
  try {
    const row = await transitionGrn(contextWithWarehousePayload(req), req.params.id, "start_receiving", req.body || {});
    return res.json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

router.post("/grn/:id/complete", requireRole(storeOperatorOnly), async (req, res, next) => {
  try {
    const row = await transitionGrn(contextWithWarehousePayload(req), req.params.id, "complete", req.body || {});
    return res.json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

router.post("/grn/:id/cancel", (_req, _res, next) => {
  return next(new ApiError(404, "NOT_FOUND", "Route not found"));
});

router.post("/cancel", (_req, _res, next) => {
  return next(new ApiError(404, "NOT_FOUND", "Route not found"));
});

export default router;
