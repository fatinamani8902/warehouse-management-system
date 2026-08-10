import express from "express";
import { withTenantContext } from "../../db/withTenantContext.js";
import { requireRole } from "../../middlewares/auth.js";
import { buildPagination, parsePagination } from "../../utils/pagination.js";

const router = express.Router();
const managerRoles = ["superadmin", "hqadmin", "storemanager"];

const resources = {
  warehouses: {
    table: "warehouses",
    id: "warehouse_id",
    code: "warehouse_code",
    name: "warehouse_name",
    prefix: "Warehouse",
    fields: ["warehouse_code", "warehouse_name", "status"],
    search: ["warehouse_code", "warehouse_name"],
  },
  zones: {
    table: "warehouse_zones",
    id: "zone_id",
    code: "zone_code",
    name: "zone_name",
    parent: { field: "warehouse_id", table: "warehouses", id: "warehouse_id", label: "Warehouse" },
    prefix: "Zone",
    fields: ["warehouse_id", "zone_code", "zone_name", "zone_type", "status"],
    search: ["zone_code", "zone_name", "zone_type"],
  },
  aisles: {
    table: "warehouse_aisles",
    id: "aisle_id",
    code: "aisle_code",
    name: "aisle_name",
    parent: { field: "zone_id", table: "warehouse_zones", id: "zone_id", label: "Zone" },
    prefix: "Aisle",
    fields: ["zone_id", "aisle_code", "aisle_name", "status"],
    search: ["aisle_code", "aisle_name"],
  },
  bays: {
    table: "warehouse_bays",
    id: "bay_id",
    code: "bay_code",
    name: "bay_name",
    parent: { field: "aisle_id", table: "warehouse_aisles", id: "aisle_id", label: "Aisle" },
    prefix: "Bay",
    fields: ["aisle_id", "bay_code", "bay_name", "width_cm", "depth_cm", "level_height_cm", "level_count", "max_weight_kg", "status"],
    search: ["bay_code", "bay_name"],
  },
  levels: {
    table: "warehouse_levels",
    id: "level_id",
    code: "level_code",
    parent: { field: "bay_id", table: "warehouse_bays", id: "bay_id", label: "Bay" },
    prefix: "Level",
    fields: ["bay_id", "level_code", "status"],
    search: ["level_code"],
  },
  bins: {
    table: "warehouse_bins",
    id: "bin_id",
    code: "bin_code",
    parent: { field: "level_id", table: "warehouse_levels", id: "level_id", label: "Level" },
    prefix: "Bin",
    fields: ["level_id", "bin_code", "max_weight", "max_volume", "status"],
    search: ["bin_code"],
  },
};

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw fail(`${label} is required`);
  return normalized;
}

function statusValue(value) {
  const normalized = requiredText(value, "Status").toLowerCase();
  if (!["active", "inactive"].includes(normalized)) {
    throw fail("Status must be active or inactive");
  }
  return normalized;
}

function optionalNumber(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw fail(`${label} must be a number greater than or equal to 0`);
  }
  return number;
}

