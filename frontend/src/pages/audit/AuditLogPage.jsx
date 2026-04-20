import { useState, useEffect, useCallback, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Download, X, FileSearch, ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toSessionContext, fetchAuditOptions, fetchAuditLogs } from "@/services/api";

const PAGE_SIZE = 20;

const USER_NAMES = {
  USR000001: "John Admin",
  USR000002: "Sarah Manager",
  USR000003: "Mike Operator",
  USR000004: "Lisa Operator",
  USR000005: "HQ Admin",
  USR100001: "Tenant2 Manager",
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

// ── utils ─────────────────────────────────────────────────────────────────────

function resolveUserName(userId) {
  return USER_NAMES[userId] || userId;
}

function resolveUserIdsFromSearch(searchTerm) {
  if (!searchTerm) return [];
  const q = searchTerm.toLowerCase();
  return Object.entries(USER_NAMES)
    .filter(([, name]) => name.toLowerCase().includes(q))
    .map(([id]) => id);
}

function formatDateTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-MY", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts; }
}

function formatDateTimeFull(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-MY", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return ts; }
}

function clientFilter(logs, search) {
  if (!search) return logs;
  const q = search.toLowerCase();
  const matchingUserIds = resolveUserIdsFromSearch(search);
  return logs.filter((l) => {
    const userName = resolveUserName(l.user_id).toLowerCase();
    return (
      userName.includes(q) ||
      matchingUserIds.includes(l.user_id) ||
      String(l.entity_id   || "").toLowerCase().includes(q) ||
      String(l.entity_type || "").toLowerCase().includes(q) ||
      String(l.action      || "").toLowerCase().includes(q) ||
      String(l.message     || "").toLowerCase().includes(q) ||
      String(l.from_status || "").toLowerCase().includes(q) ||
      String(l.to_status   || "").toLowerCase().includes(q)
    );
  });
}

// ── small components ───────────────────────────────────────────────────────────

function ActionBadge({ action }) {
  const key = String(action || "").toLowerCase();
  const s   = BADGE_VARIANTS[key] || { bg: "#F1EFE8", color: "#444441" };
  return (
    <span style={{
      fontSize: 12, padding: "3px 10px", borderRadius: 20,
      background: s.bg, color: s.color,
      whiteSpace: "nowrap", textTransform: "capitalize",
      fontWeight: 500, letterSpacing: "0.01em",
    }}>
      {action}
    </span>
  );
}

function RiskBadge({ risk }) {
  const s = RISK_VARIANTS[risk] || RISK_VARIANTS.Low;
  return (
    <span style={{
      fontSize: 12, padding: "3px 10px", borderRadius: 20,
      background: s.bg, color: s.color, whiteSpace: "nowrap", fontWeight: 500,
    }}>
      {risk}
    </span>
  );
}

function UserAvatar({ userId }) {
  const name     = resolveUserName(userId);
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const palette  = [
    { bg: "#DBEAFE", color: "#1E40AF" },
    { bg: "#D1FAE5", color: "#065F46" },
    { bg: "#EDE9FE", color: "#5B21B6" },
    { bg: "#FEF3C7", color: "#92400E" },
  ];
  const c = palette[(userId ? userId.charCodeAt(3) : 0) % palette.length];
  return (
    <div title={userId} style={{
      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {initials}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", color: "var(--color-text-tertiary)",
      marginBottom: 8, paddingBottom: 6,
      borderBottom: "0.5px solid var(--color-border-tertiary)",
    }}>
      {children}
    </p>
  );
}

// FIX: alignItems flex-start + paddingTop on label so label aligns with
// first line of multi-line or avatar content
function DetailRow({ label, children }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      padding: "8px 0", fontSize: 13,
      borderBottom: "0.5px solid var(--color-border-tertiary)",
    }}>
      <span style={{
        color: "var(--color-text-tertiary)",
        minWidth: 110, flexShrink: 0,
        paddingTop: 2, // nudge label down to align with first line of content
      }}>
        {label}
      </span>
      <span style={{ textAlign: "right", color: "var(--color-text-primary)" }}>{children}</span>
    </div>
  );
}

function EmptyState({ hasFilters }) {
  return (
    <tr>
      <td colSpan={7}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "4rem 0", gap: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "var(--color-background-secondary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FileSearch size={20} style={{ color: "var(--color-text-tertiary)" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>
              {hasFilters ? "No events match your filters" : "No audit events yet"}
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 4 }}>
              {hasFilters
                ? "Try adjusting or clearing your filters"
                : "Events appear here when users perform actions in the system"}
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── entity timeline ───────────────────────────────────────────────────────────

