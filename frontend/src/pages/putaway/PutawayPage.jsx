import { useCallback, useEffect, useMemo, useState } from "react";
import { GlossaryRegistry, GlossaryTerm } from "@/components/shared/GlossaryTooltip";
import { AlertTriangle, Clock3 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatQuantity } from "@/utils/formatQuantity";
import { formatDateTime } from "@/utils/dateTimeFormatter";
import {
  canAssignPutawayRole,
  canCompletePutawayTask,
  canViewPutawayHistoryRole,
  normalizePutawayRole,
  putawayAssignedToLabel,
} from "./putawayRbac";
import {
  assignPutawayTask,
  completePutawayTask,
  fetchPutawayOperators,
  fetchPutawayTask,
  fetchPutawayTaskHistory,
  fetchPutawayTasks,
  lookupLocations,
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

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: "#e03131", color: "#fff" };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnSecondary = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #c7d2fe", background: "#fff", color: ACCENT };
const btnTertiary = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_SECONDARY };

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:     { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
  assigned:    { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Assigned" },
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
      fontSize: 12, fontWeight: 500, lineHeight: "16px", padding: "3px 10px", borderRadius: 20,
      background: c.bg, color: c.color, border: `0.5px solid ${c.border}`,
      whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

// ── Priority pill ─────────────────────────────────────────────────────────────
function putawayStatusLabel(status) {
  const key = normalizeStatus(status);
  return STATUS_CFG[key]?.label || String(status || "-").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function historyEventLabel(eventType) {
  const normalized = String(eventType || "").trim().toLowerCase();
  const labels = {
    assigned: "Assigned",
    completed: "Completed",
    exception: "Exception",
    recompute_bin: "Recompute Bin",
  };
  return labels[normalized] || putawayStatusLabel(normalized);
}

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
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: danger ? "#991b1b" : T_PRIMARY }}>
        {children ?? "-"}
      </p>
    </div>
  );
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function LocationCode({ value }) {
  const text = hasValue(value) ? String(value) : "-";
  return (
    <span
      title={hasValue(value) ? text : undefined}
      style={{
        display: "block",
        minWidth: 0,
        maxWidth: "100%",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        fontWeight: 400,
        lineHeight: "20px",
        color: T_SECONDARY,
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {text}
    </span>
  );
}

function SkuDisplay({ task }) {
  const skuName = task?.sku_name || task?.sku_description;
  return (
    <span style={{ display: "block", minWidth: 0 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>
        {task?.sku_id || "-"}
      </span>
      {skuName && (
        <span style={{ display: "block", marginTop: 3, fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY }}>
          {skuName}
        </span>
      )}
    </span>
  );
}

function skuCompletionLabel(task) {
  const skuCode = task?.sku_id || "-";
  const productName = task?.product_name || task?.sku_name || task?.sku_description;
  return productName ? `${skuCode} – ${productName}` : skuCode;
}

// ── SectionBox ────────────────────────────────────────────────────────────────
function SectionBox({ title, children }) {
  return (
    <div style={{ border: "0.5px solid #e8ebf8", borderRadius: 10, padding: "14px 16px", background: "#fff", minHeight: "100%" }}>
      <p style={{ fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, marginBottom: 12 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function SummaryTile({ label, children }) {
  return (
    <div style={{ minWidth: 0, border: "0.5px solid #e8ebf8", borderRadius: 10, background: "#fff", padding: "12px 14px" }}>
      <p style={{ fontSize: 12, fontWeight: 600, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
        {label}
      </p>
      <div style={{ minWidth: 0, fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY }}>
        {children ?? "-"}
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const initialFilters = { search: "", status: "", priority: "", dateFrom: "", dateTo: "", source: "", suggestedBin: "", grn: "", sku: "" };

const putawayStatuses = new Set(["pending", "assigned", "in_progress", "completed", "exception"]);

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function canAssignTaskStatus(status) {
  return ["pending", "open"].includes(normalizeStatus(status));
}

function taskApiId(task) {
  return String(
    task?.putaway_task_id
    || task?.putawayTaskId
    || task?.task_id
    || task?.taskId
    || ""
  ).trim();
}

function isTaskRow(value) {
  return Boolean(value && typeof value === "object" && taskApiId(value));
}

function taskScopedSession(session, task) {
  return {
    ...session,
    warehouse_id: task?.warehouse_id || session.warehouse_id,
  };
}

function isPutawayCompleteDebugEnabled() {
  return typeof window !== "undefined" && window.localStorage?.getItem("wms.debug.putawayComplete") === "1";
}

function logPutawayCompleteDebug(stage, payload) {
  if (isPutawayCompleteDebugEnabled()) {
    console.info(`[WMS Putaway Complete] ${stage}`, payload);
  }
}

function payloadToText(payload) {
  if (!payload || typeof payload !== "object") return "-";
  const entries = Object.entries(payload);
  if (!entries.length) return "-";
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
  const roleId    = useMemo(() => normalizePutawayRole(session.role_id || auth.currentUser?.role), [auth.currentUser?.role, session.role_id]);

  const canAssign        = useMemo(() => canAssignPutawayRole(roleId), [roleId]);
  const canRecompute     = useMemo(() => ["superadmin", "hqadmin"].includes(roleId), [roleId]);
  const canMarkException = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canViewHistory   = useMemo(() => canViewPutawayHistoryRole(roleId), [roleId]);

  const [filters, setFilters]               = useState(initialFilters);
  const [page, setPage]                     = useState(1);
  const [pageSize, setPageSize]             = useState(10);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState("");
  const [tasks, setTasks]                   = useState([]);
  const [total, setTotal]                   = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTask, setSelectedTask]     = useState(null);
  const [actionTask, setActionTask]         = useState(null);
  const [operators, setOperators]           = useState([]);
  const [actionKey, setActionKey]           = useState("");

  // assign modal
  const [assignOpen, setAssignOpen]     = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignErr, setAssignErr]       = useState("");

  // complete modal
  const [completeOpen, setCompleteOpen]       = useState(false);
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [storageLocations, setStorageLocations] = useState([]);
  const [destinationLoading, setDestinationLoading] = useState(false);
  const [completeTouched, setCompleteTouched] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);

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
  const refreshTaskAfterComplete = async (taskId, scopedSession, completedTask) => {
    if (completedTask) {
      setSelectedTask(completedTask);
      setTasks((current) => current.map((row) => (
        row.task_id === taskId || row.putaway_task_id === taskId
          ? { ...row, ...completedTask }
          : row
      )));
    }
    try {
      const [listResult, detail] = await Promise.all([
        fetchPutawayTasks(scopedSession, { page, pageSize, ...filters }),
        fetchPutawayTask(scopedSession, taskId),
      ]);
      const rows = Array.isArray(listResult?.items) ? listResult.items : [];
      setTasks(rows);
      setTotal(Number(listResult?.total || 0));
      setSelectedTask(detail || completedTask || null);
      setSelectedTaskId(taskId);
    } catch (e) {
      logPutawayCompleteDebug("post-success refresh failed", {
        taskId,
        message: e.message,
      });
    }
  };

  // ── Assign ────────────────────────────────────────────────────────────────
  const openAssignModal = async (taskOrEvent = selectedTask) => {
    const task = isTaskRow(taskOrEvent) ? taskOrEvent : selectedTask;
    const id = taskApiId(task);
    if (!task || !id) {
      const msg = "Putaway task id is missing. Select the task again before assigning.";
      setAssignErr(msg);
      toast({ title: "Assign failed", description: msg, variant: "destructive" });
      return;
    }
    setActionTask(task);
    setSelectedTaskId(id);
    setAssignUserId(task.assigned_to_user_id || "");
    setAssignErr("");
    setAssignOpen(true);
    try {
      const rows = await fetchPutawayOperators(taskScopedSession(session, task));
      setOperators(Array.isArray(rows) ? rows : []);
    } catch (_) { setOperators([]); }
  };

  const submitAssign = async () => {
    const task = actionTask || selectedTask;
    if (!assignUserId) { setAssignErr("Please select an operator"); return; }
    const id = taskApiId(task);
    if (!task || !id) {
      const msg = "Putaway task id is missing. Select the task again before assigning.";
      setAssignErr(msg);
      toast({ title: "Assign failed", description: msg, variant: "destructive" });
      return;
    }
    try {
      setActionKey("assign"); setError("");
      const scopedSession = taskScopedSession(session, task);
      const res = await assignPutawayTask(scopedSession, id, assignUserId);
      toast({ title: "Task assigned", description: res?.message || `Task ${id} assigned` });
      setAssignOpen(false);
      setActionTask(null);
      await refreshData(id);
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
  const openCompleteModal = async (task = selectedTask) => {
    logPutawayCompleteDebug("detail/list button clicked", {
      task_id: task?.task_id,
      putaway_task_id: task?.putaway_task_id,
      status: task?.status,
      assigned_to_user_id: task?.assigned_to_user_id,
      warehouse_id: task?.warehouse_id,
      roleId,
      canComplete: canCompletePutawayTask(roleId, task),
    });
    if (!task) {
      logPutawayCompleteDebug("open modal early return: missing task", {});
      return;
    }
    logPutawayCompleteDebug("open modal", {
      task_id: task.task_id,
      putaway_task_id: task.putaway_task_id,
      status: task.status,
      assigned_to_user_id: task.assigned_to_user_id,
      task_warehouse_id: task.warehouse_id,
      session,
      roleId,
    });
    if (!canCompletePutawayTask(roleId, task)) {
      logPutawayCompleteDebug("open modal blocked by canCompletePutawayTask", {
        roleId,
        status: task.status,
        assigned_to_user_id: task.assigned_to_user_id,
      });
      toast({
        title: "Complete failed",
        description: "Putaway task must be assigned before completion.",
        variant: "destructive",
      });
      return;
    }
    setActionTask(task);
    setSelectedTaskId(task.task_id);
    setDestinationLocationId(task.destination_location_id || "");
    setStorageLocations([]);
    setCompleteTouched(false);
    setCompleteConfirmOpen(false);
    setCompleteOpen(true);
    logPutawayCompleteDebug("modal opened", {
      task_id: task.task_id,
      destination_location_id: task.destination_location_id || "",
    });
    try {
      setDestinationLoading(true);
      const rows = await lookupLocations(session, { type: "storage" });
      const available = rows.filter(
        (item) => !task.warehouse_id || item.warehouse_id === task.warehouse_id
      );
      setStorageLocations(available);
      logPutawayCompleteDebug("storage locations loaded", {
        task_id: task.task_id,
        count: available.length,
        destination_location_id: task.destination_location_id || "",
      });
      if (!task.destination_location_id) {
        const suggested = available.find(
          (item) => item.display_name === task.suggested_bin
            || item.location_code === task.suggested_bin
        );
        if (suggested) {
          logPutawayCompleteDebug("suggested destination selected", {
            task_id: task.task_id,
            destination_location_id: suggested.location_id,
          });
          setDestinationLocationId(suggested.location_id);
        } else {
          logPutawayCompleteDebug("no suggested destination matched", {
            task_id: task.task_id,
            suggested_bin: task.suggested_bin,
          });
        }
      }
    } catch (e) {
      logPutawayCompleteDebug("modal location load failed", { message: e.message });
      const msg = e.message || "Unable to load storage locations";
      setError(msg);
      toast({ title: "Locations failed", description: msg, variant: "destructive" });
    } finally {
      setDestinationLoading(false);
    }
  };

  const requestCompleteConfirmation = () => {
    logPutawayCompleteDebug("continue clicked", {
      destination_location_id: destinationLocationId,
      destinationLoading,
      actionKey,
      disabled: !destinationLocationId || destinationLoading || actionKey === "complete",
    });
    setCompleteTouched(true);
    if (!destinationLocationId) {
      logPutawayCompleteDebug("continue early return: missing destination", {});
      return;
    }
    setCompleteConfirmOpen(true);
    logPutawayCompleteDebug("confirm modal opened", {
      destination_location_id: destinationLocationId,
    });
  };

  const submitComplete = async () => {
    logPutawayCompleteDebug("confirm clicked", {
      actionTask: actionTask && {
        task_id: actionTask.task_id,
        status: actionTask.status,
        assigned_to_user_id: actionTask.assigned_to_user_id,
        warehouse_id: actionTask.warehouse_id,
      },
      selectedTask: selectedTask && {
        task_id: selectedTask.task_id,
        status: selectedTask.status,
        assigned_to_user_id: selectedTask.assigned_to_user_id,
        warehouse_id: selectedTask.warehouse_id,
      },
      destination_location_id: destinationLocationId,
      actionKey,
    });
    const task = actionTask || selectedTask;
    setCompleteTouched(true);
    if (!task || !destinationLocationId) {
      logPutawayCompleteDebug("submit early return: missing task or destination", {
        hasTask: Boolean(task),
        destination_location_id: destinationLocationId,
      });
      return;
    }
    const scopedSession = taskScopedSession(session, task);
    const apiTaskId = taskApiId(task);
    const finalApiUrl = `${import.meta.env.VITE_API_URL}/api/v1/putaway-tasks/${apiTaskId}/complete`;
    const debugPayload = {
      task_id: task.task_id,
      putaway_task_id: task.putaway_task_id,
      apiTaskId,
      status: task.status,
      assigned_to_user_id: task.assigned_to_user_id,
      task_warehouse_id: task.warehouse_id,
      destination_location_id: destinationLocationId,
      session_user_id: session.user_id,
      session_warehouse_id: session.warehouse_id,
      scoped_user_id: scopedSession.user_id,
      scoped_warehouse_id: scopedSession.warehouse_id,
      tenant_id: scopedSession.tenant_id,
      role_id: scopedSession.role_id,
      final_api_url: finalApiUrl,
    };
    logPutawayCompleteDebug("submit click", debugPayload);
    if (!canCompletePutawayTask(roleId, task)) {
      logPutawayCompleteDebug("submit blocked by canCompletePutawayTask", {
        roleId,
        status: task.status,
        assigned_to_user_id: task.assigned_to_user_id,
      });
      toast({
        title: "Complete failed",
        description: "Putaway task must be assigned before completion.",
        variant: "destructive",
      });
      return;
    }
    try {
      setActionKey("complete"); setError("");
      logPutawayCompleteDebug("before API call", debugPayload);
      const res = await completePutawayTask(scopedSession, apiTaskId, {
        destination_location_id: destinationLocationId,
      });
      logPutawayCompleteDebug("submit success", {
        task_id: task.task_id,
        apiTaskId,
        response: res,
      });
      toast({ title: "Task completed", description: res?.message || `Task ${apiTaskId} completed` });
      setCompleteConfirmOpen(false);
      setCompleteOpen(false);
      setActionTask(null);
      await refreshTaskAfterComplete(apiTaskId, scopedSession, res?.task);
    } catch (e) {
      const msg = e.message || "Unable to complete task";
      logPutawayCompleteDebug("submit error", {
        task_id: task.task_id,
        apiTaskId,
        message: msg,
        error: e,
      });
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
  const modalTask = actionTask || selectedTask;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <GlossaryRegistry>
    <AppLayout>
      <Breadcrumbs items={[{ label: "Putaway" }]} />

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Putaway Tasks</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Manage and track warehouse putaway operations</p>
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
              style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
              placeholder="Search task, GRN, SKU, bin…"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
          </div>
          {/* Status */}
          <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
            <SelectTrigger style={{ height: 40, width: 160, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="exception">Exception</SelectItem>
            </SelectContent>
          </Select>
          {/* Priority */}
          <Select value={filters.priority || "all"} onValueChange={(v) => updateFilter("priority", v === "all" ? "" : v)}>
            <SelectTrigger style={{ height: 40, width: 150, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <input
            type="date"
            placeholder="dd/mm/yyyy"
            value={filters.dateFrom}
            onChange={(e) => updateFilter("dateFrom", e.target.value)}
            style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
            aria-label="From Date"
          />
          <input
            type="date"
            placeholder="dd/mm/yyyy"
            value={filters.dateTo}
            onChange={(e) => updateFilter("dateTo", e.target.value)}
            style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
            aria-label="To Date"
          />
          <div style={{ flex: 1 }} />
          <button style={btnNeutral} onClick={resetFilters}>Clear</button>
          <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={fetchList} disabled={loading || Boolean(actionKey)}>Refresh</button>
        </div>

        {/* Table */}
        <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafbff" }}>
              {[
                "Task ID", "GRN", "SKU", "Qty", "Source",
                "Suggested Bin", "Priority", "Status",
                "Assigned To", "Updated", "Actions",
              ].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                  {h === "GRN" ? <GlossaryTerm term="GRN" /> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>Loading…</td></tr>
            )}
            {!loading && tasks.length === 0 && (
              <tr><td colSpan={11} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No putaway tasks found.</td></tr>
            )}
            {!loading && tasks.map((task) => {
              const isSel = selectedTaskId === task.task_id;
              const showAssign = canAssign && canAssignTaskStatus(task.status);
              const showComplete = canCompletePutawayTask(roleId, task);
              return (
                <tr key={task.task_id}
                  tabIndex={0}
                  aria-selected={isSel}
                  style={{
                    cursor: "pointer",
                    background: isSel ? "#f7f8ff" : "transparent",
                    borderBottom: "0.5px solid #f0f0f0",
                    boxShadow: isSel ? `inset 3px 0 0 ${ACCENT}` : "none",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  onFocus={(e) => { e.currentTarget.style.boxShadow = `inset 3px 0 0 ${ACCENT}, 0 0 0 2px rgba(59,91,219,.12)`; }}
                  onBlur={(e) => { e.currentTarget.style.boxShadow = isSel ? `inset 3px 0 0 ${ACCENT}` : "none"; }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedTaskId((prev) => prev === task.task_id ? "" : task.task_id);
                    }
                  }}
                  onClick={() => setSelectedTaskId((prev) => prev === task.task_id ? "" : task.task_id)}
                >
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{task.task_id}</span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{task.grn_id || "-"}</span>
                  </td>
                  <td style={{ padding: "14px 16px", minWidth: 180, maxWidth: 260 }}><SkuDisplay task={task} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{formatQuantity(task.qty)}</td>
                  <td style={{ padding: "14px 16px", minWidth: 150, maxWidth: 220 }}><LocationCode value={task.source_location} /></td>
                  <td style={{ padding: "14px 16px", minWidth: 150, maxWidth: 220 }}><LocationCode value={task.suggested_bin} /></td>
                  <td style={{ padding: "14px 16px" }}><PriorityPill priority={task.priority} /></td>
                  <td style={{ padding: "14px 16px" }}><StatusPill status={task.status} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: task.assigned_to_user_id ? T_PRIMARY : T_MUTED }}>
                    {putawayAssignedToLabel(task)}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{formatDateTime(task.updated_at)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {showAssign && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openAssignModal(task); }}
                        style={{ ...btnBase, height: 28, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#fff", color: T_PRIMARY, border: "0.5px solid #d1d5db", opacity: (Boolean(actionKey) || loading) ? 0.5 : 1 }}
                        disabled={Boolean(actionKey) || loading}
                      >
                        Assign
                      </button>
                    )}
                    {showComplete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          logPutawayCompleteDebug("table Complete button onClick", {
                            task_id: task.task_id,
                            status: task.status,
                            assigned_to_user_id: task.assigned_to_user_id,
                          });
                          openCompleteModal(task);
                        }}
                        style={{ ...btnBase, height: 28, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: ACCENT, color: "#fff", border: "0.5px solid #2f49b8", opacity: (Boolean(actionKey) || loading) ? 0.5 : 1 }}
                        disabled={Boolean(actionKey) || loading}
                      >
                        Complete
                      </button>
                    )}
                    {canViewHistory ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); openHistory(task.task_id); }}
                        style={{ ...btnBase, height: 28, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#f0f4ff", color: ACCENT, border: "0.5px solid #c7d2fe", opacity: (Boolean(actionKey) || loading) ? 0.5 : 1 }}
                        disabled={Boolean(actionKey) || loading}
                      >
                        History
                      </button>
                    ) : <span style={{ fontSize: 12, color: T_MUTED }}>-</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {/* Pagination */}
        <div style={{ padding: "10px 16px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
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
          <div style={{ borderTop: "2px solid #3b5bdb", background: "#fbfcff", boxShadow: `inset 3px 0 0 ${ACCENT}` }}>
            <div style={{ padding: "14px 16px 16px" }}>

              {/* Header row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                      Putaway ID
                    </p>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{selectedTask.task_id}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <StatusPill status={selectedTask.status} />
                    <PriorityPill priority={selectedTask.priority} />
                  </div>
                </div>
                {/* Action buttons */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
                  {canAssign && canAssignTaskStatus(selectedTask.status) && (
                    <button style={{ ...btnPrimary, opacity: actionKey === "assign" ? 0.5 : 1 }} disabled={Boolean(actionKey)} onClick={() => openAssignModal(selectedTask)}>
                      {selectedTask.assigned_to_user_id ? "Reassign" : "Assign"}
                    </button>
                  )}
                  {canRecompute && ["pending", "in_progress"].includes(normalizeStatus(selectedTask.status)) && (
                    <button style={{ ...btnSecondary, opacity: actionKey === "recompute" ? 0.5 : 1 }} disabled={Boolean(actionKey)} onClick={submitRecompute}>
                      {actionKey === "recompute" ? "Recomputing…" : "Recompute Bin"}
                    </button>
                  )}
                  {canCompletePutawayTask(roleId, selectedTask) && (
                    <button
                      style={{ ...btnPrimary, opacity: actionKey === "complete" ? 0.55 : 1 }}
                      disabled={Boolean(actionKey)}
                      onClick={() => {
                        logPutawayCompleteDebug("detail Complete Task button onClick", {
                          task_id: selectedTask.task_id,
                          status: selectedTask.status,
                          assigned_to_user_id: selectedTask.assigned_to_user_id,
                        });
                        openCompleteModal(selectedTask);
                      }}
                    >
                      {actionKey === "complete" ? "Completing…" : "Complete Task"}
                    </button>
                  )}
                  {canMarkException && ["pending", "assigned", "in_progress"].includes(normalizeStatus(selectedTask.status)) && (
                    <button style={{ ...btnDanger, opacity: actionKey === "exception" ? 0.55 : 1 }} disabled={Boolean(actionKey)} onClick={openExceptionModal}>
                      Mark Exception
                    </button>
                  )}
                  {canViewHistory && (
                    <button style={{ ...btnTertiary, opacity: actionKey === "history" ? 0.5 : 1 }} disabled={Boolean(actionKey)} onClick={() => openHistory(selectedTask.task_id)}>
                      View History
                    </button>
                  )}
                </div>
              </div>

              {/* Summary fields */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                <SummaryTile label="SKU"><SkuDisplay task={selectedTask} /></SummaryTile>
                <SummaryTile label="Quantity">{formatQuantity(selectedTask.qty)}</SummaryTile>
                <SummaryTile label="Source"><LocationCode value={selectedTask.source_location} /></SummaryTile>
                <SummaryTile label="Suggested Bin"><LocationCode value={selectedTask.suggested_bin} /></SummaryTile>
              </div>

              {/* Two-column sections */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, alignItems: "stretch" }}>
                <SectionBox title="Task Details & Execution">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px 14px" }}>
                    <DetailField label="Assigned To">
                      {putawayAssignedToLabel(selectedTask) === "Unassigned"
                        ? <span style={{ color: T_MUTED, fontWeight: 400 }}>Unassigned</span>
                        : putawayAssignedToLabel(selectedTask)}
                    </DetailField>
                    <DetailField label="Completed At">{formatDateTime(selectedTask.execution?.completed_at || selectedTask.completed_at)}</DetailField>
                    <DetailField label="Actual Bin">
                      <span style={{ display: "flex", alignItems: "flex-start", gap: 5, minWidth: 0 }}>
                        <LocationCode value={selectedTask.execution?.actual_bin || selectedTask.actual_bin_code} />
                        {selectedTaskHasBinMismatch && <AlertTriangle size={16} style={{ color: "#d97706" }} />}
                      </span>
                    </DetailField>
                    {hasValue(selectedTask.execution?.started_at || selectedTask.started_at) && (
                      <DetailField label="Started At">{formatDateTime(selectedTask.execution?.started_at || selectedTask.started_at)}</DetailField>
                    )}
                    {hasValue(selectedTask.execution?.device_type || selectedTask.device_type) && (
                      <DetailField label="Device Type">{selectedTask.execution?.device_type || selectedTask.device_type}</DetailField>
                    )}
                    <DetailField label="Last Updated">{formatDateTime(selectedTask.updated_at)}</DetailField>
                  </div>
                </SectionBox>

                <SectionBox title="Evidence Summary">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px 14px" }}>
                    {hasValue(selectedTask.evidence_summary?.scan_method || selectedTask.scan_method) && (
                      <DetailField label="Scan Method">{selectedTask.evidence_summary?.scan_method || selectedTask.scan_method}</DetailField>
                    )}
                    {hasValue(selectedTask.evidence_summary?.epc_expected_count ?? selectedTask.epc_expected_count) && (
                      <DetailField label="EPC Expected">{selectedTask.evidence_summary?.epc_expected_count ?? selectedTask.epc_expected_count}</DetailField>
                    )}
                    {hasValue(selectedTask.evidence_summary?.epc_confirmed_count ?? selectedTask.epc_confirmed_count) && (
                      <DetailField label="EPC Confirmed">{selectedTask.evidence_summary?.epc_confirmed_count ?? selectedTask.epc_confirmed_count}</DetailField>
                    )}
                    <DetailField label="Validation">
                      <span style={{ textTransform: "capitalize" }}>
                        {selectedTask.evidence_summary?.validation_result || selectedTask.validation_result || "-"}
                      </span>
                    </DetailField>
                    {selectedTask.status === "exception" && (
                      <div style={{ gridColumn: "span 2" }}>
                        <DetailField label="Exception Reason" danger>
                          {selectedTask.evidence_summary?.exception_reason || selectedTask.exception_reason || "-"}
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
              Assign task <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{modalTask?.task_id}</strong> to a warehouse operator.
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
              <button style={btnNeutral} onClick={() => { setAssignOpen(false); setActionTask(null); }} disabled={actionKey === "assign"}>Back</button>
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
              Confirm the actual bin for task <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{modalTask?.task_id}</strong>.
            </p>
            <div className="space-y-1.5">
              <Label>Destination Storage Location <span style={{ color: "#e03131" }}>*</span></Label>
              <Select
                value={destinationLocationId || "none"}
                onValueChange={(value) => {
                  setCompleteTouched(true);
                  setDestinationLocationId(value === "none" ? "" : value);
                }}
                disabled={destinationLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={destinationLoading ? "Loading locations..." : "Select storage location"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select storage location</SelectItem>
                  {storageLocations.map((item) => (
                    <SelectItem key={item.location_id} value={item.location_id}>
                      {item.display_name || item.location_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {completeTouched && !destinationLocationId && (
                <p style={{ fontSize: 12, color: "#991b1b" }}>Destination storage location is required.</p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => { setCompleteOpen(false); setCompleteConfirmOpen(false); setActionTask(null); }} disabled={actionKey === "complete"}>Back</button>
              <button
                style={{ ...btnPrimary, opacity: (!destinationLocationId || actionKey === "complete") ? 0.55 : 1 }}
                onClick={() => {
                  logPutawayCompleteDebug("Continue button onClick", {
                    destination_location_id: destinationLocationId,
                    destinationLoading,
                    actionKey,
                    disabled: !destinationLocationId || destinationLoading || actionKey === "complete",
                  });
                  requestCompleteConfirmation();
                }}
                disabled={!destinationLocationId || destinationLoading || actionKey === "complete"}
              >
                Continue
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Exception modal ── */}
      <Dialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Putaway Completion</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Complete task <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{modalTask?.task_id}</strong> and move inventory to the selected storage location?
            </p>
            <div style={{ border: "0.5px solid #e8ebf8", borderRadius: 8, padding: "10px 12px", background: "#fafbff" }}>
              <DetailField label="SKU">{skuCompletionLabel(modalTask)}</DetailField>
              <div style={{ height: 8 }} />
              <DetailField label="Quantity">{formatQuantity(modalTask?.qty)}</DetailField>
              <div style={{ height: 8 }} />
              <DetailField label="Destination">
                {storageLocations.find((item) => item.location_id === destinationLocationId)?.display_name
                  || storageLocations.find((item) => item.location_id === destinationLocationId)?.location_code
                  || destinationLocationId}
              </DetailField>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setCompleteConfirmOpen(false)} disabled={actionKey === "complete"}>Back</button>
              <button
                style={{ ...btnPrimary, opacity: actionKey === "complete" ? 0.55 : 1 }}
                onClick={() => {
                  logPutawayCompleteDebug("Complete Putaway button onClick", {
                    actionKey,
                    disabled: actionKey === "complete",
                  });
                  submitComplete();
                }}
                disabled={actionKey === "complete"}
              >
                {actionKey === "complete" ? "Completing..." : "Complete Putaway"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: T_PRIMARY }}>
                  {historyEventLabel(event.event_type)}
                </p>
                <p style={{ fontSize: 12, color: T_SECONDARY, marginBottom: 6 }}>{payloadToText(event.event_payload)}</p>
                <p style={{ fontSize: 12, color: T_MUTED, display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock3 size={11} />
                  {formatDateTime(event.created_at)} · {event.created_by}
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
    </GlossaryRegistry>
  );
};

export default PutawayPage;