function compactCodeValue(value, type) {
  const code = String(value || "");
  const pattern = type === "level" ? /^L\d{2,}$/ : /^B\d{3,}$/;
  if (!pattern.test(code)) {
    throw fail(`${type === "level" ? "Level" : "Bin"} code generation failed`);
  }
  return code;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function hasReferences(client, tenantId, config, idValue) {
  const constraints = await client.query(
    `SELECT
       source_namespace.nspname AS schema_name,
       source_table.relname AS table_name,
       source_column.attname AS source_column,
       EXISTS (
         SELECT 1 FROM pg_attribute tenant_column
         WHERE tenant_column.attrelid = source_table.oid
           AND tenant_column.attname = 'tenant_id'
           AND tenant_column.attnum > 0
           AND NOT tenant_column.attisdropped
       ) AS has_tenant_id
     FROM pg_constraint constraint_row
     JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
     JOIN pg_namespace source_namespace ON source_namespace.oid = source_table.relnamespace
     JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY source_key(attnum, position) ON true
     JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY target_key(attnum, position)
       ON target_key.position = source_key.position
     JOIN pg_attribute source_column
       ON source_column.attrelid = constraint_row.conrelid
      AND source_column.attnum = source_key.attnum
     JOIN pg_attribute target_column
       ON target_column.attrelid = constraint_row.confrelid
      AND target_column.attnum = target_key.attnum
     WHERE constraint_row.contype = 'f'
       AND constraint_row.confrelid = $1::regclass
       AND target_column.attname = $2`,
    [`public.${config.table}`, config.id]
  );

  for (const constraint of constraints.rows) {
    const table = `${quoteIdentifier(constraint.schema_name)}.${quoteIdentifier(constraint.table_name)}`;
    const column = quoteIdentifier(constraint.source_column);
    const tenantClause = constraint.has_tenant_id ? " AND tenant_id = $2" : "";
    const params = constraint.has_tenant_id ? [idValue, tenantId] : [idValue];
    const reference = await client.query(
      `SELECT 1 FROM ${table} WHERE ${column} = $1${tenantClause} LIMIT 1`,
      params
    );
    if (reference.rowCount) return true;
  }
  return false;
}

function payloadFor(config, body, { allowGeneratedCode = false, immutableCode = false } = {}) {
  const payload = {
    status: statusValue(body?.status),
  };
  const generatedCodeTable = [
    "warehouse_aisles",
    "warehouse_bays",
    "warehouse_levels",
    "warehouse_bins",
  ].includes(config.table);
  if (immutableCode) {
    // Level and Bin codes are database-backed identifiers within their parent.
  } else if (allowGeneratedCode && generatedCodeTable) {
    payload[config.code] = null;
  } else {
    payload[config.code] = requiredText(body?.[config.code], `${config.prefix} code`);
  }
  if (config.name) payload[config.name] = requiredText(body?.[config.name], `${config.prefix} name`);
  if (config.table === "warehouse_zones") {
    payload.zone_type = requiredText(body?.zone_type ?? "storage", "Zone type").toLowerCase();
  }
  if (config.table === "warehouse_bays") {
    payload.width_cm = optionalNumber(body?.width_cm, "Width") ?? 200;
    payload.depth_cm = optionalNumber(body?.depth_cm, "Depth") ?? 50;
    payload.level_height_cm = optionalNumber(body?.level_height_cm, "Level height") ?? 50;
    payload.level_count = optionalNumber(body?.level_count, "Level count") ?? 4;
    if (!Number.isInteger(payload.level_count) || payload.level_count < 1) {
      throw fail("Level count must be a whole number greater than 0");
    }
    payload.max_weight_kg = optionalNumber(body?.max_weight_kg, "Maximum weight") ?? 500;
    payload.zone_id = String(body?.zone_id || "").trim() || null;
  }
  if (config.parent) payload[config.parent.field] = requiredText(body?.[config.parent.field], config.parent.label);
  if (config.table === "warehouse_bins") {
    payload.max_weight = optionalNumber(body?.max_weight, "Maximum weight");
    payload.max_volume = optionalNumber(body?.max_volume, "Maximum volume");
  }
  return payload;
}

async function generateAisleCode(client, tenantId, zoneId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${tenantId}:${zoneId}:aisle-code`]);
  const result = await client.query(
    `SELECT COALESCE(MAX(aisle_code::int), 0) + 1 AS next_code
     FROM public.warehouse_aisles
     WHERE tenant_id = $1
       AND zone_id = $2
       AND aisle_code ~ '^[0-9]+$'`,
    [tenantId, zoneId]
  );
  return String(result.rows[0].next_code).padStart(2, "0");
}

async function generateBayCode(client, tenantId, aisleId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${tenantId}:${aisleId}:bay-code`]);
  const result = await client.query(
    `SELECT COALESCE(MAX(bay_code::int), 0) + 1 AS next_code
     FROM public.warehouse_bays
     WHERE tenant_id = $1
       AND aisle_id = $2
       AND bay_code ~ '^[0-9]+$'`,
    [tenantId, aisleId]
  );
  return String(result.rows[0].next_code).padStart(3, "0");
}

