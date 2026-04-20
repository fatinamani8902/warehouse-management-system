import express from "express";
import {
  listPutawayTasks,
  getPutawayTask,
  assignPutawayTask,
  recomputePutawaySuggestedBin,
  markPutawayTaskException,
  completePutawayTask,
  listPutawayTaskEvents,
  listAssignableOperators,
} from "../../data/store.js";

const router = express.Router();

// LIST TASKS
router.get("/putaway-tasks", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 10;
    const search = String(req.query.search || "").trim();

    const result = listPutawayTasks({
      tenantId,
      warehouseId,
      page,
      pageSize,
      search,
      filters: {
        status: String(req.query.status || "").trim().toLowerCase(),
        priority: String(req.query.priority || "").trim().toLowerCase(),
        source: String(req.query.source || "").trim(),
        suggestedBin: String(req.query.suggestedBin || "").trim(),
        grn: String(req.query.grn || "").trim(),
        sku: String(req.query.sku || "").trim(),
      },
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ OPERATORS — mesti sebelum /:id
router.get("/putaway-tasks/operators", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const operators = listAssignableOperators(tenantId, warehouseId);
    res.json(operators);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET TASK DETAIL
router.get("/putaway-tasks/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const task = getPutawayTask(tenantId, req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ASSIGN TASK
router.post("/putaway-tasks/:id/assign", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const { assignedToUserId } = req.body;

    if (!assignedToUserId) {
      return res.status(400).json({ message: "assignedToUserId is required" });
    }

    const result = assignPutawayTask({
      tenantId,
      taskId: req.params.id,
      assignedToUserId,
      actorUserId: req.user_id || "USR000001",
      warehouseId,
    });

    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// RECOMPUTE BIN
router.post("/putaway-tasks/:id/recompute-bin", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const result = recomputePutawaySuggestedBin({
      tenantId,
      taskId: req.params.id,
      actorUserId: req.user_id || "USR000001",
    });

    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// MARK EXCEPTION
router.post("/putaway-tasks/:id/mark-exception", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ message: "reason is required" });

    const result = markPutawayTaskException({
      tenantId,
      taskId: req.params.id,
      reason,
      actorUserId: req.user_id || "USR000001",
    });

    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// COMPLETE TASK
router.post("/putaway-tasks/:id/complete", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const warehouseId = req.headers["x-warehouse-id"] || null;
    const { actual_bin_code } = req.body;

    if (!actual_bin_code) {
      return res.status(400).json({ message: "actual_bin_code is required" });
    }

    const result = completePutawayTask({
      tenantId,
      taskId: req.params.id,
      actualBinCode: actual_bin_code,
      actorUserId: req.user_id || "USR000001",
      warehouseId,
    });

    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// HISTORY
router.get("/putaway-tasks/:id/history", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || "TNT000001";
    const events = listPutawayTaskEvents(tenantId, req.params.id);
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;