import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatDateTime as formatDt } from "@/utils/dateTimeFormatter";
import { displayValue } from "@/utils/displayValue";
import { RETURN_WORKFLOW_STATUS_OPTIONS, returnWorkflowStatus } from "@/utils/returnWorkflowStatus";
import { rmaStatusLabel, stepperForRmaStatus as buildRmaStepperSteps } from "@/utils/rmaStatus";
import { filterByCreatedDate, isInvalidCreatedDateRange } from "@/utils/createdDateFilter";
import { useToast } from "@/hooks/use-toast";
import {
  cancelReturn,
  createReturn,
  createRmaFromReturn,
  fetchReturnAuditTrail,
  fetchReturns,
  fetchRmaAuditTrail,
  fetchRmas,
  fetchShipments,
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

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: "#e03131", color: "#fff" };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const detailActionArea = { display: "flex", gap: 8, flexWrap: "wrap" };
const detailActionPrimary = btnPrimary;
const detailActionDanger = btnDanger;

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  created:    { bg: "#dbeafe", color: "#1e3a8a", border: "#93c5fd", dot: "#3b82f6",  label: "Created" },
  confirmed:  { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Closed" },
  closed:     { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Closed" },
  cancelled:  { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5", dot: "#ef4444",  label: "Cancelled" },
  open:       { bg: "#dbeafe", color: "#1e3a8a", border: "#93c5fd", dot: "#3b82f6",  label: "Open" },
  processing: { bg: "#ffedd5", color: "#7c2d12", border: "#fdba74", dot: "#f97316",  label: "Processing" },
  completed:  { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Completed" },
};

const RMA_STATUS_CFG = {
  ...STATUS_CFG,
  created: { bg: "#dbeafe", color: "#1e3a8a", border: "#93c5fd", dot: "#3b82f6", label: "Opened" },
  open:    { bg: "#dbeafe", color: "#1e3a8a", border: "#93c5fd", dot: "#3b82f6", label: "Opened" },
};

function statusLabel(status, type = "return") {
  if (displayValue(status) === "-") return "-";
  const key = String(status || "").toLowerCase();
  const cfg = type === "rma" ? RMA_STATUS_CFG : STATUS_CFG;
  return type === "rma" ? rmaStatusLabel(status) : cfg[key]?.label || displayValue(status);
}

function StatusPill({ status, type = "return", label }) {
  if (displayValue(status) === "-") return <span style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_PRIMARY }}>-</span>;
  const key = String(status || "").toLowerCase();
  const cfg = type === "rma" ? RMA_STATUS_CFG : STATUS_CFG;
  const c = cfg[key] || { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280", label: displayValue(status) };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 12, fontWeight: 500, lineHeight: "16px", padding: "3px 10px", borderRadius: 20,
      background: c.bg, color: c.color, border: `0.5px solid ${c.border}`,
      whiteSpace: "nowrap",
    }}>
      {label || c.label}
    </span>
  );
}

function DetailField({ label, value, danger, span, mono, preLine, children }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, letterSpacing: "0.06em", marginBottom: 4 }}>
        {typeof label === "string"
          ? <span style={{ textTransform: "uppercase" }}>{label}</span>
          : label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: danger ? "#991b1b" : T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit", whiteSpace: preLine ? "pre-line" : "normal" }}>
        {children ?? displayValue(value)}
      </p>
    </div>
  );
}

function ModalSectionTitle({ children }) {
  return (
    <h3 style={{
      margin: 0,
      fontSize: 12,
      fontWeight: 700,
      color: T_LABEL,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    }}>
      {children}
    </h3>
  );
}

function DetailSection({ title, children }) {
  return (
    <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", padding: 24, marginBottom: 24 }}>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, alignItems: "start" }}>
        {padded}
      </div>
    </DetailSection>
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
  created:   { action: "confirm",  label: "Close Return", nextStatus: "closed" },
  confirmed: { action: "close",    label: "Close Return", nextStatus: "closed"    },
};

function returnStatus(value) {
  return String(value || "").toLowerCase();
}

function getActiveLinkedRma(returnRecord) {
  if (!returnRecord) return null;
  const linked = returnRecord.linked_rma;
  if (linked?.rma_id && String(linked.status || "").toLowerCase() !== "cancelled") return linked;
  const rmaId = returnRecord.rma_id || returnRecord.active_rma_id;
  if (!rmaId) return null;
  const status = String(returnRecord.rma_status || returnRecord.active_rma_status || "").toLowerCase();
  if (status === "cancelled") return null;
  return {
    rma_id: rmaId,
    return_id: returnRecord.return_id,
    status,
    created_by: returnRecord.rma_created_by || returnRecord.active_rma_created_by || "",
    created_at: returnRecord.rma_created_at || returnRecord.active_rma_created_at || null,
  };
}

function getLinkedRma(returnRecord) {
  if (!returnRecord) return null;
  const linked = returnRecord.linked_rma;
  if (linked?.rma_id) return linked;
  const rmaId = returnRecord.rma_id || returnRecord.active_rma_id;
  if (!rmaId) return null;
  return {
    rma_id: rmaId,
    return_id: returnRecord.return_id,
    status: returnRecord.rma_status || returnRecord.active_rma_status || "",
    created_by: returnRecord.rma_created_by || returnRecord.active_rma_created_by || "",
    created_by_name: returnRecord.rma_created_by_name || returnRecord.active_rma_created_by_name || "",
    created_by_display: returnRecord.rma_created_by_display || returnRecord.active_rma_created_by_display || "",
    created_at: returnRecord.rma_created_at || returnRecord.active_rma_created_at || null,
  };
}

function hasLinkedRma(returnRecord) {
  return Boolean(getActiveLinkedRma(returnRecord));
}

// Legacy return workflow: create RMA first for new returns; only expose the
// return confirmation transition after an RMA exists, so users see one next step.
function shouldShowCreateRmaAction(returnRecord) {
  const status = returnStatus(returnRecord?.status);
  return ["created", "new"].includes(status) && !hasLinkedRma(returnRecord);
}

function shouldShowReturnTransitionAction(returnRecord) {
  const status = returnStatus(returnRecord?.status);
  if (!statusTransitions[status]) return false;
  if (status === "created") {
    const linkedRma = getActiveLinkedRma(returnRecord);
    return String(linkedRma?.status || "").toLowerCase() === "completed";
  }
  return true;
}

function shouldShowCancelReturnAction(returnRecord) {
  const linkedRma = getActiveLinkedRma(returnRecord);
  if (String(linkedRma?.status || "").toLowerCase() === "completed") return false;
  return cancellableStatuses.includes(returnStatus(returnRecord?.status));
}

function returnReasonLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const option = returnReasonOptions.find((item) => item.value === raw);
  if (option) return option.label;
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function linkedRmaFromReturn(returnRecord) {
  return getLinkedRma(returnRecord);
}

function enrichReturnsWithRmas(returnRows, rmaRows) {
  const rmasByReturn = new Map();
  for (const rma of rmaRows || []) {
    if (!rma?.return_id || String(rma.status || "").toLowerCase() === "cancelled") continue;
    const current = rmasByReturn.get(rma.return_id);
    if (!current || String(rma.created_at || "") > String(current.created_at || "")) {
      rmasByReturn.set(rma.return_id, rma);
    }
  }

  return (returnRows || []).map((row) => {
    if (getActiveLinkedRma(row)) return row;
    const rma = rmasByReturn.get(row.return_id);
    if (!rma) return row;
    return {
      ...row,
      rma_count: Math.max(1, Number(row.rma_count || 0)),
      active_rma_id: rma.rma_id,
      rma_id: rma.rma_id,
      rma_status: rma.status,
      rma_created_by: rma.created_by,
      rma_created_by_name: rma.created_by_name,
      rma_created_by_display: rma.created_by_display,
      rma_created_at: rma.created_at,
      linked_rma: {
        rma_id: rma.rma_id,
        return_id: row.return_id,
        status: rma.status,
        created_by: rma.created_by,
        created_by_name: rma.created_by_name,
        created_by_display: rma.created_by_display,
        created_at: rma.created_at,
      },
    };
  });
}

function displayReturnValue(value, fallback = "-") {
  return displayValue(value, fallback);
}

const auditActionLabels = {
  return_created: "Return Created",
  return_cancelled: "Return Cancelled",
  return_closed: "Return Closed",
  rma_created: "RMA Created",
  rma_processing_started: "RMA Processing Started",
  rma_completed: "RMA Completed",
  rma_cancelled: "RMA Cancelled",
};

function auditActionLabel(actionCode) {
  return auditActionLabels[String(actionCode || "").toLowerCase()] || displayValue(actionCode);
}

function auditPerformer(event) {
  const display = displayValue(event?.performed_by_display_name);
  const userId = displayValue(event?.performed_by_user_id);
  if (display !== "-") return display;
  return userId;
}

function AuditTrailSection({ state, onPageChange, onRetry }) {
  const total = Number(state?.total || 0);
  const page = Number(state?.page || 1);
  const pageSize = Number(state?.pageSize || 10);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = Array.isArray(state?.items) ? state.items : [];

  return (
    <DetailSection title="Audit Trail">
      {state?.loading && (
        <div style={{ padding: "18px 14px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
          Loading audit trail…
        </div>
      )}
      {!state?.loading && state?.error && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 8, border: "0.5px solid #fecaca", background: "#fef2f2", color: "#991b1b" }}>
          <span style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px" }}>{state.error}</span>
          <button type="button" onClick={onRetry} style={btnNeutral}>Retry</button>
        </div>
      )}
      {!state?.loading && !state?.error && items.length === 0 && (
        <div style={{ padding: "18px 14px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
          No audit activity recorded.
        </div>
      )}
      {!state?.loading && !state?.error && items.length > 0 && (
        <>
          <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden", background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Date & Time", "Action", "Performed By", "Remarks"].map((heading) => (
                    <th key={heading} style={{ padding: "8px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((event) => (
                  <tr key={event.audit_event_id} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                    <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY, whiteSpace: "nowrap" }}>{displayReturnValue(formatDt(event.created_at))}</td>
                    <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{auditActionLabel(event.action_code)}</td>
                    <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{auditPerformer(event)}</td>
                    <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY, maxWidth: 280, whiteSpace: "pre-line", wordBreak: "break-word" }}>{displayReturnValue(event.remarks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_MUTED }}>
              Page {page} of {totalPages} · {total} event{total === 1 ? "" : "s"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} style={{ ...btnNeutral, height: 32, opacity: page <= 1 ? 0.55 : 1 }}>Previous</button>
              <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} style={{ ...btnNeutral, height: 32, opacity: page >= totalPages ? 0.55 : 1 }}>Next</button>
            </div>
          </div>
        </>
      )}
    </DetailSection>
  );
}

