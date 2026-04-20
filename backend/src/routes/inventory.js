import express from "express";
import { body, param, query } from "express-validator";
import {
  addCountEntry,
  approveAdjustmentRequest,
  approveCountPlan,
  cancelAdjustmentRequest,
  cancelCountPlan,
  createAdjustmentRequest,
  createCountPlan,
  getInventoryConfig,
  hydrateCountPlan,
  listAdjustmentRequests,
  listCountPlans,
  listInventoryLocations,
  listInventoryReasonCodes,
  listInventorySummary,
  listInventoryTransactions,
  listInventoryZones,
  listSkus,
  rejectAdjustmentRequest,
  rejectCountPlan,
  submitAdjustmentRequest,
  submitCountPlan,
} from "../data/store.js";
import { createSimpleRateLimiter } from "../middleware/rateLimit.js";
import { handleValidationResult } from "../middleware/validation.js";
import { recordAuditEvent } from "../services/auditLog.js";
import {
  canApproveAdjustment,
  canApproveCountPlan,
  canCancelAdjustment,
  canCancelCountPlan,
  canCreateAdjustment,
  canCreateCountPlan,
  canExecuteCountPlan,
  canRejectAdjustment,
  canRejectCountPlan,
  canSubmitAdjustment,
  canSubmitCountPlan,
  canViewAdjustments,
  canViewCountPlans,
  canViewInventorySummary,
  canViewInventoryTransactions,
} from "../services/rbac.js";

const router = express.Router();

const writeRateLimit = createSimpleRateLimiter({
  windowMs: 60_000,
  max: 50,
});

function resolveWarehouseScope(roleId, warehouseId) {
  if (["storemanager", "storeoperator"].includes(roleId)) {
    return warehouseId || null;
  }
  return null;
}

function mapErrorToStatus(errorMessage) {
  if (!errorMessage) {
    return 400;
  }
  if (String(errorMessage).toLowerCase().includes("not found")) {
    return 404;
  }
  return 400;
}

router.get("/options", (req, res) => {
  if (!canViewCountPlans(req.session.role_id)) {
    return res.status(403).json({ message: "You do not have permission to view inventory options" });
  }

  const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
  return res.json({
    zones: listInventoryZones(req.tenant_id, warehouseScope),
    locations: listInventoryLocations(req.tenant_id, warehouseScope),
    skus: listSkus(req.tenant_id, { pageSize: 999 })?.items || [],
    reason_codes: listInventoryReasonCodes(req.tenant_id),
    count_config: getInventoryConfig(req.tenant_id),
  });
});

router.get(
  "/summary",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be between 1 and 100"),
    query("search").optional().isString().trim(),
    query("sku").optional().isString().trim(),
    query("location").optional().isString().trim(),
    query("zone").optional().isString().trim(),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canViewInventorySummary(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to view inventory summary" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = listInventorySummary({
      tenantId: req.tenant_id,
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 10),
      search: req.query.search || "",
      skuId: req.query.sku || "",
      locationId: req.query.location || "",
      zoneId: req.query.zone || "",
      warehouseId: warehouseScope,
    });

    return res.json(result);
  },
);

router.get(
  "/transactions",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be between 1 and 100"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canViewInventoryTransactions(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to view inventory transactions" });
    }

    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 10);
    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const rows = listInventoryTransactions(req.tenant_id, warehouseScope);
    const offset = (page - 1) * pageSize;

    return res.json({
      items: rows.slice(offset, offset + pageSize),
      total: rows.length,
      page,
      pageSize,
    });
  },
);

router.get(
  "/count-plans",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be between 1 and 100"),
    query("search").optional().isString().trim(),
    query("status").optional().isString().trim(),
    query("zone").optional().isString().trim(),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canViewCountPlans(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to view count plans" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = listCountPlans({
      tenantId: req.tenant_id,
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 10),
      search: req.query.search || "",
      status: req.query.status || "",
      zoneId: req.query.zone || "",
      warehouseId: warehouseScope,
    });

    return res.json(result);
  },
);

router.post(
  "/count-plans",
  writeRateLimit,
  [
    body("zone_id").trim().matches(/^ZN\d{3}$/).withMessage("zone_id format is invalid"),
    body("planned_date").optional().isISO8601().withMessage("planned_date must be a valid date"),
    body("scope_type").optional().isIn(["FULL_ZONE", "BY_LOCATION", "BY_SKU"]).withMessage("scope_type is invalid"),
    body("scope_location_id").optional({ values: "falsy" }).matches(/^LOC\d{6}$/).withMessage("scope_location_id format is invalid"),
    body("scope_sku_ids").optional().isArray().withMessage("scope_sku_ids must be an array"),
    body("scope_sku_ids.*").optional().matches(/^SKU\d{6}$/).withMessage("scope_sku_ids contains invalid sku_id"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canCreateCountPlan(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to create count plans" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = createCountPlan({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope || req.session.warehouse_id || null,
      userId: req.session.user_id,
      zoneId: req.body.zone_id,
      plannedDate: req.body.planned_date,
      scopeType: req.body.scope_type || "FULL_ZONE",
      scopeLocationId: req.body.scope_location_id || null,
      scopeSkuIds: Array.isArray(req.body.scope_sku_ids) ? req.body.scope_sku_ids : [],
    });

    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "count_plan",
      entity_id: result.data.count_id,
      action: "create",
      message: `Count plan ${result.data.count_id} created`,
    });

    return res.status(201).json(result.data);
  },
);

