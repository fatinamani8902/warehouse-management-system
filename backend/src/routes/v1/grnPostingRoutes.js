import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import { ApiError } from "../../utils/errors.js";
import { postGrnReceipt } from "../../services/grnPostingService.js";
import {
  getGrn,
  listEligibleGrnAsns,
  markGrnPosted,
} from "../../services/grnService.js";

const router = express.Router();
const postingRoles = ["manager", "warehousemanager", "storemanager"];
const grnCreateRoles = [
  ...postingRoles,
  "warehousemanager",
  "storeoperator",
  "storekeeper",
  "warehouseclerk",
];

router.get("/grn/eligible-asns", requireRole(grnCreateRoles), async (req, res, next) => {
  try {
    return res.json({
      success: true,
      data: await listEligibleGrnAsns(req.context),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/grn/:grnId/post", requireRole(postingRoles), async (req, res, next) => {
  try {
    const tenantId = req.context?.tenantId;
    const userId = req.context?.userId || null;
    const grn = await getGrn(tenantId, req.params.grnId);

    if (!grn) {
      throw new ApiError(404, "GRN_NOT_FOUND", "GRN not found");
    }
    if (grn.status === "cancelled") {
      throw new ApiError(400, "GRN_CANCELLED", "Cancelled GRN cannot be posted");
    }

    const posting = await postGrnReceipt({ tenantId, userId }, grn);
    const updated = await markGrnPosted(tenantId, grn.grn_id, userId);

    return res.json({
      success: true,
      message: posting.idempotent
        ? "GRN was already posted; inventory was not posted again"
        : "GRN posted to inventory and putaway tasks created",
      data: {
        ...updated,
        posting_idempotent: posting.idempotent,
        receiving_location_id: posting.receivingLocation?.location_id || null,
        inventory_transactions: posting.transactions,
        inventory_balances: posting.balances,
        putaway_tasks: posting.putawayTasks,
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("GRN inventory posting failed", {
        requestId: req.context?.requestId,
        tenantId: req.context?.tenantId,
        grnId: req.params.grnId,
        postgresCode: error.code,
        message: error.message,
      });
      return next(new ApiError(
        500,
        "GRN_POSTING_FAILED",
        "Unable to post GRN to inventory. No inventory changes were saved."
      ));
    }
    return next(error);
  }
});

export default router;