async function generateLevelCode(client, tenantId, bayId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${tenantId}:${bayId}:level-code`]);
  const result = await client.query(
    `SELECT COALESCE(MAX(substring(level_code FROM 2)::bigint), 0) + 1 AS next_code
     FROM public.warehouse_levels
     WHERE tenant_id = $1
       AND bay_id = $2
       AND level_code ~ '^L[0-9]{2,}$'`,
    [tenantId, bayId]
  );
  return `L${String(result.rows[0].next_code).padStart(2, "0")}`;
}

async function generateBinCode(client, tenantId, levelId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${tenantId}:${levelId}:bin-code`]);
  const result = await client.query(
    `SELECT COALESCE(MAX(substring(bin_code FROM 2)::bigint), 0) + 1 AS next_code
     FROM public.warehouse_bins
     WHERE tenant_id = $1
       AND level_id = $2
       AND bin_code ~ '^B[0-9]{3,}$'`,
    [tenantId, levelId]
  );
  return `B${String(result.rows[0].next_code).padStart(3, "0")}`;
}

async function selectAisle(client, tenantId, aisleId) {
  const result = await client.query(
    `SELECT a.*, z.zone_name,
            concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code) AS location_code
     FROM public.warehouse_aisles a
     JOIN public.warehouse_zones z
       ON z.tenant_id = a.tenant_id AND z.zone_id = a.zone_id
     JOIN public.warehouses w
       ON w.tenant_id = z.tenant_id AND w.warehouse_id = z.warehouse_id
     WHERE a.tenant_id = $1 AND a.aisle_id = $2`,
    [tenantId, aisleId]
  );
  return result.rows[0] || null;
}

async function selectBay(client, tenantId, bayId) {
  const result = await client.query(
    `SELECT b.*, a.aisle_name, a.aisle_code, z.zone_id, z.zone_name,
            concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code) AS location_code
     FROM public.warehouse_bays b
     JOIN public.warehouse_aisles a
       ON a.tenant_id = b.tenant_id AND a.aisle_id = b.aisle_id
     JOIN public.warehouse_zones z
       ON z.tenant_id = a.tenant_id AND z.zone_id = a.zone_id
     JOIN public.warehouses w
       ON w.tenant_id = z.tenant_id AND w.warehouse_id = z.warehouse_id
     WHERE b.tenant_id = $1 AND b.bay_id = $2`,
    [tenantId, bayId]
  );
  return result.rows[0] || null;
}

async function selectLevel(client, tenantId, levelId) {
  const result = await client.query(
    `SELECT l.*, b.bay_code, b.bay_name, a.aisle_id, a.aisle_code, a.aisle_name,
            z.zone_id, z.zone_code, z.zone_name, w.warehouse_id, w.warehouse_code,
            concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code, l.level_code) AS location_code
     FROM public.warehouse_levels l
     JOIN public.warehouse_bays b
       ON b.tenant_id = l.tenant_id AND b.bay_id = l.bay_id
     JOIN public.warehouse_aisles a
       ON a.tenant_id = b.tenant_id AND a.aisle_id = b.aisle_id
     JOIN public.warehouse_zones z
       ON z.tenant_id = a.tenant_id AND z.zone_id = a.zone_id
     JOIN public.warehouses w
       ON w.tenant_id = z.tenant_id AND w.warehouse_id = z.warehouse_id
     WHERE l.tenant_id = $1 AND l.level_id = $2`,
    [tenantId, levelId]
  );
  return result.rows[0] || null;
}