router.get(
  "/count-plans/:countId",
  [
    param("countId").matches(/^CC\d{6}$/).withMessage("countId format is invalid"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canViewCountPlans(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to view count plans" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const data = hydrateCountPlan(req.tenant_id, req.params.countId, warehouseScope);
    if (!data) {
      return res.status(404).json({ message: "Count plan not found" });
    }

    return res.json(data);
  },
);

router.post(
  "/count-plans/:countId/entries",
  writeRateLimit,
  [
    param("countId").matches(/^CC\d{6}$/).withMessage("countId format is invalid"),
    body("line_id").optional({ values: "falsy" }).matches(/^CCL\d{6}$/).withMessage("line_id format is invalid"),
    body("scan_mode").isIn(["QR", "RFID", "MANUAL"]).withMessage("scan_mode must be QR, RFID or MANUAL"),
    body("scanned_value").optional().isString().trim(),
    body("qty_counted").isFloat({ min: 0 }).withMessage("qty_counted must be greater than or equal to 0"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canExecuteCountPlan(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to execute count plans" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = addCountEntry({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      countId: req.params.countId,
      lineId: req.body.line_id || null,
      scanMode: req.body.scan_mode,
      scannedValue: req.body.scanned_value || "",
      qtyCounted: req.body.qty_counted,
      scannedBy: req.session.user_id,
    });

    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "count_plan",
      entity_id: req.params.countId,
      action: "execute_entry",
      message: `Cycle count entry posted for ${req.params.countId}`,
    });

    return res.json(result.data);
  },
);

router.post(
  "/count-plans/:countId/submit",
  writeRateLimit,
  [
    param("countId").matches(/^CC\d{6}$/).withMessage("countId format is invalid"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canSubmitCountPlan(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to submit count plans" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = submitCountPlan({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      countId: req.params.countId,
      submittedBy: req.session.user_id,
    });
    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "count_plan",
      entity_id: req.params.countId,
      action: "submit",
      message: `Count plan ${req.params.countId} submitted`,
    });

    return res.json(result.data);
  },
);

router.post(
  "/count-plans/:countId/approve",
  writeRateLimit,
  [
    param("countId").matches(/^CC\d{6}$/).withMessage("countId format is invalid"),
    body("reason_code").trim().isLength({ min: 2 }).withMessage("reason_code is required"),
    body("approval_note").optional().isString().trim(),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canApproveCountPlan(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to approve count plans" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = approveCountPlan({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      countId: req.params.countId,
      approvedBy: req.session.user_id,
      reasonCode: req.body.reason_code,
      approvalNote: req.body.approval_note || "",
    });
    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "count_plan",
      entity_id: req.params.countId,
      action: "approve",
      message: `Count plan ${req.params.countId} approved`,
    });

    return res.json(result.data);
  },
);

router.post(
  "/count-plans/:countId/reject",
  writeRateLimit,
  [
    param("countId").matches(/^CC\d{6}$/).withMessage("countId format is invalid"),
    body("reason").trim().isLength({ min: 5 }).withMessage("reason must be at least 5 characters"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canRejectCountPlan(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to reject count plans" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = rejectCountPlan({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      countId: req.params.countId,
      approvedBy: req.session.user_id,
      reason: req.body.reason,
    });
    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "count_plan",
      entity_id: req.params.countId,
      action: "reject",
      message: `Count plan ${req.params.countId} rejected`,
    });

    return res.json(result.data);
  },
);

router.post(
  "/count-plans/:countId/cancel",
  writeRateLimit,
  [
    param("countId").matches(/^CC\d{6}$/).withMessage("countId format is invalid"),
    body("reason").trim().isLength({ min: 5 }).withMessage("reason must be at least 5 characters"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canCancelCountPlan(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to cancel count plans" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = cancelCountPlan({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      countId: req.params.countId,
      cancelledBy: req.session.user_id,
      reason: req.body.reason,
    });
    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "count_plan",
      entity_id: req.params.countId,
      action: "cancel",
      message: `Count plan ${req.params.countId} cancelled`,
    });

    return res.json(result.data);
  },
);

