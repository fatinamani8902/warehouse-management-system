import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { WorkflowStepper } from "@/components/shared/WorkflowStepper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  cancelReturn,
  createReturn,
  createRmaFromReturn,
  fetchReturns,
  fetchRmas,
} from "@/services/api";

// ── Inline helpers (kept from original) ──────────────────────────────────────
async function transitionReturnStatus(session, returnId, action) {
  const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;
  const response = await fetch(`${API_BASE}/returns/${returnId}/transition`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": session.tenant_id || "",
      "x-user-id": session.user_id || "",
      "x-roles": session.role_id || "superadmin",
      "x-warehouse-id": session.warehouse_id || "",
      "x-client-source": "PORTAL",
    },
    credentials: "include",
    body: JSON.stringify({ action }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed ${response.status}`);
  return data;
}

async function transitionRmaStatus(session, rmaId, action) {
  const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;
  const response = await fetch(`${API_BASE}/rma/${rmaId}/transition`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": session.tenant_id || "",
      "x-user-id": session.user_id || "",
      "x-roles": session.role_id || "superadmin",
      "x-warehouse-id": session.warehouse_id || "",
      "x-client-source": "PORTAL",
    },
    credentials: "include",
    body: JSON.stringify({ action }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed ${response.status}`);
  return data;
}

