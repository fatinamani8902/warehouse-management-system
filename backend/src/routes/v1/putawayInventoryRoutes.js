import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import { ApiError } from "../../utils/errors.js";
import {
  getPutawayTask,
  listPutawayTaskHistory,
  listPutawayTasks,
  markPutawayTaskException,
  recomputePutawayBin,
} from "../../repositories/PutawayRepository.js";
import { completePutawayInventory } from "../../services/putawayCompletionService.js";
import {
  assignPutawayTask,
  listAssignablePutawayOperators,
} from "../../services/putawayAssignmentService.js";

const router = express.Router();
const viewRoles = [
  "superadmin",
  "hqadmin",
  "storemanager",
  "storeoperator",
  "warehouseoperator",
  "readonly",
  "viewer",
  "warehousemanager",
  "storekeeper",
  "warehouseclerk",
];
const completionRoles = [
  "storeoperator",
  "warehouseoperator",
  "storekeeper",
  "warehouseclerk",
];
const assignmentRoles = [
  "superadmin",
  "hqadmin",
  "storemanager",
  "warehousemanager",
];
const exceptionRoles = [...assignmentRoles];
const recomputeRoles = ["superadmin", "hqadmin"];

function clean(value) {
  return String(value ?? "").trim();
}

router.post(
  "/putaway-tasks/:taskId/complete",
  requireRole(completionRoles),
  async (req, res, next) => {
    try {
      const result = await completePutawayInventory({
        tenantId: req.context.tenantId,
        warehouseId: req.context.warehouseId,
        taskId: req.params.taskId,
        destinationLocationId: req.body?.destination_location_id,
        userId: req.context.userId,
      });
      return res.json({
        success: true,
        message: result.idempotent
          ? "Putaway task was already completed; inventory was not moved again"
          : "Putaway task completed and inventory moved to storage",
        task: await getPutawayTask(req.context, result.task.putaway_task_id),
        inventory_transaction: result.transaction,
        inventory_balances: result.balances,
        idempotent: result.idempotent,
      });
    } catch (error) {
      if (error?.code === "PUTAWAY_NOT_ASSIGNED") {
        return res.status(400).json({
          success: false,
          code: "PUTAWAY_NOT_ASSIGNED",
          message: "Putaway task must be assigned before completion.",
        });
      }
      return next(error);
    }
  }
);

router.get("/putaway-tasks", requireRole(viewRoles), async (req, res, next) => {
  try {
    return res.json(await listPutawayTasks(req.context, req.query || {}));
  } catch (error) {
    return next(error);
  }
});

router.get("/putaway-tasks/operators", requireRole(assignmentRoles), async (req, res, next) => {
  try {
    return res.json(await listAssignablePutawayOperators(req.context));
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/putaway-tasks/:taskId/assign",
  requireRole(assignmentRoles),
  async (req, res, next) => {
    try {
      const result = await assignPutawayTask(
        req.context,
        req.params.taskId,
        req.body?.assignedToUserId,
      );
      const task = await getPutawayTask(req.context, result.putawayTaskId);
      return res.json({
        success: true,
        message: `Task assigned to ${result.operator.user_name}`,
        task,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/putaway-tasks/:taskId/recompute-bin",
  requireRole(recomputeRoles),
  async (req, res, next) => {
    try {
      const task = await recomputePutawayBin(req.context, req.params.taskId);
      return res.json({
        success: true,
        message: "Suggested putaway bin recomputed",
        task: await getPutawayTask(req.context, task),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/putaway-tasks/:taskId/mark-exception",
  requireRole(exceptionRoles),
  async (req, res, next) => {
    try {
      const reason = clean(req.body?.reason);
      if (reason.length < 5) {
        throw new ApiError(
          400,
          "PUTAWAY_EXCEPTION_REASON_INVALID",
          "Exception reason must be at least 5 characters",
        );
      }
      const taskId = await markPutawayTaskException(req.context, req.params.taskId, reason);
      return res.json({
        success: true,
        message: "Putaway task marked as exception",
        task: await getPutawayTask(req.context, taskId),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/putaway-tasks/:taskId/history",
  requireRole(viewRoles),
  async (req, res, next) => {
    try {
      return res.json(await listPutawayTaskHistory(req.context, req.params.taskId));
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/putaway-tasks/:taskId", requireRole(viewRoles), async (req, res, next) => {
  try {
    const task = await getPutawayTask(req.context, req.params.taskId);
    if (!task) {
      throw new ApiError(404, "PUTAWAY_TASK_NOT_FOUND", "Putaway task not found");
    }
    return res.json(task);
  } catch (error) {
    return next(error);
  }
});

export default router;
