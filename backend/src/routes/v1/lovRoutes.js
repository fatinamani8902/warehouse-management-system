import express from "express";
import { withTenantContext } from "../../db/withTenantContext.js";
import { ApiError } from "../../utils/errors.js";
import { buildPagination, parsePagination } from "../../utils/pagination.js";

const router = express.Router();

function requiredText(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", `${fieldName} is required`);
  }
  return normalized;
}

function normalizeLovCode(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function requiredCode(value, fieldName) {
  requiredText(value, fieldName);
  const normalized = normalizeLovCode(value);
  if (!normalized) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} must contain at least one letter or number`
    );
  }
  return normalized;
}

function optionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function requireDeleteConfirmation(req) {
  if (req.body?.confirmDelete !== true) {
    throw new ApiError(
      400,
      "DELETE_CONFIRMATION_REQUIRED",
      "confirmDelete=true is required"
    );
  }
}

function mapDatabaseError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error?.code === "23505") {
    return new ApiError(409, "DUPLICATE_LOV", "An LOV record with the same code already exists");
  }

  if (error?.code === "23503") {
    return new ApiError(409, "LOV_IN_USE", "The LOV record is referenced by another record");
  }

  return error;
}

async function selectGroup(client, tenantId, lovGroupId) {
  const result = await client.query(
    `SELECT
       g.lov_group_id AS id,
       g.lov_group_id,
       g.group_code,
       g.group_name AS name,
       g.group_name,
       g.description,
       g.is_system,
       g.created_at,
       g.updated_at,
       COALESCE(
         json_agg(
           json_build_object(
             'id', v.lov_value_id,
             'lov_value_id', v.lov_value_id,
             'value_code', v.value_code,
             'value_label', v.value_label,
             'sort_order', v.sort_order,
             'is_active', v.is_active,
             'created_at', v.created_at,
             'updated_at', v.updated_at
           )
           ORDER BY v.sort_order, v.value_label
         ) FILTER (WHERE v.lov_value_id IS NOT NULL),
         '[]'::json
       ) AS values
     FROM public.lov_groups g
     LEFT JOIN public.lov_values v
       ON v.tenant_id = g.tenant_id
      AND v.lov_group_id = g.lov_group_id
     WHERE g.tenant_id = $1
       AND g.lov_group_id = $2
     GROUP BY g.lov_group_id`,
    [tenantId, lovGroupId]
  );

  return result.rows[0] || null;
}

router.get("/groups", async (req, res, next) => {
  const search = String(req.query.search || "").trim().toLowerCase();
  const { page, pageSize } = parsePagination(req.query);
  const offset = (page - 1) * pageSize;

  try {
    const result = await withTenantContext(req.context.tenantId, async (client) => {
      const params = [req.context.tenantId];
      let whereSql = "WHERE g.tenant_id = $1";

      if (search) {
        params.push(`%${search}%`);
        whereSql += ` AND (
          lower(g.group_code) LIKE $${params.length}
          OR lower(g.group_name) LIKE $${params.length}
        )`;
      }

      const countResult = await client.query(
        `SELECT count(*)::int AS total
         FROM public.lov_groups g
         ${whereSql}`,
        params
      );

      const listParams = [...params, pageSize, offset];
      const limitParam = listParams.length - 1;
      const offsetParam = listParams.length;
      const rowsResult = await client.query(
        `SELECT
           g.lov_group_id AS id,
           g.lov_group_id,
           g.group_code,
           g.group_name AS name,
           g.group_name,
           g.description,
           g.is_system,
           g.created_at,
           g.updated_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', v.lov_value_id,
                 'lov_value_id', v.lov_value_id,
                 'value_code', v.value_code,
                 'value_label', v.value_label,
                 'sort_order', v.sort_order,
                 'is_active', v.is_active,
                 'created_at', v.created_at,
                 'updated_at', v.updated_at
               )
               ORDER BY v.sort_order, v.value_label
             ) FILTER (WHERE v.lov_value_id IS NOT NULL),
             '[]'::json
           ) AS values
         FROM public.lov_groups g
         LEFT JOIN public.lov_values v
           ON v.tenant_id = g.tenant_id
          AND v.lov_group_id = g.lov_group_id
         ${whereSql}
         GROUP BY g.lov_group_id
         ORDER BY g.group_code
         LIMIT $${limitParam}
         OFFSET $${offsetParam}`,
        listParams
      );

      return {
        rows: rowsResult.rows,
        pagination: buildPagination(page, pageSize, countResult.rows[0]?.total || 0),
      };
    });

    return res.json({
      success: true,
      data: result.rows,
      meta: {
        requestId: req.requestId || null,
        tenantId: req.context.tenantId,
        pagination: result.pagination,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(mapDatabaseError(error));
  }
});

router.get("/groups/:id", async (req, res, next) => {
  try {
    const group = await withTenantContext(req.context.tenantId, (client) =>
      selectGroup(client, req.context.tenantId, req.params.id)
    );

    if (!group) {
      throw new ApiError(404, "LOV_GROUP_NOT_FOUND", "LOV group not found");
    }

    return res.json({ success: true, data: group });
  } catch (error) {
    return next(mapDatabaseError(error));
  }
});

router.post("/groups", async (req, res, next) => {
  try {
    const groupCode = requiredCode(req.body?.group_code ?? req.body?.id, "group_code");
    const groupName = requiredText(req.body?.group_name ?? req.body?.name, "group_name");
    const description = optionalText(req.body?.description);
    const isSystem = req.body?.is_system === true;

    const group = await withTenantContext(req.context.tenantId, async (client) => {
      const insertResult = await client.query(
        `INSERT INTO public.lov_groups (
           tenant_id,
           group_code,
           group_name,
           description,
           is_system
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING lov_group_id`,
        [req.context.tenantId, groupCode, groupName, description, isSystem]
      );

      return selectGroup(
        client,
        req.context.tenantId,
        insertResult.rows[0].lov_group_id
      );
    });

    return res.status(201).json({ success: true, data: group });
  } catch (error) {
    return next(mapDatabaseError(error));
  }
});

router.put("/groups/:id", async (req, res, next) => {
  try {
    const groupCode = requiredCode(req.body?.group_code ?? req.body?.id, "group_code");
    const groupName = requiredText(req.body?.group_name ?? req.body?.name, "group_name");
    const description = optionalText(req.body?.description);

    const group = await withTenantContext(req.context.tenantId, async (client) => {
      const updateResult = await client.query(
        `UPDATE public.lov_groups
         SET group_code = $3,
             group_name = $4,
             description = $5,
             updated_at = now()
         WHERE tenant_id = $1
           AND lov_group_id = $2
         RETURNING lov_group_id`,
        [req.context.tenantId, req.params.id, groupCode, groupName, description]
      );

      if (!updateResult.rowCount) {
        return null;
      }

      return selectGroup(client, req.context.tenantId, req.params.id);
    });

    if (!group) {
      throw new ApiError(404, "LOV_GROUP_NOT_FOUND", "LOV group not found");
    }

    return res.json({ success: true, data: group });
  } catch (error) {
    return next(mapDatabaseError(error));
  }
});

router.delete("/groups/:id", async (req, res, next) => {
  try {
    requireDeleteConfirmation(req);

    const deleted = await withTenantContext(req.context.tenantId, async (client) => {
      const result = await client.query(
        `DELETE FROM public.lov_groups
         WHERE tenant_id = $1
           AND lov_group_id = $2
         RETURNING
           lov_group_id AS id,
           lov_group_id,
           group_code,
           group_name AS name,
           group_name,
           description,
           is_system`,
        [req.context.tenantId, req.params.id]
      );

      return result.rows[0] || null;
    });

    if (!deleted) {
      throw new ApiError(404, "LOV_GROUP_NOT_FOUND", "LOV group not found");
    }

    return res.json({ success: true, data: deleted });
  } catch (error) {
    return next(mapDatabaseError(error));
  }
});

router.post("/groups/:id/values", async (req, res, next) => {
  try {
    const valueCode = requiredCode(req.body?.value_code ?? req.body?.value, "value_code");
    const valueLabel = requiredText(
      req.body?.value_label ?? req.body?.label ?? req.body?.value,
      "value_label"
    );
    const sortOrder = Number.isInteger(req.body?.sort_order) ? req.body.sort_order : 0;
    const isActive = req.body?.is_active !== false;

    const value = await withTenantContext(req.context.tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO public.lov_values (
           tenant_id,
           lov_group_id,
           value_code,
           value_label,
           sort_order,
           is_active
         )
         SELECT $1, g.lov_group_id, $3, $4, $5, $6
         FROM public.lov_groups g
         WHERE g.tenant_id = $1
           AND g.lov_group_id = $2
         RETURNING
           lov_value_id AS id,
           lov_value_id,
           lov_group_id,
           value_code,
           value_label,
           sort_order,
           is_active,
           created_at,
           updated_at`,
        [
          req.context.tenantId,
          req.params.id,
          valueCode,
          valueLabel,
          sortOrder,
          isActive,
        ]
      );

      return result.rows[0] || null;
    });

    if (!value) {
      throw new ApiError(404, "LOV_GROUP_NOT_FOUND", "LOV group not found");
    }

    return res.status(201).json({ success: true, data: value });
  } catch (error) {
    return next(mapDatabaseError(error));
  }
});

