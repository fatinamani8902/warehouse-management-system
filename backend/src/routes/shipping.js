import express from "express";
import { requireRole } from "../middlewares/auth.js";
import * as outboundService from "../services/outboundService.js";

const router = express.Router();
const viewRoles = [
  "superadmin", "hqadmin", "admin", "manager", "warehousemanager",
  "storemanager", "storeoperator", "warehouseoperator",
  "warehouseclerk", "storekeeper", "auditor",
];
const controlRoles = ["manager", "warehousemanager", "storemanager"];

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

router.get("/", requireRole(viewRoles), asyncRoute(async (req, res) => {
  const result = await outboundService.listShipping(req.context, req.query);
  res.json({
    success: true,
    data: result.items,
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    summary: result.summary,
  });
}));

router.get("/:id", requireRole(viewRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.getShipping(req.context, req.params.id);
  if (!data) return res.status(404).json({ success: false, message: "Shipment not found" });
  return res.json({ success: true, data });
}));

router.post("/:id/dispatch", requireRole(controlRoles), asyncRoute(async (req, res) => {
  const result = await outboundService.dispatchShipment(req.context, req.params.id, req.body);
  res.json({ success: true, data: result.shipment, idempotent: result.idempotent });
}));

router.post("/:id/close", requireRole(controlRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.closeShipment(req.context, req.params.id);
  res.json({ success: true, data });
}));

router.post("/:id/cancel", requireRole(controlRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.cancelShipment(req.context, req.params.id, req.body?.reason);
  res.json({ success: true, data });
}));

export default router;
