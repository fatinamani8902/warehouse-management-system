import { useState, useEffect, useCallback, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Download, X, FileSearch, ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toSessionContext, fetchAuditOptions, fetchAuditLogs } from "@/services/api";
import { formatDate, formatDateTime } from "@/utils/dateTimeFormatter";

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 12px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnOutline = { ...btnBase, height: 30, padding: "0 10px", borderRadius: 6, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const cardStyle  = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };
const thStyle    = { padding: "9px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap", background: "#fafbff" };

const PAGE_SIZE = 20;

const USER_NAMES = {
  USR000001: "John Admin",    USR000002: "Sarah Manager",
  USR000003: "Mike Operator", USR000004: "Lisa Operator",
  USR000005: "HQ Admin",      USR100001: "Tenant2 Manager",
};

const BADGE_VARIANTS = {
  create:         { bg: "#EAF3DE", color: "#27500A" },
  update:         { bg: "#FAEEDA", color: "#633806" },
  delete:         { bg: "#FCEBEB", color: "#791F1F" },
  cancel:         { bg: "#FCEBEB", color: "#791F1F" },
  scan:           { bg: "#EEEDFE", color: "#3C3489" },
  dispatch:       { bg: "#E6F1FB", color: "#0C447C" },
  adjust:         { bg: "#FAEEDA", color: "#633806" },
  approve:        { bg: "#EAF3DE", color: "#27500A" },
  submit:         { bg: "#E6F1FB", color: "#0C447C" },
  post:           { bg: "#EAF3DE", color: "#27500A" },
  assign:         { bg: "#EEEDFE", color: "#3C3489" },
  mark_exception: { bg: "#FCEBEB", color: "#791F1F" },
  reject:         { bg: "#FCEBEB", color: "#791F1F" },
  execute_entry:  { bg: "#EEEDFE", color: "#3C3489" },
};

const RISK_VARIANTS = {
  High:   { bg: "#FCEBEB", color: "#791F1F" },
  Medium: { bg: "#FAEEDA", color: "#633806" },
  Low:    { bg: "#EAF3DE", color: "#27500A" },
};

// ── Utils (unchanged) ─────────────────────────────────────────────────────────
function resolveUserName(userId) { return USER_NAMES[userId] || userId; }

function resolveUserIdsFromSearch(searchTerm) {
  if (!searchTerm) return [];
  const q = searchTerm.toLowerCase();
  return Object.entries(USER_NAMES).filter(([, name]) => name.toLowerCase().includes(q)).map(([id]) => id);
}

function clientFilter(logs, search) {
  if (!search) return logs;
  const q = search.toLowerCase();
  const matchingUserIds = resolveUserIdsFromSearch(search);
  return logs.filter((l) => {
    const userName = resolveUserName(l.user_id).toLowerCase();
    return (
      userName.includes(q) || matchingUserIds.includes(l.user_id) ||
      String(l.entity_id   || "").toLowerCase().includes(q) ||
      String(l.entity_type || "").toLowerCase().includes(q) ||
      String(l.action      || "").toLowerCase().includes(q) ||
      String(l.message     || "").toLowerCase().includes(q) ||
      String(l.from_status || "").toLowerCase().includes(q) ||
      String(l.to_status   || "").toLowerCase().includes(q)
    );
  });
}

// ── Small components ──────────────────────────────────────────────────────────
function ActionBadge({ action }) {
  const s = BADGE_VARIANTS[String(action || "").toLowerCase()] || { bg: "#F1EFE8", color: "#444441" };
  return (
    <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, whiteSpace: "nowrap", textTransform: "capitalize", fontWeight: 500, letterSpacing: "0.01em" }}>
      {action}
    </span>
  );
}

function RiskBadge({ risk }) {
  const s = RISK_VARIANTS[risk] || RISK_VARIANTS.Low;
  return (
    <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, whiteSpace: "nowrap", fontWeight: 500 }}>
      {risk}
    </span>
  );
}

