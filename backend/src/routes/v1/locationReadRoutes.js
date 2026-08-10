import express from "express";
import {
  listPortalLocations,
  lookupLocations,
} from "../../repositories/MasterDataReadRepository.js";
import { ApiError } from "../../utils/errors.js";

const router = express.Router();
const locationTypes = new Set([
  "receiving",
  "staging",
  "storage",
  "quarantine",
  "packing",
  "shipping",
  "adjustment",
]);

function parseType(value) {
  if (value === undefined || value === null || value === "") return "";
  const normalized = String(value).trim().toLowerCase();
  if (!locationTypes.has(normalized)) {
    throw new ApiError(400, "LOCATION_VALIDATION_ERROR", "Location type is invalid");
  }
  return normalized;
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

router.get("/lookup", async (req, res, next) => {
  try {
    const rows = await lookupLocations({
      tenantId: req.context.tenantId,
      warehouseId: req.headers["x-warehouse-id"] || req.query.warehouse_id || "",
      search: req.query.search,
      type: parseType(req.query.type),
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const result = await listPortalLocations({
      tenantId: req.context.tenantId,
      warehouseId: req.headers["x-warehouse-id"] || req.query.warehouse_id || "",
      search: req.query.search,
      type: parseType(req.query.type),
      page: parsePositiveInteger(req.query.page, 1, 1000000),
      pageSize: parsePositiveInteger(req.query.pageSize, 20, 100),
    });

    return res.json({
      success: true,
      data: result.rows,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
