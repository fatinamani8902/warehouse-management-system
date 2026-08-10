import { QueryTypes } from "sequelize";
import { sequelize } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const MAX_PAGE_SIZE = 100;
const SENSITIVE_KEY_PATTERN = /(authorization|password|secret|token|jwt|session|credential|cookie)/i;

let forceAuditFailureForTests = false;

function requireTenant(tenantId) {
  const value = String(tenantId || "").trim();
  if (!value) throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  return value;
}

function cleanString(value, maxLength = null) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) return null;
  return maxLength && text.length > maxLength ? text.slice(0, maxLength) : text;
}

function sanitizeMetadata(value, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) return {};
  return Object.entries(value).reduce((safe, [key, item]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) return safe;
    if (item === undefined || typeof item === "function") return safe;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      safe[key] = sanitizeMetadata(item, depth + 1);
      return safe;
    }
    if (Array.isArray(item)) {
      safe[key] = item
        .filter((entry) => entry === null || ["string", "number", "boolean"].includes(typeof entry))
        .slice(0, 50);
      return safe;
    }
    safe[key] = item;
    return safe;
  }, {});
}

function pagination(input = {}) {
  const page = Math.max(1, Number.parseInt(input.page, 10) || 1);
  const requestedPageSize = Number.parseInt(input.pageSize, 10) || 10;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function setTenantContext({ tenantId, transaction }) {
  await sequelize.query(
    "SELECT set_config('app.current_tenant_id', :tenantId, true)",
    { replacements: { tenantId }, transaction }
  );
}

async function resolveUserDisplay({ tenantId, userId, fallbackDisplayName, transaction }) {
  const id = cleanString(userId, 64);
  if (!id) return null;
  const rows = await sequelize.query(
    `SELECT user_name
       FROM public.users
      WHERE tenant_id = :tenantId
        AND user_id = :userId
      LIMIT 1`,
    {
      replacements: { tenantId, userId: id },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  const name = cleanString(rows[0]?.user_name || fallbackDisplayName, 160);
  return name ? `${name} (${id})` : id;
}

function setReturnRmaAuditFailureForTests(value) {
  forceAuditFailureForTests = Boolean(value);
}

async function recordReturnRmaAuditEvent({
  tenantId,
  entityType,
  entityId,
  returnId = null,
  rmaId = null,
  actionCode,
  previousStatus = null,
  newStatus = null,
  performedByUserId,
  performedByDisplayName = null,
  performedByRoleId = null,
  remarks = null,
  metadata = {},
  requestId = null,
  ipAddress = null,
  userAgent = null,
  transaction,
}) {
  const scopedTenantId = requireTenant(tenantId);
  if (!transaction) throw new Error("Return/RMA audit events must be recorded inside a transaction");
  if (forceAuditFailureForTests && process.env.NODE_ENV !== "production") {
    throw new Error("Forced Return/RMA audit failure for tests");
  }

  await setTenantContext({ tenantId: scopedTenantId, transaction });
  const actorId = cleanString(performedByUserId, 64);
  if (!actorId) throw new ApiError(403, "USER_CONTEXT_REQUIRED", "User context is required");
  const displayName = await resolveUserDisplay({
    tenantId: scopedTenantId,
    userId: actorId,
    fallbackDisplayName: performedByDisplayName,
    transaction,
  });

  const rows = await sequelize.query(
    `INSERT INTO public.return_rma_audit_events (
       tenant_id,
       entity_type,
       entity_id,
       return_id,
       rma_id,
       action_code,
       previous_status,
       new_status,
       performed_by_user_id,
       performed_by_display_name,
       performed_by_role_id,
       remarks,
       metadata,
       request_id,
       ip_address,
       user_agent
     ) VALUES (
       :tenantId,
       :entityType,
       :entityId,
       :returnId,
       :rmaId,
       :actionCode,
       :previousStatus,
       :newStatus,
       :performedByUserId,
       :performedByDisplayName,
       :performedByRoleId,
       :remarks,
       CAST(:metadata AS jsonb),
       :requestId,
       :ipAddress,
       :userAgent
     )
     RETURNING *`,
    {
      replacements: {
        tenantId: scopedTenantId,
        entityType: cleanString(entityType, 32),
        entityId: cleanString(entityId, 64),
        returnId: cleanString(returnId, 64),
        rmaId: cleanString(rmaId, 64),
        actionCode: cleanString(actionCode, 64),
        previousStatus: cleanString(previousStatus, 64),
        newStatus: cleanString(newStatus, 64),
        performedByUserId: actorId,
        performedByDisplayName: displayName,
        performedByRoleId: cleanString(performedByRoleId, 64),
        remarks: cleanString(remarks),
        metadata: JSON.stringify(sanitizeMetadata(metadata)),
        requestId: cleanString(requestId, 128),
        ipAddress: cleanString(ipAddress, 128),
        userAgent: cleanString(userAgent, 512),
      },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  return rows[0] || null;
}

async function listReturnRmaAuditEvents({ tenantId, entityType, entityId, returnId = null, rmaId = null, page = 1, pageSize = 10 }) {
  const scopedTenantId = requireTenant(tenantId);
  const { page: currentPage, pageSize: currentPageSize, offset } = pagination({ page, pageSize });
  return sequelize.transaction(async (transaction) => {
    await setTenantContext({ tenantId: scopedTenantId, transaction });
    const replacements = {
      tenantId: scopedTenantId,
      entityType: cleanString(entityType, 32),
      entityId: cleanString(entityId, 64),
      returnId: cleanString(returnId, 64),
      rmaId: cleanString(rmaId, 64),
      limit: currentPageSize,
      offset,
    };
    const countRows = await sequelize.query(
      `SELECT count(*)::int AS total
         FROM public.return_rma_audit_events
        WHERE tenant_id = :tenantId
          AND (:entityType IS NULL OR entity_type = :entityType)
          AND (:entityId IS NULL OR entity_id = :entityId)
          AND (:returnId IS NULL OR return_id = :returnId)
          AND (:rmaId IS NULL OR rma_id = :rmaId)`,
      { replacements, type: QueryTypes.SELECT, transaction }
    );
    const items = await sequelize.query(
      `SELECT *
         FROM public.return_rma_audit_events
        WHERE tenant_id = :tenantId
          AND (:entityType IS NULL OR entity_type = :entityType)
          AND (:entityId IS NULL OR entity_id = :entityId)
          AND (:returnId IS NULL OR return_id = :returnId)
          AND (:rmaId IS NULL OR rma_id = :rmaId)
        ORDER BY created_at DESC, audit_event_id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT, transaction }
    );
    return {
      total: Number(countRows[0]?.total || 0),
      page: currentPage,
      pageSize: currentPageSize,
      items,
    };
  });
}

export {
  listReturnRmaAuditEvents,
  recordReturnRmaAuditEvent,
  setReturnRmaAuditFailureForTests,
};
