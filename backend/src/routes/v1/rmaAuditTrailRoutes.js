import express from "express";
import { getRma } from "../../repositories/RmaRepository.js";
import { listReturnRmaAuditEvents } from "../../repositories/ReturnRmaAuditRepository.js";

const router = express.Router();

function canViewReturnRmaAudit(req) {
  return ["superadmin", "hqadmin", "storemanager"].includes(String(req.role_id || "").toLowerCase());
}

function validRmaId(value) {
  return /^RMA[A-Z0-9]{3,32}$/.test(String(value || "").trim());
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query?.pageSize, 10) || 10));
  return { page, pageSize };
}

router.get("/:rmaId/audit-trail", async (req, res, next) => {
  if (!canViewReturnRmaAudit(req)) {
    return res.status(403).json({ message: "Insufficient role to access this resource" });
  }
  if (!validRmaId(req.params.rmaId)) {
    return res.status(400).json({ message: "Invalid RMA ID" });
  }

  try {
    const warehouseId = req.headers["x-warehouse-id"] || req.warehouse_id || null;
    const row = await getRma({ tenantId: req.tenant_id, warehouseId, rmaId: req.params.rmaId });
    if (!row) return res.status(404).json({ message: "RMA not found" });
    const result = await listReturnRmaAuditEvents({
      tenantId: req.tenant_id,
      entityType: "rma",
      entityId: row.rma_id,
      rmaId: row.rma_id,
      ...pagination(req.query),
    });
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

export default router;
