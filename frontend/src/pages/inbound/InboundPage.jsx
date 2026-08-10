import { useCallback, useEffect, useMemo, useState } from "react";
import { GlossaryRegistry, GlossaryTerm } from "@/components/shared/GlossaryTooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { WorkflowStepper } from "@/components/shared/WorkflowStepper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatQuantity } from "@/utils/formatQuantity";
import { formatDate, formatDateTime } from "@/utils/dateTimeFormatter";
import { displayValue } from "@/utils/displayValue";
import { filterByCreatedDate } from "@/utils/createdDateFilter";
import {
  fetchAsns,
  fetchGrns,
  toSessionContext,
  transitionAsn,
  transitionGrn,
  updateGrnLines,
} from "@/services/api";
import {
  canTransition,
  canCancelDocument,
  canCreateAsn,
  canCreateGrn,
  normalizeRole as normalizeRbacRole,
} from "@/services/rbac";
import CreateASN from "./CreateASN";
import CreateGRN from "./CreateGRN";

// -- Design tokens -------------------------------------------------------------
const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: "#e03131", color: "#fff" };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const detailActionArea = { display: "flex", gap: 8, flexWrap: "wrap" };
const detailActionPrimary = btnPrimary;
const detailActionDanger = btnDanger;

// -- Status pill ---------------------------------------------------------------
const STATUS_CFG = {
  draft:      { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Draft" },
  pending:    { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "Pending" },
  in_transit: { bg: "#dbeafe", color: "#1e3a8a", border: "#93c5fd", dot: "#3b82f6",  label: "In Transit" },
  arrived:    { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Arrived" },
  closed:     { bg: "#e0e7ff", color: "#3730a3", border: "#a5b4fc", dot: "#6366f1",  label: "Closed" },
  cancelled:  { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5", dot: "#ef4444",  label: "Cancelled" },
  receiving:  { bg: "#ffedd5", color: "#7c2d12", border: "#fdba74", dot: "#f97316",  label: "Receiving" },
  completed:  { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Completed" },
  posted:     { bg: "#e0e7ff", color: "#3730a3", border: "#a5b4fc", dot: "#6366f1",  label: "Posted" },
};

function StatusPill({ status }) {
  if (displayValue(status) === "-") return <span style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_PRIMARY }}>-</span>;
  const key = String(status || "").toLowerCase();
  const c = STATUS_CFG[key] || { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280", label: displayValue(status) };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 12, fontWeight: 500, lineHeight: "16px", padding: "3px 10px", borderRadius: 20,
      background: c.bg, color: c.color, border: `0.5px solid ${c.border}`,
      whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

// -- Line status config --------------------------------------------------------
const LINE_STATUS_CFG = {
  pending: { bg: "#F1EFE8", color: "#5F5E5A" },
  matched: { bg: "#EAF3DE", color: "#27500A" },
  over:    { bg: "#FCEBEB", color: "#791F1F" },
  short:   { bg: "#FAEEDA", color: "#633806" },
};

// -- Constants -----------------------------------------------------------------
const asnActionLabels = {
  submit: "Submit", mark_in_transit: "Mark In Transit",
  mark_arrived: "Mark Arrived", close: "Close", cancel: "Cancel ASN",
};
const grnActionLabels = {
  start_receiving: "Start Receiving", complete: "Finish Receiving",
  post: "Post to Inventory",
};
const asnStatusActions = {
  draft: ["submit", "cancel"], pending: ["mark_in_transit", "cancel"],
  in_transit: ["mark_arrived"], arrived: ["close"],
  closed: [], cancelled: [],
};
const grnStatusActions = {
  draft: ["start_receiving"], receiving: ["complete"],
  completed: ["post"], posted: [], cancelled: [],
};
const inboundAsnActionRoles = {
  submit: ["superadmin", "hqadmin", "storemanager", "storeoperator"],
  mark_in_transit: ["superadmin", "hqadmin", "storemanager"],
  mark_arrived: ["superadmin", "hqadmin", "storemanager"],
  close: ["superadmin", "hqadmin", "storemanager"],
  cancel: ["superadmin", "hqadmin", "storemanager"],
};

const inboundTabs          = new Set(["asn", "grn"]);
const asnQueryStatuses     = new Set(["open", "draft", "pending", "in_transit", "arrived", "closed", "cancelled"]);
const grnQueryStatuses     = new Set(["open", "draft", "receiving", "completed", "posted", "cancelled"]);
const inboundStatusFilters = new Set(["open", "draft", "pending", "in_transit", "arrived", "closed", "receiving", "completed", "posted", "cancelled"]);
const ASN_STATUS_OPTIONS   = ["draft", "pending", "in_transit", "arrived", "closed", "cancelled"];
const GRN_STATUS_OPTIONS   = ["draft", "receiving", "completed", "posted", "cancelled"];

function parseInboundQuery(search) {
  const params = new URLSearchParams(search || "");
  const rawTab    = String(params.get("tab") || "").toLowerCase();
  const rawStatus = String(params.get("status") || "").toLowerCase();
  const rawDate   = String(params.get("date") || "").toLowerCase();
  return {
    tab:    inboundTabs.has(rawTab) ? rawTab : "asn",
    status: inboundStatusFilters.has(rawStatus) ? rawStatus : "",
    date:   rawDate === "today" ? "today" : "",
  };
}

function toStepperSteps(currentStatus, flow) {
  const labelForStatus = (status) => STATUS_CFG[status]?.label || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (currentStatus === "cancelled") {
    return flow.map((s, i) => ({ label: labelForStatus(s), status: i === 0 ? "current" : "pending" }));
  }
  let reached = false;
  return flow.map((s) => {
    if (s === currentStatus) { reached = true; return { label: labelForStatus(s), status: "current" }; }
    return { label: labelForStatus(s), status: reached ? "pending" : "completed" };
  });
}

function normalizeInboundStatusKey(status) {
  return String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

// -- DetailField ---------------------------------------------------------------
function DetailField({ label, value, danger, span, mono, children }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, letterSpacing: "0.06em", marginBottom: 4 }}>
        {typeof label === "string"
          ? <span style={{ textTransform: "uppercase" }}>{label}</span>
          : label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: danger ? "#991b1b" : T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
        {children ?? displayValue(value)}
      </p>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", padding: "12px 16px", marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function DetailFieldGrid({ title, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean);
  const padded = [...items];
  while (padded.length < 5) padded.push(<div key={`spacer-${padded.length}`} aria-hidden="true" />);
  return (
    <DetailSection title={title}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5" style={{ columnGap: 14, rowGap: 11, alignItems: "start" }}>
        {padded}
      </div>
    </DetailSection>
  );
}

// -- Page ----------------------------------------------------------------------
const InboundPage = () => {
  const auth      = useAuth();
  const location  = useLocation();
  const { toast } = useToast();
  const session   = useMemo(() => toSessionContext(auth), [auth]);
  const rawRoleId = session.role_id || auth.currentUser?.role;
  const roleId    = useMemo(() => normalizeRbacRole(rawRoleId), [rawRoleId]);

  const [activeTab, setActiveTab]         = useState("asn");
  const [routeFilters, setRouteFilters]   = useState({ status: "", date: "" });
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState("");
  const [submittingKey, setSubmittingKey] = useState("");
  const [cancelling, setCancelling]       = useState(false);
  const [asns, setAsns]                   = useState([]);
  const [grns, setGrns]                   = useState([]);

  const [asnSearch, setAsnSearch]             = useState("");
  const [asnStatusFilter, setAsnStatusFilter] = useState("");
  const [asnDateFrom, setAsnDateFrom]         = useState("");
  const [asnDateTo, setAsnDateTo]             = useState("");
  const [grnSearch, setGrnSearch]             = useState("");
  const [grnStatusFilter, setGrnStatusFilter] = useState("");
  const [grnDateFrom, setGrnDateFrom]         = useState("");
  const [grnDateTo, setGrnDateTo]             = useState("");

  const [asnPage, setAsnPage]         = useState(1);
  const [asnPageSize, setAsnPageSize] = useState(10);
  const [grnPage, setGrnPage]         = useState(1);
  const [grnPageSize, setGrnPageSize] = useState(10);

  const [selectedAsn, setSelectedAsn]     = useState(null);
  const [selectedGrn, setSelectedGrn]     = useState(null);
  const [showCreateAsn, setShowCreateAsn] = useState(false);
  const [showCreateGrn, setShowCreateGrn] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelErr, setCancelErr]       = useState("");

  const [receivingQty, setReceivingQty] = useState({});
  const [savingLines, setSavingLines]   = useState(false);

  // -- URL sync --------------------------------------------------------------
  useEffect(() => {
    const parsed = parseInboundQuery(location.search);
    setActiveTab(parsed.tab);
    setRouteFilters({ status: parsed.status, date: parsed.date });
  }, [location.search]);

  // -- Load ------------------------------------------------------------------
  const loadInboundData = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setLoading(true); setError("");
      const [asnRows, grnRows] = await Promise.all([
        fetchAsns(session, { status: asnQueryStatuses.has(routeFilters.status) ? routeFilters.status : undefined, date: routeFilters.date || undefined, page: 1, pageSize: 200 }),
        fetchGrns(session, { status: grnQueryStatuses.has(routeFilters.status) ? routeFilters.status : undefined, date: routeFilters.date || undefined, page: 1, pageSize: 200 }),
      ]);
      setAsns(Array.isArray(asnRows?.data) ? asnRows.data : Array.isArray(asnRows) ? asnRows : []);
      setGrns(Array.isArray(grnRows?.data) ? grnRows.data : Array.isArray(grnRows) ? grnRows : []);
    } catch (e) {
      setError(e.message || "Failed to load inbound data");
    } finally { setLoading(false); }
  }, [routeFilters.date, routeFilters.status, session.tenant_id, session.user_id, session.role_id, session.warehouse_id]);

  useEffect(() => { loadInboundData(); }, [loadInboundData]);

  // -- Derived selected details ----------------------------------------------
  const selectedAsnDetails = selectedAsn ? asns.find((r) => r.asn_id === selectedAsn.asn_id) || selectedAsn : null;
  const selectedGrnDetails = selectedGrn ? grns.find((r) => r.grn_id === selectedGrn.grn_id) || selectedGrn : null;

  useEffect(() => {
    if (!selectedGrnDetails) return;
    const init = {};
    (selectedGrnDetails.lines || []).forEach((l) => { init[l.line_no] = l.received_qty ?? 0; });
    setReceivingQty(init);
  }, [selectedGrnDetails?.grn_id]);

  // -- Filtered + paged ------------------------------------------------------
  const filteredAsns = useMemo(() => {
    const q    = asnSearch.toLowerCase();
    return filterByCreatedDate(asns, asnDateFrom, asnDateTo).filter((r) => {
      return (
        (!q || (r.asn_id || "").toLowerCase().includes(q) || (r.supplier_name || "").toLowerCase().includes(q)) &&
        (!asnStatusFilter || r.status === asnStatusFilter)
      );
    });
  }, [asns, asnSearch, asnStatusFilter, asnDateFrom, asnDateTo]);

  const asnTotalPages = Math.max(1, Math.ceil(filteredAsns.length / asnPageSize));
  const pagedAsns     = useMemo(() => filteredAsns.slice((asnPage - 1) * asnPageSize, asnPage * asnPageSize), [filteredAsns, asnPage, asnPageSize]);

  const filteredGrns = useMemo(() => {
    const q    = grnSearch.toLowerCase();
    return filterByCreatedDate(grns, grnDateFrom, grnDateTo).filter((r) => {
      return (
        (!q || (r.grn_id || "").toLowerCase().includes(q) || (r.supplier_name || "").toLowerCase().includes(q) || (r.asn_id || "").toLowerCase().includes(q)) &&
        (!grnStatusFilter || r.status === grnStatusFilter)
      );
    });
  }, [grns, grnSearch, grnStatusFilter, grnDateFrom, grnDateTo]);

  const grnTotalPages = Math.max(1, Math.ceil(filteredGrns.length / grnPageSize));
  const pagedGrns     = useMemo(() => filteredGrns.slice((grnPage - 1) * grnPageSize, grnPage * grnPageSize), [filteredGrns, grnPage, grnPageSize]);

  // -- Transitions -----------------------------------------------------------
  const runAsnTransition = async (record, action) => {
    try {
      setSubmittingKey(`${record.asn_id}-${action}`); setError("");
      const res = await transitionAsn(session, record.asn_id, action);
      const updated = res.data;
      setAsns((prev) => prev.map((r) => r.asn_id === updated.asn_id ? updated : r));
      setSelectedAsn((cur) => cur?.asn_id === updated.asn_id ? updated : cur);
      toast({ title: "ASN status updated", description: `${updated.asn_id} — ${asnActionLabels[action]}` });
    } catch (e) {
      const msg = e.message || "Unable to update ASN";
      setError(msg);
      toast({ title: "Transition failed", description: msg, variant: "destructive" });
    } finally { setSubmittingKey(""); }
  };

  const runGrnTransition = async (record, action) => {
    try {
      setSubmittingKey(`${record.grn_id}-${action}`); setError("");
      const res = await transitionGrn(session, record.grn_id, action);
      const updated = res.data;
      setGrns((prev) => prev.map((r) => r.grn_id === updated.grn_id ? updated : r));
      setSelectedGrn((cur) => cur?.grn_id === updated.grn_id ? updated : cur);
      toast({
        title: action === "post" ? "GRN posted" : "GRN status updated",
        description: res.message || `${updated.grn_id} — ${grnActionLabels[action]}`,
      });
    } catch (e) {
      const msg = e.message || "Unable to update GRN";
      setError(msg);
      toast({ title: "Transition failed", description: msg, variant: "destructive" });
    } finally { setSubmittingKey(""); }
  };

  const handleAsnAction = (record, action) => {
    if (action === "cancel") { setCancelTarget({ entity: "asn", record }); setCancelReason(""); setCancelErr(""); return; }
    runAsnTransition(record, action);
  };

  const handleGrnAction = async (record, action) => {
    if (action === "complete" && record.status === "receiving") await handleSaveReceivedQty(record);
    runGrnTransition(record, action);
  };

  const handleSaveReceivedQty = async (grn) => {
    try {
      setSavingLines(true); setError("");
      const lines = (grn.lines || []).map((l) => ({ line_no: l.line_no, received_qty: Number(receivingQty[l.line_no] ?? 0) }));
      const res = await updateGrnLines(session, grn.grn_id, lines);
      const updated = res?.data;
      if (updated) {
        setGrns((prev) => prev.map((r) => r.grn_id === updated.grn_id ? updated : r));
        setSelectedGrn(updated);
      }
      toast({ title: "Quantities saved" });
    } catch (e) {
      const msg = e.message || "Unable to save quantities";
      setError(msg);
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally { setSavingLines(false); }
  };

  const performCancellation = async () => {
    if (!cancelReason.trim())           { setCancelErr("Cancellation reason is required"); return; }
    if (cancelReason.trim().length < 5) { setCancelErr("Reason must be at least 5 characters"); return; }
    const { entity, record } = cancelTarget;
    const documentId = entity === "asn" ? record.asn_id : record.grn_id;
    try {
      setCancelling(true); setError("");
      if (entity === "asn") {
        const res = await transitionAsn(session, documentId, "cancel", { cancellation_reason: cancelReason });
        const updated = res.data;
        setAsns((prev) => prev.map((r) => r.asn_id === updated.asn_id ? updated : r));
        setSelectedAsn((cur) => cur?.asn_id === updated.asn_id ? updated : cur);
      }
      toast({ title: "Cancelled", description: `${entity.toUpperCase()} ${documentId} cancelled successfully` });
      setCancelTarget(null);
    } catch (e) {
      const msg = e.message || "Unable to cancel";
      setError(msg);
      toast({ title: "Cancellation failed", description: msg, variant: "destructive" });
    } finally { setCancelling(false); }
  };

  // -- Row action chips -------------------------------------------------------
  const getAvailableActions = (entity, record) => {
    const actionMap = entity === "asn" ? asnStatusActions : grnStatusActions;
    const statusKey = normalizeInboundStatusKey(record.status);
    return (actionMap[statusKey] || []).filter((action) => {
      if (entity === "asn") {
        return (inboundAsnActionRoles[action] || []).includes(roleId);
      }
      return action === "cancel" ? canCancelDocument(roleId) : canTransition(roleId, entity, action);
    });
  };

  const renderActionChips = (entity, record, options = {}) => {
    const labels    = entity === "asn" ? asnActionLabels  : grnActionLabels;
    const actions   = getAvailableActions(entity, record);
    const emptyLabel = options.emptyLabel ?? "-";
    if (!actions.length) return <span style={{ fontSize: 12, color: T_MUTED }}>{emptyLabel}</span>;
    const recordId = entity === "asn" ? record.asn_id : record.grn_id;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} onClick={(e) => e.stopPropagation()}>
        {actions.map((action) => {
          const isBusy = submittingKey === `${recordId}-${action}`;
          const isDang = action === "cancel";
          return (
            <button key={action}
              disabled={Boolean(submittingKey) || cancelling}
              onClick={() => entity === "asn" ? handleAsnAction(record, action) : handleGrnAction(record, action)}
              style={{
                ...(isDang ? detailActionDanger : detailActionPrimary),
                opacity:   (Boolean(submittingKey) || cancelling) ? 0.5 : 1,
              }}
            >
              {isBusy ? "Working…" : labels[action]}
            </button>
          );
        })}
      </div>
    );
  };

  // -- Generic table renderer ------------------------------------------------
  const renderTable = (rows, entity, selectedId, onSelect) => {
    const isAsn = entity === "asn";
    const cols = isAsn
      ? [
          { key: "asn_id",              label: <GlossaryTerm term="ASN" suffix=" ID" />, mono: true },
          { key: "supplier_name",       label: "Supplier", bold: true },
          { key: "created_at",          label: "Created", dt: true },
          { key: "eta",                 label: <GlossaryTerm term="ETA" /> },
          { key: "lines_count",         label: "Lines", right: true },
          { key: "status",              label: "Status", pill: true },
          { key: "cancellation_reason", label: "Cancel Reason", muted: true },
        ]
      : [
          { key: "grn_id",              label: <GlossaryTerm term="GRN" suffix=" ID" />, mono: true },
          { key: "asn_id",              label: <GlossaryTerm term="ASN" />, mono: true },
          { key: "supplier_name",       label: "Supplier", bold: true },
          { key: "created_at",          label: "Created", dt: true },
          { key: "received_date",       label: "Received" },
          { key: "status",              label: "Status", pill: true },
        ];

    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fafbff" }}>
            {cols.map((c) => (
              <th key={c.key} style={{ padding: "10px 16px", textAlign: c.right ? "right" : "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                {typeof c.label === "string" ? <span style={{ textTransform: "uppercase" }}>{c.label}</span> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={cols.length} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Loading…</td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={cols.length} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>No records found.</td></tr>
          )}
          {!loading && rows.map((row) => {
            const rowId = isAsn ? row.asn_id : row.grn_id;
            const isSel = selectedId === rowId;
            return (
              <tr key={rowId}
                style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                onClick={() => onSelect(row)}
              >
                {cols.map((c) => {
                  let cell;
                  if      (c.key === "_actions") cell = renderActionChips(entity, row);
                  else if (c.pill)  cell = <StatusPill status={row[c.key]} />;
                  else if (c.mono)  cell = <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row[c.key] ?? "-"}</span>;
                  else if (c.dt)    cell = <span style={{ fontSize: 13, color: T_SECONDARY }}>{formatDateTime(row[c.key])}</span>;
                  else if (c.key === "eta" || c.key === "received_date") cell = <span style={{ fontSize: 13, color: T_PRIMARY }}>{formatDate(row[c.key])}</span>;
                  else if (c.muted) cell = <span style={{ fontSize: 13, color: row[c.key] ? T_SECONDARY : T_MUTED }}>{row[c.key] || "-"}</span>;
                  else              cell = <span style={{ fontSize: 13, fontWeight: c.bold ? 600 : 400, color: T_PRIMARY }}>{row[c.key] ?? "-"}</span>;
                  return <td key={c.key} style={{ padding: "12px 16px", textAlign: c.right ? "right" : "left" }}>{cell}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  // -- Pagination bar --------------------------------------------------------
  const renderPagination = (total, page, pageSize, totalPages, setPage, setPageSize) => (
    <div style={{ padding: "10px 16px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{total} result{total === 1 ? "" : "s"} · Page {page} of {totalPages}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger style={{ height: 30, width: 110, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 5, color: T_PRIMARY }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>
        {[
          { label: "Prev", disabled: page <= 1,         fn: () => setPage((p) => p - 1) },
          { label: "Next", disabled: page >= totalPages, fn: () => setPage((p) => p + 1) },
        ].map((b) => (
          <button key={b.label} disabled={b.disabled} onClick={b.fn}
            style={{ ...btnOutline, opacity: b.disabled ? 0.4 : 1, cursor: b.disabled ? "not-allowed" : "pointer" }}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );

  // -- Toolbar ---------------------------------------------------------------
  const renderToolbar = ({ search, onSearch, statusFilter, onStatusFilter, statusOpts, onRefresh, onClear, onCreate, createLabel, dateFrom, onDateFrom, dateTo, onDateTo }) => (
    <div style={{ background: "#fafbff", borderBottom: "0.5px solid #eef0fc" }}>
      <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
            placeholder="Search ID, supplier…" value={search} onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => onStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger style={{ height: 40, width: 175, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statusOpts.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="date" value={dateFrom} onChange={(e) => onDateFrom(e.target.value)}
          style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff", cursor: "pointer" }} />
        <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => onDateTo(e.target.value)}
          style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff", cursor: "pointer" }} />
        <div style={{ flex: 1 }} />
        <button style={btnNeutral} onClick={onClear}>Clear</button>
        <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={onRefresh} disabled={loading}>Refresh</button>
        {onCreate && <button style={btnPrimary} onClick={onCreate}>+ {createLabel}</button>}
      </div>
    </div>
  );

  // -- ASN detail panel ------------------------------------------------------
  const renderAsnDetail = () => {
    const r = selectedAsnDetails;
    if (!r) return null;
    const statusKey = normalizeInboundStatusKey(r.status);
    return (
      <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
        <div style={{ padding: "12px 16px 16px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{r.asn_id}</span>
            <StatusPill status={r.status} />
          </div>
          {/* Stepper */}
          <div style={{ marginBottom: 12 }}>
            <WorkflowStepper steps={toStepperSteps(statusKey, ["draft", "pending", "in_transit", "arrived", "closed"])} />
          </div>
          <DetailFieldGrid title="ASN Information">
            <DetailField label="Supplier" value={r.supplier_name} />
            <DetailField label={<GlossaryTerm term="ETA" />} value={formatDate(r.eta)} />
            <DetailField label="Lines" value={r.lines_count} />
            <DetailField label="Notes" value={r.notes} />
          </DetailFieldGrid>

          <DetailFieldGrid title="Document Information">
            <DetailField label="Created By" value={r.created_by_display || (r.created_by_name && r.created_by ? `${r.created_by_name} (${r.created_by})` : r.created_by)} />
            <DetailField label="Created At" value={formatDateTime(r.created_at)} />
          </DetailFieldGrid>

          {r.cancellation_reason && (
            <DetailFieldGrid title="Cancellation Information">
              <DetailField label="Cancellation Reason" value={r.cancellation_reason} danger span />
            </DetailFieldGrid>
          )}

          {/* Lines table */}
          {(r.lines || []).length > 0 && (
            <DetailSection title="ASN Items">
              <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["SKU", "Expected Qty"].map((h, i) => (
                        <th key={h} style={{ padding: "8px 14px", textAlign: i === 1 ? "right" : "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                          {h === "SKU" ? <span style={{ textTransform: "none" }}><GlossaryTerm term="SKU" /></span> : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(r.lines || []).map((line) => (
                      <tr key={line.line_no} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                        <td style={{ padding: "9px 14px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY, display: "block" }}>{displayValue(line.sku_id)}</span>
                          {(line.sku_name || line.description) && (
                            <span style={{ fontSize: 12, color: T_LABEL, display: "block", marginTop: 1 }}>{displayValue(line.sku_name || line.description)}</span>
                          )}
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{formatQuantity(line.expected_qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>
          )}

          <div style={detailActionArea}>
            {renderActionChips("asn", r, { emptyLabel: "No actions available" })}
          </div>
        </div>
      </div>
    );
  };

  // -- GRN detail panel ------------------------------------------------------
  const renderGrnDetail = () => {
    const r = selectedGrnDetails;
    if (!r) return null;
    const statusKey = normalizeInboundStatusKey(r.status);
    return (
      <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
        <div style={{ padding: "12px 16px 16px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{r.grn_id}</span>
            <StatusPill status={r.status} />
          </div>
          {/* Stepper */}
          <div style={{ marginBottom: 12 }}>
            <WorkflowStepper steps={toStepperSteps(statusKey, ["draft", "receiving", "completed", "posted"])} />
          </div>
          <DetailFieldGrid title="GRN Information">
            <DetailField label="Supplier"       value={r.supplier_name} />
            <DetailField label="Created At"     value={formatDateTime(r.created_at)} />
            <DetailField label="Created By"     value={r.created_by_display || (r.created_by_name && r.created_by ? `${r.created_by_name} (${r.created_by})` : r.created_by)} />
            <DetailField label={<GlossaryTerm term="ASN" />} value={r.asn_id || "Direct Receipt"} mono />
            <DetailField label="Receiving Date" value={formatDate(r.received_date)} />
            {r.notes && <DetailField label="Notes" value={r.notes} span />}
          </DetailFieldGrid>
          <DetailSection title="GRN Items">
            <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {[
                      { h: <GlossaryTerm term="SKU" />, align: "left" },
                      { h: "Expected", align: "right" },
                      { h: "Received", align: "right" },
                      ...(r.status === "receiving" ? [{ h: "Line Status", align: "right" }] : []),
                    ].map(({ h, align }, i) => (
                      <th key={i} style={{ padding: "8px 14px", textAlign: align, fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                        {typeof h === "string" ? h : <span style={{ textTransform: "none" }}>{h}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!(r.lines || []).length && (
                    <tr><td colSpan={r.status === "receiving" ? 4 : 3} style={{ padding: "20px 14px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>No line items.</td></tr>
                  )}
                  {(r.lines || []).map((line) => {
                    const received  = Number(receivingQty[line.line_no] ?? line.received_qty ?? 0);
                    const expected  = Number(line.expected_qty);
                    const isEditing = r.status === "receiving";
                    const ls        = received === 0 ? "pending" : received === expected ? "matched" : received > expected ? "over" : "short";
                    const lsCfg     = LINE_STATUS_CFG[ls];
                    return (
                      <tr key={`${r.grn_id}-${line.line_no}`} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                        <td style={{ padding: "9px 14px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY, display: "block" }}>{displayValue(line.sku_id)}</span>
                          {(line.sku_name || line.description || line.product_name) && (
                            <span style={{ fontSize: 12, color: T_LABEL, display: "block", marginTop: 1 }}>{displayValue(line.sku_name || line.description || line.product_name)}</span>
                          )}
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{formatQuantity(line.expected_qty)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right" }}>
                          {isEditing ? (
                            <input type="number" min="0" value={receivingQty[line.line_no] ?? 0}
                              onChange={(e) => setReceivingQty((prev) => ({ ...prev, [line.line_no]: e.target.value === "" ? 0 : Number(e.target.value) }))}
                              style={{ width: 68, padding: "3px 8px", borderRadius: 5, fontSize: 13, textAlign: "right", outline: "none", fontFamily: "var(--font-mono)", border: `1px solid ${ls === "matched" ? "#639922" : ls === "over" ? "#E24B4A" : ls === "short" ? "#BA7517" : "#d1d5db"}` }} />
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{formatQuantity(line.received_qty)}</span>
                          )}
                        </td>
                        {isEditing && (
                          <td style={{ padding: "9px 14px", textAlign: "right" }}>
                            <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 20, background: lsCfg.bg, color: lsCfg.color, fontWeight: 500 }}>
                              {ls === "pending" ? "Pending" : ls === "matched" ? "Matched" : ls === "over" ? `Over (+${formatQuantity(received - expected)})` : `Short (${formatQuantity(received)}/${formatQuantity(expected)})`}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <div style={detailActionArea}>
            {r.status === "receiving" && (
              <button disabled={savingLines || Boolean(submittingKey) || cancelling} onClick={() => handleSaveReceivedQty(r)}
                style={{ ...detailActionPrimary, opacity: (savingLines || Boolean(submittingKey) || cancelling) ? 0.55 : 1 }}>
                {savingLines ? "Saving…" : "Save Quantities"}
              </button>
            )}
            {renderActionChips("grn", r, { emptyLabel: r.status === "receiving" ? "" : "No actions available" })}
          </div>
        </div>
      </div>
    );
  };

  // -- Card wrapper ----------------------------------------------------------
  const cardStyle = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };

  // -- Render ----------------------------------------------------------------
  return (
    <GlossaryRegistry>
    <AppLayout>
      <Breadcrumbs items={[{ label: "Inbound" }]} />
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Inbound</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Manage advance shipment notices and goods receipts</p>
      </div>
      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>{error}</div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="asn"><GlossaryTerm term="ASN" /></TabsTrigger>
          <TabsTrigger value="grn"><GlossaryTerm term="GRN" suffix=" — Goods Receipt" /></TabsTrigger>
        </TabsList>

        {/* -- ASN TAB -- */}
        <TabsContent value="asn" className="mt-4">
          <div style={cardStyle}>
            {renderToolbar({
              search: asnSearch, onSearch: (v) => { setAsnSearch(v); setAsnPage(1); },
              statusFilter: asnStatusFilter, onStatusFilter: (v) => { setAsnStatusFilter(v); setAsnPage(1); },
              statusOpts: ASN_STATUS_OPTIONS, onRefresh: loadInboundData,
              onClear: () => { setAsnSearch(""); setAsnStatusFilter(""); setAsnDateFrom(""); setAsnDateTo(""); setAsnPage(1); },
              onCreate: canCreateAsn(roleId) ? () => setShowCreateAsn(true) : null, createLabel: "Create ASN",
              dateFrom: asnDateFrom, onDateFrom: (v) => { setAsnDateFrom(v); setAsnPage(1); },
              dateTo:   asnDateTo,   onDateTo:   (v) => { setAsnDateTo(v);   setAsnPage(1); },
            })}
            {renderTable(pagedAsns, "asn", selectedAsnDetails?.asn_id, (row) => setSelectedAsn((prev) => prev?.asn_id === row.asn_id ? null : row))}
            {renderPagination(filteredAsns.length, asnPage, asnPageSize, asnTotalPages, setAsnPage, setAsnPageSize)}
            {renderAsnDetail()}
          </div>
        </TabsContent>

        {/* -- GRN TAB -- */}
        <TabsContent value="grn" className="mt-4">
          <div style={cardStyle}>
            {renderToolbar({
              search: grnSearch, onSearch: (v) => { setGrnSearch(v); setGrnPage(1); },
              statusFilter: grnStatusFilter, onStatusFilter: (v) => { setGrnStatusFilter(v); setGrnPage(1); },
              statusOpts: GRN_STATUS_OPTIONS, onRefresh: loadInboundData,
              onClear: () => { setGrnSearch(""); setGrnStatusFilter(""); setGrnDateFrom(""); setGrnDateTo(""); setGrnPage(1); },
              onCreate: canCreateGrn(roleId) ? () => setShowCreateGrn(true) : null, createLabel: "Create GRN",
              dateFrom: grnDateFrom, onDateFrom: (v) => { setGrnDateFrom(v); setGrnPage(1); },
              dateTo:   grnDateTo,   onDateTo:   (v) => { setGrnDateTo(v);   setGrnPage(1); },
            })}
            {renderTable(pagedGrns, "grn", selectedGrnDetails?.grn_id, (row) => setSelectedGrn((prev) => prev?.grn_id === row.grn_id ? null : row))}
            {renderPagination(filteredGrns.length, grnPage, grnPageSize, grnTotalPages, setGrnPage, setGrnPageSize)}
            {renderGrnDetail()}
          </div>
        </TabsContent>
      </Tabs>

      {/* -- Create ASN modal -- */}
      <Dialog open={showCreateAsn} onOpenChange={setShowCreateAsn}>
        <DialogContent className="max-w-3xl overflow-visible">
          <DialogHeader><DialogTitle>Create ASN</DialogTitle></DialogHeader>
          <CreateASN session={session} onCancel={() => setShowCreateAsn(false)}
            onCreated={(created) => {
              setAsns((prev) => [created, ...prev]);
              setShowCreateAsn(false);
              toast({ title: "ASN created", description: `Created ${created.asn_id}` });
            }} />
        </DialogContent>
      </Dialog>

      {/* -- Create GRN modal -- */}
      <Dialog open={showCreateGrn} onOpenChange={setShowCreateGrn}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create GRN</DialogTitle></DialogHeader>
          <CreateGRN session={session} onCancel={() => setShowCreateGrn(false)}
            onCreated={(created) => {
              const normalized = {
                grn_id: created.grn_id, asn_id: created.asn_id || "-",
                supplier_name: created.supplier_name || "-", created_at: created.created_at,
                received_date: created.received_date, status: created.status,
                notes: created.notes || null,
                lines: created.lines || [],
              };
              setGrns((prev) => [normalized, ...prev]);
              setShowCreateGrn(false);
              toast({ title: "GRN created", description: `GRN ${normalized.grn_id} created` });
            }} />
        </DialogContent>
      </Dialog>

      {/* -- Cancellation modal -- */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {cancelTarget?.entity?.toUpperCase()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Are you sure you want to cancel{" "}
              <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>
                {cancelTarget?.entity === "asn" ? cancelTarget?.record?.asn_id : cancelTarget?.record?.grn_id}
              </strong>? This action cannot be undone.
            </p>
            <div className="space-y-1.5">
              <Label>Cancellation Reason <span style={{ color: "#e03131" }}>*</span></Label>
              <Textarea value={cancelReason} onChange={(e) => { setCancelErr(""); setCancelReason(e.target.value); }}
                placeholder="Please provide the reason for cancellation (min. 5 characters)" rows={3} />
            </div>
            {cancelErr && <p style={{ fontSize: 12, color: "#991b1b" }}>{cancelErr}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setCancelTarget(null)} disabled={cancelling}>Back</button>
              <button style={{ ...btnDanger, opacity: cancelling ? 0.6 : 1 }} onClick={performCancellation} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
    </GlossaryRegistry>
  );
};

export default InboundPage;
