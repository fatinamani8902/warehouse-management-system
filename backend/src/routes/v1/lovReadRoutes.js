import express from "express";
import {
  getLovGroup,
  listLovGroups,
} from "../../repositories/MasterDataReadRepository.js";
import { buildPagination } from "../../utils/pagination.js";

const router = express.Router();

function parsePositiveInt(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

router.get("/groups", async (req, res, next) => {
  try {
    const result = await listLovGroups({
      tenantId: req.context.tenantId,
      search: req.query.search,
      page: parsePositiveInt(req.query.page, 1, 1000000),
      pageSize: parsePositiveInt(req.query.pageSize, 20, 100),
    });

    return res.json({
      success: true,
      data: result.rows,
      meta: {
        requestId: req.requestId || null,
        tenantId: req.context.tenantId,
        pagination: buildPagination(result.page, result.pageSize, result.total),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/groups/:id", async (req, res, next) => {
  try {
    const group = await getLovGroup({
      tenantId: req.context.tenantId,
      lovGroupId: req.params.id,
    });

    if (!group) {
      return res.status(404).json({ success: false, message: "LOV group not found" });
    }

    return res.json({ success: true, data: group });
  } catch (error) {
    return next(error);
  }
});

export default router;
