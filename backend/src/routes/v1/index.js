import express from "express";
import authRoutes from "./authRoutes.js";
import masterDataRoutes from "./masterDataRoutes.js";
import inboundRoutes from "./inboundRoutes.js";
import putawayRoutes from "./putawayRoutes.js";
import outboundRoutes from "./outboundRoutes.js";
import inventoryRoutes from "./inventoryRoutes.js";
import pickingRoutes from "../picking.js";
import packingRoutes from "../packing.js";
import shippingRoutes from "../shipping.js";
import rmaRoutes from "./rmaRoutes.js";
import traceRoutes from "../trace.js";
import usersRoutes from "./usersRoutes.js";
import lovRoutes from "./lovRoutes.js";

const router = express.Router();

router.use(authRoutes);
router.use("/master", masterDataRoutes);
router.use("/inbound", inboundRoutes);
router.use(putawayRoutes);
router.use(outboundRoutes);
router.use(inventoryRoutes);
router.use(pickingRoutes);
router.use(packingRoutes);
router.use("/shipping", shippingRoutes);
router.use(rmaRoutes);
router.use("/trace", traceRoutes);
router.use("/users", usersRoutes);
router.use("/lov", lovRoutes);

export default router;
