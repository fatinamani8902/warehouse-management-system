import express from "express";
import { requireRole } from "../../middlewares/auth.js";

const router = express.Router();

// ==============================
// STUB DATA
// ==============================
const rmaStub = [
  {
    id: "RMA000001",
    referenceNo: "RET001",
    status: "CREATED",
    reason: "Damaged Item",
    tenantId: "TEN001",
    createdAt: new Date().toISOString(),
  }
];

// ==============================
// LIST RMA
// ==============================
router.get("/rma", requireRole(["superadmin", "hqadmin", "storemanager", "warehousemanager"]), (req, res) => {
  res.json({
    success: true,
    data: rmaStub
  });
});

// ==============================
// GET RMA BY ID
// ==============================
router.get("/rma/:id", requireRole(["superadmin", "hqadmin", "storemanager", "warehousemanager"]), (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.params.id,
      referenceNo: "RET001",
      status: "CREATED",
      reason: "Damaged Item",
      tenantId: "TEN001",
      createdAt: new Date().toISOString(),
    }
  });
});

// ==============================
// CREATE RMA
// ==============================
router.post("/rma", requireRole(["superadmin", "hqadmin", "storemanager", "warehousemanager"]), (req, res) => {
  res.json({
    success: true,
    message: "RMA created successfully",
    data: {
      id: "RMA000002",
      ...req.body,
      status: "CREATED",
      tenantId: "TEN001"
    }
  });
});

// ==============================
// UPDATE RMA
// ==============================
router.put("/rma/:id", requireRole(["superadmin", "hqadmin", "storemanager", "warehousemanager"]), (req, res) => {
  res.json({
    success: true,
    message: "RMA updated successfully",
    data: {
      id: req.params.id,
      ...req.body
    }
  });
});

// ==============================
// DELETE RMA
// ==============================
router.delete("/rma/:id", requireRole(["superadmin", "hqadmin"]), (req, res) => {
  res.json({
    success: true,
    message: `RMA ${req.params.id} deleted successfully`
  });
});

// ==============================
// CANCEL RMA
// ==============================
router.post("/rma/:id/cancel", requireRole(["superadmin", "hqadmin", "storemanager", "warehousemanager"]), (req, res) => {
  res.json({
    success: true,
    message: `RMA ${req.params.id} cancelled successfully`
  });
});

// ==============================
// PROGRESS RMA
// ==============================
router.post("/rma/:id/progress", requireRole(["superadmin", "hqadmin", "storemanager", "warehousemanager"]), (req, res) => {
  res.json({
    success: true,
    message: `RMA ${req.params.id} progressed successfully`
  });
});

export default router;