router.get(
  "/adjustments",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be between 1 and 100"),
    query("search").optional().isString().trim(),
    query("status")
      .optional()
      .trim()
      .toUpperCase()
      .isIn(["OPEN", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"])
      .withMessage("status must be one of OPEN, DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED"),
    query("sku").optional().isString().trim(),
    query("location").optional().isString().trim(),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canViewAdjustments(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to view adjustments" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = listAdjustmentRequests({
      tenantId: req.tenant_id,
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 10),
      search: req.query.search || "",
      status: req.query.status || "",
      skuId: req.query.sku || "",
      locationId: req.query.location || "",
      warehouseId: warehouseScope,
    });
    return res.json(result);
  },
);

router.post(
  "/adjustments",
  writeRateLimit,
  [
    body("sku_id").trim().matches(/^SKU\d{6}$/).withMessage("sku_id format is invalid"),
    body("location_id").trim().matches(/^LOC\d{6}$/).withMessage("location_id format is invalid"),
    body("qty_delta").isFloat({ ne: 0 }).withMessage("qty_delta must be a non-zero number"),
    body("reason_code").trim().isLength({ min: 2 }).withMessage("reason_code is required"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canCreateAdjustment(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to create adjustments" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = createAdjustmentRequest({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope || req.session.warehouse_id || null,
      requestedBy: req.session.user_id,
      skuId: req.body.sku_id,
      locationId: req.body.location_id,
      qtyDelta: req.body.qty_delta,
      reasonCode: req.body.reason_code,
    });

    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "adjustment",
      entity_id: result.data.adj_id,
      action: "create",
      message: `Adjustment request ${result.data.adj_id} created`,
    });

    return res.status(201).json(result.data);
  },
);

router.post(
  "/adjustments/:adjId/submit",
  writeRateLimit,
  [
    param("adjId").matches(/^ADJ\d{6}$/).withMessage("adjId format is invalid"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canSubmitAdjustment(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to submit adjustments" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = submitAdjustmentRequest({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      adjId: req.params.adjId,
    });

    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "adjustment",
      entity_id: req.params.adjId,
      action: "submit",
      message: `Adjustment request ${req.params.adjId} submitted`,
    });

    return res.json(result.data);
  },
);

router.post(
  "/adjustments/:adjId/approve",
  writeRateLimit,
  [
    param("adjId").matches(/^ADJ\d{6}$/).withMessage("adjId format is invalid"),
    body("approval_note").optional().isString().trim(),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canApproveAdjustment(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to approve adjustments" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = approveAdjustmentRequest({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      adjId: req.params.adjId,
      approvedBy: req.session.user_id,
      approvalNote: req.body.approval_note || "",
    });

    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "adjustment",
      entity_id: req.params.adjId,
      action: "approve",
      message: `Adjustment request ${req.params.adjId} approved`,
    });

    return res.json(result.data);
  },
);

router.post(
  "/adjustments/:adjId/reject",
  writeRateLimit,
  [
    param("adjId").matches(/^ADJ\d{6}$/).withMessage("adjId format is invalid"),
    body("reason").trim().isLength({ min: 5 }).withMessage("reason must be at least 5 characters"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canRejectAdjustment(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to reject adjustments" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = rejectAdjustmentRequest({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      adjId: req.params.adjId,
      approvedBy: req.session.user_id,
      reason: req.body.reason,
    });

    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "adjustment",
      entity_id: req.params.adjId,
      action: "reject",
      message: `Adjustment request ${req.params.adjId} rejected`,
    });

    return res.json(result.data);
  },
);

router.post(
  "/adjustments/:adjId/cancel",
  writeRateLimit,
  [
    param("adjId").matches(/^ADJ\d{6}$/).withMessage("adjId format is invalid"),
    body("reason").trim().isLength({ min: 5 }).withMessage("reason must be at least 5 characters"),
    handleValidationResult,
  ],
  (req, res) => {
    if (!canCancelAdjustment(req.session.role_id)) {
      return res.status(403).json({ message: "You do not have permission to cancel adjustments" });
    }

    const warehouseScope = resolveWarehouseScope(req.session.role_id, req.session.warehouse_id);
    const result = cancelAdjustmentRequest({
      tenantId: req.tenant_id,
      warehouseId: warehouseScope,
      adjId: req.params.adjId,
      cancelledBy: req.session.user_id,
      reason: req.body.reason,
    });

    if (result.error) {
      return res.status(mapErrorToStatus(result.error)).json({ message: result.error });
    }

    recordAuditEvent({
      tenant_id: req.tenant_id,
      user_id: req.session.user_id,
      entity_type: "adjustment",
      entity_id: req.params.adjId,
      action: "cancel",
      message: `Adjustment request ${req.params.adjId} cancelled`,
    });

    return res.json(result.data);
  },
);

export default router;
