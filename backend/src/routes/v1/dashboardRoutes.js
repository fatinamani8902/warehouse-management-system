import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import { getDashboardSummaryForContext } from "../../services/dashboardService.js";
import { isApiError } from "../../utils/errors.js";

const router = express.Router();

const dashboardViewRoles = [
  "superadmin",
  "hqadmin",
  "admin",
  "manager",
  "warehousemanager",
  "storemanager",
  "storeoperator",
  "warehouseoperator",
  "auditor",
];

router.get("/summary", requireRole(dashboardViewRoles), async (req, res, next) => {
  try {
    const data = await getDashboardSummaryForContext(req.context);
    return res.json({ data });
  } catch (error) {
    if (!isApiError(error)) {
      console.error("Dashboard summary failed", {
        requestId: req.requestId || null,
        tenantId: req.context?.tenantId || null,
        warehouseId: req.context?.warehouseId || null,
        userId: req.context?.userId || null,
        errorName: error?.name,
        errorMessage: error?.message,
        errorStack: error?.stack,
      });
    }
    return next(error);
  }
});

export default router;