async function selectBin(client, tenantId, binId) {
  const result = await client.query(
    `SELECT n.*, l.level_code, b.bay_id, b.bay_code, b.bay_name,
            a.aisle_id, a.aisle_code, a.aisle_name,
            z.zone_id, z.zone_code, z.zone_name, w.warehouse_id, w.warehouse_code,
            concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code, l.level_code, n.bin_code) AS location_code
     FROM public.warehouse_bins n
     JOIN public.warehouse_levels l
       ON l.tenant_id = n.tenant_id AND l.level_id = n.level_id
     JOIN public.warehouse_bays b
       ON b.tenant_id = l.tenant_id AND b.bay_id = l.bay_id
     JOIN public.warehouse_aisles a
       ON a.tenant_id = b.tenant_id AND a.aisle_id = b.aisle_id
     JOIN public.warehouse_zones z
       ON z.tenant_id = a.tenant_id AND z.zone_id = a.zone_id
     JOIN public.warehouses w
       ON w.tenant_id = z.tenant_id AND w.warehouse_id = z.warehouse_id
     WHERE n.tenant_id = $1 AND n.bin_id = $2`,
    [tenantId, binId]
  );
  return result.rows[0] || null;
}

async function assertParent(client, tenantId, config, payload) {
  if (!config.parent) return;
  const result = await client.query(
    `SELECT 1 FROM public.${config.parent.table}
     WHERE tenant_id = $1 AND ${config.parent.id} = $2`,
    [tenantId, payload[config.parent.field]]
  );
  if (!result.rowCount) throw fail(`${config.parent.label} not found for this tenant`);
  if (config.table === "warehouse_bays" && payload.zone_id) {
    const hierarchy = await client.query(
      `SELECT 1 FROM public.warehouse_aisles
       WHERE tenant_id = $1 AND aisle_id = $2 AND zone_id = $3`,
      [tenantId, payload.aisle_id, payload.zone_id]
    );
    if (!hierarchy.rowCount) throw fail("Aisle does not belong to the selected zone");
  }
}

function sendError(res, error) {
  if (error.code === "23505") {
    return res.status(409).json({ success: false, message: "Code already exists under the selected parent" });
  }
  return res.status(error.status || 500).json({
    success: false,
    message: error.status ? error.message : "Unable to process location taxonomy request",
  });
}