function UserAvatar({ userId }) {
  const name     = resolveUserName(userId);
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const palette  = [
    { bg: "#DBEAFE", color: "#1E40AF" }, { bg: "#D1FAE5", color: "#065F46" },
    { bg: "#EDE9FE", color: "#5B21B6" }, { bg: "#FEF3C7", color: "#92400E" },
  ];
  const c = palette[(userId ? userId.charCodeAt(3) : 0) % palette.length];
  return (
    <div title={userId} style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
      {initials}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", letterSpacing: "0.08em", textTransform: "uppercase", color: T_LABEL, marginBottom: 8, paddingBottom: 6, borderBottom: "0.5px solid #eef0fc" }}>
      {children}
    </p>
  );
}

function DetailRow({ label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", fontSize: 13, borderBottom: "0.5px solid #f0f0f0" }}>
      <span style={{ color: T_LABEL, minWidth: 110, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <span style={{ textAlign: "right", color: T_PRIMARY }}>{children}</span>
    </div>
  );
}

function EmptyState({ hasFilters }) {
  return (
    <tr>
      <td colSpan={7}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4rem 0", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileSearch size={20} style={{ color: T_MUTED }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: T_SECONDARY }}>{hasFilters ? "No events match your filters" : "No audit events yet"}</p>
            <p style={{ fontSize: 13, color: T_MUTED, marginTop: 4 }}>{hasFilters ? "Try adjusting or clearing your filters" : "Events appear here when users perform actions in the system"}</p>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Entity timeline (unchanged logic) ────────────────────────────────────────
function EntityTimeline({ entityId, entityType, allLogs, onBack }) {
  const events = useMemo(() =>
    allLogs.filter((l) => l.entity_id === entityId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    [allLogs, entityId],
  );

  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#fafbff", borderBottom: "0.5px solid #eef0fc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{ ...btnBase, height: "auto", padding: 0, fontSize: 13, color: T_SECONDARY, background: "none" }}>
            <ArrowLeft size={14} /> Back to event detail
          </button>
          <div style={{ width: 1, height: 14, background: "#e5e7eb" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>Timeline for</span>
            <code style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#fff", border: "0.5px solid #e5e7eb", color: ACCENT }}>{entityId}</code>
            <span style={{ fontSize: 13, color: T_MUTED, textTransform: "capitalize" }}>({entityType})</span>
          </div>
        </div>
        <span style={{ fontSize: 13, color: T_MUTED }}>{events.length} event{events.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={{ padding: "20px 24px" }}>
        {events.length === 0 ? (
          <p style={{ fontSize: 13, color: T_MUTED, textAlign: "center", padding: "2rem 0" }}>No events recorded for this entity</p>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 10, top: 10, bottom: 10, width: 1, background: "#e5e7eb" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {events.map((ev, idx) => {
                const isFirst = idx === 0, isLast = idx === events.length - 1;
                const hasTransition = ev.from_status || ev.to_status;
                const isNewRecord = !ev.from_status && ev.to_status;
                return (
                  <div key={ev.audit_id} style={{ display: "flex", gap: 16, position: "relative" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: isFirst ? "#D1FAE5" : isLast ? "#DBEAFE" : "#f9fafb", border: `2px solid ${isFirst ? "#059669" : isLast ? "#3B82F6" : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: isFirst ? "#059669" : isLast ? "#3B82F6" : T_MUTED }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <ActionBadge action={ev.action} />
                        <RiskBadge risk={ev.risk} />
                        <span style={{ fontSize: 13, color: T_MUTED }}>{formatDateTime(ev.timestamp)}</span>
                      </div>
                      {ev.message && <p style={{ fontSize: 13, color: T_SECONDARY, marginBottom: 6 }}>{ev.message}</p>}
                      {hasTransition && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          {isNewRecord ? (
                            <><span style={{ fontSize: 13, color: T_MUTED }}>Created as</span><span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#D1FAE5", color: "#065F46" }}>{ev.to_status}</span></>
                          ) : (
                            <><span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#FEE2E2", color: "#991B1B" }}>{ev.from_status}</span><span style={{ fontSize: 13, color: T_MUTED }}>→</span><span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#D1FAE5", color: "#065F46" }}>{ev.to_status}</span></>
                          )}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <UserAvatar userId={ev.user_id} />
                        <span style={{ fontSize: 13, color: T_SECONDARY }}>{resolveUserName(ev.user_id)}</span>
                        <span style={{ fontSize: 13, color: T_MUTED }}>·</span>
                        <span style={{ fontSize: 13, color: T_MUTED }}>{formatDateTime(ev.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail panel (unchanged logic) ───────────────────────────────────────────
function DetailPanel({ log, onClose, onViewTimeline }) {
  if (!log) return null;
  const hasTransition = log.from_status || log.to_status;
  const isNewRecord   = !log.from_status && log.to_status;

  return (
    <div style={{ ...cardStyle, marginTop: 16, borderTop: "2px solid #3b5bdb" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#fafbff", borderBottom: "0.5px solid #eef0fc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ActionBadge action={log.action} />
          <code style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#fff", border: "0.5px solid #e5e7eb", color: ACCENT }}>{log.entity_id}</code>
          <RiskBadge risk={log.risk} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onViewTimeline} style={{ ...btnBase, height: 30, padding: "0 12px", borderRadius: 7, fontSize: 13, fontWeight: 500, background: ACCENT_LIGHT, color: ACCENT, border: "0.5px solid #c7d2fe" }}>
            View full timeline →
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: T_MUTED }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body — two columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "20px 24px", gap: 0 }}>
        {/* Left */}
        <div style={{ paddingRight: 24, borderRight: "0.5px solid #eef0fc" }}>
          <SectionLabel>Event info</SectionLabel>
          <DetailRow label="Audit ID"><code style={{ fontSize: 12, color: T_SECONDARY }}>{log.audit_id}</code></DetailRow>
          <DetailRow label="Timestamp"><span style={{ fontSize: 13 }}>{formatDateTime(log.timestamp)}</span></DetailRow>
          <DetailRow label="Action"><ActionBadge action={log.action} /></DetailRow>
          <DetailRow label="Risk level"><RiskBadge risk={log.risk} /></DetailRow>
          <DetailRow label="Entity type"><span style={{ fontSize: 13, textTransform: "capitalize" }}>{log.entity_type}</span></DetailRow>
          <DetailRow label="Entity ID"><code style={{ fontSize: 13, color: ACCENT }}>{log.entity_id}</code></DetailRow>
          {log.message && <DetailRow label="Message"><span style={{ fontSize: 13, textAlign: "right", maxWidth: 180, lineHeight: 1.5 }}>{log.message}</span></DetailRow>}
          {log.source  && <DetailRow label="Source"><span style={{ fontSize: 13 }}>{log.source}</span></DetailRow>}
        </div>

        {/* Right */}
        <div style={{ paddingLeft: 24 }}>
          <SectionLabel>Session info</SectionLabel>
          <DetailRow label="User">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <UserAvatar userId={log.user_id} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{resolveUserName(log.user_id)}</span>
            </div>
          </DetailRow>
          <DetailRow label="User ID"><code style={{ fontSize: 12, color: T_MUTED }}>{log.user_id}</code></DetailRow>
          <DetailRow label="Tenant"><code style={{ fontSize: 12 }}>{log.tenant_id}</code></DetailRow>

          {hasTransition && (
            <div style={{ marginTop: 20 }}>
              <SectionLabel>{isNewRecord ? "Record created" : "Status transition"}</SectionLabel>
              {isNewRecord ? (
                <DetailRow label="New record created with status">
                  <span style={{ fontSize: 13, padding: "3px 10px", borderRadius: 6, background: "#D1FAE5", color: "#065F46", fontWeight: 500, whiteSpace: "nowrap" }}>{log.to_status}</span>
                </DetailRow>
              ) : (
                <DetailRow label="Status changed">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, padding: "3px 10px", borderRadius: 6, background: "#FEE2E2", color: "#991B1B", fontWeight: 500 }}>{log.from_status}</span>
                    <span style={{ fontSize: 13, color: T_MUTED }}>→</span>
                    <span style={{ fontSize: 13, padding: "3px 10px", borderRadius: 6, background: "#D1FAE5", color: "#065F46", fontWeight: 500 }}>{log.to_status}</span>
                  </div>
                </DetailRow>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const { authState }  = useAuth();
  const session        = toSessionContext(authState);

  const [allLogs, setAllLogs]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const [options, setOptions]               = useState({ actions: [], entities: [], users: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [search, setSearch]             = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [filterRisk, setFilterRisk]     = useState("");
  const [filterUser, setFilterUser]     = useState("");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [page, setPage]                 = useState(1);

  const [selectedLog, setSelectedLog]       = useState(null);
  const [timelineEntity, setTimelineEntity] = useState(null);
  const [hoveredEntityId, setHoveredEntityId] = useState(null);

  const logs = useMemo(() => clientFilter(allLogs, search), [allLogs, search]);

  // ── Load options (unchanged) ──────────────────────────────────────────────
  useEffect(() => {
    if (!session?.tenant_id) return;
    setOptionsLoading(true);
    fetchAuditOptions(session)
      .then((data) => {
        if (data) setOptions({
          actions:  data.actions  || [],
          entities: data.entities || [],
          users: (data.users || []).map((uid) => ({ value: uid, label: resolveUserName(uid) })),
        });
      })
      .catch(() => {})
      .finally(() => setOptionsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.tenant_id]);

  // ── Load logs (unchanged) ─────────────────────────────────────────────────
  const loadLogs = useCallback(() => {
    if (!session?.tenant_id) return;
    setLoading(true); setError(null);
    fetchAuditLogs(session, {
      page, pageSize: PAGE_SIZE,
      action: filterAction || undefined, entity: filterEntity || undefined,
      risk:   filterRisk   || undefined, user:   filterUser   || undefined,
      dateFrom: dateFrom   || undefined, dateTo: dateTo       || undefined,
    })
      .then((data) => { setAllLogs(data?.items || []); setTotal(data?.total || 0); setTotalPages(data?.totalPages || 1); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterAction, filterEntity, filterRisk, filterUser, dateFrom, dateTo, session.tenant_id]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { setPage(1); setSelectedLog(null); setTimelineEntity(null); }, [filterAction, filterEntity, filterRisk, filterUser, dateFrom, dateTo]);

  const clearAll = () => {
    setSearch(""); setFilterAction(""); setFilterEntity("");
    setFilterRisk(""); setFilterUser(""); setDateFrom(""); setDateTo("");
    setPage(1); setSelectedLog(null); setTimelineEntity(null);
  };

  const hasFilters = !!(search || filterAction || filterEntity || filterRisk || filterUser || dateFrom || dateTo);

  const activeTags = [
    filterAction && { label: `Action: ${filterAction}`,              clear: () => setFilterAction("") },
    filterEntity && { label: `Entity: ${filterEntity}`,              clear: () => setFilterEntity("") },
    filterRisk   && { label: `Risk: ${filterRisk}`,                  clear: () => setFilterRisk("") },
    filterUser   && { label: `User: ${resolveUserName(filterUser)}`, clear: () => setFilterUser("") },
    dateFrom     && { label: `From: ${formatDate(dateFrom)}`,        clear: () => setDateFrom("") },
    dateTo       && { label: `To: ${formatDate(dateTo)}`,            clear: () => setDateTo("") },
  ].filter(Boolean);

  const highRiskCount  = logs.filter((l) => l.risk === "High").length;
  const uniqueUsers    = new Set(logs.map((l) => l.user_id)).size;
  const uniqueEntities = new Set(logs.map((l) => l.entity_type)).size;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Audit Log" }]} />

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Audit Log</h1>
          <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Complete activity trail — restricted to superadmin and hqadmin</p>
        </div>
        <button style={btnNeutral} onClick={() => {}}>
          <Download size={16} /> Export
        </button>
      </div>

      {/* Info bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: "#fffbeb", border: "0.5px solid #fde68a", fontSize: 13, color: "#92400e" }}>
        <ShieldAlert size={15} style={{ flexShrink: 0, color: "#d97706" }} />
        PII data is masked in exported logs. Sensitive operations are flagged for compliance review. Logs are retained for 12 months.
      </div>

      {/* Filter card */}
      <div style={{ ...cardStyle, marginBottom: 16, overflow: "visible" }}>
        <div style={{ padding: "14px 16px", background: "#fafbff", borderBottom: "0.5px solid #eef0fc" }}>
          {/* Row 1 — search + dates */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
              <Search size={16} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: T_MUTED, flexShrink: 0 }} />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, entity ID, action…"
                style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 28px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
              />
              {search && <X size={16} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: T_MUTED }} onClick={() => setSearch("")} />}
            </div>
            <span style={{ fontSize: 13, color: T_MUTED }}>From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              style={{ fontSize: 13, height: 40, padding: "0 10px", borderRadius: 7, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY }} />
            <span style={{ fontSize: 13, color: T_MUTED }}>To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              style={{ fontSize: 13, height: 40, padding: "0 10px", borderRadius: 7, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY }} />
            <div style={{ flex: 1 }} />
            {hasFilters && (
              <button onClick={clearAll} style={{ ...btnBase, height: "auto", padding: 0, fontSize: 13, color: T_MUTED, background: "none", textDecoration: "underline" }}>
                Clear all
              </button>
            )}
          </div>

          {/* Row 2 — dropdowns */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {[
              { value: filterAction, setValue: setFilterAction, placeholder: "All actions",     width: 148, items: options.actions.map((a) => ({ value: a, label: a })) },
              { value: filterEntity, setValue: setFilterEntity, placeholder: "All entities",    width: 148, items: options.entities.map((e) => ({ value: e, label: e })) },
              { value: filterRisk,   setValue: setFilterRisk,   placeholder: "All risk levels", width: 148, items: [{ value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }] },
              { value: filterUser,   setValue: setFilterUser,   placeholder: "All users",       width: 160, items: options.users },
            ].map(({ value, setValue, placeholder, width, items }) => (
              <Select key={placeholder} value={value || "all"} onValueChange={(v) => setValue(v === "all" ? "" : v)}
                disabled={optionsLoading && placeholder !== "All risk levels"}>
                <SelectTrigger style={{ height: 40, fontSize: 13, width, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{placeholder}</SelectItem>
                  {items.map(({ value: v, label }) => (
                    <SelectItem key={v} value={v} style={{ textTransform: "capitalize" }}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            <div style={{ flex: 1 }} />
            <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={loadLogs} disabled={loading}>Refresh</button>
          </div>

          {/* Active filter tags */}
          {activeTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {activeTags.map((t) => (
                <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 10px", borderRadius: 20, background: ACCENT_LIGHT, color: ACCENT, border: "0.5px solid #c7d2fe" }}>
                  {t.label}
                  <X size={11} style={{ cursor: "pointer", opacity: 0.6 }} onClick={t.clear} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { num: logs.length,    label: "Total events",  color: T_PRIMARY  },
          { num: highRiskCount,  label: "High risk",     color: "#b91c1c"  },
          { num: uniqueUsers,    label: "Active users",  color: "#065f46"  },
          { num: uniqueEntities, label: "Entity types",  color: "#1d4ed8"  },
        ].map(({ num, label, color }) => (
          <div key={label} style={{ ...cardStyle, padding: "14px 16px" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{num}</div>
            <div style={{ fontSize: 12, color: T_MUTED, marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div style={cardStyle}>
        {/* Risk legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 16px", flexWrap: "wrap", borderBottom: "0.5px solid #eef0fc" }}>
          <span style={{ fontSize: 12, color: T_MUTED }}>Risk level:</span>
          {[{ risk: "High", desc: "Destructive" }, { risk: "Medium", desc: "State change" }, { risk: "Low", desc: "Read / create" }].map(({ risk, desc }) => (
            <div key={risk} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RiskBadge risk={risk} />
              <span style={{ fontSize: 12, color: T_MUTED }}>{desc}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: "#E24B4A" }} />
            <span style={{ fontSize: 12, color: T_MUTED }}>High risk row</span>
          </div>
        </div>

        {/* Table */}
        {error ? (
          <div style={{ padding: "3rem", textAlign: "center", fontSize: 13, color: "#b91c1c" }}>{error}</div>
        ) : loading ? (
          <div style={{ padding: "3rem", textAlign: "center", fontSize: 13, color: T_MUTED }}>Loading…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {[
                  { label: "Date & Time", w: 150 }, { label: "User",      w: 160 },
                  { label: "Action",      w: 100 }, { label: "Entity",    w: 90  },
                  { label: "Entity ID",   w: 120 }, { label: "Details",   w: "auto" },
                  { label: "Risk",        w: 80  },
                ].map(({ label, w }) => (
                  <th key={label} style={{ ...thStyle, width: w }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? <EmptyState hasFilters={hasFilters} /> : logs.map((log) => {
                const isSel    = selectedLog?.audit_id === log.audit_id;
                const details  = log.message || (log.from_status && log.to_status ? `${log.entity_type} changed from ${log.from_status} to ${log.to_status}` : `${log.entity_type} ${log.action}`);
                return (
                  <tr key={log.audit_id}
                    onClick={() => { setTimelineEntity(null); setSelectedLog(isSel ? null : log); }}
                    style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0", borderLeft: log.risk === "High" ? "3px solid #E24B4A" : "3px solid transparent" }}
                    onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                    onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = isSel ? ACCENT_LIGHT : "transparent"; }}
                  >
                    <td style={{ padding: "12px 16px", fontSize: 13, color: T_SECONDARY, whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <UserAvatar userId={log.user_id} />
                        <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T_PRIMARY }}>{resolveUserName(log.user_id)}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}><ActionBadge action={log.action} /></td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: T_SECONDARY, textTransform: "capitalize" }}>{log.entity_type}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedLog(null); setTimelineEntity({ id: log.entity_id, type: log.entity_type }); }}
                        onMouseEnter={() => setHoveredEntityId(log.audit_id)}
                        onMouseLeave={() => setHoveredEntityId(null)}
                        style={{ ...btnBase, height: "auto", padding: 0, fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: ACCENT, background: "none", textDecoration: hoveredEntityId === log.audit_id ? "underline" : "none" }}
                        title="Click to view full timeline"
                      >
                        {log.entity_id}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: T_SECONDARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={details}>{details}</td>
                    <td style={{ padding: "12px 16px" }}><RiskBadge risk={log.risk} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "0.5px solid #eef0fc", background: "#fafbff" }}>
          <span style={{ fontSize: 13, color: T_MUTED }}>
            {logs.length === 0 ? "No events" : `Showing ${Math.min(1, logs.length)}–${logs.length} of ${total} events`}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button style={{ ...btnOutline, opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? "not-allowed" : "pointer" }} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push("..."); acc.push(p); return acc; }, [])
              .map((p, i) => p === "..." ? (
                <span key={`d${i}`} style={{ fontSize: 13, color: T_MUTED, padding: "0 4px" }}>…</span>
              ) : (
                <button key={p} onClick={() => setPage(p)}
                  style={{ ...btnOutline, width: 30, padding: 0, justifyContent: "center", background: p === page ? ACCENT : "#fff", color: p === page ? "#fff" : T_PRIMARY, border: p === page ? "none" : "0.5px solid #d1d5db" }}>
                  {p}
                </button>
              ))}
            <button style={{ ...btnOutline, opacity: page === totalPages ? 0.4 : 1, cursor: page === totalPages ? "not-allowed" : "pointer" }} disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedLog && !timelineEntity && (
        <DetailPanel log={selectedLog} onClose={() => setSelectedLog(null)}
          onViewTimeline={() => setTimelineEntity({ id: selectedLog.entity_id, type: selectedLog.entity_type })} />
      )}

      {/* Entity timeline */}
      {timelineEntity && (
        <EntityTimeline entityId={timelineEntity.id} entityType={timelineEntity.type} allLogs={allLogs}
          onBack={() => {
            setTimelineEntity(null);
            if (!selectedLog) { const match = allLogs.find((l) => l.entity_id === timelineEntity.id); if (match) setSelectedLog(match); }
          }} />
      )}
    </AppLayout>
  );
}