function EntityTimeline({ entityId, entityType, allLogs, onBack }) {
  const events = useMemo(() =>
    allLogs
      .filter((l) => l.entity_id === entityId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    [allLogs, entityId],
  );

  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 12, overflow: "hidden", marginTop: 16,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px",
        background: "var(--color-background-secondary)",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 13, color: "var(--color-text-secondary)",
              background: "none", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <ArrowLeft size={14} /> Back to event detail
          </button>
          <div style={{ width: 1, height: 14, background: "var(--color-border-secondary)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Timeline for</span>
            <code style={{
              fontSize: 13, padding: "2px 8px", borderRadius: 6,
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-secondary)",
              color: "var(--color-text-info)",
            }}>
              {entityId}
            </code>
            <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", textTransform: "capitalize" }}>
              ({entityType})
            </span>
          </div>
        </div>
        <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ padding: "20px 24px" }}>
        {events.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", padding: "2rem 0" }}>
            No events recorded for this entity
          </p>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", left: 10, top: 10, bottom: 10,
              width: 1, background: "var(--color-border-tertiary)",
            }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {events.map((ev, idx) => {
                const isFirst       = idx === 0;
                const isLast        = idx === events.length - 1;
                const hasTransition = ev.from_status || ev.to_status;
                const isNewRecord   = !ev.from_status && ev.to_status;
                return (
                  <div key={ev.audit_id} style={{ display: "flex", gap: 16, position: "relative" }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: isFirst ? "#D1FAE5" : isLast ? "#DBEAFE" : "var(--color-background-secondary)",
                      border: `2px solid ${isFirst ? "#059669" : isLast ? "#3B82F6" : "var(--color-border-secondary)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1,
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: isFirst ? "#059669" : isLast ? "#3B82F6" : "var(--color-text-tertiary)",
                      }} />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <ActionBadge action={ev.action} />
                        <RiskBadge risk={ev.risk} />
                        <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                          {formatDateTime(ev.timestamp)}
                        </span>
                      </div>

                      {ev.message && (
                        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                          {ev.message}
                        </p>
                      )}

                      {hasTransition && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          {isNewRecord ? (
                            <>
                              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Created as</span>
                              <span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#D1FAE5", color: "#065F46" }}>
                                {ev.to_status}
                              </span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#FEE2E2", color: "#991B1B" }}>
                                {ev.from_status}
                              </span>
                              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>→</span>
                              <span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#D1FAE5", color: "#065F46" }}>
                                {ev.to_status}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <UserAvatar userId={ev.user_id} />
                        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                          {resolveUserName(ev.user_id)}
                        </span>
                        <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>·</span>
                        <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                          {formatDateTimeFull(ev.timestamp)}
                        </span>
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

// ── detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ log, onClose, onViewTimeline }) {
  if (!log) return null;
  const hasTransition = log.from_status || log.to_status;
  const isNewRecord   = !log.from_status && log.to_status;

  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 12, overflow: "hidden", marginTop: 16,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px",
        background: "var(--color-background-secondary)",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ActionBadge action={log.action} />
          <code style={{
            fontSize: 13, padding: "2px 8px", borderRadius: 6,
            background: "var(--color-background-primary)",
            border: "0.5px solid var(--color-border-secondary)",
            color: "var(--color-text-info)",
          }}>
            {log.entity_id}
          </code>
          <RiskBadge risk={log.risk} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onViewTimeline}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
              background: "var(--color-background-info)",
              color: "var(--color-text-info)",
              border: "0.5px solid var(--color-border-info)",
              fontWeight: 500,
            }}
          >
            View full timeline →
          </button>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--color-text-tertiary)" }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* FIX: use gap instead of padding/border trick so columns are truly equal */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "20px 24px", gap: 0 }}>

        {/* LEFT COLUMN */}
        <div style={{ paddingRight: 24, borderRight: "0.5px solid var(--color-border-tertiary)" }}>
          <SectionLabel>Event info</SectionLabel>
          <DetailRow label="Audit ID">
            <code style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{log.audit_id}</code>
          </DetailRow>
          <DetailRow label="Timestamp">
            <span style={{ fontSize: 13 }}>{formatDateTimeFull(log.timestamp)}</span>
          </DetailRow>
          <DetailRow label="Action"><ActionBadge action={log.action} /></DetailRow>
          <DetailRow label="Risk level"><RiskBadge risk={log.risk} /></DetailRow>
          <DetailRow label="Entity type">
            <span style={{ fontSize: 13, textTransform: "capitalize" }}>{log.entity_type}</span>
          </DetailRow>
          <DetailRow label="Entity ID">
            <code style={{ fontSize: 13, color: "var(--color-text-info)" }}>{log.entity_id}</code>
          </DetailRow>
          {log.message && (
            <DetailRow label="Message">
              <span style={{ fontSize: 13, textAlign: "right", maxWidth: 180, lineHeight: 1.5 }}>{log.message}</span>
            </DetailRow>
          )}
          {log.source && (
            <DetailRow label="Source"><span style={{ fontSize: 13 }}>{log.source}</span></DetailRow>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ paddingLeft: 24 }}>
          <SectionLabel>Session info</SectionLabel>
          <DetailRow label="User">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <UserAvatar userId={log.user_id} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{resolveUserName(log.user_id)}</span>
            </div>
          </DetailRow>
          <DetailRow label="User ID">
            <code style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{log.user_id}</code>
          </DetailRow>
          <DetailRow label="Tenant">
            <code style={{ fontSize: 12 }}>{log.tenant_id}</code>
          </DetailRow>

          {hasTransition && (
            <div style={{ marginTop: 20 }}>
              <SectionLabel>{isNewRecord ? "Record created" : "Status transition"}</SectionLabel>
              {isNewRecord ? (
                <DetailRow label="New record created with status">
                  <span style={{
                    fontSize: 13, padding: "3px 10px", borderRadius: 6,
                    background: "#D1FAE5", color: "#065F46", fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}>
                    {log.to_status}
                  </span>
                </DetailRow>
              ) : (
                <DetailRow label="Status changed">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 13, padding: "3px 10px", borderRadius: 6,
                      background: "#FEE2E2", color: "#991B1B", fontWeight: 500,
                    }}>
                      {log.from_status}
                    </span>
                    <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>→</span>
                    <span style={{
                      fontSize: 13, padding: "3px 10px", borderRadius: 6,
                      background: "#D1FAE5", color: "#065F46", fontWeight: 500,
                    }}>
                      {log.to_status}
                    </span>
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

// ── main page ─────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const { authState } = useAuth();
  const session       = toSessionContext(authState);

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

  const [selectedLog, setSelectedLog]         = useState(null);
  const [timelineEntity, setTimelineEntity]   = useState(null);
  const [hoveredEntityId, setHoveredEntityId] = useState(null);

  const logs = useMemo(() => clientFilter(allLogs, search), [allLogs, search]);

  useEffect(() => {
    if (!session?.tenant_id) return;
    setOptionsLoading(true);
    fetchAuditOptions(session)
      .then((data) => {
        if (data) {
          setOptions({
            actions:  data.actions  || [],
            entities: data.entities || [],
            users: (data.users || []).map((uid) => ({ value: uid, label: resolveUserName(uid) })),
          });
        }
      })
      .catch(() => {})
      .finally(() => setOptionsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.tenant_id]);

  const loadLogs = useCallback(() => {
    if (!session?.tenant_id) return;
    setLoading(true);
    setError(null);
    fetchAuditLogs(session, {
      page, pageSize: PAGE_SIZE,
      action:   filterAction || undefined,
      entity:   filterEntity || undefined,
      risk:     filterRisk   || undefined,
      user:     filterUser   || undefined,
      dateFrom: dateFrom     || undefined,
      dateTo:   dateTo       || undefined,
    })
      .then((data) => {
        setAllLogs(data?.items || []);
        setTotal(data?.total || 0);
        setTotalPages(data?.totalPages || 1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterAction, filterEntity, filterRisk, filterUser, dateFrom, dateTo, session.tenant_id]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    setPage(1);
    setSelectedLog(null);
    setTimelineEntity(null);
  }, [filterAction, filterEntity, filterRisk, filterUser, dateFrom, dateTo]);

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
    dateFrom     && { label: `From: ${dateFrom}`,                    clear: () => setDateFrom("") },
    dateTo       && { label: `To: ${dateTo}`,                        clear: () => setDateTo("") },
  ].filter(Boolean);

  const highRiskCount  = logs.filter((l) => l.risk === "High").length;
  const uniqueUsers    = new Set(logs.map((l) => l.user_id)).size;
  const uniqueEntities = new Set(logs.map((l) => l.entity_type)).size;

  function getRowStyle(log) {
    const isSelected = selectedLog?.audit_id === log.audit_id;
    return {
      cursor: "pointer",
      background: isSelected ? "var(--color-background-info)" : "transparent",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
      borderLeft: log.risk === "High" ? "3px solid #E24B4A" : "3px solid transparent",
      transition: "background 0.12s ease",
    };
  }

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Audit Log" }]} />

      {/* page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
            Audit Log
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            Complete activity trail — restricted to superadmin and hqadmin
          </p>
        </div>
        <Button size="sm" variant="outline" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Download size={14} /> Export
        </Button>
      </div>

      {/* info bar — FIX: alignItems center so icon stays vertically centred with text */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderRadius: 8, marginBottom: 16,
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        fontSize: 13, color: "var(--color-text-secondary)",
      }}>
        <ShieldAlert size={15} style={{ flexShrink: 0, color: "var(--color-text-tertiary)" }} />
        PII data is masked in exported logs. Sensitive operations are flagged for compliance review.
        Logs are retained for 12 months.
      </div>

      {/* filter card — CSS grid so "Search" label and "Filter by" label share the same left edge,
           and inputs in col 2 are flush-left with each other */}
      <div style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 12, padding: "16px 20px", marginBottom: 16,
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          alignItems: "center",
          rowGap: 10,
          columnGap: 12,
        }}>
          {/* row 1: search + date */}
          <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>Search</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 8, padding: "0 12px", height: 36,
              background: "var(--color-background-secondary)", flex: 1, maxWidth: 300,
            }}>
              <Search size={13} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, entity ID, action..."
                style={{
                  border: "none", outline: "none", background: "transparent",
                  fontSize: 13, color: "var(--color-text-primary)", width: "100%",
                }}
              />
              {search && (
                <X size={12} style={{ cursor: "pointer", color: "var(--color-text-tertiary)", flexShrink: 0 }}
                  onClick={() => setSearch("")} />
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>From</span>
              <input
                type="date" value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  fontSize: 13, height: 36, padding: "0 10px", borderRadius: 8,
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "var(--color-background-secondary)",
                  color: "var(--color-text-primary)",
                }}
              />
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>To</span>
              <input
                type="date" value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  fontSize: 13, height: 36, padding: "0 10px", borderRadius: 8,
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "var(--color-background-secondary)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {hasFilters && (
              <button
                onClick={clearAll}
                style={{
                  marginLeft: "auto", fontSize: 13, color: "var(--color-text-tertiary)",
                  background: "none", border: "none", cursor: "pointer", textDecoration: "underline",
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* row 2: dropdowns */}
          <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>Filter by</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {[
            {
              value: filterAction, setValue: setFilterAction,
              placeholder: "All actions", width: 148,
              items: options.actions.map((a) => ({ value: a, label: a })),
            },
            {
              value: filterEntity, setValue: setFilterEntity,
              placeholder: "All entities", width: 148,
              items: options.entities.map((e) => ({ value: e, label: e })),
            },
            {
              value: filterRisk, setValue: setFilterRisk,
              placeholder: "All risk levels", width: 148,
              items: [
                { value: "High", label: "High" },
                { value: "Medium", label: "Medium" },
                { value: "Low", label: "Low" },
              ],
            },
            {
              value: filterUser, setValue: setFilterUser,
              placeholder: "All users", width: 160,
              items: options.users,
            },
          ].map(({ value, setValue, placeholder, width, items }) => (
            <Select
              key={placeholder}
              value={value || "all"}
              onValueChange={(v) => setValue(v === "all" ? "" : v)}
              disabled={optionsLoading && placeholder !== "All risk levels"}
            >
              <SelectTrigger style={{ height: 36, fontSize: 13, width }}>
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
          </div>
        </div>

        {/* active filter tags */}
        {activeTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {activeTags.map((t) => (
              <div
                key={t.label}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 13, padding: "4px 10px", borderRadius: 20,
                  background: "var(--color-background-info)",
                  color: "var(--color-text-info)",
                  border: "0.5px solid var(--color-border-info)",
                }}
              >
                {t.label}
                <X size={11} style={{ cursor: "pointer", opacity: 0.6 }} onClick={t.clear} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { num: logs.length,    label: "Total events",  color: undefined  },
          { num: highRiskCount,  label: "High risk",     color: "#B91C1C"  },
          { num: uniqueUsers,    label: "Active users",  color: "#065F46"  },
          { num: uniqueEntities, label: "Entity types",  color: "#1D4ED8"  },
        ].map(({ num, label, color }) => (
          <div key={label} style={{
            background: "var(--color-background-secondary)",
            borderRadius: 10, padding: "12px 16px",
          }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: color || "var(--color-text-primary)", lineHeight: 1 }}>
              {num}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* table card */}
      <div style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 12, overflow: "hidden",
      }}>
        {/* risk legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Risk level:</span>
          {[
            { risk: "High", desc: "Destructive" },
            { risk: "Medium", desc: "State change" },
            { risk: "Low", desc: "Read / create" },
          ].map(({ risk, desc }) => (
            <div key={risk} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RiskBadge risk={risk} />
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>{desc}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: "#E24B4A" }} />
            <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>High risk row</span>
          </div>
        </div>

        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
          {error ? (
            <div style={{ padding: "3rem", textAlign: "center", fontSize: 13, color: "var(--color-text-danger)" }}>
              {error}
            </div>
          ) : loading ? (
            <div style={{ padding: "3rem", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>
              Loading...
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: "var(--color-background-secondary)" }}>
                  {[
                    { label: "Date & Time", w: 150 },
                    { label: "User",        w: 160 },
                    { label: "Action",      w: 100 },
                    { label: "Entity",      w: 90  },
                    { label: "Entity ID",   w: 120 },
                    { label: "Details",     w: "auto" },
                    { label: "Risk",        w: 80  },
                  ].map(({ label, w }) => (
                    <th key={label} style={{
                      padding: "10px 16px", textAlign: "left",
                      fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--color-text-tertiary)",
                      borderBottom: "0.5px solid var(--color-border-tertiary)",
                      width: w,
                    }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0
                  ? <EmptyState hasFilters={hasFilters} />
                  : logs.map((log) => {
                    const details  = log.message
                      || (log.from_status && log.to_status
                        ? `${log.entity_type} changed from ${log.from_status} to ${log.to_status}`
                        : `${log.entity_type} ${log.action}`);
                    return (
                      <tr
                        key={log.audit_id}
                        onClick={() => {
                          setTimelineEntity(null);
                          setSelectedLog(selectedLog?.audit_id === log.audit_id ? null : log);
                        }}
                        style={getRowStyle(log)}
                      >
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                          {formatDateTime(log.timestamp)}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <UserAvatar userId={log.user_id} />
                            <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {resolveUserName(log.user_id)}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <ActionBadge action={log.action} />
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-secondary)", textTransform: "capitalize" }}>
                          {log.entity_type}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(null);
                              setTimelineEntity({ id: log.entity_id, type: log.entity_type });
                            }}
                            onMouseEnter={() => setHoveredEntityId(log.audit_id)}
                            onMouseLeave={() => setHoveredEntityId(null)}
                            style={{
                              background: "none", border: "none", padding: 0, cursor: "pointer",
                              fontFamily: "monospace", fontSize: 13, fontWeight: 500,
                              color: "var(--color-text-info)",
                              textDecoration: hoveredEntityId === log.audit_id ? "underline" : "none",
                            }}
                            title="Click to view full timeline"
                          >
                            {log.entity_id}
                          </button>
                        </td>
                        <td style={{
                          padding: "12px 16px", fontSize: 13,
                          color: "var(--color-text-secondary)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }} title={details}>
                          {details}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <RiskBadge risk={log.risk} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>

        {/* pagination */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 20px",
          borderTop: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-secondary)",
        }}>
          <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            {logs.length === 0
              ? "No events"
              : `Showing ${Math.min(1, logs.length)}–${logs.length} of ${total} events`}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Button variant="outline" size="sm" style={{ height: 30, padding: "0 10px", fontSize: 13 }}
              disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "..." ? (
                  <span key={`d${i}`} style={{ fontSize: 13, color: "var(--color-text-tertiary)", padding: "0 4px" }}>…</span>
                ) : (
                  <Button key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm" style={{ height: 30, width: 30, padding: 0, fontSize: 13 }}
                    onClick={() => setPage(p)}>
                    {p}
                  </Button>
                ),
              )}
            <Button variant="outline" size="sm" style={{ height: 30, padding: "0 10px", fontSize: 13 }}
              disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>→</Button>
          </div>
        </div>
      </div>

      {/* detail panel */}
      {selectedLog && !timelineEntity && (
        <DetailPanel
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onViewTimeline={() => {
            setTimelineEntity({ id: selectedLog.entity_id, type: selectedLog.entity_type });
          }}
        />
      )}

      {/* entity timeline */}
      {timelineEntity && (
        <EntityTimeline
          entityId={timelineEntity.id}
          entityType={timelineEntity.type}
          allLogs={allLogs}
          onBack={() => {
            setTimelineEntity(null);
            if (!selectedLog) {
              const match = allLogs.find((l) => l.entity_id === timelineEntity.id);
              if (match) setSelectedLog(match);
            }
          }}
        />
      )}
    </AppLayout>
  );
}