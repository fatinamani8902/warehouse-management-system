import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "storeoperator").toLowerCase()] || "storeoperator";
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString();
}

function payloadToText(payload) {
  if (!payload || typeof payload !== "object") {
    return "-";
  }
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return "-";
  }
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
  const roleId = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);

  const canAssign = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canRecompute = useMemo(() => ["superadmin", "hqadmin"].includes(roleId), [roleId]);
  const canMarkException = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canCompleteTask = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canViewHistory = useMemo(
    () => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId),
    [roleId],
  );

  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);

  const [operators, setOperators] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");

  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionTouched, setExceptionTouched] = useState(false);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [actualBin, setActualBin] = useState("");
  const [completeTouched, setCompleteTouched] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);

  const [actionKey, setActionKey] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const isExceptionReasonValid = useMemo(() => exceptionReason.trim().length >= 5, [exceptionReason]);
  const selectedTaskHasBinMismatch = useMemo(() => {
    if (!selectedTask?.actual_bin_code || !selectedTask?.suggested_bin) {
      return false;
    }
    return selectedTask.actual_bin_code !== selectedTask.suggested_bin;
  }, [selectedTask]);

  useEffect(() => {
    const queryStatus = parsePutawayStatusFilter(location.search);
    setFilters((current) => ({
      ...current,
      status: queryStatus,
    }));
    setPage(1);
  }, [location.search]);

  const fetchList = useCallback(async () => {
    if (!session.tenant_id) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      const result = await fetchPutawayTasks(session, {
        page,
        pageSize,
        ...filters,
      });

      const rows = Array.isArray(result?.items) ? result.items : [];
      setTasks(rows);
      setTotal(Number(result?.total || 0));

      setSelectedTaskId((current) => {
        if (current && rows.some((item) => item.task_id === current)) {
          return current;
        }
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
    if (!taskId || !session.tenant_id) {
      setSelectedTask(null);
      return;
    }

    try {
      const detail = await fetchPutawayTask(session, taskId);
      setSelectedTask(detail || null);
    } catch (detailError) {
      setSelectedTask(null);
      setError(detailError.message || "Failed to load task details");
    }
  }, [session]);

  const loadOperators = useCallback(async () => {
    if (!canAssign) {
      setOperators([]);
      return;
    }
    try {
      const rows = await fetchPutawayOperators(session);
      setOperators(Array.isArray(rows) ? rows : []);
    } catch (_error) {
      setOperators([]);
    }
  }, [canAssign, session]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchDetail(selectedTaskId);
  }, [selectedTaskId, fetchDetail]);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  const refreshData = async (taskId = selectedTaskId) => {
    await fetchList();
    if (taskId) {
      await fetchDetail(taskId);
    }
  };

  const openAssignModal = async () => {
    setAssignUserId(selectedTask?.assigned_to_user_id || "");
    setAssignOpen(true);
    try {
      const rows = await fetchPutawayOperators(session);
      setOperators(Array.isArray(rows) ? rows : []);
    } catch (_error) {
      setOperators([]);
    }
  };

  const submitAssign = async () => {
    if (!selectedTask || !assignUserId) {
      return;
    }

    try {
      setActionKey("assign");
      setError("");
      const response = await assignPutawayTask(session, selectedTask.task_id, assignUserId);
      toast({
        title: "Task assigned",
        description: response?.message || `Task ${selectedTask.task_id} assigned`,
      });
      setAssignOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (assignError) {
      const message = assignError.message || "Unable to assign task";
      setError(message);
      toast({ title: "Assign failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const submitRecompute = async () => {
    if (!selectedTask) {
      return;
    }
    try {
      setActionKey("recompute");
      setError("");
      const response = await recomputePutawayBin(session, selectedTask.task_id);
      toast({
        title: "Suggested bin updated",
        description: response?.message || `Task ${selectedTask.task_id} recomputed`,
      });
      await refreshData(selectedTask.task_id);
    } catch (recomputeError) {
      const message = recomputeError.message || "Unable to recompute suggested bin";
      setError(message);
      toast({ title: "Recompute failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const openCompleteModal = () => {
    setActualBin(selectedTask?.suggested_bin || "");
    setCompleteTouched(false);
    setCompleteOpen(true);
  };

  const submitComplete = async () => {
    setCompleteTouched(true);
    if (!selectedTask || !actualBin.trim()) return;

    try {
      setActionKey("complete");
      setError("");
      const response = await completePutawayTask(session, selectedTask.task_id, {
        actual_bin_code: actualBin.trim(),
      });
      toast({
        title: "Task completed",
        description: response?.message || `Task ${selectedTask.task_id} marked as completed`,
      });
      setCompleteOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (completeError) {
      const message = completeError.message || "Unable to complete task";
      setError(message);
      toast({ title: "Complete failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const openExceptionModal = () => {
    setExceptionReason("");
    setExceptionTouched(false);
    setExceptionOpen(true);
  };

  const submitException = async () => {
    if (!selectedTask || !isExceptionReasonValid) {
      setExceptionTouched(true);
      return;
    }
    try {
      setActionKey("exception");
      setError("");
      const response = await markPutawayTaskException(session, selectedTask.task_id, exceptionReason.trim());
      toast({
        title: "Task marked as exception",
        description: response?.message || `Task ${selectedTask.task_id} marked as exception`,
      });
      setExceptionOpen(false);
      await refreshData(selectedTask.task_id);
    } catch (exceptionError) {
      const message = exceptionError.message || "Unable to mark task as exception";
      setError(message);
      toast({ title: "Mark exception failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const openHistory = async (taskId) => {
    if (!taskId) {
      return;
    }

    try {
      setActionKey("history");
      setError("");
      const rows = await fetchPutawayTaskHistory(session, taskId);
      setHistoryRows(Array.isArray(rows) ? rows : []);
      setHistoryOpen(true);
    } catch (historyError) {
      const message = historyError.message || "Unable to load task history";
      setError(message);
      toast({ title: "History failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Putaway" }]} />
      <h1 className="text-2xl font-bold mb-4">Putaway Tasks</h1>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
            <Input
              placeholder="Search Task/GRN/SKU/Source/Bin/Status/Priority"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
            <Select value={filters.status || "all"} onValueChange={(value) => updateFilter("status", value === "all" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="exception">Exception</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.priority || "all"} onValueChange={(value) => updateFilter("priority", value === "all" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Source"
              value={filters.source}
              onChange={(event) => updateFilter("source", event.target.value)}
            />
            <Input
              placeholder="Suggested Bin"
              value={filters.suggestedBin}
              onChange={(event) => updateFilter("suggestedBin", event.target.value)}
            />
            <Input
              placeholder="GRN"
              value={filters.grn}
              onChange={(event) => updateFilter("grn", event.target.value)}
            />
            <Input
              placeholder="SKU"
              value={filters.sku}
              onChange={(event) => updateFilter("sku", event.target.value)}
            />
            <Button variant="outline" onClick={resetFilters}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-left">Task ID</th>
                  <th className="px-3 py-2 text-left">GRN</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Suggested Bin</th>
                  <th className="px-3 py-2 text-left">Priority</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Assigned To</th>
                  <th className="px-3 py-2 text-left">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading putaway tasks...
                      </span>
                    </td>
                  </tr>
                )}

                {!loading && tasks.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      No putaway tasks found.
                    </td>
                  </tr>
                )}

                {!loading &&
                  tasks.map((task) => (
                    <tr
                      key={task.task_id}
                      className={`border-t cursor-pointer hover:bg-accent/40 ${selectedTaskId === task.task_id ? "bg-accent/30" : ""}`}
                      onClick={() => setSelectedTaskId(task.task_id)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{task.task_id}</td>
                      <td className="px-3 py-2">{task.grn_id || "-"}</td>
                      <td className="px-3 py-2">{task.sku_id}</td>
                      <td className="px-3 py-2">{task.qty}</td>
                      <td className="px-3 py-2">{task.source_location}</td>
                      <td className="px-3 py-2">{task.suggested_bin}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={task.priority} />
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-3 py-2">{task.assigned_to_user_name || "Unassigned"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-xs">{formatDateTime(task.updated_at)}</span>
                          {canViewHistory && (
                            <button
                              className="text-xs text-blue-600 hover:underline text-left w-fit"
                              onClick={(event) => {
                                event.stopPropagation();
                                openHistory(task.task_id);
                              }}
                            >
                              View History
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <div className="text-muted-foreground">
              {total} result{total === 1 ? "" : "s"} · Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[92px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedTask && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {selectedTask.task_id}
              <StatusBadge status={selectedTask.status} />
              <StatusBadge status={selectedTask.priority} />
              {canViewHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-[11px] px-2"
                  disabled={actionKey === "history"}
                  onClick={() => openHistory(selectedTask.task_id)}
                >
                  View History
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">SKU</p>
                <p>{selectedTask.sku_id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quantity</p>
                <p>{selectedTask.qty}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <p>{selectedTask.source_location}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Suggested Bin</p>
                <p>{selectedTask.suggested_bin}</p>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium mb-2">Task Details & Execution</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Assigned To</p>
                  <p>{selectedTask.execution?.assigned_to || selectedTask.assigned_to_user_name || "Unassigned"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Started At</p>
                  <p>{formatDateTime(selectedTask.execution?.started_at || selectedTask.started_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed At</p>
                  <p>{formatDateTime(selectedTask.execution?.completed_at || selectedTask.completed_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Actual Bin</p>
                  <p className="inline-flex items-center gap-1">
                    {selectedTask.execution?.actual_bin || selectedTask.actual_bin_code || "-"}
                    {selectedTaskHasBinMismatch && (
                      <span className="inline-flex items-center text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Device Type</p>
                  <p>{selectedTask.execution?.device_type || selectedTask.device_type || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p>{formatDateTime(selectedTask.updated_at)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium mb-2">Evidence Summary</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Scan Method</p>
                  <p>{selectedTask.evidence_summary?.scan_method || selectedTask.scan_method || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">EPC Expected</p>
                  <p>{selectedTask.evidence_summary?.epc_expected_count ?? selectedTask.epc_expected_count ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">EPC Confirmed</p>
                  <p>{selectedTask.evidence_summary?.epc_confirmed_count ?? selectedTask.epc_confirmed_count ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Validation Result</p>
                  <p className="capitalize">{selectedTask.evidence_summary?.validation_result || selectedTask.validation_result || "-"}</p>
                </div>
                {selectedTask.status === "exception" && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-muted-foreground">Exception Reason</p>
                    <p>{selectedTask.evidence_summary?.exception_reason || selectedTask.exception_reason || "-"}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {canAssign && ["pending", "in_progress", "exception"].includes(selectedTask.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionKey === "assign"}
                  onClick={openAssignModal}
                >
                  Assign
                </Button>
              )}
              {canRecompute && ["pending", "in_progress"].includes(selectedTask.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionKey === "recompute"}
                  onClick={submitRecompute}
                >
                  {actionKey === "recompute" ? "Recomputing..." : "Recompute Suggested Bin"}
                </Button>
              )}
              {canCompleteTask && selectedTask.status === "in_progress" && (
                <Button
                  variant="default"
                  size="sm"
                  disabled={actionKey === "complete"}
                  onClick={openCompleteModal}
                >
                  {actionKey === "complete" ? "Completing..." : "Complete Task"}
                </Button>
              )}
              {canMarkException && ["pending", "in_progress"].includes(selectedTask.status) && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={actionKey === "exception"}
                  onClick={openExceptionModal}
                >
                  Mark as Exception
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Putaway Task</DialogTitle>
            <DialogDescription>
              Assign task {selectedTask?.task_id || "-"} to a warehouse operator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Operator</Label>
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select operator" />
              </SelectTrigger>
              <SelectContent>
                {operators.length === 0 && (
                  <SelectItem value="none" disabled>
                    No operators available
                  </SelectItem>
                )}
                {operators.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    {user.user_name} ({user.user_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={actionKey === "assign"}>
              Cancel
            </Button>
            <Button onClick={submitAssign} disabled={!assignUserId || actionKey === "assign"}>
              {actionKey === "assign" ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Putaway Task</DialogTitle>
            <DialogDescription>
              Confirm the actual bin where items were placed for task {selectedTask?.task_id || "-"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="actual-bin">Actual Bin</Label>
            <Input
              id="actual-bin"
              value={actualBin}
              onChange={(event) => setActualBin(event.target.value)}
              onBlur={() => setCompleteTouched(true)}
              placeholder={selectedTask?.suggested_bin || "e.g. A-01-001"}
            />
            {completeTouched && !actualBin.trim() && (
              <p className="text-xs text-destructive">Actual bin is required.</p>
            )}
            {actualBin.trim() && selectedTask?.suggested_bin && actualBin.trim() !== selectedTask.suggested_bin && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Bin differs from suggested bin ({selectedTask.suggested_bin}). This will be flagged.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={actionKey === "complete"}>
              Cancel
            </Button>
            <Button onClick={submitComplete} disabled={!actualBin.trim() || actionKey === "complete"}>
              {actionKey === "complete" ? "Completing..." : "Confirm Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Task as Exception</DialogTitle>
            <DialogDescription>
              Provide a reason before setting task {selectedTask?.task_id || "-"} to Exception.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="exception-reason">Exception Reason</Label>
            <Textarea
              id="exception-reason"
              rows={4}
              value={exceptionReason}
              onChange={(event) => setExceptionReason(event.target.value)}
              onBlur={() => setExceptionTouched(true)}
              placeholder="Explain why this task is an exception"
            />
            {exceptionTouched && !isExceptionReasonValid && (
              <p className="text-xs text-destructive">Reason is required and must be at least 5 characters.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExceptionOpen(false)} disabled={actionKey === "exception"}>
              Back
            </Button>
            <Button variant="destructive" onClick={submitException} disabled={!isExceptionReasonValid || actionKey === "exception"}>
              {actionKey === "exception" ? "Saving..." : "Confirm Exception"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Task History</DialogTitle>
            <DialogDescription>
              Timeline of task events for {selectedTask?.task_id || selectedTaskId || "-"}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[360px] overflow-y-auto space-y-2">
            {historyRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No history entries found.</p>
            )}
            {historyRows.map((event) => (
              <div key={event.event_id} className="border rounded px-3 py-2 text-xs">
                <p className="font-medium capitalize">{event.event_type.replace(/_/g, " ")}</p>
                <p className="text-muted-foreground">{payloadToText(event.event_payload)}</p>
                <p className="text-muted-foreground inline-flex items-center gap-1 mt-1">
                  <Clock3 className="h-3 w-3" />
                  {formatDateTime(event.created_at)} · {event.created_by}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default PutawayPage;