async function cancelRmaRequest(session, rmaId, reason) {
  const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;
  const response = await fetch(`${API_BASE}/rma/${rmaId}/cancel`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": session.tenant_id || "",
      "x-user-id": session.user_id || "",
      "x-roles": session.role_id || "superadmin",
      "x-warehouse-id": session.warehouse_id || "",
      "x-client-source": "PORTAL",
    },
    credentials: "include",
    body: JSON.stringify({ cancellation_reason: reason }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed ${response.status}`);
  return data;
}

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
  created:    { bg: "#dbeafe", color: "#1e3a8a", border: "#93c5fd", dot: "#3b82f6",  label: "Created" },
  confirmed:  { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Confirmed" },
  closed:     { bg: "#e0e7ff", color: "#3730a3", border: "#a5b4fc", dot: "#6366f1",  label: "Closed" },
  cancelled:  { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5", dot: "#ef4444",  label: "Cancelled" },
  open:       { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Open" },
  processing: { bg: "#ffedd5", color: "#7c2d12", border: "#fdba74", dot: "#f97316",  label: "Processing" },
  completed:  { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Completed" },
};

function StatusPill({ status }) {
  const key = String(status || "").toLowerCase();
  const c = STATUS_CFG[key] || { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280", label: status || "—" };
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

// ── DetailField ───────────────────────────────────────────────────────────────
function DetailField({ label, value, danger, span, mono }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 14, fontWeight: 500, color: danger ? "#991b1b" : T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
        {value ?? "—"}
      </p>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const roleAliases = {
  superadmin: "warehousemanager", hqadmin: "warehousemanager",
  storemanager: "warehousemanager", warehouseclerk: "storekeeper",
  warehousemanager: "warehousemanager", storekeeper: "storekeeper",
  auditor: "auditor", readonly: "readonly",
};

const returnReasonOptions = [
  { value: "defective",           label: "Defective" },
  { value: "wrong_item",          label: "Wrong Item" },
  { value: "damaged_in_transit",  label: "Damaged In Transit" },
  { value: "missing_parts",       label: "Missing Parts" },
  { value: "not_as_described",    label: "Not As Described" },
];

const cancellableStatuses = ["created"];

const statusTransitions = {
  created:   { action: "confirm",  label: "Confirm",  nextStatus: "confirmed" },
  confirmed: { action: "close",    label: "Close",    nextStatus: "closed"    },
};

const rmaStatusTransitions = {
  created:    { action: "process",  label: "Process",  nextStatus: "processing" },
  processing: { action: "complete", label: "Complete", nextStatus: "completed"  },
};

const initialCreateForm = {
  shipment_id: "", customer_id: "", customer_name: "",
  sku_id: "", qty: "1", reason_code: "", reason_description: "", notes: "",
};

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

function formatDt(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function stepperForReturnStatus(status) {
  const flow = ["created", "confirmed", "closed"];
  if (status === "cancelled") return flow.map((l, i) => ({ label: l, status: i === 0 ? "current" : "pending" }));
  const idx = flow.indexOf(status);
  if (idx === -1) return flow.map((l, i) => ({ label: l, status: i === 0 ? "current" : "pending" }));
  return flow.map((l, i) => ({ label: l, status: i < idx ? "completed" : i === idx ? "current" : "pending" }));
}

function stepperForRmaStatus(status) {
  const flow = ["open", "processing", "completed"];
  if (status === "cancelled") return flow.map((l, i) => ({ label: l, status: i === 0 ? "current" : "pending" }));
  const idx = flow.indexOf(status);
  if (idx === -1) return flow.map((l, i) => ({ label: l, status: i === 0 ? "current" : "pending" }));
  return flow.map((l, i) => ({ label: l, status: i < idx ? "completed" : i === idx ? "current" : "pending" }));
}

// ── Page ──────────────────────────────────────────────────────────────────────
const ReturnsPage = () => {
  const auth      = useAuth();
  const { toast } = useToast();

  const tenantId    = auth.currentTenantId || null;
  const warehouseId = auth.currentWarehouseId || null;
  const userId      = auth.currentUser?.id || null;
  const userRole    = auth.currentUser?.role || null;

  const session = useMemo(() => ({
    tenant_id: tenantId, warehouse_id: warehouseId,
    user_id: userId, role_id: userRole,
  }), [tenantId, warehouseId, userId, userRole]);

  const roleId = useMemo(() => normalizeRole(userRole), [userRole]);

  const canCreateReturnPermission = useMemo(() => ["warehousemanager", "storekeeper"].includes(roleId), [roleId]);
  const canCreateRma              = useMemo(() => ["warehousemanager"].includes(roleId), [roleId]);
  const canCancelReturnRole       = useMemo(() => roleId === "warehousemanager", [roleId]);
  const canTransitionReturn       = useMemo(() => ["warehousemanager"].includes(roleId), [roleId]);
  const canProcessRma             = useMemo(() => ["warehousemanager"].includes(roleId), [roleId]);

  const [activeTab, setActiveTab]     = useState("returns");
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [actionKey, setActionKey]     = useState("");

  const [returnsData, setReturnsData] = useState([]);
  const [rmasData, setRmasData]       = useState([]);

  // search + filter
  const [returnSearch, setReturnSearch]         = useState("");
  const [returnStatusFilter, setReturnStatusFilter] = useState("");
  const [rmaSearch, setRmaSearch]               = useState("");
  const [rmaStatusFilter, setRmaStatusFilter]   = useState("");

  // pagination
  const [returnPage, setReturnPage]         = useState(1);
  const [returnPageSize, setReturnPageSize] = useState(10);
  const [rmaPage, setRmaPage]               = useState(1);
  const [rmaPageSize, setRmaPageSize]       = useState(10);

  const [selectedReturnId, setSelectedReturnId] = useState("");
  const [selectedRmaId, setSelectedRmaId]       = useState("");

  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [createForm, setCreateForm]             = useState(initialCreateForm);
  const [createFormErrors, setCreateFormErrors] = useState({});

  // cancel modals
  const [cancelTarget, setCancelTarget]     = useState(null);
  const [cancelReason, setCancelReason]     = useState("");
  const [cancelErr, setCancelErr]           = useState("");
  const [cancelRmaTarget, setCancelRmaTarget]   = useState(null);
  const [cancelRmaReason, setCancelRmaReason]   = useState("");
  const [cancelRmaErr, setCancelRmaErr]     = useState("");

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedReturn = useMemo(() => returnsData.find((r) => r.return_id === selectedReturnId) || null, [returnsData, selectedReturnId]);
  const selectedRma    = useMemo(() => rmasData.find((r) => r.rma_id === selectedRmaId) || null, [rmasData, selectedRmaId]);

  const relatedRmasForSelectedReturn = useMemo(() => {
    if (!selectedReturn) return [];
    return rmasData.filter((r) => r.return_id === selectedReturn.return_id);
  }, [rmasData, selectedReturn]);

  const reasonCodesForSelectedReturn = useMemo(() => {
    return relatedRmasForSelectedReturn
      .flatMap((r) => r.items || [])
      .map((item) => item.reason_code)
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }, [relatedRmasForSelectedReturn]);

  // ── Filtered + paged ──────────────────────────────────────────────────────
  const filteredReturns = useMemo(() => {
    const q = returnSearch.toLowerCase();
    return returnsData.filter((r) =>
      (!q || (r.return_id || "").toLowerCase().includes(q) || (r.customer_name || "").toLowerCase().includes(q) || (r.shipment_id || "").toLowerCase().includes(q)) &&
      (!returnStatusFilter || r.status === returnStatusFilter)
    );
  }, [returnsData, returnSearch, returnStatusFilter]);

  const returnTotalPages = Math.max(1, Math.ceil(filteredReturns.length / returnPageSize));
  const pagedReturns     = useMemo(() => filteredReturns.slice((returnPage - 1) * returnPageSize, returnPage * returnPageSize), [filteredReturns, returnPage, returnPageSize]);

  const filteredRmas = useMemo(() => {
    const q = rmaSearch.toLowerCase();
    return rmasData.filter((r) =>
      (!q || (r.rma_id || "").toLowerCase().includes(q) || (r.return_id || "").toLowerCase().includes(q)) &&
      (!rmaStatusFilter || r.status === rmaStatusFilter)
    );
  }, [rmasData, rmaSearch, rmaStatusFilter]);

  const rmaTotalPages = Math.max(1, Math.ceil(filteredRmas.length / rmaPageSize));
  const pagedRmas     = useMemo(() => filteredRmas.slice((rmaPage - 1) * rmaPageSize, rmaPage * rmaPageSize), [filteredRmas, rmaPage, rmaPageSize]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true); setError("");
      const [returnRows, rmaRows] = await Promise.all([
        fetchReturns(session),
        fetchRmas(session),
      ]);
      const nr = Array.isArray(returnRows) ? returnRows : [];
      const nm = Array.isArray(rmaRows)    ? rmaRows    : [];
      setReturnsData(nr);
      setRmasData(nm);
      setSelectedReturnId((cur) => (cur && nr.some((r) => r.return_id === cur)) ? cur : "");
      setSelectedRmaId((cur)    => (cur && nm.some((r) => r.rma_id === cur))    ? cur : "");
    } catch (e) {
      setError(e.message || "Failed to load returns data");
    } finally { setLoading(false); }
  }, [tenantId, warehouseId, userId, userRole]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Create Return ─────────────────────────────────────────────────────────
  const updateCreateForm = (field, value) => {
    setCreateForm((c) => ({ ...c, [field]: value }));
    setCreateFormErrors((c) => ({ ...c, [field]: "" }));
  };

  const validateCreateReturnForm = () => {
    const errors = {};
    if (!createForm.shipment_id.trim())  errors.shipment_id  = "Shipment ID is required";
    if (!createForm.customer_id.trim())  errors.customer_id  = "Customer ID is required";
    if (!createForm.customer_name.trim()) errors.customer_name = "Customer name is required";
    if (!createForm.sku_id.trim())       errors.sku_id       = "SKU ID is required";
    if (!createForm.reason_code.trim())  errors.reason_code  = "Reason code is required";
    const qty = Number(createForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) errors.qty = "Quantity must be greater than 0";
    setCreateFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitCreateReturn = async () => {
    if (!validateCreateReturnForm()) return;
    try {
      setActionKey("create-return"); setError("");
      const reason  = returnReasonOptions.find((o) => o.value === createForm.reason_code);
      const created = await createReturn(session, {
        shipment_id:        createForm.shipment_id.trim(),
        customer_id:        createForm.customer_id.trim(),
        customer_name:      createForm.customer_name.trim(),
        sku_id:             createForm.sku_id.trim(),
        qty:                Number(createForm.qty),
        reason_code:        createForm.reason_code.trim(),
        reason_description: createForm.reason_description.trim() || reason?.label || "",
        notes:              createForm.notes.trim(),
      });
      setReturnsData((prev) => [created, ...prev.filter((r) => r.return_id !== created.return_id)]);
      setSelectedReturnId(created.return_id);
      setShowCreateReturn(false);
      setCreateForm(initialCreateForm);
      toast({ title: "Return created", description: `Return ${created.return_id} created successfully` });
    } catch (e) {
      const msg = e.message || "Unable to create return";
      setError(msg);
      toast({ title: "Create failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Create RMA ────────────────────────────────────────────────────────────
  const handleCreateRma = async (returnRecord) => {
    if (!returnRecord) return;
    const busyKey = `create-rma-${returnRecord.return_id}`;
    try {
      setActionKey(busyKey); setError("");
      const created       = await createRmaFromReturn(session, returnRecord.return_id, { notes: `Created from return ${returnRecord.return_id}` });
      const updatedReturn = created?.return || null;
      const rmaRecord     = { ...created };
      delete rmaRecord.return;
      setRmasData((prev) => [rmaRecord, ...prev.filter((r) => r.rma_id !== rmaRecord.rma_id)]);
      if (updatedReturn) setReturnsData((prev) => prev.map((r) => r.return_id === updatedReturn.return_id ? updatedReturn : r));
      setSelectedRmaId(rmaRecord.rma_id);
      setActiveTab("rma");
      toast({ title: "RMA created", description: `RMA ${rmaRecord.rma_id} created from ${returnRecord.return_id}` });
    } catch (e) {
      const msg = e.message || "Unable to create RMA";
      setError(msg);
      toast({ title: "Create RMA failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Cancel Return ─────────────────────────────────────────────────────────
  const performCancelReturn = async () => {
    if (!cancelReason.trim())           { setCancelErr("Cancellation reason is required"); return; }
    if (cancelReason.trim().length < 5) { setCancelErr("Reason must be at least 5 characters"); return; }
    const busyKey = `cancel-${cancelTarget.return_id}`;
    try {
      setActionKey(busyKey); setError("");
      const response = await cancelReturn(session, cancelTarget.return_id, { cancellation_reason: cancelReason });
      const updated  = response?.document;
      if (updated) setReturnsData((prev) => prev.map((r) => r.return_id === updated.return_id ? updated : r));
      setCancelTarget(null);
      toast({ title: "Return cancelled", description: response?.message || `Return ${cancelTarget.return_id} cancelled` });
    } catch (e) {
      const msg = e.message || "Unable to cancel return";
      setError(msg);
      toast({ title: "Cancellation failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Cancel RMA ────────────────────────────────────────────────────────────
  const performCancelRma = async () => {
    if (!cancelRmaReason.trim())           { setCancelRmaErr("Cancellation reason is required"); return; }
    if (cancelRmaReason.trim().length < 5) { setCancelRmaErr("Reason must be at least 5 characters"); return; }
    const busyKey = `rma-cancel-${cancelRmaTarget.rma_id}`;
    try {
      setActionKey(busyKey); setError("");
      const response = await cancelRmaRequest(session, cancelRmaTarget.rma_id, cancelRmaReason);
      const updated  = response?.document;
      setRmasData((prev) => prev.map((r) => r.rma_id === cancelRmaTarget.rma_id ? (updated || { ...r, status: "cancelled" }) : r));
      setCancelRmaTarget(null);
      toast({ title: "RMA cancelled", description: `RMA ${cancelRmaTarget.rma_id} cancelled successfully` });
    } catch (e) {
      const msg = e.message || "Unable to cancel RMA";
      setError(msg);
      toast({ title: "Cancellation failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Transition Return ─────────────────────────────────────────────────────
  const handleTransitionReturn = async (returnRecord, action, nextStatus) => {
    const busyKey = `transition-${returnRecord.return_id}`;
    try {
      setActionKey(busyKey); setError("");
      const response = await transitionReturnStatus(session, returnRecord.return_id, action);
      const updated  = response?.document || response;
      if (updated?.return_id) {
        setReturnsData((prev) => prev.map((r) => r.return_id === updated.return_id ? updated : r));
      } else {
        setReturnsData((prev) => prev.map((r) => r.return_id === returnRecord.return_id ? { ...r, status: nextStatus } : r));
      }
      toast({ title: "Status updated", description: `Return ${returnRecord.return_id} moved to ${nextStatus}` });
    } catch (e) {
      const msg = e.message || "Unable to update status";
      setError(msg);
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Transition RMA ────────────────────────────────────────────────────────
  const handleTransitionRma = async (rmaRecord, action, nextStatus) => {
    const busyKey = `rma-transition-${rmaRecord.rma_id}`;
    try {
      setActionKey(busyKey); setError("");
      const response = await transitionRmaStatus(session, rmaRecord.rma_id, action);
      const updated  = response?.document;
      setRmasData((prev) => prev.map((r) => r.rma_id === rmaRecord.rma_id ? (updated || { ...r, status: nextStatus }) : r));
      toast({ title: "RMA updated", description: `RMA ${rmaRecord.rma_id} moved to ${nextStatus}` });
    } catch (e) {
      const msg = e.message || "Unable to update RMA";
      setError(msg);
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Action chips for table rows ───────────────────────────────────────────
  const renderReturnChips = (row) => {
    const chips = [];
    const hasActiveRma = Boolean(row.active_rma_id);

    if (canCreateRma && !["closed", "cancelled"].includes(row.status) && !hasActiveRma) {
      const busy = actionKey === `create-rma-${row.return_id}`;
      chips.push({ key: "create-rma", label: busy ? "Creating…" : "Create RMA", danger: false, onClick: (e) => { e.stopPropagation(); handleCreateRma(row); } });
    }
    if (canTransitionReturn && statusTransitions[row.status]) {
      const t = statusTransitions[row.status];
      const busy = actionKey === `transition-${row.return_id}`;
      chips.push({ key: "transition", label: busy ? "Updating…" : t.label, danger: false, onClick: (e) => { e.stopPropagation(); handleTransitionReturn(row, t.action, t.nextStatus); } });
    }
    if (canCancelReturnRole && cancellableStatuses.includes(row.status)) {
      chips.push({ key: "cancel", label: "Cancel", danger: true, onClick: (e) => { e.stopPropagation(); setCancelTarget(row); setCancelReason(""); setCancelErr(""); } });
    }

    if (!chips.length) return <span style={{ fontSize: 12, color: T_MUTED }}>—</span>;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }} onClick={(e) => e.stopPropagation()}>
        {chips.map((c) => (
          <button key={c.key} disabled={Boolean(actionKey) || loading} onClick={c.onClick}
            style={{
              ...btnBase, height: 28, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: c.danger ? "#fee2e2" : "#f0f4ff",
              color:      c.danger ? "#b91c1c" : ACCENT,
              border:    `0.5px solid ${c.danger ? "#fca5a5" : "#c7d2fe"}`,
              opacity: (Boolean(actionKey) || loading) ? 0.5 : 1,
            }}>
            {c.label}
          </button>
        ))}
      </div>
    );
  };

  const renderRmaChips = (row) => {
    const chips = [];
    const t = rmaStatusTransitions[row.status];
    if (t && canProcessRma) {
      const busy = actionKey === `rma-transition-${row.rma_id}`;
      chips.push({ key: "transition", label: busy ? "Updating…" : t.label, danger: false, onClick: (e) => { e.stopPropagation(); handleTransitionRma(row, t.action, t.nextStatus); } });
    }
    if (row.status === "open") {
      chips.push({ key: "cancel", label: "Cancel", danger: true, onClick: (e) => { e.stopPropagation(); setCancelRmaTarget(row); setCancelRmaReason(""); setCancelRmaErr(""); } });
    }
    if (!chips.length) return <span style={{ fontSize: 12, color: T_MUTED }}>—</span>;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }} onClick={(e) => e.stopPropagation()}>
        {chips.map((c) => (
          <button key={c.key} disabled={Boolean(actionKey) || loading} onClick={c.onClick}
            style={{
              ...btnBase, height: 28, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: c.danger ? "#fee2e2" : "#f0f4ff",
              color:      c.danger ? "#b91c1c" : ACCENT,
              border:    `0.5px solid ${c.danger ? "#fca5a5" : "#c7d2fe"}`,
              opacity: (Boolean(actionKey) || loading) ? 0.5 : 1,
            }}>
            {c.label}
          </button>
        ))}
      </div>
    );
  };

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const renderToolbar = ({ search, onSearch, statusFilter, onStatusFilter, statusOpts, onRefresh, onClear, onCreate, createLabel }) => (
    <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
        <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          style={{ width: "100%", height: 34, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 14, color: T_PRIMARY, outline: "none", background: "#fff" }}
          placeholder="Search ID…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <Select value={statusFilter || "all"} onValueChange={(v) => onStatusFilter(v === "all" ? "" : v)}>
        <SelectTrigger style={{ height: 34, width: 175, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {statusOpts.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
        </SelectContent>
      </Select>
      <div style={{ flex: 1 }} />
      <button style={btnNeutral} onClick={onClear}>Clear</button>
      <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={onRefresh} disabled={loading || Boolean(actionKey)}>Refresh</button>
      {onCreate && <button style={btnPrimary} onClick={onCreate}>+ {createLabel}</button>}
    </div>
  );

  // ── Pagination ────────────────────────────────────────────────────────────
  const renderPagination = (total, page, pageSize, totalPages, setPage, setPageSize) => (
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
  );

  // ── Generic table ─────────────────────────────────────────────────────────
  const renderTable = (rows, cols, selectedId, idKey, onSelect) => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ background: "#fafbff" }}>
          {cols.map((c) => (
            <th key={c.key} style={{ padding: "10px 16px", textAlign: c.right ? "right" : "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr><td colSpan={cols.length} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>Loading…</td></tr>
        )}
        {!loading && rows.length === 0 && (
          <tr><td colSpan={cols.length} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No records found.</td></tr>
        )}
        {!loading && rows.map((row) => {
          const rowId = row[idKey];
          const isSel = selectedId === rowId;
          return (
            <tr key={rowId}
              style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
              onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
              onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              onClick={() => onSelect(rowId)}
            >
              {cols.map((c) => {
                let cell;
                if      (c.render)  cell = c.render(row);
                else if (c.mono)    cell = <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{row[c.key] || "—"}</span>;
                else if (c.bold)    cell = <span style={{ fontSize: 14, fontWeight: 600, color: T_PRIMARY }}>{row[c.key] ?? "—"}</span>;
                else if (c.dt)      cell = <span style={{ fontSize: 13, color: T_SECONDARY }}>{formatDt(row[c.key])}</span>;
                else if (c.muted)   cell = <span style={{ fontSize: 13, color: row[c.key] ? T_SECONDARY : T_MUTED }}>{row[c.key] || "—"}</span>;
                else                cell = <span style={{ fontSize: 14, color: T_PRIMARY }}>{row[c.key] ?? "—"}</span>;
                return <td key={c.key} style={{ padding: "14px 16px", textAlign: c.right ? "right" : "left" }}>{cell}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ── Column defs ───────────────────────────────────────────────────────────
  const returnCols = [
    { key: "return_id",     label: "Return ID",  mono: true },
    { key: "shipment_id",   label: "Shipment",   mono: true },
    { key: "customer_name", label: "Customer",   bold: true },
    { key: "sku_id",        label: "SKU",        mono: true },
    { key: "qty",           label: "Qty",        right: true },
    { key: "created_at",    label: "Created",    dt: true },
    { key: "status",        label: "Status",     render: (r) => <StatusPill status={r.status} /> },
    { key: "_actions",      label: "Actions",    render: (r) => renderReturnChips(r) },
  ];

  const rmaCols = [
    { key: "rma_id",    label: "RMA ID",    mono: true },
    { key: "return_id", label: "Return ID", mono: true },
    { key: "created_at", label: "Created",  dt: true },
    { key: "created_by", label: "Created By", muted: true },
    { key: "status",    label: "Status",    render: (r) => <StatusPill status={r.status} /> },
    { key: "_actions",  label: "Actions",   render: (r) => renderRmaChips(r) },
  ];

  // ── Card style ────────────────────────────────────────────────────────────
  const cardStyle = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };

  // ── Returns detail panel ──────────────────────────────────────────────────
  const renderReturnDetail = () => {
    const r = selectedReturn;
    if (!r) return null;
    const visibleActions = [];
    const hasActiveRma = Boolean(r.active_rma_id);
    if (canCreateRma && !["closed", "cancelled"].includes(r.status) && !hasActiveRma) {
      visibleActions.push({ key: "create-rma", label: actionKey === `create-rma-${r.return_id}` ? "Creating…" : "Create RMA", danger: false, fn: () => handleCreateRma(r) });
    }
    if (canTransitionReturn && statusTransitions[r.status]) {
      const t = statusTransitions[r.status];
      visibleActions.push({ key: "transition", label: actionKey === `transition-${r.return_id}` ? "Updating…" : t.label, danger: false, fn: () => handleTransitionReturn(r, t.action, t.nextStatus) });
    }
    if (canCancelReturnRole && cancellableStatuses.includes(r.status)) {
      visibleActions.push({ key: "cancel", label: "Cancel Return", danger: true, fn: () => { setCancelTarget(r); setCancelReason(""); setCancelErr(""); } });
    }

    return (
      <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
        <div style={{ padding: "18px 16px 16px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: T_PRIMARY }}>{r.return_id}</span>
            <StatusPill status={r.status} />
          </div>
          {/* Stepper */}
          <div style={{ marginBottom: 18 }}>
            <WorkflowStepper steps={stepperForReturnStatus(r.status)} />
          </div>
          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
            <DetailField label="Customer"   value={r.customer_name} />
            <DetailField label="Created At" value={formatDt(r.created_at)} />
            <DetailField label="Created By" value={r.created_by} />
            <DetailField label="Shipment"   value={r.shipment_id} mono />
            <DetailField label="SKU"        value={r.sku_id} mono />
            <DetailField label="Quantity"   value={r.qty} />
            {r.notes && <DetailField label="Notes" value={r.notes} span />}
            {r.cancellation_reason && <DetailField label="Cancellation Reason" value={r.cancellation_reason} danger span />}
          </div>

          {/* Lines table */}
          <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["SKU", "Qty", "Reason Code", "Linked RMA"].map((h) => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: "0.5px solid #f0f0f0" }}>
                  <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: T_SECONDARY }}>{r.sku_id || "—"}</td>
                  <td style={{ padding: "11px 14px", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{r.qty}</td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: T_SECONDARY }}>
                    {reasonCodesForSelectedReturn.length > 0 ? reasonCodesForSelectedReturn.join(", ") : (r.reason_code || "—")}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    {relatedRmasForSelectedReturn.length === 0 ? (
                      <span style={{ fontSize: 13, color: T_MUTED }}>No RMA linked</span>
                    ) : (
                      relatedRmasForSelectedReturn.map((row) => (
                        <button key={row.rma_id}
                          onClick={() => { setSelectedRmaId(row.rma_id); setActiveTab("rma"); }}
                          style={{ ...btnBase, height: "auto", padding: 0, fontSize: 13, color: ACCENT, textDecoration: "underline", marginRight: 8, background: "transparent" }}>
                          {row.rma_id}
                        </button>
                      ))
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Actions */}
          {visibleActions.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {visibleActions.map((a) => (
                <button key={a.key} disabled={Boolean(actionKey) || loading}
                  onClick={a.fn}
                  style={{
                    ...btnBase, height: 34, padding: "0 18px", borderRadius: 7, fontSize: 14, fontWeight: 500,
                    background: a.danger ? "#e03131" : ACCENT, color: "#fff",
                    opacity: (Boolean(actionKey) || loading) ? 0.55 : 1,
                  }}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── RMA detail panel ──────────────────────────────────────────────────────
  const renderRmaDetail = () => {
    const r = selectedRma;
    if (!r) return null;
    const t = rmaStatusTransitions[r.status];
    return (
      <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
        <div style={{ padding: "18px 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: T_PRIMARY }}>{r.rma_id}</span>
            <StatusPill status={r.status} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <WorkflowStepper steps={stepperForRmaStatus(r.status)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
            <DetailField label="Return ID"  value={r.return_id} mono />
            <DetailField label="Created At" value={formatDt(r.created_at)} />
            <DetailField label="Created By" value={r.created_by} />
            {r.notes && <DetailField label="Notes" value={r.notes} span />}
            {r.cancellation_reason && <DetailField label="Cancellation Reason" value={r.cancellation_reason} danger span />}
          </div>

          {/* RMA items table */}
          <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["RMA Item ID", "SKU", "Qty", "Reason Code"].map((h) => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!(r.items || []).length && (
                  <tr><td colSpan={4} style={{ padding: "20px 14px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No items available.</td></tr>
                )}
                {(r.items || []).map((item) => (
                  <tr key={item.rma_item_id} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                    <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: T_SECONDARY }}>{item.rma_item_id}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: T_SECONDARY }}>{item.sku_id}</td>
                    <td style={{ padding: "11px 14px", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{item.qty}</td>
                    <td style={{ padding: "11px 14px", fontSize: 13, color: T_SECONDARY }}>{item.reason_code || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {t && canProcessRma && (
              <button disabled={Boolean(actionKey) || loading}
                onClick={() => handleTransitionRma(r, t.action, t.nextStatus)}
                style={{ ...btnPrimary, opacity: (Boolean(actionKey) || loading) ? 0.55 : 1 }}>
                {actionKey === `rma-transition-${r.rma_id}` ? "Updating…" : t.label}
              </button>
            )}
            {r.status === "open" && (
              <button disabled={Boolean(actionKey) || loading}
                onClick={() => { setCancelRmaTarget(r); setCancelRmaReason(""); setCancelRmaErr(""); }}
                style={{ ...btnDanger, opacity: (Boolean(actionKey) || loading) ? 0.55 : 1 }}>
                Cancel RMA
              </button>
            )}
            {!t && r.status !== "open" && <span style={{ fontSize: 12, color: T_MUTED }}>No actions available</span>}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Returns" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Returns</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>Manage customer returns and RMA records</p>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
          {error}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="returns">Returns</TabsTrigger>
          <TabsTrigger value="rma">RMA</TabsTrigger>
        </TabsList>

        {/* ── RETURNS TAB ── */}
        <TabsContent value="returns" className="mt-4">
          <div style={cardStyle}>
            {renderToolbar({
              search: returnSearch, onSearch: (v) => { setReturnSearch(v); setReturnPage(1); },
              statusFilter: returnStatusFilter, onStatusFilter: (v) => { setReturnStatusFilter(v); setReturnPage(1); },
              statusOpts: ["created", "confirmed", "closed", "cancelled"],
              onRefresh: loadData,
              onClear: () => { setReturnSearch(""); setReturnStatusFilter(""); setReturnPage(1); },
              onCreate: canCreateReturnPermission ? () => setShowCreateReturn(true) : null,
              createLabel: "Create Return",
            })}
            {renderTable(pagedReturns, returnCols, selectedReturnId, "return_id", 
              (id) => setSelectedReturnId((prev) => prev === id ? "" : id))}
            {renderPagination(filteredReturns.length, returnPage, returnPageSize, returnTotalPages, setReturnPage, setReturnPageSize)}
            {renderReturnDetail()}
          </div>
        </TabsContent>

        {/* ── RMA TAB ── */}
        <TabsContent value="rma" className="mt-4">
          <div style={cardStyle}>
            {renderToolbar({
              search: rmaSearch, onSearch: (v) => { setRmaSearch(v); setRmaPage(1); },
              statusFilter: rmaStatusFilter, onStatusFilter: (v) => { setRmaStatusFilter(v); setRmaPage(1); },
              statusOpts: ["open", "processing", "completed", "cancelled"],
              onRefresh: loadData,
              onClear: () => { setRmaSearch(""); setRmaStatusFilter(""); setRmaPage(1); },
              onCreate: null,
              createLabel: "",
            })}
            {renderTable(pagedRmas, rmaCols, selectedRmaId, "rma_id", 
              (id) => setSelectedRmaId((prev) => prev === id ? "" : id))}
            {renderPagination(filteredRmas.length, rmaPage, rmaPageSize, rmaTotalPages, setRmaPage, setRmaPageSize)}
            {renderRmaDetail()}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create Return modal ── */}
      <Dialog open={showCreateReturn} onOpenChange={setShowCreateReturn}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Return</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: "Shipment ID",   field: "shipment_id",   placeholder: "SHP000031" },
                { label: "Customer ID",   field: "customer_id",   placeholder: "CUS000001" },
                { label: "Customer Name", field: "customer_name", placeholder: "RetailMax" },
                { label: "SKU ID",        field: "sku_id",        placeholder: "SKU000002" },
                { label: "Quantity",      field: "qty",           placeholder: "1", type: "number" },
              ].map(({ label, field, placeholder, type }) => (
                <div key={field} className="space-y-1">
                  <Label>{label}</Label>
                  <Input
                    type={type || "text"}
                    value={createForm[field]}
                    onChange={(e) => updateCreateForm(field, e.target.value)}
                    placeholder={placeholder}
                    min={type === "number" ? "1" : undefined}
                  />
                  {createFormErrors[field] && <p style={{ fontSize: 12, color: "#991b1b" }}>{createFormErrors[field]}</p>}
                </div>
              ))}
              <div className="space-y-1">
                <Label>Reason Code</Label>
                <Select value={createForm.reason_code} onValueChange={(v) => {
                  updateCreateForm("reason_code", v);
                  const reason = returnReasonOptions.find((o) => o.value === v);
                  if (!createForm.reason_description && reason) updateCreateForm("reason_description", reason.label);
                }}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {returnReasonOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {createFormErrors.reason_code && <p style={{ fontSize: 12, color: "#991b1b" }}>{createFormErrors.reason_code}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason Description</Label>
              <Input value={createForm.reason_description} onChange={(e) => updateCreateForm("reason_description", e.target.value)} placeholder="Additional reason details" />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={3} value={createForm.notes} onChange={(e) => updateCreateForm("notes", e.target.value)} placeholder="Optional notes" />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setShowCreateReturn(false)} disabled={actionKey === "create-return"}>Back</button>
              <button style={{ ...btnPrimary, opacity: actionKey === "create-return" ? 0.6 : 1 }} onClick={submitCreateReturn} disabled={actionKey === "create-return"}>
                {actionKey === "create-return" ? "Creating…" : "Create Return"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Return modal ── */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Return</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Are you sure you want to cancel return{" "}
              <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{cancelTarget?.return_id}</strong>?
              This action cannot be undone.
            </p>
            <div className="space-y-1.5">
              <Label>Cancellation Reason <span style={{ color: "#e03131" }}>*</span></Label>
              <Textarea value={cancelReason} onChange={(e) => { setCancelErr(""); setCancelReason(e.target.value); }}
                placeholder="Please provide the reason for cancellation (min. 5 characters)" rows={3} />
            </div>
            {cancelErr && <p style={{ fontSize: 12, color: "#991b1b" }}>{cancelErr}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setCancelTarget(null)} disabled={Boolean(actionKey)}>Back</button>
              <button style={{ ...btnDanger, opacity: Boolean(actionKey) ? 0.6 : 1 }} onClick={performCancelReturn} disabled={Boolean(actionKey)}>
                {actionKey.startsWith("cancel-") ? "Cancelling…" : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cancel RMA modal ── */}
      <Dialog open={Boolean(cancelRmaTarget)} onOpenChange={() => setCancelRmaTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel RMA</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Are you sure you want to cancel RMA{" "}
              <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{cancelRmaTarget?.rma_id}</strong>?
              This action cannot be undone.
            </p>
            <div className="space-y-1.5">
              <Label>Cancellation Reason <span style={{ color: "#e03131" }}>*</span></Label>
              <Textarea value={cancelRmaReason} onChange={(e) => { setCancelRmaErr(""); setCancelRmaReason(e.target.value); }}
                placeholder="Please provide the reason for cancellation (min. 5 characters)" rows={3} />
            </div>
            {cancelRmaErr && <p style={{ fontSize: 12, color: "#991b1b" }}>{cancelRmaErr}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setCancelRmaTarget(null)} disabled={Boolean(actionKey)}>Back</button>
              <button style={{ ...btnDanger, opacity: Boolean(actionKey) ? 0.6 : 1 }} onClick={performCancelRma} disabled={Boolean(actionKey)}>
                {actionKey.startsWith("rma-cancel-") ? "Cancelling…" : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default ReturnsPage;