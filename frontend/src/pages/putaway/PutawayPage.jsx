import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  assignPutawayTask,
  completePutawayTask,
  fetchPutawayOperators,
  fetchPutawayTask,
  fetchPutawayTaskHistory,
  fetchPutawayTasks,
  markPutawayTaskException,
  recomputePutawayBin,
  toSessionContext,
} from "@/services/api";

// ── Design tokens (identical to InboundPage / OutboundPage) ──────────────────
const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 34, padding: "0 14px", borderRadius: 7, fontSize: 14, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 34, padding: "0 16px", borderRadius: 7, fontSize: 14, fontWeight: 500, background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 34, padding: "0 16px", borderRadius: 7, fontSize: 14, fontWeight: 500, background: "#e03131", color: "#fff" };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:     { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
  in_progress: { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "In Progress" },
  completed:   { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Completed" },
  exception:   { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5", dot: "#ef4444",  label: "Exception" },
};

function StatusPill({ status }) {
  const key = String(status || "").toLowerCase();
  const c = STATUS_CFG[key] || STATUS_CFG.pending;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 13, fontWeight: 500, padding: "4px 12px", borderRadius: 20,
      background: c.bg, color: c.color, border: `0.5px solid ${c.border}`,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

// ── Priority pill ─────────────────────────────────────────────────────────────
const PRIORITY_CFG = {
  high:   { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5", label: "High" },
  medium: { bg: "#fef9c3", color: "#713f12", border: "#fde68a", label: "Medium" },
  low:    { bg: "#dcfce7", color: "#14532d", border: "#86efac", label: "Low" },
};

function PriorityPill({ priority }) {
  const key = String(priority || "").toLowerCase();
  const c = PRIORITY_CFG[key] || PRIORITY_CFG.low;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20,
      background: c.bg, color: c.color, border: `0.5px solid ${c.border}`,
      whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

// ── DetailField ───────────────────────────────────────────────────────────────
function DetailField({ label, children, danger }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 14, fontWeight: 500, color: danger ? "#991b1b" : T_PRIMARY }}>
        {children ?? "—"}
      </p>
    </div>
  );
}

// ── SectionBox ────────────────────────────────────────────────────────────────
function SectionBox({ title, children }) {
  return (
    <div style={{ border: "0.5px solid #e8ebf8", borderRadius: 10, padding: "14px 16px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T_LABEL, marginBottom: 12 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const initialFilters = { search: "", status: "", priority: "", source: "", suggestedBin: "", grn: "", sku: "" };

const roleAliases = {
  superadmin: "superadmin", hqadmin: "hqadmin",
  storemanager: "storemanager", storeoperator: "storeoperator",
  warehousemanager: "storemanager", storekeeper: "storeoperator",
  warehouseclerk: "storeoperator",
};

const putawayStatuses = new Set(["pending", "in_progress", "completed", "exception"]);

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "storeoperator").toLowerCase()] || "storeoperator";
}

function formatDt(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function payloadToText(payload) {
  if (!payload || typeof payload !== "object") return "—";
  const entries = Object.entries(payload);
  if (!entries.length) return "—";
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(" | ");
}

function parsePutawayStatusFilter(search) {
  const params = new URLSearchParams(search || "");
  const status = String(params.get("status") || "").toLowerCase();
  return putawayStatuses.has(status) ? status : "";
}

// ── Page ──────────────────────────────────────────────────────────────────────
const PutawayPage = () => {
  const location  = useLocation();
  const auth      = useAuth();
  const { toast } = useToast();
  const session   = useMemo(() => toSessionContext(auth), [auth]);
  const roleId    = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);

  const canAssign        = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canRecompute     = useMemo(() => ["superadmin", "hqadmin"].includes(roleId), [roleId]);
  const canMarkException = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canCompleteTask  = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canViewHistory   = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);

  const [filters, setFilters]               = useState(initialFilters);
  const [page, setPage]                     = useState(1);
  const [pageSize, setPageSize]             = useState(10);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState("");
  const [tasks, setTasks]                   = useState([]);
  const [total, setTotal]                   = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTask, setSelectedTask]     = useState(null);
  const [operators, setOperators]           = useState([]);
  const [actionKey, setActionKey]           = useState("");

  // assign modal
  const [assignOpen, setAssignOpen]     = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignErr, setAssignErr]       = useState("");

  // complete modal
  const [completeOpen, setCompleteOpen]       = useState(false);
  const [actualBin, setActualBin]             = useState("");
  const [completeTouched, setCompleteTouched] = useState(false);

  // exception modal
  const [exceptionOpen, setExceptionOpen]       = useState(false);
  const [exceptionReason, setExceptionReason]   = useState("");
  const [exceptionTouched, setExceptionTouched] = useState(false);

  // history modal
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const isExceptionReasonValid   = useMemo(() => exceptionReason.trim().length >= 5, [exceptionReason]);
  const selectedTaskHasBinMismatch = useMemo(() => {
    if (!selectedTask?.actual_bin_code || !selectedTask?.suggested_bin) return false;
    return selectedTask.actual_bin_code !== selectedTask.suggested_bin;
  }, [selectedTask]);

  // ── URL filter sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const queryStatus = parsePutawayStatusFilter(location.search);
    setFilters((c) => ({ ...c, status: queryStatus }));
    setPage(1);
  }, [location.search]);

  // ── Fetch list ────────────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setLoading(true); setError("");
      const result = await fetchPutawayTasks(session, { page, pageSize, ...filters });
      const rows   = Array.isArray(result?.items) ? result.items : [];
      setTasks(rows);
      setTotal(Number(result?.total || 0));
      setSelectedTaskId((cur) => (cur && rows.some((t) => t.task_id === cur)) ? cur : "");
    } catch (e) {
      setError(e.message || "Failed to load putaway tasks");
      setTasks([]); setTotal(0);
    } finally { setLoading(false); }
  }, [session, page, pageSize, filters]);

  const fetchDetail = useCallback(async (taskId) => {
    if (!taskId || !session.tenant_id) { setSelectedTask(null); return; }
    try {
      const detail = await fetchPutawayTask(session, taskId);
      setSelectedTask(detail || null);
    } catch (e) {
      setSelectedTask(null);
      setError(e.message || "Failed to load task details");
    }
  }, [session]);

  const loadOperators = useCallback(async () => {
    if (!canAssign) { setOperators([]); return; }
    try {
      const rows = await fetchPutawayOperators(session);
      setOperators(Array.isArray(rows) ? rows : []);
    } catch (_) { setOperators([]); }
  }, [canAssign, session]);

  useEffect(() => { fetchList(); },          [fetchList]);
  useEffect(() => { fetchDetail(selectedTaskId); }, [selectedTaskId, fetchDetail]);
  useEffect(() => { loadOperators(); },      [loadOperators]);

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };
  const resetFilters = () => { setFilters(initialFilters); setPage(1); };
  const refreshData  = async (taskId = selectedTaskId) => { await fetchList(); if (taskId) await fetchDetail(taskId); };

  // ── Assign ────────────────────────────────────────────────────────────────
  const openAssignModal = async () => {
    setAssignUserId(selectedTask?.assigned_to_user_id || "");
    setAssignErr("");
    setAssignOpen(true);
    try {
      const rows = await fetchPutawayOperators(session);
      setOperators(Array.isArray(rows) ? rows : []);
    } catch (_) { setOperators([]); }
  };

  const submitAssign = async () => {
    if (!assignUserId) { setAssignErr("Please select an operator"); return; }
    try {
      setActionKey("assign"); setError("");
      const res = await assignPutawayTask(session, selectedTask.task_id, assignUserId);
      toast({ title: "Task assigned", description: res?.message || `Task ${selectedTask.task_id} assigned` });
      setAssignOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (e) {
      const msg = e.message || "Unable to assign task";
      setError(msg);
      toast({ title: "Assign failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Recompute ─────────────────────────────────────────────────────────────
  const submitRecompute = async () => {
    if (!selectedTask) return;
    try {
      setActionKey("recompute"); setError("");
      const res = await recomputePutawayBin(session, selectedTask.task_id);
      toast({ title: "Suggested bin updated", description: res?.message || `Task ${selectedTask.task_id} recomputed` });
      await refreshData(selectedTask.task_id);
    } catch (e) {
      const msg = e.message || "Unable to recompute suggested bin";
      setError(msg);
      toast({ title: "Recompute failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Complete ──────────────────────────────────────────────────────────────
  const openCompleteModal = () => { setActualBin(selectedTask?.suggested_bin || ""); setCompleteTouched(false); setCompleteOpen(true); };

  const submitComplete = async () => {
    setCompleteTouched(true);
    if (!selectedTask || !actualBin.trim()) return;
    try {
      setActionKey("complete"); setError("");
      const res = await completePutawayTask(session, selectedTask.task_id, { actual_bin_code: actualBin.trim() });
      toast({ title: "Task completed", description: res?.message || `Task ${selectedTask.task_id} completed` });
      setCompleteOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (e) {
      const msg = e.message || "Unable to complete task";
      setError(msg);
      toast({ title: "Complete failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Exception ─────────────────────────────────────────────────────────────
  const openExceptionModal = () => { setExceptionReason(""); setExceptionTouched(false); setExceptionOpen(true); };

  const submitException = async () => {
    setExceptionTouched(true);
    if (!selectedTask || !isExceptionReasonValid) return;
    try {
      setActionKey("exception"); setError("");
      const res = await markPutawayTaskException(session, selectedTask.task_id, exceptionReason.trim());
      toast({ title: "Task marked as exception", description: res?.message || `Task ${selectedTask.task_id} marked as exception` });
      setExceptionOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (e) {
      const msg = e.message || "Unable to mark as exception";
      setError(msg);
      toast({ title: "Mark exception failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── History ───────────────────────────────────────────────────────────────
  const openHistory = async (taskId) => {
    if (!taskId) return;
    try {
      setActionKey("history"); setError("");
      const rows = await fetchPutawayTaskHistory(session, taskId);
      setHistoryRows(Array.isArray(rows) ? rows : []);
      setHistoryOpen(true);
    } catch (e) {
      const msg = e.message || "Unable to load task history";
      setError(msg);
      toast({ title: "History failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Card style ────────────────────────────────────────────────────────────
  const cardStyle = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Putaway" }]} />

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Putaway Tasks</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>Manage and track warehouse putaway operations</p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
          {error}
        </div>
      )}

      {/* ── Main card ── */}
      <div style={cardStyle}>

        {/* Toolbar */}
        <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
            <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              style={{ width: "100%", height: 34, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 14, color: T_PRIMARY, outline: "none", background: "#fff" }}
              placeholder="Search task, GRN, SKU, bin…"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
          </div>
          {/* Status */}
          <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
            <SelectTrigger style={{ height: 34, width: 160, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="exception">Exception</SelectItem>
            </SelectContent>
          </Select>
          {/* Priority */}
          <Select value={filters.priority || "all"} onValueChange={(v) => updateFilter("priority", v === "all" ? "" : v)}>
            <SelectTrigger style={{ height: 34, width: 150, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <div style={{ flex: 1 }} />
          <button style={btnNeutral} onClick={resetFilters}>Clear</button>
          <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={fetchList} disabled={loading || Boolean(actionKey)}>Refresh</button>
        </div>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafbff" }}>
              {[
                "Task ID", "GRN", "SKU", "Qty", "Source",
                "Suggested Bin", "Priority", "Status",
                "Assigned To", "Updated", "Actions",
              ].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>Loading…</td></tr>
            )}
            {!loading && tasks.length === 0 && (
              <tr><td colSpan={11} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No putaway tasks found.</td></tr>
            )}
            {!loading && tasks.map((task) => {
              const isSel = selectedTaskId === task.task_id;
              return (
                <tr key={task.task_id}
                  style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  onClick={() => setSelectedTaskId((prev) => prev === task.task_id ? "" : task.task_id)}
                >
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{task.task_id}</span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{task.grn_id || "—"}</span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{task.sku_id}</span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{task.qty}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{task.source_location || "—"}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: T_SECONDARY }}>{task.suggested_bin || "—"}</span>
                  </td>
                  <td style={{ padding: "14px 16px" }}><PriorityPill priority={task.priority} /></td>
                  <td style={{ padding: "14px 16px" }}><StatusPill status={task.status} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: task.assigned_to_user_name ? T_PRIMARY : T_MUTED }}>
                    {task.assigned_to_user_name || "Unassigned"}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{formatDt(task.updated_at)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    {canViewHistory ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); openHistory(task.task_id); }}
                        style={{ ...btnBase, height: 28, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#f0f4ff", color: ACCENT, border: "0.5px solid #c7d2fe", opacity: (Boolean(actionKey) || loading) ? 0.5 : 1 }}
                        disabled={Boolean(actionKey) || loading}
                      >
                        History
                      </button>
                    ) : <span style={{ fontSize: 12, color: T_MUTED }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ padding: "10px 16px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T_SECONDARY }}>
            {total} result{total === 1 ? "" : "s"} · Page {page} of {totalPages}
          </span>
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
              { label: "Prev", disabled: page <= 1,          fn: () => setPage((p) => p - 1) },
              { label: "Next", disabled: page >= totalPages,  fn: () => setPage((p) => p + 1) },
            ].map((b) => (
              <button key={b.label} disabled={b.disabled} onClick={b.fn}
                style={{ ...btnOutline, opacity: b.disabled ? 0.4 : 1, cursor: b.disabled ? "not-allowed" : "pointer" }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail panel ── */}
        {selectedTask && (
          <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
            <div style={{ padding: "18px 16px 16px" }}>

              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: T_PRIMARY }}>{selectedTask.task_id}</span>
                  <StatusPill status={selectedTask.status} />
                  <PriorityPill priority={selectedTask.priority} />
                </div>
                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {canAssign && ["pending", "in_progress", "exception"].includes(selectedTask.status) && (
                    <button style={{ ...btnNeutral, opacity: actionKey === "assign" ? 0.5 : 1 }} disabled={Boolean(actionKey)} onClick={openAssignModal}>
                      {selectedTask.assigned_to_user_id ? "Reassign" : "Assign"}
                    </button>
                  )}
                  {canRecompute && ["pending", "in_progress"].includes(selectedTask.status) && (
                    <button style={{ ...btnNeutral, opacity: actionKey === "recompute" ? 0.5 : 1 }} disabled={Boolean(actionKey)} onClick={submitRecompute}>
                      {actionKey === "recompute" ? "Recomputing…" : "Recompute Bin"}
                    </button>
                  )}
                  {canCompleteTask && selectedTask.status === "in_progress" && (
                    <button style={{ ...btnPrimary, opacity: actionKey === "complete" ? 0.55 : 1 }} disabled={Boolean(actionKey)} onClick={openCompleteModal}>
                      {actionKey === "complete" ? "Completing…" : "Complete Task"}
                    </button>
                  )}
                  {canMarkException && ["pending", "in_progress"].includes(selectedTask.status) && (
                    <button style={{ ...btnDanger, opacity: actionKey === "exception" ? 0.55 : 1 }} disabled={Boolean(actionKey)} onClick={openExceptionModal}>
                      Mark Exception
                    </button>
                  )}
                  {canViewHistory && (
                    <button style={{ ...btnNeutral, opacity: actionKey === "history" ? 0.5 : 1 }} disabled={Boolean(actionKey)} onClick={() => openHistory(selectedTask.task_id)}>
                      View History
                    </button>
                  )}
                </div>
              </div>

              {/* Summary fields */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14, marginBottom: 16 }}>
                <DetailField label="SKU">{selectedTask.sku_id}</DetailField>
                <DetailField label="Quantity">{selectedTask.qty}</DetailField>
                <DetailField label="Source">{selectedTask.source_location || "—"}</DetailField>
                <DetailField label="Suggested Bin">
                  <span style={{ fontFamily: "var(--font-mono)" }}>{selectedTask.suggested_bin || "—"}</span>
                </DetailField>
              </div>

              {/* Two-column sections */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <SectionBox title="Task Details & Execution">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                    <DetailField label="Assigned To">
                      {selectedTask.execution?.assigned_to || selectedTask.assigned_to_user_name ||
                        <span style={{ color: T_MUTED, fontWeight: 400 }}>Unassigned</span>}
                    </DetailField>
                    <DetailField label="Started At">{formatDt(selectedTask.execution?.started_at || selectedTask.started_at)}</DetailField>
                    <DetailField label="Completed At">{formatDt(selectedTask.execution?.completed_at || selectedTask.completed_at)}</DetailField>
                    <DetailField label="Actual Bin">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)" }}>
                        {selectedTask.execution?.actual_bin || selectedTask.actual_bin_code || "—"}
                        {selectedTaskHasBinMismatch && <AlertTriangle size={13} style={{ color: "#d97706" }} />}
                      </span>
                    </DetailField>
                    <DetailField label="Device Type">{selectedTask.execution?.device_type || selectedTask.device_type || "—"}</DetailField>
                    <DetailField label="Last Updated">{formatDt(selectedTask.updated_at)}</DetailField>
                  </div>
                </SectionBox>

                <SectionBox title="Evidence Summary">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                    <DetailField label="Scan Method">{selectedTask.evidence_summary?.scan_method || selectedTask.scan_method || "—"}</DetailField>
                    <DetailField label="EPC Expected">{selectedTask.evidence_summary?.epc_expected_count ?? selectedTask.epc_expected_count ?? "—"}</DetailField>
                    <DetailField label="EPC Confirmed">{selectedTask.evidence_summary?.epc_confirmed_count ?? selectedTask.epc_confirmed_count ?? "—"}</DetailField>
                    <DetailField label="Validation">
                      <span style={{ textTransform: "capitalize" }}>
                        {selectedTask.evidence_summary?.validation_result || selectedTask.validation_result || "—"}
                      </span>
                    </DetailField>
                    {selectedTask.status === "exception" && (
                      <div style={{ gridColumn: "span 2" }}>
                        <DetailField label="Exception Reason" danger>
                          {selectedTask.evidence_summary?.exception_reason || selectedTask.exception_reason || "—"}
                        </DetailField>
                      </div>
                    )}
                  </div>
                </SectionBox>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── Assign modal ── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Putaway Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Assign task <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{selectedTask?.task_id}</strong> to a warehouse operator.
            </p>
            <div className="space-y-1.5">
              <Label>Operator</Label>
              <Select value={assignUserId || "none"} onValueChange={(v) => { setAssignErr(""); setAssignUserId(v === "none" ? "" : v); }}>
                <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select operator</SelectItem>
                  {operators.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.user_name} ({u.user_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignErr && <p style={{ fontSize: 12, color: "#991b1b" }}>{assignErr}</p>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setAssignOpen(false)} disabled={actionKey === "assign"}>Back</button>
              <button style={{ ...btnPrimary, opacity: actionKey === "assign" ? 0.6 : 1 }} onClick={submitAssign} disabled={actionKey === "assign"}>
                {actionKey === "assign" ? "Assigning…" : "Assign Task"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Complete modal ── */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Putaway Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Confirm the actual bin for task <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{selectedTask?.task_id}</strong>.
            </p>
            <div className="space-y-1.5">
              <Label>Actual Bin <span style={{ color: "#e03131" }}>*</span></Label>
              <Input
                value={actualBin}
                onChange={(e) => setActualBin(e.target.value)}
                onBlur={() => setCompleteTouched(true)}
                placeholder={selectedTask?.suggested_bin || "e.g. A-01-001"}
              />
              {completeTouched && !actualBin.trim() && (
                <p style={{ fontSize: 12, color: "#991b1b" }}>Actual bin is required.</p>
              )}
              {actualBin.trim() && selectedTask?.suggested_bin && actualBin.trim() !== selectedTask.suggested_bin && (
                <p style={{ fontSize: 12, color: "#d97706", display: "flex", alignItems: "center", gap: 5 }}>
                  <AlertTriangle size={13} />
                  Bin differs from suggested ({selectedTask.suggested_bin}). This will be flagged.
                </p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setCompleteOpen(false)} disabled={actionKey === "complete"}>Back</button>
              <button style={{ ...btnPrimary, opacity: (!actualBin.trim() || actionKey === "complete") ? 0.55 : 1 }} onClick={submitComplete} disabled={!actualBin.trim() || actionKey === "complete"}>
                {actionKey === "complete" ? "Completing…" : "Confirm Complete"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Exception modal ── */}
      <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Task as Exception</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Provide a reason for marking task <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{selectedTask?.task_id}</strong> as an exception.
            </p>
            <div className="space-y-1.5">
              <Label>Exception Reason <span style={{ color: "#e03131" }}>*</span></Label>
              <Textarea
                rows={4}
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                onBlur={() => setExceptionTouched(true)}
                placeholder="Explain why this task is an exception (min. 5 characters)"
              />
              {exceptionTouched && !isExceptionReasonValid && (
                <p style={{ fontSize: 12, color: "#991b1b" }}>Reason must be at least 5 characters.</p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setExceptionOpen(false)} disabled={actionKey === "exception"}>Back</button>
              <button style={{ ...btnDanger, opacity: (!isExceptionReasonValid || actionKey === "exception") ? 0.55 : 1 }} onClick={submitException} disabled={!isExceptionReasonValid || actionKey === "exception"}>
                {actionKey === "exception" ? "Saving…" : "Confirm Exception"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── History modal ── */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Task History — {selectedTask?.task_id || selectedTaskId}</DialogTitle>
          </DialogHeader>
          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {historyRows.length === 0 && (
              <p style={{ fontSize: 13, color: T_MUTED }}>No history entries found.</p>
            )}
            {historyRows.map((event) => (
              <div key={event.event_id} style={{ border: "0.5px solid #e8ebf8", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize", marginBottom: 4, color: T_PRIMARY }}>
                  {event.event_type.replace(/_/g, " ")}
                </p>
                <p style={{ fontSize: 12, color: T_SECONDARY, marginBottom: 6 }}>{payloadToText(event.event_payload)}</p>
                <p style={{ fontSize: 12, color: T_MUTED, display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock3 size={11} />
                  {formatDt(event.created_at)} · {event.created_by}
                </p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
            <button style={btnNeutral} onClick={() => setHistoryOpen(false)}>Close</button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default PutawayPage;