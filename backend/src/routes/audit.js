import express from "express";
import { listAuditLogs } from "../../data/store.js";
import { hasPermission } from "../../services/rbac.js";

const router = express.Router();

const RISK_MAP = {
  delete:         "High",
  cancel:         "High",
  adjust:         "High",
  mark_exception: "High",
  approve:        "Medium",
  dispatch:       "Medium",
  update:         "Medium",
  post:           "Medium",
  create:         "Low",
  scan:           "Low",
  submit:         "Low",
  execute_entry:  "Low",
  recompute_bin:  "Low",
  assign:         "Low",
};

function resolveRisk(action) {
  if (!action) return "Low";
  return RISK_MAP[String(action).toLowerCase()] || "Low";
}

function enrichLog(log) {
  return { ...log, risk: resolveRisk(log.action) };
}

function paginate(rows, page, pageSize) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(200, Math.max(1, Number(pageSize) || 20));
  const total = rows.length;
  const offset = (safePage - 1) * safeSize;
  return {
    items: rows.slice(offset, offset + safeSize),
    total,
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.max(1, Math.ceil(total / safeSize)),
  };
}

// GET /api/v1/audit/options
router.get("/options", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.tenant_id || "TNT000001";
    const roleId   = req.role_id || req.context?.roles?.[0] || "superadmin";

    if (!hasPermission(roleId, "audit.view")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view audit logs" });
    }

    const logs = listAuditLogs(tenantId).map(enrichLog);

    const actions    = [...new Set(logs.map((l) => l.action).filter(Boolean))].sort();
    const entities   = [...new Set(logs.map((l) => l.entity_type).filter(Boolean))].sort();
    const users      = [...new Set(logs.map((l) => l.user_id).filter(Boolean))].sort();
    const riskLevels = ["High", "Medium", "Low"];

    return res.json({ actions, entities, users, riskLevels });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/audit/logs
router.get("/logs", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.tenant_id || "TNT000001";
    const roleId   = req.role_id || req.context?.roles?.[0] || "superadmin";

    if (!hasPermission(roleId, "audit.view")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view audit logs" });
    }

    const {
      search, action, entity, risk, user,
      dateFrom, dateTo,
      page, pageSize,
    } = req.query;

    let logs = listAuditLogs(tenantId).map(enrichLog);

    if (search) {
      const q = String(search).toLowerCase();
      logs = logs.filter((l) =>
        [l.user_id, l.entity_id, l.message, l.entity_type, l.action, l.from_status, l.to_status]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }

    if (action) {
      logs = logs.filter((l) =>
        String(l.action || "").toLowerCase() === String(action).toLowerCase(),
      );
    }

    if (entity) {
      logs = logs.filter((l) =>
        String(l.entity_type || "").toLowerCase() === String(entity).toLowerCase(),
      );
    }

    if (risk) {
      logs = logs.filter((l) => l.risk === risk);
    }

    if (user) {
      logs = logs.filter((l) =>
        String(l.user_id || "").toLowerCase().includes(String(user).toLowerCase()),
      );
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      logs = logs.filter((l) => l.timestamp && new Date(l.timestamp).getTime() >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      logs = logs.filter((l) => l.timestamp && new Date(l.timestamp).getTime() <= to.getTime());
    }

    return res.json(paginate(logs, page, pageSize));
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;