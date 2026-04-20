import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Loader2, CheckCircle2, AlertCircle, Circle, Timer } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { canAssignPutaway, canRecomputePutawayBin, canMarkPutawayException } from "@/services/rbac";
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

const initialFilters = {
  search: "",
  status: "",
  priority: "",
  source: "",
  suggestedBin: "",
  grn: "",
  sku: "",
};

const roleAliases = {
  superadmin: "superadmin",
  hqadmin: "hqadmin",
  storemanager: "storemanager",
  storeoperator: "storeoperator",
  warehousemanager: "storemanager",
  storekeeper: "storeoperator",
  warehouseclerk: "storeoperator",
};

const putawayStatuses = new Set(["pending", "in_progress", "completed", "exception"]);

const STATUS_CONFIG = {
  pending:     { bg: "#F1EFE8", color: "#5F5E5A", label: "Pending",     icon: Circle },
  in_progress: { bg: "#FEF3C7", color: "#92400E", label: "In Progress", icon: Timer },
  completed:   { bg: "#D1FAE5", color: "#065F46", label: "Completed",   icon: CheckCircle2 },
  exception:   { bg: "#FEE2E2", color: "#991B1B", label: "Exception",   icon: AlertCircle },
};

const PRIORITY_CONFIG = {
  high:   { bg: "#FEE2E2", color: "#991B1B", label: "High" },
  medium: { bg: "#FEF3C7", color: "#92400E", label: "Medium" },
  low:    { bg: "#D1FAE5", color: "#065F46", label: "Low" },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function PriorityPill({ priority }) {
  const cfg = PRIORITY_CONFIG[priority?.toLowerCase()] || PRIORITY_CONFIG.low;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function SectionBox({ title, children }) {
  return (
    <div style={{
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 10, padding: "14px 16px",
    }}>
      <p style={{
        fontSize: 11, fontWeight: 600, letterSpacing: "0.07em",
        textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 12,
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function DetailField({ label, children }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>{children}</p>
    </div>
  );
}

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "storeoperator").toLowerCase()] || "storeoperator";
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function payloadToText(payload) {
  if (!payload || typeof payload !== "object") return "-";
  const entries = Object.entries(payload);
  if (entries.length === 0) return "-";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" | ");
}

function parsePutawayStatusFilter(search) {
  const params = new URLSearchParams(search || "");
  const status = String(params.get("status") || "").toLowerCase();
  return putawayStatuses.has(status) ? status : "";
}

const PutawayPage = () => {
  const location = useLocation();
  const auth = useAuth();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const userRole = auth.currentUser?.role || "";
  const roleId  = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);

  const canAssign        = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canRecompute     = useMemo(() => ["superadmin", "hqadmin"].includes(roleId), [roleId]);
  const canMarkException = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canCompleteTask  = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canViewHistory   = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);

  const [filters, setFilters]           = useState(initialFilters);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(10);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [tasks, setTasks]               = useState([]);
  const [total, setTotal]               = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTask, setSelectedTask]     = useState(null);
  const [operators, setOperators]       = useState([]);
  const [assignOpen, setAssignOpen]     = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [exceptionOpen, setExceptionOpen]     = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionTouched, setExceptionTouched] = useState(false);
  const [completeOpen, setCompleteOpen]     = useState(false);
  const [actualBin, setActualBin]           = useState("");
  const [completeTouched, setCompleteTouched] = useState(false);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [historyRows, setHistoryRows]   = useState([]);
  const [actionKey, setActionKey]       = useState("");
  const [hoveredRow, setHoveredRow]     = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const isExceptionReasonValid = useMemo(() => exceptionReason.trim().length >= 5, [exceptionReason]);
  const selectedTaskHasBinMismatch = useMemo(() => {
    if (!selectedTask?.actual_bin_code || !selectedTask?.suggested_bin) return false;
    return selectedTask.actual_bin_code !== selectedTask.suggested_bin;
  }, [selectedTask]);

  useEffect(() => {
    const queryStatus = parsePutawayStatusFilter(location.search);
    setFilters((c) => ({ ...c, status: queryStatus }));
    setPage(1);
  }, [location.search]);

  const fetchList = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setLoading(true);
      setError("");
      const result = await fetchPutawayTasks(session, { page, pageSize, ...filters });
      const rows = Array.isArray(result?.items) ? result.items : [];
      setTasks(rows);
      setTotal(Number(result?.total || 0));
      setSelectedTaskId((current) => {
        if (current && rows.some((item) => item.task_id === current)) return current;
        return rows[0]?.task_id || "";
      });
    } catch (loadError) {
      setError(loadError.message || "Failed to load putaway tasks");
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [session, page, pageSize, filters]);

  const fetchDetail = useCallback(async (taskId) => {
    if (!taskId || !session.tenant_id) { setSelectedTask(null); return; }
    try {
      const detail = await fetchPutawayTask(session, taskId);
      setSelectedTask(detail || null);
    } catch (detailError) {
      setSelectedTask(null);
      setError(detailError.message || "Failed to load task details");
    }
  }, [session]);

  const loadOperators = useCallback(async () => {
    if (!canAssign) { setOperators([]); return; }
    try {
      const rows = await fetchPutawayOperators(session);
      setOperators(Array.isArray(rows) ? rows : []);
    } catch (_error) { setOperators([]); }
  }, [canAssign, session]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchDetail(selectedTaskId); }, [selectedTaskId, fetchDetail]);
  useEffect(() => { loadOperators(); }, [loadOperators]);

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };
  const resetFilters = () => { setFilters(initialFilters); setPage(1); };
  const refreshData  = async (taskId = selectedTaskId) => { await fetchList(); if (taskId) await fetchDetail(taskId); };

  const openAssignModal = async () => {
    setAssignUserId(selectedTask?.assigned_to_user_id || "");
    setAssignOpen(true);
    try {
      const rows = await fetchPutawayOperators(session);
      setOperators(Array.isArray(rows) ? rows : []);
    } catch (_error) { setOperators([]); }
  };

  const submitAssign = async () => {
    if (!selectedTask || !assignUserId) return;
    try {
      setActionKey("assign"); setError("");
      const response = await assignPutawayTask(session, selectedTask.task_id, assignUserId);
      toast({ title: "Task assigned", description: response?.message || `Task ${selectedTask.task_id} assigned` });
      setAssignOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (assignError) {
      const message = assignError.message || "Unable to assign task";
      setError(message);
      toast({ title: "Assign failed", description: message, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  const submitRecompute = async () => {
    if (!selectedTask) return;
    try {
      setActionKey("recompute"); setError("");
      const response = await recomputePutawayBin(session, selectedTask.task_id);
      toast({ title: "Suggested bin updated", description: response?.message || `Task ${selectedTask.task_id} recomputed` });
      await refreshData(selectedTask.task_id);
    } catch (recomputeError) {
      const message = recomputeError.message || "Unable to recompute suggested bin";
      setError(message);
      toast({ title: "Recompute failed", description: message, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  const openCompleteModal = () => { setActualBin(selectedTask?.suggested_bin || ""); setCompleteTouched(false); setCompleteOpen(true); };

  const submitComplete = async () => {
    setCompleteTouched(true);
    if (!selectedTask || !actualBin.trim()) return;
    try {
      setActionKey("complete"); setError("");
      const response = await completePutawayTask(session, selectedTask.task_id, { actual_bin_code: actualBin.trim() });
      toast({ title: "Task completed", description: response?.message || `Task ${selectedTask.task_id} completed` });
      setCompleteOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (completeError) {
      const message = completeError.message || "Unable to complete task";
      setError(message);
      toast({ title: "Complete failed", description: message, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  const openExceptionModal = () => { setExceptionReason(""); setExceptionTouched(false); setExceptionOpen(true); };

  const submitException = async () => {
    if (!selectedTask || !isExceptionReasonValid) { setExceptionTouched(true); return; }
    try {
      setActionKey("exception"); setError("");
      const response = await markPutawayTaskException(session, selectedTask.task_id, exceptionReason.trim());
      toast({ title: "Task marked as exception", description: response?.message || `Task ${selectedTask.task_id} marked as exception` });
      setExceptionOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (exceptionError) {
      const message = exceptionError.message || "Unable to mark task as exception";
      setError(message);
      toast({ title: "Mark exception failed", description: message, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  const openHistory = async (taskId) => {
    if (!taskId) return;
    try {
      setActionKey("history"); setError("");
      const rows = await fetchPutawayTaskHistory(session, taskId);
      setHistoryRows(Array.isArray(rows) ? rows : []);
      setHistoryOpen(true);
    } catch (historyError) {
      const message = historyError.message || "Unable to load task history";
      setError(message);
      toast({ title: "History failed", description: message, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  const inputSt = {
    height: 36, fontSize: 13, borderRadius: 8, padding: "0 10px",
    border: "0.5px solid var(--color-border-secondary)",
    background: "var(--color-background-secondary)",
    color: "var(--color-text-primary)", width: "100%", outline: "none", boxSizing: "border-box",
  };

  const ghostBtn = {
    height: 36, fontSize: 13, borderRadius: 8, cursor: "pointer", fontWeight: 500,
    padding: "0 14px", border: "0.5px solid var(--color-border-secondary)",
    background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  };

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Putaway" }]} />

      {/* header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>Putaway Tasks</h1>
        <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", marginTop: 4 }}>
          Manage and track warehouse putaway operations
        </p>
      </div>

      {error && (
        <div style={{
          fontSize: 13, color: "var(--color-text-danger)", marginBottom: 12,
          padding: "8px 14px", borderRadius: 8,
          background: "var(--color-background-danger)",
          border: "0.5px solid var(--color-border-danger)",
        }}>
          {error}
        </div>
      )}

      {/* filter card */}
      <div style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 12, padding: "14px 18px", marginBottom: 16,
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 10 }}>
          Filters
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input style={inputSt} placeholder="Search task, GRN, SKU, source, bin..." value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} />
          <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
            <SelectTrigger style={{ ...inputSt, cursor: "pointer" }}><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="exception">Exception</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.priority || "all"} onValueChange={(v) => updateFilter("priority", v === "all" ? "" : v)}>
            <SelectTrigger style={{ ...inputSt, cursor: "pointer" }}><SelectValue placeholder="All Priorities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <input style={inputSt} placeholder="Source" value={filters.source} onChange={(e) => updateFilter("source", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <input style={inputSt} placeholder="Suggested Bin" value={filters.suggestedBin} onChange={(e) => updateFilter("suggestedBin", e.target.value)} />
          <input style={inputSt} placeholder="GRN" value={filters.grn} onChange={(e) => updateFilter("grn", e.target.value)} />
          <input style={inputSt} placeholder="SKU" value={filters.sku} onChange={(e) => updateFilter("sku", e.target.value)} />
          <button onClick={resetFilters} style={{ ...inputSt, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer", width: "100%" }}>
            Clear
          </button>
        </div>
      </div>

      {/* task table */}
      <div style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 12, overflow: "hidden", marginBottom: 16,
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              {[
                ["Task ID", 110], ["GRN", 110], ["SKU", 110], ["Qty", 55],
                ["Source", 80], ["Suggested Bin", 120], ["Priority", 90],
                ["Status", 120], ["Assigned To", 140], ["Last Updated", 160], ["Actions", 110],
              ].map(([label, w]) => (
                <th key={label} style={{
                  padding: "10px 14px", textAlign: "left", width: w,
                  fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
                  color: "var(--color-text-tertiary)",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    Loading putaway tasks...
                  </span>
                </td>
              </tr>
            )}
            {!loading && tasks.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                  No putaway tasks found.
                </td>
              </tr>
            )}
            {!loading && tasks.map((task) => {
              const isSelected = selectedTaskId === task.task_id;
              const isHovered  = hoveredRow === task.task_id;
              return (
                <tr
                  key={task.task_id}
                  onClick={() => setSelectedTaskId(task.task_id)}
                  onMouseEnter={() => setHoveredRow(task.task_id)}
                  onMouseLeave={() => setHoveredRow("")}
                  style={{
                    cursor: "pointer",
                    borderBottom: "0.5px solid var(--color-border-tertiary)",
                    background: isSelected ? "var(--color-background-info)" : isHovered ? "var(--color-background-secondary)" : "transparent",
                    transition: "background 0.1s ease",
                  }}
                >
                  <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 12, color: "var(--color-text-secondary)" }}>{task.task_id}</td>
                  <td style={{ padding: "11px 14px", fontSize: 13 }}>{task.grn_id || "-"}</td>
                  <td style={{ padding: "11px 14px", fontSize: 13 }}>{task.sku_id}</td>
                  <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500 }}>{task.qty}</td>
                  <td style={{ padding: "11px 14px", fontSize: 13 }}>{task.source_location}</td>
                  <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 12 }}>{task.suggested_bin}</td>
                  <td style={{ padding: "11px 14px" }}><PriorityPill priority={task.priority} /></td>
                  <td style={{ padding: "11px 14px" }}><StatusPill status={task.status} /></td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: task.assigned_to_user_name ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
                    {task.assigned_to_user_name || "Unassigned"}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--color-text-secondary)" }}>{formatDateTime(task.updated_at)}</td>
                  <td style={{ padding: "11px 14px" }}>
                    {canViewHistory ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); openHistory(task.task_id); }}
                        style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)" }}
                      >
                        View History
                      </button>
                    ) : <span style={{ color: "var(--color-text-tertiary)" }}>-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* pagination */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", borderTop: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-secondary)",
        }}>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {total} result{total === 1 ? "" : "s"} · Page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger style={{ height: 30, fontSize: 12, width: 100, borderRadius: 6 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ height: 30, padding: "0 10px", fontSize: 12 }}>←</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ height: 30, padding: "0 10px", fontSize: 12 }}>→</Button>
          </div>
        </div>
      </div>

      {/* task detail panel */}
      {selectedTask && (
        <div style={{
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 12, overflow: "hidden",
        }}>
          {/* detail header with action buttons */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 20px", background: "var(--color-background-secondary)",
            borderBottom: "0.5px solid var(--color-border-tertiary)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600 }}>{selectedTask.task_id}</span>
              <StatusPill status={selectedTask.status} />
              <PriorityPill priority={selectedTask.priority} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {canAssign && ["pending", "in_progress", "exception"].includes(selectedTask.status) && (
                <button disabled={actionKey === "assign"} onClick={openAssignModal}
                  style={{ ...ghostBtn, opacity: actionKey === "assign" ? 0.5 : 1 }}>
                  Assign
                </button>
              )}
              {canRecompute && ["pending", "in_progress"].includes(selectedTask.status) && (
                <button disabled={actionKey === "recompute"} onClick={submitRecompute}
                  style={{ ...ghostBtn, opacity: actionKey === "recompute" ? 0.5 : 1 }}>
                  {actionKey === "recompute" ? "Recomputing..." : "Recompute Bin"}
                </button>
              )}
              {canCompleteTask && selectedTask.status === "in_progress" && (
                <button disabled={actionKey === "complete"} onClick={openCompleteModal}
                  style={{ ...ghostBtn, border: "none", background: "#1D4ED8", color: "#fff", opacity: actionKey === "complete" ? 0.6 : 1 }}>
                  {actionKey === "complete" ? "Completing..." : "Complete Task"}
                </button>
              )}
              {canMarkException && ["pending", "in_progress"].includes(selectedTask.status) && (
                <button disabled={actionKey === "exception"} onClick={openExceptionModal}
                  style={{ ...ghostBtn, border: "none", background: "#DC2626", color: "#fff", opacity: actionKey === "exception" ? 0.6 : 1 }}>
                  Mark as Exception
                </button>
              )}
              {canViewHistory && (
                <button disabled={actionKey === "history"} onClick={() => openHistory(selectedTask.task_id)}
                  style={{ ...ghostBtn, color: "var(--color-text-secondary)", opacity: actionKey === "history" ? 0.5 : 1 }}>
                  View History
                </button>
              )}
            </div>
          </div>

          {/* detail body */}
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* summary row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <DetailField label="SKU">{selectedTask.sku_id}</DetailField>
              <DetailField label="Quantity">{selectedTask.qty}</DetailField>
              <DetailField label="Source">{selectedTask.source_location}</DetailField>
              <DetailField label="Suggested Bin">
                <span style={{ fontFamily: "monospace" }}>{selectedTask.suggested_bin}</span>
              </DetailField>
            </div>

            {/* two column sections */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <SectionBox title="Task Details & Execution">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                  <DetailField label="Assigned To">
                    {selectedTask.execution?.assigned_to || selectedTask.assigned_to_user_name ||
                      <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>Unassigned</span>}
                  </DetailField>
                  <DetailField label="Started At">{formatDateTime(selectedTask.execution?.started_at || selectedTask.started_at)}</DetailField>
                  <DetailField label="Completed At">{formatDateTime(selectedTask.execution?.completed_at || selectedTask.completed_at)}</DetailField>
                  <DetailField label="Actual Bin">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "monospace" }}>
                      {selectedTask.execution?.actual_bin || selectedTask.actual_bin_code || "-"}
                      {selectedTaskHasBinMismatch && <AlertTriangle size={13} style={{ color: "#D97706" }} />}
                    </span>
                  </DetailField>
                  <DetailField label="Device Type">{selectedTask.execution?.device_type || selectedTask.device_type || "-"}</DetailField>
                  <DetailField label="Last Updated">{formatDateTime(selectedTask.updated_at)}</DetailField>
                </div>
              </SectionBox>

              <SectionBox title="Evidence Summary">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                  <DetailField label="Scan Method">{selectedTask.evidence_summary?.scan_method || selectedTask.scan_method || "-"}</DetailField>
                  <DetailField label="EPC Expected">{selectedTask.evidence_summary?.epc_expected_count ?? selectedTask.epc_expected_count ?? "-"}</DetailField>
                  <DetailField label="EPC Confirmed">{selectedTask.evidence_summary?.epc_confirmed_count ?? selectedTask.epc_confirmed_count ?? "-"}</DetailField>
                  <DetailField label="Validation Result">
                    <span style={{ textTransform: "capitalize" }}>
                      {selectedTask.evidence_summary?.validation_result || selectedTask.validation_result || "-"}
                    </span>
                  </DetailField>
                  {selectedTask.status === "exception" && (
                    <div style={{ gridColumn: "span 2" }}>
                      <DetailField label="Exception Reason">
                        <span style={{ color: "#991B1B" }}>
                          {selectedTask.evidence_summary?.exception_reason || selectedTask.exception_reason || "-"}
                        </span>
                      </DetailField>
                    </div>
                  )}
                </div>
              </SectionBox>
            </div>
          </div>
        </div>
      )}

      {/* assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Putaway Task</DialogTitle>
            <DialogDescription>Assign task {selectedTask?.task_id || "-"} to a warehouse operator.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Operator</Label>
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
              <SelectContent>
                {operators.length === 0 && <SelectItem value="none" disabled>No operators available</SelectItem>}
                {operators.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>{user.user_name} ({user.user_id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={actionKey === "assign"}>Cancel</Button>
            <Button onClick={submitAssign} disabled={!assignUserId || actionKey === "assign"}>
              {actionKey === "assign" ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* complete dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Putaway Task</DialogTitle>
            <DialogDescription>Confirm the actual bin for task {selectedTask?.task_id || "-"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="actual-bin">Actual Bin</Label>
            <Input id="actual-bin" value={actualBin} onChange={(e) => setActualBin(e.target.value)} onBlur={() => setCompleteTouched(true)} placeholder={selectedTask?.suggested_bin || "e.g. A-01-001"} />
            {completeTouched && !actualBin.trim() && <p className="text-xs text-destructive">Actual bin is required.</p>}
            {actualBin.trim() && selectedTask?.suggested_bin && actualBin.trim() !== selectedTask.suggested_bin && (
              <p style={{ fontSize: 12, color: "#D97706", display: "flex", alignItems: "center", gap: 5 }}>
                <AlertTriangle size={13} />
                Bin differs from suggested ({selectedTask.suggested_bin}). This will be flagged.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={actionKey === "complete"}>Cancel</Button>
            <Button onClick={submitComplete} disabled={!actualBin.trim() || actionKey === "complete"}>
              {actionKey === "complete" ? "Completing..." : "Confirm Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* exception dialog */}
      <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Task as Exception</DialogTitle>
            <DialogDescription>Provide a reason for task {selectedTask?.task_id || "-"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="exception-reason">Exception Reason</Label>
            <Textarea id="exception-reason" rows={4} value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} onBlur={() => setExceptionTouched(true)} placeholder="Explain why this task is an exception" />
            {exceptionTouched && !isExceptionReasonValid && <p className="text-xs text-destructive">Reason must be at least 5 characters.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExceptionOpen(false)} disabled={actionKey === "exception"}>Back</Button>
            <Button variant="destructive" onClick={submitException} disabled={!isExceptionReasonValid || actionKey === "exception"}>
              {actionKey === "exception" ? "Saving..." : "Confirm Exception"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* history dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Task History</DialogTitle>
            <DialogDescription>Timeline of events for {selectedTask?.task_id || selectedTaskId || "-"}.</DialogDescription>
          </DialogHeader>
          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {historyRows.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No history entries found.</p>}
            {historyRows.map((event) => (
              <div key={event.event_id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ fontSize: 13, fontWeight: 500, textTransform: "capitalize", marginBottom: 4 }}>
                  {event.event_type.replace(/_/g, " ")}
                </p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>{payloadToText(event.event_payload)}</p>
                <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock3 size={11} />
                  {formatDateTime(event.created_at)} · {event.created_by}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AppLayout>
  );
};

export default PutawayPage;