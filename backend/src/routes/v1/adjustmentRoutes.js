import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import {
  approveAdjustment,
  cancelAdjustment,
  createAdjustment,
  getAdjustment,
  listAdjustments,
  rejectAdjustment,
  submitAdjustment,
} from "../../services/adjustmentService.js";

const router = express.Router();
const viewRoles = [
  "superadmin",
  "hqadmin",
  "admin",
  "manager",
  "storemanager",
  "warehousemanager",
  "storeoperator",
  "warehouseoperator",
  "auditor",
];
const managerRoles = ["superadmin", "hqadmin", "storemanager", "warehousemanager"];
const creatorRoles = ["superadmin", "hqadmin", "storemanager", "warehousemanager", "storeoperator"];

router.get("/adjustments", requireRole(viewRoles), async (req, res, next) => {
  try {
    return res.json(await listAdjustments(req.context, req.query));
  } catch (error) {
    return next(error);
  }
});

router.get("/adjustments/:id", requireRole(viewRoles), async (req, res, next) => {
  try {
    return res.json(await getAdjustment(req.context, req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.post("/adjustments", requireRole(creatorRoles), async (req, res, next) => {
  try {
    return res.status(201).json(await createAdjustment(req.context, req.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/adjustments/:id/submit", requireRole(creatorRoles), async (req, res, next) => {
  try {
    return res.json(await submitAdjustment(req.context, req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.post("/adjustments/:id/approve", requireRole(managerRoles), async (req, res, next) => {
  try {
    const result = await approveAdjustment(req.context, req.params.id, req.body);
    return res.json({
      ...result.adjustment,
      message: result.idempotent
        ? "Adjustment was already approved; inventory was not posted again"
        : "Adjustment approved and inventory updated",
      inventory_transaction: result.transaction,
      inventory_balances: result.balances,
      idempotent: result.idempotent,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/adjustments/:id/reject", requireRole(managerRoles), async (req, res, next) => {
  try {
    return res.json(await rejectAdjustment(req.context, req.params.id, req.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/adjustments/:id/cancel", requireRole(managerRoles), async (req, res, next) => {
  try {
    return res.json(await cancelAdjustment(req.context, req.params.id, req.body));
  } catch (error) {
    return next(error);
  }
});

export default router;
