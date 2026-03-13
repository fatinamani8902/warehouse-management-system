import express from "express";
import { verifyClerkJwt, requireRole } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";

import {
  listSchema,
  createOrderSchema,
  updateOrderSchema,
  idSchema,
  listPickingTasksSchema,
  pickingScanSchema,
  shippingConfirmSchema,
} from "../../validators/outboundValidators.js";

import {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  listPickingTasks,
  startPickingTask,
  processPickingScan,
  completePickingTask,
  confirmShipping,
  releaseOrder, // ✅ NEW
} from "../../controllers/outboundController.js";

const router = express.Router();

/* --------------------------
   Outbound Orders
-------------------------- */

router.get(
  "/orders",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
    "storekeeper",
  ]),
  validate(listSchema),
  listOrders
);

router.get(
  "/orders/:id",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
    "storekeeper",
  ]),
  validate(idSchema),
  getOrder
);

router.post(
  "/orders",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
  ]),
  validate(createOrderSchema),
  createOrder
);

router.put(
  "/orders/:id",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
  ]),
  validate(updateOrderSchema),
  updateOrder
);

router.delete(
  "/orders/:id",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
  ]),
  validate(idSchema),
  deleteOrder
);

/* --------------------------
   RELEASE ORDER
   (Generate Pick List)
-------------------------- */

router.post(
  "/orders/:id/release",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
  ]),
  releaseOrder
);

/* --------------------------
   Picking Operations
-------------------------- */

router.get(
  "/picking/tasks",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
    "storekeeper",
  ]),
  validate(listPickingTasksSchema),
  listPickingTasks
);

router.post(
  "/picking/tasks/:id/start",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
    "storekeeper",
  ]),
  validate(idSchema),
  startPickingTask
);

router.post(
  "/picking/scan",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
    "storekeeper",
  ]),
  validate(pickingScanSchema),
  processPickingScan
);

router.post(
  "/picking/tasks/:id/complete",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
    "storekeeper",
  ]),
  validate(idSchema),
  completePickingTask
);

/* --------------------------
   Shipping
-------------------------- */

router.post(
  "/shipping/confirm",
  verifyClerkJwt,
  requireRole([
    "superadmin",
    "hqadmin",
    "storemanager",
    "warehousemanager",
  ]),
  validate(shippingConfirmSchema),
  confirmShipping
);

export default router;