router.get("/taxonomy/tree", async (req, res) => {
  try {
    const tenantId = req.context.tenantId;
    const { page, pageSize } = parsePagination(req.query);
    const search = String(req.query.search || "").trim().toLowerCase();
    const params = [tenantId];
    let where = "w.tenant_id = $1";
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (
        lower(w.warehouse_code) LIKE $2
        OR lower(w.warehouse_name) LIKE $2
        OR EXISTS (
          SELECT 1
          FROM public.warehouse_zones search_zone
          JOIN public.warehouse_aisles search_aisle
            ON search_aisle.tenant_id = search_zone.tenant_id
           AND search_aisle.zone_id = search_zone.zone_id
          JOIN public.warehouse_bays search_bay
            ON search_bay.tenant_id = search_aisle.tenant_id
           AND search_bay.aisle_id = search_aisle.aisle_id
          LEFT JOIN public.warehouse_levels search_level
            ON search_level.tenant_id = search_bay.tenant_id
           AND search_level.bay_id = search_bay.bay_id
          LEFT JOIN public.warehouse_bins search_bin
            ON search_bin.tenant_id = search_level.tenant_id
           AND search_bin.level_id = search_level.level_id
          WHERE search_zone.tenant_id = w.tenant_id
            AND search_zone.warehouse_id = w.warehouse_id
            AND (
              lower(search_zone.zone_code) LIKE $2
              OR lower(search_zone.zone_name) LIKE $2
              OR lower(search_aisle.aisle_code) LIKE $2
              OR lower(search_aisle.aisle_name) LIKE $2
              OR lower(search_bay.bay_code) LIKE $2
              OR lower(search_bay.bay_name) LIKE $2
              OR lower(search_level.level_code) LIKE $2
              OR lower(search_bin.bin_code) LIKE $2
              OR lower(concat_ws('-', w.warehouse_code, search_zone.zone_code, search_aisle.aisle_code, search_bay.bay_code, search_level.level_code)) LIKE $2
              OR lower(concat_ws('-', w.warehouse_code, search_zone.zone_code, search_aisle.aisle_code, search_bay.bay_code, search_level.level_code, search_bin.bin_code)) LIKE $2
            )
        )
      )`;
    }
    const result = await withTenantContext(tenantId, async (client) => {
      const count = await client.query(
        `SELECT count(*)::int AS total FROM public.warehouses w WHERE ${where}`,
        params
      );
      const listParams = [...params, pageSize, (page - 1) * pageSize];
      const rows = await client.query(
        `SELECT
           w.tenant_id, w.warehouse_id, w.warehouse_code, w.warehouse_name, w.status,
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object(
                 'zone_id', z.zone_id, 'zone_code', z.zone_code, 'zone_name', z.zone_name,
                 'zone_type', z.zone_type, 'status', z.status,
                 'aisles', COALESCE((
                   SELECT jsonb_agg(
                     jsonb_build_object(
                       'aisle_id', a.aisle_id, 'aisle_code', a.aisle_code,
                       'aisle_name', a.aisle_name, 'zone_id', a.zone_id, 'zone_name', z.zone_name,
                       'location_code', concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code),
                       'status', a.status,
                       'bays', COALESCE((
                         SELECT jsonb_agg(
                           jsonb_build_object(
                             'bay_id', b.bay_id, 'bay_code', b.bay_code, 'bay_name', b.bay_name,
                             'aisle_id', b.aisle_id, 'aisle_name', a.aisle_name,
                             'zone_id', z.zone_id, 'zone_name', z.zone_name,
                             'location_code', concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code),
                             'width_cm', b.width_cm, 'depth_cm', b.depth_cm,
                             'level_height_cm', b.level_height_cm, 'level_count', b.level_count,
                             'max_weight_kg', b.max_weight_kg, 'status', b.status,
                             'levels', COALESCE((
                               SELECT jsonb_agg(
                                 jsonb_build_object(
                                   'level_id', l.level_id, 'level_code', l.level_code, 'bay_id', l.bay_id,
                                   'location_code', concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code, l.level_code),
                                   'status', l.status,
                                   'bins', COALESCE((
                                     SELECT jsonb_agg(
                                       jsonb_build_object(
                                         'bin_id', n.bin_id, 'bin_code', n.bin_code, 'level_id', n.level_id,
                                         'location_code', concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code, l.level_code, n.bin_code),
                                         'max_weight', n.max_weight, 'max_volume', n.max_volume, 'status', n.status
                                       ) ORDER BY n.bin_code
                                     )
                                     FROM public.warehouse_bins n
                                     WHERE n.tenant_id = w.tenant_id AND n.level_id = l.level_id
                                   ), '[]'::jsonb)
                                 ) ORDER BY l.level_code
                               )
                               FROM public.warehouse_levels l
                               WHERE l.tenant_id = w.tenant_id AND l.bay_id = b.bay_id
                             ), '[]'::jsonb)
                           ) ORDER BY b.bay_code
                         )
                         FROM public.warehouse_bays b
                         WHERE b.tenant_id = w.tenant_id AND b.aisle_id = a.aisle_id
                       ), '[]'::jsonb)
                     ) ORDER BY a.aisle_code
                   )
                   FROM public.warehouse_aisles a
                   WHERE a.tenant_id = w.tenant_id AND a.zone_id = z.zone_id
                 ), '[]'::jsonb)
               ) ORDER BY z.zone_code
             )
             FROM public.warehouse_zones z
             WHERE z.tenant_id = w.tenant_id AND z.warehouse_id = w.warehouse_id
           ), '[]'::jsonb) AS zones
         FROM public.warehouses w
         WHERE ${where}
         ORDER BY w.warehouse_code
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      return {
        rows: rows.rows,
        pagination: buildPagination(page, pageSize, count.rows[0].total),
      };
    });
    res.json({ success: true, data: result.rows, ...result.pagination });
  } catch (error) {
    sendError(res, error);
  }
});

