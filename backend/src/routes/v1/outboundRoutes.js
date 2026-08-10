import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import * as controller from "../../controllers/outboundController.js";

const router = express.Router();

const viewRoles = [
  "superadmin", "hqadmin", "admin", "manager", "warehousemanager",
  "storemanager", "storeoperator", "warehouseoperator",
  "warehouseclerk", "storekeeper", "auditor",
];
const createRoles = ["superadmin", "hqadmin", "admin"];
const releaseRoles = ["superadmin", "hqadmin", "admin", "manager", "warehousemanager", "storemanager"];
const operatorRoles = ["storeoperator", "warehouseoperator", "warehouseclerk", "storekeeper"];
const shippingControlRoles = ["manager", "warehousemanager", "storemanager"];

router.get("/orders", requireRole(viewRoles), controller.listOrders);
router.post("/orders", requireRole(createRoles), controller.createOrder);
router.post("/orders/:id/lines", requireRole(createRoles), controller.addOrderLine);
router.post("/orders/:id/release", requireRole(releaseRoles), controller.releaseOrder);
router.post("/orders/:id/cancel", requireRole(createRoles), controller.cancelOrder);
router.get("/orders/:id", requireRole(viewRoles), controller.getOrder);
router.put("/orders/:id", requireRole(createRoles), controller.updateOrder);
router.delete("/orders/:id", requireRole(createRoles), controller.deleteOrder);

router.get("/picking/tasks", requireRole(viewRoles), controller.listPickingTasks);
router.post("/picking/tasks/:id/start", requireRole(operatorRoles), controller.startPickingTask);
router.post("/picking/scan", requireRole(operatorRoles), controller.processPickingScan);
router.post("/picking/tasks/:id/complete", requireRole(operatorRoles), controller.completePickingTask);

router.post("/shipping/confirm", requireRole(shippingControlRoles), controller.confirmShipping);

export default router;
