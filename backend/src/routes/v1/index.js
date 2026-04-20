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
import rmaRoutes from "../rma.js";
import traceRoutes from "../trace.js";
import usersRoutes from "./usersRoutes.js";
import lovRoutes from "./lovRoutes.js";
import auditRoutes from "./auditRoutes.js";
import returnsRoutes from "../returns.js";

const router = express.Router();

router.use("/auth", authRoutes);         // prefix /auth
router.use("/master", masterDataRoutes);
router.use("/inbound", inboundRoutes);
router.use(putawayRoutes);               // ada prefix /putaway-tasks dalam file
router.use("/outbound", outboundRoutes); // prefix /outbound
router.use("/inventory", inventoryRoutes);
router.use("/picking", pickingRoutes);
router.use("/packing", packingRoutes);
router.use("/shipping", shippingRoutes);
router.use("/returns", returnsRoutes);
router.use("/rma", rmaRoutes);
router.use("/trace", traceRoutes);
router.use("/users", usersRoutes);
router.use("/lov", lovRoutes);
router.use("/audit", auditRoutes);

export default router;