for (const [resourceName, config] of Object.entries(resources)) {
  router.get(`/taxonomy/${resourceName}`, async (req, res) => {
    try {
      const tenantId = req.context.tenantId;
      const { page, pageSize } = parsePagination(req.query);
      const search = String(req.query.search || "").trim().toLowerCase();
      const params = [tenantId];
      let where = "tenant_id = $1";
      if (config.parent && req.query[config.parent.field]) {
        params.push(String(req.query[config.parent.field]).trim());
        where += ` AND ${config.parent.field} = $${params.length}`;
      }
      if (config.table === "warehouse_bays" && req.query.zone_id) {
        params.push(String(req.query.zone_id).trim());
        where += ` AND zone_id = $${params.length}`;
      }
      if (req.query.status) {
        params.push(statusValue(req.query.status));
        where += ` AND status = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        where += ` AND (${config.search.map((field) => `lower(${field}) LIKE $${params.length}`).join(" OR ")})`;
      }
      const result = await withTenantContext(tenantId, async (client) => {
        const isAisle = config.table === "warehouse_aisles";
        const isBay = config.table === "warehouse_bays";
        const isLevel = config.table === "warehouse_levels";
        const isBin = config.table === "warehouse_bins";
        let qualifiedWhere = isAisle
          ? where.replaceAll("tenant_id", "a.tenant_id")
              .replaceAll("zone_id", "a.zone_id")
              .replaceAll("status", "a.status")
              .replaceAll("lower(aisle_code)", "lower(a.aisle_code)")
              .replaceAll("lower(aisle_name)", "lower(a.aisle_name)")
          : isBay
            ? where.replaceAll("tenant_id", "b.tenant_id")
                .replaceAll("aisle_id", "b.aisle_id")
                .replaceAll("zone_id", "z.zone_id")
                .replaceAll("status", "b.status")
                .replaceAll("lower(bay_code)", "lower(b.bay_code)")
                .replaceAll("lower(bay_name)", "lower(b.bay_name)")
            : isLevel
              ? where.replaceAll("tenant_id", "l.tenant_id")
                  .replaceAll("bay_id", "l.bay_id")
                  .replaceAll("status", "l.status")
                  .replaceAll("lower(level_code)", "lower(l.level_code)")
              : isBin
                ? where.replaceAll("tenant_id", "n.tenant_id")
                    .replaceAll("level_id", "n.level_id")
                    .replaceAll("status", "n.status")
                    .replaceAll("lower(bin_code)", "lower(n.bin_code)")
                : where;
        if (search && isLevel) {
          qualifiedWhere = qualifiedWhere.replace(
            /lower\(l\.level_code\) LIKE \$(\d+)/,
            "lower(l.level_code) LIKE $$$1 OR lower(concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code, l.level_code)) LIKE $$$1"
          );
        }
        if (search && isBin) {
          qualifiedWhere = qualifiedWhere.replace(
            /lower\(n\.bin_code\) LIKE \$(\d+)/,
            "lower(n.bin_code) LIKE $$$1 OR lower(concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code, l.level_code, n.bin_code)) LIKE $$$1"
          );
        }
        const fromSql = isAisle
          ? `public.warehouse_aisles a
             JOIN public.warehouse_zones z
               ON z.tenant_id = a.tenant_id AND z.zone_id = a.zone_id
             JOIN public.warehouses w
               ON w.tenant_id = z.tenant_id AND w.warehouse_id = z.warehouse_id`
          : isBay
            ? `public.warehouse_bays b
               JOIN public.warehouse_aisles a
                 ON a.tenant_id = b.tenant_id AND a.aisle_id = b.aisle_id
               JOIN public.warehouse_zones z
                 ON z.tenant_id = a.tenant_id AND z.zone_id = a.zone_id
               JOIN public.warehouses w
                 ON w.tenant_id = z.tenant_id AND w.warehouse_id = z.warehouse_id`
            : isLevel
              ? `public.warehouse_levels l
                 JOIN public.warehouse_bays b
                   ON b.tenant_id = l.tenant_id AND b.bay_id = l.bay_id
                 JOIN public.warehouse_aisles a
                   ON a.tenant_id = b.tenant_id AND a.aisle_id = b.aisle_id
                 JOIN public.warehouse_zones z
                   ON z.tenant_id = a.tenant_id AND z.zone_id = a.zone_id
                 JOIN public.warehouses w
                   ON w.tenant_id = z.tenant_id AND w.warehouse_id = z.warehouse_id`
              : isBin
                ? `public.warehouse_bins n
                   JOIN public.warehouse_levels l
                     ON l.tenant_id = n.tenant_id AND l.level_id = n.level_id
                   JOIN public.warehouse_bays b
                     ON b.tenant_id = l.tenant_id AND b.bay_id = l.bay_id
                   JOIN public.warehouse_aisles a
                     ON a.tenant_id = b.tenant_id AND a.aisle_id = b.aisle_id
                   JOIN public.warehouse_zones z
                     ON z.tenant_id = a.tenant_id AND z.zone_id = a.zone_id
                   JOIN public.warehouses w
                     ON w.tenant_id = z.tenant_id AND w.warehouse_id = z.warehouse_id`
            : `public.${config.table}`;
        const count = await client.query(
          `SELECT count(*)::int AS total FROM ${fromSql} WHERE ${qualifiedWhere}`,
          params
        );
        const listParams = [...params, pageSize, (page - 1) * pageSize];
        const selectSql = isAisle
          ? `SELECT a.*, z.zone_name,
                    concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code) AS location_code
             FROM ${fromSql}`
          : isBay
            ? `SELECT b.*, a.aisle_name, a.aisle_code, z.zone_id, z.zone_name,
                      concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code) AS location_code
               FROM ${fromSql}`
            : isLevel
              ? `SELECT l.*, b.bay_code, b.bay_name, a.aisle_id, a.aisle_code, a.aisle_name,
                        z.zone_id, z.zone_code, z.zone_name, w.warehouse_id, w.warehouse_code,
                        concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code, l.level_code) AS location_code
                 FROM ${fromSql}`
              : isBin
                ? `SELECT n.*, l.level_code, b.bay_id, b.bay_code, b.bay_name,
                          a.aisle_id, a.aisle_code, a.aisle_name,
                          z.zone_id, z.zone_code, z.zone_name, w.warehouse_id, w.warehouse_code,
                          concat_ws('-', w.warehouse_code, z.zone_code, a.aisle_code, b.bay_code, l.level_code, n.bin_code) AS location_code
                   FROM ${fromSql}`
            : `SELECT * FROM public.${config.table}`;
        const rows = await client.query(
          `${selectSql}
           WHERE ${qualifiedWhere}
           ORDER BY ${isAisle ? `a.${config.code}` : isBay ? `b.${config.code}` : isLevel ? `l.${config.code}` : isBin ? `n.${config.code}` : config.code}
           LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
          listParams
        );
        return { rows: rows.rows, pagination: buildPagination(page, pageSize, count.rows[0].total) };
      });
      res.json({ success: true, data: result.rows, ...result.pagination });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get(`/taxonomy/${resourceName}/:${config.id}`, async (req, res) => {
    try {
      const tenantId = req.context.tenantId;
      const row = await withTenantContext(tenantId, async (client) => {
        if (config.table === "warehouse_aisles") {
          return selectAisle(client, tenantId, req.params[config.id]);
        }
        if (config.table === "warehouse_bays") {
          return selectBay(client, tenantId, req.params[config.id]);
        }
        if (config.table === "warehouse_levels") {
          return selectLevel(client, tenantId, req.params[config.id]);
        }
        if (config.table === "warehouse_bins") {
          return selectBin(client, tenantId, req.params[config.id]);
        }
        const result = await client.query(
          `SELECT * FROM public.${config.table} WHERE tenant_id = $1 AND ${config.id} = $2`,
          [tenantId, req.params[config.id]]
        );
        return result.rows[0] || null;
      });
      if (!row) return res.status(404).json({ success: false, message: `${config.prefix} not found` });
      res.json({ success: true, data: row });
    } catch (error) {
      sendError(res, error);
    }
  });

}

export default router;
