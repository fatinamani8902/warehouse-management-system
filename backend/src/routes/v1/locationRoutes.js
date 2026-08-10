import express from "express";
import { withTenantContext } from "../../db/withTenantContext.js";
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

function fail(message, status = 400) {
  return new ApiError(status, "LOCATION_VALIDATION_ERROR", message);
}

function parseType(value) {
  if (value === undefined || value === null || value === "") return "";
  const normalized = String(value).trim().toLowerCase();
  if (!locationTypes.has(normalized)) {
    throw fail("Location type is invalid");
  }
  return normalized;
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function baseLocationQuery() {
  return `
    SELECT
      location.tenant_id,
      location.location_id,
      location.location_code,
      location.location_type,
      location.warehouse_id,
      location.bin_id,
      COALESCE(zone.zone_id, NULLIF(location.zone, '')) AS zone_id,
      CASE WHEN location.is_active THEN 'active' ELSE 'inactive' END AS status,
      CASE
        WHEN location.bin_id IS NOT NULL THEN concat_ws(
          '-',
          warehouse.warehouse_code,
          zone.zone_code,
          aisle.aisle_code,
          bay.bay_code,
          level.level_code,
          bin.bin_code
        )
        ELSE COALESCE(
          NULLIF(btrim(location.location_code), ''),
          NULLIF(btrim(location.label), ''),
          location.location_id
        )
      END AS display_name
    FROM public.locations location
    LEFT JOIN public.warehouse_bins bin
      ON bin.tenant_id = location.tenant_id
     AND bin.bin_id = location.bin_id
    LEFT JOIN public.warehouse_levels level
      ON level.tenant_id = bin.tenant_id
     AND level.level_id = bin.level_id
    LEFT JOIN public.warehouse_bays bay
      ON bay.tenant_id = level.tenant_id
     AND bay.bay_id = level.bay_id
    LEFT JOIN public.warehouse_aisles aisle
      ON aisle.tenant_id = bay.tenant_id
     AND aisle.aisle_id = bay.aisle_id
    LEFT JOIN public.warehouse_zones zone
      ON zone.tenant_id = aisle.tenant_id
     AND zone.zone_id = aisle.zone_id
    LEFT JOIN public.warehouses warehouse
      ON warehouse.tenant_id = zone.tenant_id
     AND warehouse.warehouse_id = zone.warehouse_id
    WHERE location.tenant_id = $1
  `;
}

function buildFilters({ search, type, activeOnly, warehouseId }) {
  const values = [];
  const clauses = [];

  if (warehouseId) {
    values.push(warehouseId);
    clauses.push(`location_row.warehouse_id = $${values.length + 1}`);
  }
  if (type) {
    values.push(type);
    clauses.push(`location_row.location_type = $${values.length + 1}`);
  }
  if (activeOnly) {
    clauses.push(`location_row.status = 'active'`);
  }
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length + 1}`;
    clauses.push(`(
      location_row.location_id ILIKE ${parameter}
      OR location_row.location_code ILIKE ${parameter}
      OR location_row.display_name ILIKE ${parameter}
    )`);
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    values,
  };
}

router.get("/lookup", async (req, res, next) => {
  try {
    const tenantId = req.context.tenantId;
    const type = parseType(req.query.type);
    const search = String(req.query.search || "").trim();
    const warehouseId = String(req.headers["x-warehouse-id"] || req.query.warehouse_id || "").trim();
    const filters = buildFilters({ search, type, activeOnly: true, warehouseId });

    const rows = await withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `WITH location_row AS (${baseLocationQuery()})
         SELECT
           location_id,
           location_code,
           location_type,
           warehouse_id,
           bin_id,
           status,
           display_name
         FROM location_row
         WHERE true${filters.sql}
         ORDER BY display_name, location_id
         LIMIT 100`,
        [tenantId, ...filters.values]
      );
      return result.rows;
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const tenantId = req.context.tenantId;
    const type = parseType(req.query.type);
    const search = String(req.query.search || "").trim();
    const warehouseId = String(req.headers["x-warehouse-id"] || req.query.warehouse_id || "").trim();
    const page = parsePositiveInteger(req.query.page, 1, 1000000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
    const filters = buildFilters({ search, type, activeOnly: false, warehouseId });

    const result = await withTenantContext(tenantId, async (client) => {
      const parameters = [tenantId, ...filters.values];
      const countResult = await client.query(
        `WITH location_row AS (${baseLocationQuery()})
         SELECT count(*)::int AS total
         FROM location_row
         WHERE true${filters.sql}`,
        parameters
      );
      const offsetParameter = parameters.length + 1;
      const limitParameter = parameters.length + 2;
      const rowsResult = await client.query(
        `WITH location_row AS (${baseLocationQuery()})
         SELECT
           location_id,
           location_code,
           location_type,
           warehouse_id,
           bin_id,
           status,
           display_name
         FROM location_row
         WHERE true${filters.sql}
         ORDER BY display_name, location_id
         OFFSET $${offsetParameter}
         LIMIT $${limitParameter}`,
        [...parameters, (page - 1) * pageSize, pageSize]
      );
      return { rows: rowsResult.rows, total: countResult.rows[0].total };
    });

    return res.json({
      success: true,
      data: result.rows,
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