router.put("/groups/:id/values/:lovValueId", async (req, res, next) => {
  try {
    const valueCode = requiredCode(req.body?.value_code ?? req.body?.value, "value_code");
    const valueLabel = requiredText(
      req.body?.value_label ?? req.body?.label ?? req.body?.value,
      "value_label"
    );
    const sortOrder = Number.isInteger(req.body?.sort_order) ? req.body.sort_order : 0;
    const isActive = req.body?.is_active !== false;

    const value = await withTenantContext(req.context.tenantId, async (client) => {
      const result = await client.query(
        `UPDATE public.lov_values
         SET value_code = $4,
             value_label = $5,
             sort_order = $6,
             is_active = $7,
             updated_at = now()
         WHERE tenant_id = $1
           AND lov_group_id = $2
           AND lov_value_id = $3
         RETURNING
           lov_value_id AS id,
           lov_value_id,
           lov_group_id,
           value_code,
           value_label,
           sort_order,
           is_active,
           created_at,
           updated_at`,
        [
          req.context.tenantId,
          req.params.id,
          req.params.lovValueId,
          valueCode,
          valueLabel,
          sortOrder,
          isActive,
        ]
      );

      return result.rows[0] || null;
    });

    if (!value) {
      throw new ApiError(404, "LOV_VALUE_NOT_FOUND", "LOV value not found");
    }

    return res.json({ success: true, data: value });
  } catch (error) {
    return next(mapDatabaseError(error));
  }
});

router.delete("/groups/:id/values/:lovValueId", async (req, res, next) => {
  try {
    requireDeleteConfirmation(req);

    const value = await withTenantContext(req.context.tenantId, async (client) => {
      const result = await client.query(
        `DELETE FROM public.lov_values
         WHERE tenant_id = $1
           AND lov_group_id = $2
           AND lov_value_id = $3
         RETURNING
           lov_value_id AS id,
           lov_value_id,
           lov_group_id,
           value_code,
           value_label,
           sort_order,
           is_active`,
        [req.context.tenantId, req.params.id, req.params.lovValueId]
      );

      return result.rows[0] || null;
    });

    if (!value) {
      throw new ApiError(404, "LOV_VALUE_NOT_FOUND", "LOV value not found");
    }

    return res.json({ success: true, data: value });
  } catch (error) {
    return next(mapDatabaseError(error));
  }
});

export default router;
