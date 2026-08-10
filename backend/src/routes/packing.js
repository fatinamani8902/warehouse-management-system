import express from "express";
import { requireRole } from "../middlewares/auth.js";
import * as outboundService from "../services/outboundService.js";

const router = express.Router();
const viewRoles = [
  "superadmin", "hqadmin", "admin", "manager", "warehousemanager",
  "storemanager", "storeoperator", "warehouseoperator",
  "warehouseclerk", "storekeeper", "auditor",
];
const controlRoles = ["manager", "warehousemanager", "storemanager", "storeoperator", "warehouseoperator"];

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

router.get("/orders", requireRole(viewRoles), asyncRoute(async (req, res) => {
  const result = await outboundService.listPacking(req.context, req.query);
  res.json({
    success: true,
    data: result.items,
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}));

router.get("/orders/:id", requireRole(viewRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.getPacking(req.context, req.params.id);
  if (!data) return res.status(404).json({ success: false, message: "Pack order not found" });
  return res.json({ success: true, data });
}));

router.get("/options", requireRole(viewRoles), (_req, res) => {
  res.json({
    success: true,
    packaging_types: [
      { value: "standard_box", label: "Standard Box" },
      { value: "pallet", label: "Pallet" },
      { value: "envelope", label: "Envelope" },
    ],
  });
});

router.post("/orders/:id/create-carton", requireRole(controlRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.generatePackingCarton(req.context, req.params.id);
  res.json({
    success: true,
    data: data.packing_task,
    packing_task: data.packing_task,
    carton_id: data.packing_task?.carton_id || null,
    idempotent: data.idempotent,
  });
}));

router.post("/orders/:id/carton", requireRole(controlRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.generatePackingCarton(req.context, req.params.id);
  res.json({
    success: true,
    data: data.packing_task,
    packing_task: data.packing_task,
    carton_id: data.packing_task?.carton_id || null,
    idempotent: data.idempotent,
  });
}));

router.post("/orders/:id/confirm-pack", requireRole(controlRoles), asyncRoute(async (req, res) => {
  const data = await outboundService.confirmPacking(req.context, req.params.id, req.body);
  res.json({
    success: true,
    data: data.packing_task,
    order: data.packing_task,
    shipment: data.shipment,
    idempotent: data.idempotent,
  });
}));

export default router;
