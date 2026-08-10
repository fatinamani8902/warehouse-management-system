import express from "express";
import { requireRole } from "../middlewares/auth.js";
import * as outboundService from "../services/outboundService.js";

const router = express.Router();
const viewRoles = [
  "superadmin", "hqadmin", "admin", "manager", "warehousemanager",
  "storemanager", "storeoperator", "warehouseoperator",
  "warehouseclerk", "storekeeper", "auditor",
];
const assignRoles = ["superadmin", "hqadmin", "manager", "warehousemanager", "storemanager"];
const operatorRoles = ["storeoperator", "warehouseoperator", "warehouseclerk", "storekeeper"];

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

router.get("/pick-lists", requireRole(viewRoles), asyncRoute(async (req, res) => {
  const result = await outboundService.listPickingTasks(req.context, req.query);
  res.json({
    success: true,
    data: result.items,
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}));

router.get("/pick-lists/:pickListId", requireRole(viewRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.getPickingTask(req.context, req.params.pickListId);
  if (!data) return res.status(404).json({ success: false, message: "Pick list not found" });
  return res.json({ success: true, data });
}));

router.get("/operators", requireRole(assignRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.getPickingOperators(req.context);
  res.json({ success: true, data });
}));

router.post("/pick-lists/:pickListId/assign", requireRole(assignRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.assignPickingTask(
    req.context,
    req.params.pickListId,
    req.body?.assignedToUserId
  );
  res.json({ success: true, message: "Pick list assigned", data });
}));

router.post("/pick-lists/:pickListId/status", requireRole(operatorRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.updatePickingStatus(req.context, req.params.pickListId, req.body?.status);
  res.json({ success: true, data });
}));

router.post("/pick-lists/:pickListId/lines/:lineId/scan-unit", requireRole(operatorRoles), asyncRoute(async (req, res) => {
  const current = await outboundService.getPickingTask(req.context, req.params.pickListId);
  const line = current?.lines?.find((item) => item.line_id === req.params.lineId);
  if (!line) return res.status(404).json({ success: false, message: "Pick task not found" });
  const data = await outboundService.updatePickLine(
    req.context,
    req.params.pickListId,
    req.params.lineId,
    Number(line.qty_picked || 0) + 1
  );
  res.json({ success: true, data, scan_count: Number(data.picked_qty), qty_required: Number(data.qty) });
}));

router.post("/pick-lists/:pickListId/lines/:lineId/undo-scan", requireRole(operatorRoles), asyncRoute(async (req, res) => {
  const current = await outboundService.getPickingTask(req.context, req.params.pickListId);
  const line = current?.lines?.find((item) => item.line_id === req.params.lineId);
  if (!line) return res.status(404).json({ success: false, message: "Pick task not found" });
  const data = await outboundService.updatePickLine(
    req.context,
    req.params.pickListId,
    req.params.lineId,
    Math.max(0, Number(line.qty_picked || 0) - 1)
  );
  res.json({ success: true, data, scan_count: Number(data.picked_qty), qty_required: Number(data.qty) });
}));

async function manualPick(req, res) {
  const data = await outboundService.updatePickLine(
    req.context,
    req.params.pickListId,
    req.params.lineId,
    req.body?.qty_picked
  );
  res.json({ success: true, data, line_completed: Number(data.picked_qty) >= Number(data.qty) });
}

router.post("/pick-lists/:pickListId/lines/:lineId/manual-pick", requireRole(operatorRoles), asyncRoute(manualPick));
router.post("/pick-lists/:pickListId/lines/:lineId/confirm", requireRole(operatorRoles), asyncRoute(manualPick));

router.post("/pick-lists/:pickListId/complete", requireRole(operatorRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.completePickingTask(req.context, req.params.pickListId);
  res.json({ success: true, message: "Pick list completed", data });
}));

export default router;