function createdByDisplay(record) {
  const id = displayValue(record?.created_by);
  const name = displayValue(
    record?.created_by_display ||
    record?.created_by_name ||
    record?.created_user_name ||
    record?.created_by_user_name ||
    record?.rma_created_by_display ||
    record?.rma_created_by_name ||
    record?.active_rma_created_by_display ||
    record?.active_rma_created_by_name ||
    record?.creator_name ||
    record?.user_name
  );
  if (name !== "-" && id !== "-" && !String(name).includes(String(record.created_by))) {
    return `${name} (${record.created_by})`;
  }
  return name !== "-" ? name : id;
}

const rmaStatusTransitions = {
  created:    { action: "process",  label: "Process",  nextStatus: "processing" },
  processing: { action: "complete", label: "Complete", nextStatus: "completed"  },
};

function parentReturnStatusForRma(rmaRecord, returnRecord = null) {
  return returnStatus(returnRecord?.status || rmaRecord?.return_status || "");
}

function canContinueRmaWorkflow(rmaRecord, returnRecord = null) {
  const parentStatus = parentReturnStatusForRma(rmaRecord, returnRecord);
  return !["cancelled", "closed"].includes(parentStatus);
}

const initialCreateForm = {
  shipment_id: "", sales_order_id: "", customer_id: "", customer_name: "", shipment_date: "",
  sku_id: "", qty: "1", reason_code: "", reason_description: "", notes: "",
};

function shipmentDisplayDate(value) {
  return value ? formatDt(value) : "-";
}

function shipmentSalesOrderId(shipment) {
  return shipment?.sales_order_id || shipment?.order_id || shipment?.so_id || shipment?.order_ref || "";
}

function shipmentCustomerId(shipment) {
  return shipment?.customer_id || shipment?.order?.customer_id || "";
}

function shipmentLineKey(item, index) {
  return item?.line_id || item?.pick_task_id || item?.sku_id || String(index);
}

function shipmentLineQty(item) {
  return Number(item?.delivered_qty ?? item?.shipped_qty ?? item?.qty ?? item?.qty_picked ?? item?.qty_required ?? 0);
}

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

function stepperForReturnStatus(status, hasLinkedRma = false) {
  const normalizedStatus = returnStatus(status);
  const flow = ["Return Created", "RMA Opened", "Closed"];
  if (normalizedStatus === "cancelled") {
    return flow.map((label, index) => ({ label, status: index === 0 ? "current" : "pending" }));
  }
  if (normalizedStatus === "closed" || normalizedStatus === "confirmed") {
    return flow.map((label, index) => ({ label, status: index < 2 ? "completed" : "current" }));
  }
  if (hasLinkedRma) {
    return flow.map((label, index) => ({ label, status: index === 0 ? "completed" : index === 1 ? "current" : "pending" }));
  }
  return flow.map((label, index) => ({ label, status: index === 0 ? "current" : "pending" }));
}

