import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import {
  addCycleCountEntry,
  approveCycleCount,
  assignCycleCount,
  cancelCycleCount,
  createCycleCount,
  getCycleCount,
  listCycleCountOperators,
  listCycleCounts,
  rejectCycleCount,
  startCycleCount,
  submitCycleCount,
  updateCycleCount,
} from "../../services/cycleCountService.js";

const router = express.Router();
const viewRoles = [
  "superadmin",
  "hqadmin",
  "warehousemanager",
  "manager",
  "storemanager",
  "operator",
  "storeoperator",
  "warehouseoperator",
  "auditor",
];
const creatorRoles = ["superadmin", "hqadmin"];
const assignRoles = ["superadmin", "hqadmin"];
const executionRoles = ["operator", "storeoperator", "warehouseoperator"];
const approvalRoles = ["superadmin", "warehousemanager", "manager"];
const cancelRoles = ["superadmin", "hqadmin"];

router.get("/count-plans", requireRole(viewRoles), async (req, res, next) => {
  try {
    return res.json(await listCycleCounts(req.context, {
      ...req.query,
      zoneId: req.query.zone_id,
    }));
  } catch (error) {
    return next(error);
  }
});

router.get("/count-plans/operators", requireRole(assignRoles), async (req, res, next) => {
  try {
    return res.json(await listCycleCountOperators(req.context));
  } catch (error) {
    return next(error);
  }
});

router.get("/count-plans/:id", requireRole(viewRoles), async (req, res, next) => {
  try {
    return res.json(await getCycleCount(req.context, req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.post("/count-plans", requireRole(creatorRoles), async (req, res, next) => {
  try {
    return res.status(201).json(await createCycleCount(req.context, req.body));
  } catch (error) {
    return next(error);
  }
});

router.patch("/count-plans/:id", requireRole(creatorRoles), async (req, res, next) => {
  try {
    return res.json(await updateCycleCount(req.context, req.params.id, req.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/count-plans/:id/assign", requireRole(assignRoles), async (req, res, next) => {
  try {
    return res.json(await assignCycleCount(req.context, req.params.id, req.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/count-plans/:id/start", requireRole(executionRoles), async (req, res, next) => {
  try {
    return res.json(await startCycleCount(req.context, req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.post("/count-plans/:id/entries", requireRole(executionRoles), async (req, res, next) => {
  try {
    return res.json(await addCycleCountEntry(req.context, req.params.id, req.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/count-plans/:id/submit", requireRole(executionRoles), async (req, res, next) => {
  try {
    return res.json(await submitCycleCount(req.context, req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.post("/count-plans/:id/approve", requireRole(approvalRoles), async (req, res, next) => {
  try {
    return res.json(await approveCycleCount(req.context, req.params.id, req.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/count-plans/:id/reject", requireRole(approvalRoles), async (req, res, next) => {
  try {
    return res.json(await rejectCycleCount(req.context, req.params.id, req.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/count-plans/:id/cancel", requireRole(cancelRoles), async (req, res, next) => {
  try {
    return res.json(await cancelCycleCount(req.context, req.params.id, req.body));
  } catch (error) {
    return next(error);
  }
});

export default router;