function stepperForRmaStatus(status) {
  return buildRmaStepperSteps(status);
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

  const canCreateReturnPermission = useMemo(() => ["warehousemanager"].includes(roleId), [roleId]);
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
  const [returnDateFrom, setReturnDateFrom]     = useState("");
  const [returnDateTo, setReturnDateTo]         = useState("");
  const [rmaSearch, setRmaSearch]               = useState("");
  const [rmaStatusFilter, setRmaStatusFilter]   = useState("");
  const [rmaDateFrom, setRmaDateFrom]           = useState("");
  const [rmaDateTo, setRmaDateTo]               = useState("");

  // pagination
  const [returnPage, setReturnPage]         = useState(1);
  const [returnPageSize, setReturnPageSize] = useState(10);
  const [rmaPage, setRmaPage]               = useState(1);
  const [rmaPageSize, setRmaPageSize]       = useState(10);

  const [selectedReturnId, setSelectedReturnId] = useState("");
  const [selectedRmaId, setSelectedRmaId]       = useState("");
  const [returnAudit, setReturnAudit] = useState({ items: [], total: 0, page: 1, pageSize: 10, loading: false, error: "" });
  const [rmaAudit, setRmaAudit] = useState({ items: [], total: 0, page: 1, pageSize: 10, loading: false, error: "" });

  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [createForm, setCreateForm]             = useState(initialCreateForm);
  const [createFormErrors, setCreateFormErrors] = useState({});
  const [createRmaTarget, setCreateRmaTarget]   = useState(null);
  const [createRmaRemarks, setCreateRmaRemarks] = useState("");
  const [closeTarget, setCloseTarget]           = useState(null);
  const [shipmentSearch, setShipmentSearch]     = useState("");
  const [shipmentLookupOpen, setShipmentLookupOpen] = useState(false);
  const [shipmentLookupLoading, setShipmentLookupLoading] = useState(false);
  const [shipmentLookupRows, setShipmentLookupRows] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [selectedShipmentLineKey, setSelectedShipmentLineKey] = useState("");
  const shipmentLookupRef = useRef(null);

  // cancel modals
  const [cancelTarget, setCancelTarget]     = useState(null);
  const [cancelReason, setCancelReason]     = useState("");
  const [cancelErr, setCancelErr]           = useState("");
  const [cancelRmaTarget, setCancelRmaTarget]   = useState(null);
  const [cancelRmaReason, setCancelRmaReason]   = useState("");
  const [cancelRmaErr, setCancelRmaErr]     = useState("");
  const returnDetailRef = useRef(null);
  const rmaDetailRef = useRef(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedReturn = useMemo(() => returnsData.find((r) => r.return_id === selectedReturnId) || null, [returnsData, selectedReturnId]);
  const selectedRma    = useMemo(() => rmasData.find((r) => r.rma_id === selectedRmaId) || null, [rmasData, selectedRmaId]);
  const selectedRmaReturn = useMemo(
    () => selectedRma ? returnsData.find((r) => r.return_id === selectedRma.return_id) || null : null,
    [returnsData, selectedRma]
  );

  const relatedRmasForSelectedReturn = useMemo(() => {
    if (!selectedReturn) return [];
    const rows = rmasData.filter((r) => r.return_id === selectedReturn.return_id);
    const linked = linkedRmaFromReturn(selectedReturn);
    if (linked && !rows.some((row) => row.rma_id === linked.rma_id)) {
      return [linked, ...rows];
    }
    return rows;
  }, [rmasData, selectedReturn]);

  const returnedQtyByShipmentSku = useMemo(() => {
    const totals = new Map();
    for (const row of returnsData) {
      if (!row?.shipment_id || !row?.sku_id || String(row.status || "").toLowerCase() === "cancelled") continue;
      const key = `${row.shipment_id}:${row.sku_id}`;
      totals.set(key, (totals.get(key) || 0) + Number(row.qty || 0));
    }
    return totals;
  }, [returnsData]);

  const selectedShipmentItems = useMemo(() => {
    const rows = Array.isArray(selectedShipment?.items) ? selectedShipment.items : [];
    return rows.map((item, index) => {
      const deliveredQty = shipmentLineQty(item);
      const returnedQty = Number(item.previously_returned_qty ?? returnedQtyByShipmentSku.get(`${selectedShipment.shipment_id}:${item.sku_id}`) ?? 0);
      const availableQty = Math.max(0, Number(item.available_to_return ?? item.available_return_qty ?? deliveredQty - returnedQty));
      return {
        ...item,
        line_key: shipmentLineKey(item, index),
        delivered_qty: deliveredQty,
        previously_returned_qty: returnedQty,
        available_return_qty: availableQty,
      };
    }).filter((item) => item.available_return_qty > 0);
  }, [returnedQtyByShipmentSku, selectedShipment]);

  const selectedShipmentLine = useMemo(
    () => selectedShipmentItems.find((item) => item.line_key === selectedShipmentLineKey) || null,
    [selectedShipmentItems, selectedShipmentLineKey]
  );

  const shouldShowShipmentLookup = shipmentLookupOpen && !selectedShipment;

  const applyReturnAvailabilityToShipment = useCallback((shipment) => {
    const shipmentId = shipment?.shipment_id;
    const items = (Array.isArray(shipment?.items) ? shipment.items : []).map((item, index) => {
      const deliveredQty = shipmentLineQty(item);
      const returnedQty = Number(item.previously_returned_qty ?? returnedQtyByShipmentSku.get(`${shipmentId}:${item.sku_id}`) ?? 0);
      const availableQty = Math.max(0, Number(item.available_to_return ?? item.available_return_qty ?? deliveredQty - returnedQty));
      return {
        ...item,
        line_key: shipmentLineKey(item, index),
        delivered_qty: deliveredQty,
        previously_returned_qty: returnedQty,
        available_to_return: availableQty,
        available_return_qty: availableQty,
      };
    }).filter((item) => item.available_return_qty > 0);
    return { ...shipment, items };
  }, [returnedQtyByShipmentSku]);

  const returnDateRangeInvalid = isInvalidCreatedDateRange(returnDateFrom, returnDateTo);
  const rmaDateRangeInvalid = isInvalidCreatedDateRange(rmaDateFrom, rmaDateTo);

  // ── Filtered + paged ──────────────────────────────────────────────────────
  const filteredReturns = useMemo(() => {
    const q = returnSearch.toLowerCase();
    const dateFiltered = filterByCreatedDate(returnsData, returnDateFrom, returnDateTo);
    return dateFiltered.filter((r) =>
      (!q || (r.return_id || "").toLowerCase().includes(q) || (r.customer_name || "").toLowerCase().includes(q) || (r.shipment_id || "").toLowerCase().includes(q)) &&
      (!returnStatusFilter || returnWorkflowStatus(r).value === returnStatusFilter)
    );
  }, [returnsData, returnDateFrom, returnDateTo, returnSearch, returnStatusFilter]);

  const returnTotalPages = Math.max(1, Math.ceil(filteredReturns.length / returnPageSize));
  const pagedReturns     = useMemo(() => filteredReturns.slice((returnPage - 1) * returnPageSize, returnPage * returnPageSize), [filteredReturns, returnPage, returnPageSize]);

  const filteredRmas = useMemo(() => {
    const q = rmaSearch.toLowerCase();
    const dateFiltered = filterByCreatedDate(rmasData, rmaDateFrom, rmaDateTo);
    return dateFiltered.filter((r) =>
      (!q || (r.rma_id || "").toLowerCase().includes(q) || (r.return_id || "").toLowerCase().includes(q)) &&
      (!rmaStatusFilter || r.status === rmaStatusFilter)
    );
  }, [rmaDateFrom, rmaDateTo, rmaSearch, rmaStatusFilter, rmasData]);

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
      setReturnsData(enrichReturnsWithRmas(nr, nm));
      setRmasData(nm);
      setSelectedReturnId((cur) => (cur && nr.some((r) => r.return_id === cur)) ? cur : "");
      setSelectedRmaId((cur)    => (cur && nm.some((r) => r.rma_id === cur))    ? cur : "");
    } catch (e) {
      setError(e.message || "Failed to load returns data");
    } finally { setLoading(false); }
  }, [session, tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadReturnAudit = useCallback(async (page = 1) => {
    if (!tenantId || !selectedReturnId) {
      setReturnAudit((current) => ({ ...current, items: [], total: 0, page: 1, loading: false, error: "" }));
      return;
    }
    setReturnAudit((current) => ({ ...current, page, loading: true, error: "" }));
    try {
      const response = await fetchReturnAuditTrail(session, selectedReturnId, { page, pageSize: 10 });
      const data = response?.data || response || {};
      setReturnAudit({
        items: Array.isArray(data.items) ? data.items : [],
        total: Number(data.total || 0),
        page: Number(data.page || page),
        pageSize: Number(data.pageSize || 10),
        loading: false,
        error: "",
      });
    } catch (e) {
      setReturnAudit((current) => ({
        ...current,
        page,
        loading: false,
        error: e.message || "Failed to load audit trail",
      }));
    }
  }, [selectedReturnId, session, tenantId]);

  const loadRmaAudit = useCallback(async (page = 1) => {
    if (!tenantId || !selectedRmaId) {
      setRmaAudit((current) => ({ ...current, items: [], total: 0, page: 1, loading: false, error: "" }));
      return;
    }
    setRmaAudit((current) => ({ ...current, page, loading: true, error: "" }));
    try {
      const response = await fetchRmaAuditTrail(session, selectedRmaId, { page, pageSize: 10 });
      const data = response?.data || response || {};
      setRmaAudit({
        items: Array.isArray(data.items) ? data.items : [],
        total: Number(data.total || 0),
        page: Number(data.page || page),
        pageSize: Number(data.pageSize || 10),
        loading: false,
        error: "",
      });
    } catch (e) {
      setRmaAudit((current) => ({
        ...current,
        page,
        loading: false,
        error: e.message || "Failed to load audit trail",
      }));
    }
  }, [selectedRmaId, session, tenantId]);

  useEffect(() => { loadReturnAudit(1); }, [loadReturnAudit]);
  useEffect(() => { loadRmaAudit(1); }, [loadRmaAudit]);

  const loadShipmentLookup = useCallback(async (search = shipmentSearch) => {
    if (!tenantId || !warehouseId) return;
    try {
      setShipmentLookupLoading(true);
      const result = await fetchShipments(session, {
        page: 1,
        pageSize: 20,
        status: "closed",
        returnEligible: true,
        search: search.trim(),
      });
      const rows = Array.isArray(result?.items)
        ? result.items
        : Array.isArray(result?.data)
          ? result.data
          : Array.isArray(result)
            ? result
            : [];
      const eligibleRows = rows
        .filter((shipment) => String(shipment?.status || "").toLowerCase() === "closed")
        .map(applyReturnAvailabilityToShipment)
        .filter((shipment) => shipment.items.length > 0);
      setShipmentLookupRows(eligibleRows);
    } catch (e) {
      setShipmentLookupRows([]);
      toast({ title: "Shipment lookup failed", description: e.message || "Unable to search shipments", variant: "destructive" });
    } finally {
      setShipmentLookupLoading(false);
    }
  }, [applyReturnAvailabilityToShipment, session, shipmentSearch, tenantId, toast, warehouseId]);

  useEffect(() => {
    if (!shouldShowShipmentLookup) return;
    const timer = setTimeout(() => loadShipmentLookup(shipmentSearch), 250);
    return () => clearTimeout(timer);
  }, [loadShipmentLookup, shipmentSearch, shouldShowShipmentLookup]);

  useEffect(() => {
    if (!shipmentLookupOpen) return;
    const handlePointerDown = (event) => {
      if (!shipmentLookupRef.current?.contains(event.target)) {
        setShipmentLookupOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [shipmentLookupOpen]);

  const resetCreateReturnModal = () => {
    setCreateForm(initialCreateForm);
    setCreateFormErrors({});
    setShipmentSearch("");
    setShipmentLookupOpen(false);
    setShipmentLookupRows([]);
    setSelectedShipment(null);
    setSelectedShipmentLineKey("");
  };

  const clearSelectedShipment = () => {
    setSelectedShipment(null);
    setSelectedShipmentLineKey("");
    setShipmentSearch("");
    setShipmentLookupRows([]);
    setShipmentLookupOpen(false);
    setCreateForm((current) => ({
      ...current,
      shipment_id: "",
      sales_order_id: "",
      customer_id: "",
      customer_name: "",
      shipment_date: "",
      sku_id: "",
      qty: "1",
    }));
    setCreateFormErrors((current) => ({
      ...current,
      shipment_id: "",
      customer_id: "",
      customer_name: "",
      sku_id: "",
      qty: "",
    }));
  };

  const scrollToDetail = (ref) => {
    window.setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const openLinkedRma = (rmaId) => {
    if (!rmaId) return;
    setSelectedRmaId(rmaId);
    setActiveTab("rma");
    scrollToDetail(rmaDetailRef);
  };

  const openLinkedReturn = (returnId) => {
    if (!returnId) return;
    setSelectedReturnId(returnId);
    setActiveTab("returns");
    scrollToDetail(returnDetailRef);
  };

  const selectShipmentForReturn = (shipment) => {
    const customerId = shipmentCustomerId(shipment);
    const customerName = shipment?.customer_name || shipment?.order?.customer?.customer_name || "";
    const salesOrderId = shipmentSalesOrderId(shipment);
    const shipmentDate = shipment?.shipment_date || shipment?.ship_date || shipment?.dispatched_at || shipment?.created_at || "";
    setSelectedShipment(shipment);
    setSelectedShipmentLineKey("");
    setShipmentLookupOpen(false);
    setShipmentSearch(`${shipment.shipment_id} - ${customerName || salesOrderId || "Shipment"}`);
    setCreateForm((current) => ({
      ...current,
      shipment_id: shipment.shipment_id || "",
      sales_order_id: salesOrderId,
      customer_id: customerId,
      customer_name: customerName,
      shipment_date: shipmentDate,
      sku_id: "",
      qty: "1",
    }));
    setCreateFormErrors((current) => ({
      ...current,
      shipment_id: "",
      customer_id: "",
      customer_name: "",
      sku_id: "",
      qty: "",
    }));
  };

  const selectShipmentLineForReturn = (lineKey) => {
    const line = selectedShipmentItems.find((item) => item.line_key === lineKey);
    setSelectedShipmentLineKey(lineKey);
    setCreateForm((current) => ({
      ...current,
      sku_id: line?.sku_id || "",
      qty: line?.available_return_qty > 0 ? "1" : "0",
    }));
    setCreateFormErrors((current) => ({ ...current, sku_id: "", qty: "" }));
  };

  // ── Create Return ─────────────────────────────────────────────────────────
  const updateCreateForm = (field, value) => {
    setCreateForm((c) => ({ ...c, [field]: value }));
    setCreateFormErrors((c) => ({ ...c, [field]: "" }));
  };

  const validateCreateReturnForm = () => {
    const errors = {};
    if (!createForm.shipment_id.trim())  errors.shipment_id  = "Shipment is required";
    if (!createForm.customer_id.trim())  errors.customer_id  = "Customer ID is required";
    if (!createForm.customer_name.trim()) errors.customer_name = "Customer name is required";
    if (!selectedShipmentLine)           errors.sku_id       = "Select a shipped item to return";
    if (!createForm.reason_code.trim())  errors.reason_code  = "Reason code is required";
    const qty = Number(createForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) errors.qty = "Quantity must be greater than 0";
    if (selectedShipmentLine && qty > selectedShipmentLine.available_return_qty) {
      errors.qty = `Return quantity cannot exceed ${selectedShipmentLine.available_return_qty}`;
    }
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
      resetCreateReturnModal();
      toast({ title: "Return created", description: `Return ${created.return_id} created successfully` });
    } catch (e) {
      const msg = e.message || "Unable to create return";
      setError(msg);
      toast({ title: "Create failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  // ── Create RMA ────────────────────────────────────────────────────────────
  const openCreateRmaDialog = (returnRecord) => {
    setCreateRmaTarget(returnRecord);
    setCreateRmaRemarks("");
  };

  const handleCreateRma = async (returnRecord, remarks = "") => {
    if (!returnRecord) return;
    const busyKey = `create-rma-${returnRecord.return_id}`;
    try {
      setActionKey(busyKey); setError("");
      const notes = remarks.trim() || `Created from Return ${returnRecord.return_id}`;
      const created       = await createRmaFromReturn(session, returnRecord.return_id, { notes });
      const updatedReturn = created?.return || null;
      const rmaRecord     = { ...created };
      delete rmaRecord.return;
      setRmasData((prev) => [rmaRecord, ...prev.filter((r) => r.rma_id !== rmaRecord.rma_id)]);
      setReturnsData((prev) => prev.map((r) => {
        if (r.return_id !== returnRecord.return_id) return r;
        const baseReturn = updatedReturn?.return_id === r.return_id ? { ...r, ...updatedReturn } : r;
        return {
          ...baseReturn,
          rma_count: Math.max(1, Number(baseReturn.rma_count || 0)),
          active_rma_id: rmaRecord.rma_id,
          rma_id: rmaRecord.rma_id,
          rma_status: rmaRecord.status,
          rma_created_by: rmaRecord.created_by,
          rma_created_by_name: rmaRecord.created_by_name,
          rma_created_by_display: rmaRecord.created_by_display,
          rma_created_at: rmaRecord.created_at,
          linked_rma: {
            rma_id: rmaRecord.rma_id,
            return_id: returnRecord.return_id,
            status: rmaRecord.status,
            created_by: rmaRecord.created_by,
            created_by_name: rmaRecord.created_by_name,
            created_by_display: rmaRecord.created_by_display,
            created_at: rmaRecord.created_at,
          },
        };
      }));
      setSelectedRmaId(rmaRecord.rma_id);
      setActiveTab("rma");
      setCreateRmaTarget(null);
      setCreateRmaRemarks("");
      await loadReturnAudit(1);
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
      if (updated) {
        setReturnsData((prev) => prev.map((r) => r.return_id === updated.return_id ? updated : r));
        const linkedRma = linkedRmaFromReturn(updated);
        if (linkedRma?.rma_id) {
          setRmasData((prev) => {
            const nextRma = {
              ...prev.find((rma) => rma.rma_id === linkedRma.rma_id),
              ...linkedRma,
              status: linkedRma.status || "cancelled",
              return_status: updated.status,
            };
            return prev.some((rma) => rma.rma_id === linkedRma.rma_id)
              ? prev.map((rma) => rma.rma_id === linkedRma.rma_id ? nextRma : rma)
              : [nextRma, ...prev];
          });
        }
      }
      await loadData();
      await loadReturnAudit(1);
      await loadRmaAudit(1);
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
      await loadRmaAudit(1);
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
      await loadData();
      await loadReturnAudit(1);
      toast({ title: "Status updated", description: `Return ${returnRecord.return_id} moved to ${nextStatus}` });
    } catch (e) {
      const msg = e.message || "Unable to update status";
      setError(msg);
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    } finally { setActionKey(""); }
  };

  const performCloseReturn = async () => {
    if (!closeTarget?.returnRecord || !closeTarget?.transition) return;
    await handleTransitionReturn(closeTarget.returnRecord, closeTarget.transition.action, closeTarget.transition.nextStatus);
    setCloseTarget(null);
  };

  // ── Transition RMA ────────────────────────────────────────────────────────
  const handleTransitionRma = async (rmaRecord, action, nextStatus) => {
    const busyKey = `rma-transition-${rmaRecord.rma_id}`;
    try {
      setActionKey(busyKey); setError("");
      const response = await transitionRmaStatus(session, rmaRecord.rma_id, action);
      const updated  = response?.document;
      setRmasData((prev) => prev.map((r) => r.rma_id === rmaRecord.rma_id ? (updated || { ...r, status: nextStatus }) : r));
      await loadData();
      await loadRmaAudit(1);
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
    if (canCreateRma && shouldShowCreateRmaAction(row)) {
      const busy = actionKey === `create-rma-${row.return_id}`;
      chips.push({ key: "create-rma", label: busy ? "Creating…" : "Create RMA", danger: false, onClick: (e) => { e.stopPropagation(); openCreateRmaDialog(row); } });
    }
    if (canTransitionReturn && shouldShowReturnTransitionAction(row)) {
      const t = statusTransitions[returnStatus(row.status)];
      const busy = actionKey === `transition-${row.return_id}`;
      chips.push({ key: "transition", label: busy ? "Updating…" : t.label, danger: false, onClick: (e) => { e.stopPropagation(); setCloseTarget({ returnRecord: row, transition: t }); } });
    }
    if (canCancelReturnRole && shouldShowCancelReturnAction(row)) {
      chips.push({ key: "cancel", label: "Cancel", danger: true, onClick: (e) => { e.stopPropagation(); setCancelTarget(row); setCancelReason(""); setCancelErr(""); } });
    }

    if (!chips.length) return <span style={{ fontSize: 12, color: T_MUTED }}>-</span>;
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
    if (t && canProcessRma && canContinueRmaWorkflow(row, returnsData.find((r) => r.return_id === row.return_id))) {
      const busy = actionKey === `rma-transition-${row.rma_id}`;
      chips.push({ key: "transition", label: busy ? "Updating…" : t.label, danger: false, onClick: (e) => { e.stopPropagation(); handleTransitionRma(row, t.action, t.nextStatus); } });
    }
    if (row.status === "open") {
      chips.push({ key: "cancel", label: "Cancel", danger: true, onClick: (e) => { e.stopPropagation(); setCancelRmaTarget(row); setCancelRmaReason(""); setCancelRmaErr(""); } });
    }
    if (!chips.length) return <span style={{ fontSize: 12, color: T_MUTED }}>-</span>;
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
  const renderToolbar = ({
    search,
    onSearch,
    statusFilter,
    onStatusFilter,
    statusOpts,
    statusType = "return",
    dateFrom,
    onDateFrom,
    dateTo,
    onDateTo,
    dateError,
    onRefresh,
    onClear,
    onCreate,
    createLabel,
  }) => (
    <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
        <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
          placeholder="Search ID…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <Select value={statusFilter || "all"} onValueChange={(v) => onStatusFilter(v === "all" ? "" : v)}>
        <SelectTrigger style={{ height: 40, width: 175, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {statusOpts.map((option) => {
            const value = typeof option === "string" ? option : option.value;
            const label = typeof option === "string" ? statusLabel(option, statusType) : option.label;
            return <SelectItem key={value} value={value}>{label}</SelectItem>;
          })}
        </SelectContent>
      </Select>
      <input
        type="date"
        aria-label="Created Date From"
        value={dateFrom || ""}
        onChange={(event) => onDateFrom(event.target.value)}
        style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
      />
      <input
        type="date"
        aria-label="Created Date To"
        value={dateTo || ""}
        onChange={(event) => onDateTo(event.target.value)}
        style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
      />
      {dateError && (
        <span style={{ fontSize: 12, color: "#991b1b", width: "100%" }}>
          {dateError}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <button style={btnNeutral} onClick={onClear}>Clear</button>
      <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={onRefresh} disabled={loading || Boolean(actionKey)}>Refresh</button>
      {onCreate && <button style={btnPrimary} onClick={onCreate}>+ {createLabel}</button>}
    </div>
  );

  // ── Pagination ────────────────────────────────────────────────────────────
  const renderPagination = (total, page, pageSize, totalPages, setPage, setPageSize) => (
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
  );

  // ── Generic table ─────────────────────────────────────────────────────────
  const renderTable = (rows, cols, selectedId, idKey, onSelect) => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ background: "#fafbff" }}>
          {cols.map((c) => (
            <th key={c.key} style={{ padding: "10px 16px", textAlign: c.right ? "right" : "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr><td colSpan={cols.length} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>Loading…</td></tr>
        )}
        {!loading && rows.length === 0 && (
          <tr><td colSpan={cols.length} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No records found.</td></tr>
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
                else if (c.mono)    cell = <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{displayValue(row[c.key])}</span>;
                else if (c.bold)    cell = <span style={{ fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{displayValue(row[c.key])}</span>;
                else if (c.dt)      cell = <span style={{ fontSize: 13, color: T_SECONDARY }}>{formatDt(row[c.key])}</span>;
                else if (c.muted)   cell = <span style={{ fontSize: 13, color: displayValue(row[c.key]) !== "-" ? T_SECONDARY : T_MUTED }}>{displayValue(row[c.key])}</span>;
                else                cell = <span style={{ fontSize: 13, color: T_PRIMARY }}>{displayValue(row[c.key])}</span>;
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
    { key: "status",        label: "Status",     render: (r) => {
      const workflowStatus = returnWorkflowStatus(r);
      return <StatusPill status={workflowStatus.badgeStatus} label={workflowStatus.label} />;
    } },
  ];

  const rmaCols = [
    { key: "rma_id",    label: "RMA ID",    mono: true },
    { key: "return_id", label: "Return ID", mono: true },
    { key: "created_at", label: "Created",  dt: true },
    { key: "created_by", label: "Created By", render: (r) => <span style={{ fontSize: 13, color: T_SECONDARY }}>{createdByDisplay(r)}</span> },
    { key: "status",    label: "Status",    render: (r) => <StatusPill status={r.status} type="rma" /> },
  ];

  // ── Card style ────────────────────────────────────────────────────────────
  const cardStyle = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };

  // ── Returns detail panel ──────────────────────────────────────────────────
  const renderReturnDetail = () => {
    const r = selectedReturn;
    if (!r) return null;
    const returnItems = (Array.isArray(r.items) && r.items.length)
      ? r.items
      : [{
          return_item_id: `${r.return_id}-item`,
          sku_id: r.sku_id,
          sku_name: r.sku_name || r.product_name || r.sku_description,
          product_name: r.product_name || r.sku_name || r.sku_description,
          qty: r.qty,
          reason_code: r.reason_code,
        }];
    const linkedRma = linkedRmaFromReturn(r);
    const workflowStatus = returnWorkflowStatus(r);
    const visibleActions = [];
    if (canCreateRma && shouldShowCreateRmaAction(r)) {
      visibleActions.push({ key: "create-rma", label: actionKey === `create-rma-${r.return_id}` ? "Creating…" : "Create RMA", danger: false, fn: () => openCreateRmaDialog(r) });
    }
    if (canTransitionReturn && shouldShowReturnTransitionAction(r)) {
      const t = statusTransitions[returnStatus(r.status)];
      visibleActions.push({ key: "transition", label: actionKey === `transition-${r.return_id}` ? "Updating…" : t.label, danger: false, fn: () => setCloseTarget({ returnRecord: r, transition: t }) });
    }
    if (canCancelReturnRole && shouldShowCancelReturnAction(r)) {
      visibleActions.push({ key: "cancel", label: "Cancel Return", danger: true, fn: () => { setCancelTarget(r); setCancelReason(""); setCancelErr(""); } });
    }

    return (
      <div ref={returnDetailRef} style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
        <div style={{ padding: "12px 16px 16px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{r.return_id}</span>
            <StatusPill status={workflowStatus.badgeStatus} label={workflowStatus.label} />
          </div>
          {/* Return lifecycle stepper */}
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Return Status
            </p>
            <WorkflowStepper steps={stepperForReturnStatus(r.status, Boolean(linkedRma))} />
          </div>
          <DetailFieldGrid title="Return Information">
            <DetailField label="Customer" value={r.customer_name} />
            <DetailField label="Shipment" value={r.shipment_id} mono />
            <DetailField label="Total Items" value={returnItems.length} />
            <DetailField label="Return Qty" value={r.qty} />
          </DetailFieldGrid>

          <DetailFieldGrid title="Request Information">
            <DetailField label="Created By" value={createdByDisplay(r)} />
            <DetailField label="Created At" value={displayReturnValue(formatDt(r.created_at))} />
            <DetailField label="Notes" value={r.notes} />
            {r.cancellation_reason && <DetailField label="Cancellation Reason" value={r.cancellation_reason} danger preLine />}
          </DetailFieldGrid>

          <DetailFieldGrid title="RMA Information">
            {!linkedRma ? (
              <>
                <DetailField label="RMA No" value="-" mono />
                <DetailField label="RMA Status" value="-" />
                <DetailField label="Created By" value="-" />
                <DetailField label="Created At" value="-" />
              </>
            ) : (
              [linkedRma].flatMap((row) => [
                <DetailField key="rma-no" label="RMA No">
                  <button
                    onClick={() => openLinkedRma(row.rma_id)}
                    style={{ ...btnBase, height: "auto", padding: 0, fontSize: 13, fontWeight: 500, color: ACCENT, textDecoration: "underline", background: "transparent" }}
                  >
                    {row.rma_id}
                  </button>
                </DetailField>,
                <DetailField key="rma-status" label="RMA Status">
                  <StatusPill status={row.status} type="rma" />
                </DetailField>,
                <DetailField key="rma-created-by" label="Created By" value={createdByDisplay(row)} />,
                <DetailField key="rma-created-at" label="Created At" value={displayReturnValue(formatDt(row.created_at))} />,
              ])
            )}
          </DetailFieldGrid>

          <DetailSection title="Return Items">
            <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["SKU ID", "Product Name", "Qty", "Reason Code", "Linked RMA"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: h === "Qty" ? "right" : "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, index) => {
                    const productName = displayValue(item.product_name || item.sku_name || item.sku_description || item.description || item.sku?.description);
                    return (
                      <tr key={item.return_item_id || item.rmi_id || `${item.sku_id}-${index}`} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                        <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{displayValue(item.sku_id)}</td>
                        <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{productName}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{displayReturnValue(item.qty)}</td>
                        <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
                          {returnReasonLabel(item.reason_code || r.reason_code)}
                        </td>
                        <td style={{ padding: "9px 14px" }}>
                          {linkedRma ? (
                            <button key={linkedRma.rma_id}
                              onClick={() => openLinkedRma(linkedRma.rma_id)}
                              style={{ ...btnBase, height: "auto", padding: 0, fontSize: 13, fontWeight: 500, lineHeight: "20px", color: ACCENT, textDecoration: "underline", marginRight: 8, background: "transparent" }}>
                              {linkedRma.rma_id}
                            </button>
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_MUTED }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <AuditTrailSection
            state={returnAudit}
            onPageChange={loadReturnAudit}
            onRetry={() => loadReturnAudit(returnAudit.page)}
          />

          <div style={detailActionArea}>
            {visibleActions.length > 0 ? visibleActions.map((a) => (
              <button key={a.key} disabled={Boolean(actionKey) || loading}
                onClick={a.fn}
                style={{
                  ...(a.danger ? detailActionDanger : detailActionPrimary),
                  opacity: (Boolean(actionKey) || loading) ? 0.5 : 1,
                }}>
                {a.label}
              </button>
            )) : (
              <span style={{ fontSize: 12, color: T_MUTED }}>No actions available</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── RMA detail panel ──────────────────────────────────────────────────────
  const renderRmaDetail = () => {
    const r = selectedRma;
    if (!r) return null;
    const t = rmaStatusTransitions[r.status];
    const linkedReturnItems = selectedRmaReturn
      ? (Array.isArray(selectedRmaReturn.items) && selectedRmaReturn.items.length)
        ? selectedRmaReturn.items
        : [{
            sku_id: selectedRmaReturn.sku_id,
            sku_name: selectedRmaReturn.sku_name || selectedRmaReturn.product_name || selectedRmaReturn.sku_description,
            product_name: selectedRmaReturn.product_name || selectedRmaReturn.sku_name || selectedRmaReturn.sku_description,
            reason_code: selectedRmaReturn.reason_code,
          }]
      : [];
    const returnItemBySku = new Map(linkedReturnItems.map((item) => [item.sku_id, item]));
    return (
      <div ref={rmaDetailRef} style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
        <div style={{ padding: "12px 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{r.rma_id}</span>
            <StatusPill status={r.status} type="rma" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <WorkflowStepper steps={stepperForRmaStatus(r.status)} />
          </div>

          <DetailFieldGrid title="RMA Information">
            <DetailField label="Return ID">
              <button
                onClick={() => openLinkedReturn(r.return_id)}
                style={{ ...btnBase, height: "auto", padding: 0, fontSize: 13, fontWeight: 500, color: ACCENT, textDecoration: "underline", background: "transparent", fontFamily: "var(--font-mono)" }}
              >
                {displayValue(r.return_id)}
              </button>
            </DetailField>
            <DetailField label="Customer" value={selectedRmaReturn?.customer_name} />
            <DetailField label="Shipment" value={selectedRmaReturn?.shipment_id} mono />
          </DetailFieldGrid>

          <DetailFieldGrid title="Request Information">
            <DetailField label="Created By" value={createdByDisplay(r)} />
            <DetailField label="Created At" value={displayReturnValue(formatDt(r.created_at))} />
            <DetailField label="Notes" value={r.notes} />
            {r.cancellation_reason && <DetailField label="Cancellation Reason" value={r.cancellation_reason} danger span preLine />}
          </DetailFieldGrid>

          <DetailSection title="RMA Items">
            <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["SKU ID", "Product Name", "Qty", "Reason Code"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: h === "Qty" ? "right" : "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!(r.items || []).length && (
                    <tr><td colSpan={4} style={{ padding: "20px 14px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No items available.</td></tr>
                  )}
                  {(r.items || []).map((item) => {
                    const returnItem = returnItemBySku.get(item.sku_id);
                    const productName = returnItem?.product_name
                      || returnItem?.sku_name
                      || returnItem?.sku_description
                      || returnItem?.description
                      || returnItem?.sku?.description
                      || item.product_name
                      || item.sku_name
                      || item.sku_description
                      || item.description
                      || item.sku?.description;
                    return (
                      <tr key={item.rma_item_id} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                        <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{displayReturnValue(item.sku_id)}</td>
                        <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{displayReturnValue(productName)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{displayReturnValue(item.qty)}</td>
                        <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{returnReasonLabel(item.reason_code || returnItem?.reason_code || selectedRmaReturn?.reason_code)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <AuditTrailSection
            state={rmaAudit}
            onPageChange={loadRmaAudit}
            onRetry={() => loadRmaAudit(rmaAudit.page)}
          />

          {/* Actions */}
          <div style={detailActionArea}>
            {t && canProcessRma && canContinueRmaWorkflow(r, selectedRmaReturn) && (
              <button disabled={Boolean(actionKey) || loading}
                onClick={() => handleTransitionRma(r, t.action, t.nextStatus)}
                style={{ ...detailActionPrimary, opacity: (Boolean(actionKey) || loading) ? 0.55 : 1 }}>
                {actionKey === `rma-transition-${r.rma_id}` ? "Updating…" : t.label}
              </button>
            )}
            {r.status === "open" && (
              <button disabled={Boolean(actionKey) || loading}
                onClick={() => { setCancelRmaTarget(r); setCancelRmaReason(""); setCancelRmaErr(""); }}
                style={{ ...detailActionDanger, opacity: (Boolean(actionKey) || loading) ? 0.55 : 1 }}>
                Cancel RMA
              </button>
            )}
            {(!t || !canContinueRmaWorkflow(r, selectedRmaReturn)) && r.status !== "open" && <span style={{ fontSize: 12, color: T_MUTED }}>No actions available</span>}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const createReturnQty = Number(createForm.qty);
  const createReturnReady = Boolean(
    selectedShipment &&
    selectedShipmentLine &&
    createForm.reason_code.trim() &&
    Number.isFinite(createReturnQty) &&
    createReturnQty > 0 &&
    createReturnQty <= selectedShipmentLine.available_return_qty
  );
  const createReturnDisabled = actionKey === "create-return" || !createReturnReady;

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Returns" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Returns</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Manage customer returns and RMA records</p>
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
              statusOpts: RETURN_WORKFLOW_STATUS_OPTIONS,
              dateFrom: returnDateFrom,
              onDateFrom: (v) => { setReturnDateFrom(v); setReturnPage(1); },
              dateTo: returnDateTo,
              onDateTo: (v) => { setReturnDateTo(v); setReturnPage(1); },
              dateError: returnDateRangeInvalid ? "To Date cannot be earlier than From Date." : "",
              onRefresh: loadData,
              onClear: () => { setReturnSearch(""); setReturnStatusFilter(""); setReturnDateFrom(""); setReturnDateTo(""); setReturnPage(1); },
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
              statusOpts: ["created", "processing", "completed", "cancelled"],
              statusType: "rma",
              dateFrom: rmaDateFrom,
              onDateFrom: (v) => { setRmaDateFrom(v); setRmaPage(1); },
              dateTo: rmaDateTo,
              onDateTo: (v) => { setRmaDateTo(v); setRmaPage(1); },
              dateError: rmaDateRangeInvalid ? "To Date cannot be earlier than From Date." : "",
              onRefresh: loadData,
              onClear: () => { setRmaSearch(""); setRmaStatusFilter(""); setRmaDateFrom(""); setRmaDateTo(""); setRmaPage(1); },
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
      <Dialog open={showCreateReturn} onOpenChange={(open) => { setShowCreateReturn(open); if (!open) resetCreateReturnModal(); }}>
        <DialogContent style={{ maxWidth: 760, maxHeight: "80vh", padding: 0, overflow: "hidden" }}>
          <DialogHeader style={{ padding: "22px 24px 12px" }}><DialogTitle>Create Return</DialogTitle></DialogHeader>
          <div style={{ maxHeight: "calc(80vh - 76px)", overflowY: "auto", padding: "0 24px 96px", display: "grid", gap: 24, scrollBehavior: "smooth" }}>
            <section style={{ display: "grid", gap: 12 }}>
              <ModalSectionTitle>Return Source</ModalSectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                ref={shipmentLookupRef}
                className="space-y-1 md:col-span-2"
                style={{ position: "relative" }}
                onBlur={() => {
                  window.setTimeout(() => {
                    if (!shipmentLookupRef.current?.contains(document.activeElement)) {
                      setShipmentLookupOpen(false);
                    }
                  }, 0);
                }}
              >
                <Label>Shipment <span style={{ color: "#e03131" }}>*</span></Label>
                <div style={{ position: "relative" }}>
                  {selectedShipment ? (
                    <div style={{
                      minHeight: 74,
                      borderRadius: 8,
                      border: "0.5px solid #d1d5db",
                      background: "#fff",
                      padding: "10px 40px 10px 12px",
                      display: "grid",
                      gap: 2,
                    }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: T_PRIMARY }}>{createForm.shipment_id}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T_PRIMARY }}>{createForm.customer_name || "Unknown customer"}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: T_SECONDARY }}>{createForm.sales_order_id || "No sales order"}</span>
                    </div>
                  ) : (
                    <Input
                      id="returnShipmentLookup"
                      name="returnShipmentLookup"
                      value={shipmentSearch}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      inputMode="search"
                      role="combobox"
                      aria-autocomplete="list"
                      onFocus={() => {
                        setShipmentLookupOpen(true);
                        loadShipmentLookup(shipmentSearch);
                      }}
                      onClick={() => setShipmentLookupOpen(true)}
                      onChange={(e) => {
                        setShipmentSearch(e.target.value);
                        setShipmentLookupOpen(true);
                        setSelectedShipment(null);
                        setSelectedShipmentLineKey("");
                        setCreateForm((current) => ({
                          ...current,
                          shipment_id: "",
                          sales_order_id: "",
                          customer_id: "",
                          customer_name: "",
                          shipment_date: "",
                          sku_id: "",
                          qty: "1",
                        }));
                      }}
                      placeholder="Search shipment, sales order, tracking no. or customer"
                    />
                  )}
                  {selectedShipment && (
                    <button
                      type="button"
                      aria-label="Clear selected shipment"
                      onClick={clearSelectedShipment}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        border: "0.5px solid #d1d5db",
                        background: "#fff",
                        color: T_SECONDARY,
                        lineHeight: "20px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 12, color: T_SECONDARY }}>Select the shipment that the customer is returning from.</p>
                {createFormErrors.shipment_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createFormErrors.shipment_id}</p>}
                {shouldShowShipmentLookup && (
                  <div style={{
                    position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 60,
                    background: "#fff", border: "0.5px solid #d1d5db", borderRadius: 8,
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)", maxHeight: 260, overflowY: "auto",
                  }}>
                    {shipmentLookupLoading && <div style={{ padding: "12px 14px", fontSize: 13, color: T_SECONDARY }}>Searching shipments...</div>}
                    {!shipmentLookupLoading && shipmentLookupRows.length === 0 && (
                      <div style={{ padding: "12px 14px", fontSize: 13, color: T_SECONDARY }}>No eligible completed shipments available for return.</div>
                    )}
                    {!shipmentLookupLoading && shipmentLookupRows.map((shipment) => (
                      <button
                        key={shipment.shipment_id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectShipmentForReturn(shipment)}
                        style={{
                          width: "100%", display: "grid", gridTemplateColumns: "1fr auto", gap: 12,
                          padding: "10px 14px", textAlign: "left", background: "#fff", border: "none",
                          borderBottom: "0.5px solid #eef0fc", cursor: "pointer",
                        }}
                      >
                        <span>
                          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: T_PRIMARY }}>{shipment.shipment_id}</span>
                          <span style={{ display: "block", fontSize: 12, color: T_SECONDARY }}>
                            {shipment.customer_name || "Unknown customer"} • {shipmentSalesOrderId(shipment) || "No sales order"}
                          </span>
                          <span style={{ display: "block", fontSize: 12, color: T_SECONDARY }}>
                            Shipment Date: {shipmentDisplayDate(shipment?.shipment_date || shipment?.ship_date || shipment?.dispatched_at || shipment?.created_at) || "-"}
                          </span>
                        </span>
                        <StatusPill status={shipment.status} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedShipment && (
                <div className="md:col-span-2" style={{
                  borderRadius: 10,
                  border: "0.5px solid #e5e7eb",
                  background: "#fafbff",
                  padding: "12px 14px",
                  display: "grid",
                  gap: 10,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em" }}>Selected Shipment</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: T_PRIMARY }}>{createForm.shipment_id}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T_PRIMARY }}>{createForm.customer_name || "Unknown customer"}</span>
                    </div>
                    <button type="button" style={btnOutline} onClick={clearSelectedShipment}>Change</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    <DetailField label="Sales Order" value={createForm.sales_order_id || "-"} mono />
                    <DetailField label="Shipment Date" value={shipmentDisplayDate(createForm.shipment_date)} />
                    <DetailField label="Customer ID" value={createForm.customer_id || "-"} mono />
                  </div>
                  {(createFormErrors.customer_id || createFormErrors.customer_name) && (
                    <p style={{ margin: 0, fontSize: 12, color: "#991b1b" }}>
                      {createFormErrors.customer_id || createFormErrors.customer_name}
                    </p>
                  )}
                </div>
              )}
            </div>
            </section>

            <section style={{ display: "grid", gap: 12 }}>
              <ModalSectionTitle>Return Item</ModalSectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1 md:col-span-2">
                <Label>Shipped Item <span style={{ color: "#e03131" }}>*</span></Label>
                <Select
                  value={selectedShipmentLineKey || "none"}
                  onValueChange={(v) => selectShipmentLineForReturn(v === "none" ? "" : v)}
                  disabled={!selectedShipment}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedShipment ? "Select item to return" : "Select a shipment first"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Select item to return</SelectItem>
                    {selectedShipmentItems.map((item) => (
                      <SelectItem key={item.line_key} value={item.line_key} disabled={item.available_return_qty <= 0}>
                        {item.sku_id} - {item.sku_name || item.product_name || item.description || "Item"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createFormErrors.sku_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createFormErrors.sku_id}</p>}
                {selectedShipment && selectedShipmentItems.length === 0 && (
                  <p style={{ fontSize: 12, color: "#991b1b" }}>No shipped items found for this shipment.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Available Qty</Label>
                <Input value={selectedShipmentLine?.available_return_qty ?? ""} readOnly placeholder={selectedShipment ? "Select item first" : "Select a shipment first"} />
              </div>
              {selectedShipmentLine && (
                <p className="md:col-span-2" style={{ margin: 0, fontSize: 12, color: T_SECONDARY }}>
                  Delivered Qty: {selectedShipmentLine.delivered_qty} | Previously Returned: {selectedShipmentLine.previously_returned_qty} | Available to Return: {selectedShipmentLine.available_return_qty}
                </p>
              )}
              <div className="space-y-1">
                <Label>Return Quantity <span style={{ color: "#e03131" }}>*</span></Label>
                <Input
                  type="number"
                  value={createForm.qty}
                  onChange={(e) => updateCreateForm("qty", e.target.value)}
                  placeholder="1"
                  min="1"
                  max={selectedShipmentLine?.available_return_qty || undefined}
                  disabled={!selectedShipmentLine}
                />
                {createFormErrors.qty && <p style={{ fontSize: 12, color: "#991b1b" }}>{createFormErrors.qty}</p>}
              </div>
              <div className="space-y-1">
                <Label>Reason Code <span style={{ color: "#e03131" }}>*</span></Label>
                <Select disabled={!selectedShipment} value={createForm.reason_code} onValueChange={(v) => {
                  updateCreateForm("reason_code", v);
                  const reason = returnReasonOptions.find((o) => o.value === v);
                  if (!createForm.reason_description && reason) updateCreateForm("reason_description", reason.label);
                }}>
                  <SelectTrigger><SelectValue placeholder={selectedShipment ? "Select reason" : "Select a shipment first"} /></SelectTrigger>
                  <SelectContent>
                    {returnReasonOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {createFormErrors.reason_code && <p style={{ fontSize: 12, color: "#991b1b" }}>{createFormErrors.reason_code}</p>}
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Reason Description</Label>
                <Input
                  value={createForm.reason_description}
                  onChange={(e) => updateCreateForm("reason_description", e.target.value)}
                  placeholder={selectedShipment ? "Additional reason details" : "Select a shipment first"}
                  disabled={!selectedShipment}
                />
              </div>
              </div>
            </section>
            <section style={{ display: "grid", gap: 14, marginTop: 4 }}>
              <ModalSectionTitle>Additional Information</ModalSectionTitle>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={createForm.notes}
                  onChange={(e) => updateCreateForm("notes", e.target.value)}
                  placeholder={selectedShipment ? "Optional notes" : "Select a shipment first"}
                  disabled={!selectedShipment}
                />
              </div>
            </section>
          </div>
          <div style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            padding: "14px 24px",
            background: "#fff",
            borderTop: "0.5px solid #e5e7eb",
          }}>
              <button style={btnNeutral} onClick={() => setShowCreateReturn(false)} disabled={actionKey === "create-return"}>Cancel</button>
              <button style={{ ...btnPrimary, opacity: createReturnDisabled ? 0.55 : 1 }} onClick={submitCreateReturn} disabled={createReturnDisabled}>
                {actionKey === "create-return" ? "Creating…" : "Create Return"}
              </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create RMA modal ── */}
      <Dialog open={Boolean(createRmaTarget)} onOpenChange={(open) => { if (!open) { setCreateRmaTarget(null); setCreateRmaRemarks(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create RMA</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Create an RMA for{" "}
              <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{createRmaTarget?.return_id}</strong>.
            </p>
            <div className="space-y-1">
              <Label>Remarks</Label>
              <Textarea
                rows={3}
                value={createRmaRemarks}
                onChange={(event) => setCreateRmaRemarks(event.target.value)}
                placeholder="Enter remarks..."
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button
                style={btnNeutral}
                onClick={() => { setCreateRmaTarget(null); setCreateRmaRemarks(""); }}
                disabled={actionKey === `create-rma-${createRmaTarget?.return_id}`}
              >
                Cancel
              </button>
              <button
                style={{ ...btnPrimary, opacity: actionKey === `create-rma-${createRmaTarget?.return_id}` ? 0.6 : 1 }}
                onClick={() => handleCreateRma(createRmaTarget, createRmaRemarks)}
                disabled={!createRmaTarget || actionKey === `create-rma-${createRmaTarget?.return_id}`}
              >
                {actionKey === `create-rma-${createRmaTarget?.return_id}` ? "Creating…" : "Create RMA"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Return modal */}
      <Dialog open={Boolean(closeTarget)} onOpenChange={() => setCloseTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close Return</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Are you sure you want to close this Return?
            </p>
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              This action indicates that the return process has been completed and cannot be reopened.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setCloseTarget(null)} disabled={Boolean(actionKey)}>Cancel</button>
              <button style={{ ...btnPrimary, opacity: actionKey ? 0.6 : 1 }} onClick={performCloseReturn} disabled={Boolean(actionKey)}>
                {actionKey.startsWith("transition-") ? "Closing…" : "Close Return"}
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
              Are you sure you want to cancel this Return?
            </p>
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              The linked RMA will also be cancelled if it is still active.
            </p>
            <div className="space-y-1.5">
              <Label>Cancellation Reason <span style={{ color: "#e03131" }}>*</span></Label>
              <Textarea value={cancelReason} onChange={(e) => { setCancelErr(""); setCancelReason(e.target.value); }}
                placeholder="Please provide the reason for cancellation (min. 5 characters)" rows={3} />
            </div>
            {cancelErr && <p style={{ fontSize: 12, color: "#991b1b" }}>{cancelErr}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setCancelTarget(null)} disabled={Boolean(actionKey)}>Keep Return</button>
              <button style={{ ...btnDanger, opacity: actionKey ? 0.6 : 1 }} onClick={performCancelReturn} disabled={Boolean(actionKey)}>
                {actionKey.startsWith("cancel-") ? "Cancelling…" : "Cancel Return"}
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
              <button style={{ ...btnDanger, opacity: actionKey ? 0.6 : 1 }} onClick={performCancelRma} disabled={Boolean(actionKey)}>
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
