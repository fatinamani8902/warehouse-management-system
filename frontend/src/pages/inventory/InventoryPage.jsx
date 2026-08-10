import { useCallback, useEffect, useMemo, useState } from "react";
import { GlossaryRegistry, GlossaryTerm } from "@/components/shared/GlossaryTooltip";
import SkuCombobox from "@/components/shared/SkuCombobox";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { CancellationConfirmModal } from "@/components/modals/CancellationConfirmModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatQuantity } from "@/utils/formatQuantity";
import { formatDate, formatDateTime } from "@/utils/dateTimeFormatter";
import { filterByCreatedDate } from "@/utils/createdDateFilter";
import {
  canReviewCycleCount,
  cycleCountHasVariance,
  cycleCountLineLabel,
  getCycleCountVariance,
  isCycleCountMakerCheckerBlocked,
  validateCycleCountEntry,
} from "@/utils/cycleCountEntry";
import {
  cycleCountProcessStatuses,
  normalizeCycleCountProcessStatus,
} from "@/utils/cycleCountStatus";
import {
  addCountPlanEntry,
  assignCountPlan,
  approveAdjustmentRequest as approveAdjustment,
  approveCountPlan,
  cancelAdjustmentRequest as cancelAdjustment,
  cancelCountPlan,
  createAdjustmentRequest,
  createCountPlan,
  fetchAdjustmentLocations,
  fetchAdjustmentRequests,
  fetchCountPlanById,
  fetchCountPlanOperators,
  fetchCountPlans,
  fetchInventoryOptions,
  fetchInventoryBalances,
  lookupLocations,
  rejectAdjustmentRequest as rejectAdjustment,
  rejectCountPlan,
  startCountPlan,
  submitAdjustmentRequest,
  submitCountPlan,
  toSessionContext,
  updateCountPlan,
} from "@/services/api";

// ── Design tokens (identical to ReturnsPage) ──────────────────────────────────
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

const cardStyle = {
  background: "#fff", borderRadius: 12,
  border: "0.5px solid #e8ebf8", overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:       { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Draft" },
  assigned:    { bg: "#eef2ff", color: "#3730a3", border: "#c7d2fe", dot: "#6366f1",  label: "Assigned" },
  counting:    { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "Counting" },
  in_progress: { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "Counting" },
  submitted:   { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Submitted" },
  approved:    { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Approved" },
  rejected:    { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", dot: "#ef4444",  label: "Rejected" },
  cancelled:   { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db", dot: "#9ca3af",  label: "Cancelled" },
  pending:     { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
  counted:     { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Counted" },
  variance:    { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "Variance" },
  open:        { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Open" },
};

function StatusPill({ status }) {
  const key = String(status || "").toLowerCase().replace(/ /g, "_");
  const c = STATUS_CFG[key] || { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280", label: status || "-" };
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

// ── DetailField ───────────────────────────────────────────────────────────────
function DetailField({ label, value, danger, span, mono, children }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: danger ? "#991b1b" : T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
        {children ?? value ?? "-"}
      </p>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
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
  const items = Array.isArray(children) ? children : [children];
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

const roleAliases = {
  superadmin: "superadmin", admin: "admin", manager: "manager",
  hqadmin: "hqadmin", storemanager: "storemanager",
  warehousemanager: "storemanager", storeoperator: "storeoperator",
  warehouseoperator: "warehouseoperator", storekeeper: "storeoperator",
  warehouseclerk: "storeoperator",
  auditor: "auditor",
};

const pageSizes = [10, 20, 50];
const adjustmentStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"];
const scanModes = ["MANUAL", "QR", "RFID"];

const stockInitialFilters      = { search: "", warehouse: "", location: "", zone: "" };
const countInitialFilters      = { search: "", status: "", zone: "", dateFrom: "", dateTo: "" };
const adjustmentInitialFilters = { search: "", status: "", dateFrom: "", dateTo: "" };

const inventoryQueryViews          = new Set(["stock", "cycle", "adjustments", "exceptions"]);
const adjustmentStatusQueryValues  = new Set(["draft", "submitted", "approved", "rejected", "cancelled"]);

const createCountInitial = {
  zone_id: "", planned_date: "", scope_type: "FULL_ZONE",
  scope_location_id: "", scope_sku_ids: "",
};

const execInitial = {
  line_id: "", scan_mode: "MANUAL", scanned_value: "", qty_counted: "",
};

const createAdjustmentInitial = {
  sku_id: "", location_id: "", qty_delta: "", reason_code: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

function normalizeCycleCountApprovalRole(roleId) {
  const normalized = String(roleId || "readonly").trim().toLowerCase();
  const aliases = {
    "wh manager": "warehousemanager",
    "warehouse manager": "warehousemanager",
    whmanager: "warehousemanager",
  };
  return aliases[normalized] || normalized;
}

function normalizeStatus(value) {
  const key = String(value || "").toLowerCase();
  return key === "in_progress" ? "counting" : key;
}

function fmtQty(value) {
  return formatQuantity(value);
}

function fmtStatusLabel(value) {
  return String(value || "").toLowerCase().replace(/_/g, " ")
    .split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function actorDisplay(record, key) {
  const display = record?.[`${key}_display`];
  const name = record?.[`${key}_name`];
  const id = record?.[key];
  if (display) return display;
  if (name && id) return `${name} (${id})`;
  return name || id || "-";
}

function parseScopeSkus(text) {
  const rows = String(text || "").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean);
  const unique = [...new Set(rows)];
  const invalid = unique.find((row) => !/^SKU\d{6}$/.test(row));
  return { values: unique, invalid };
}

function parseInventoryQuery(search) {
  const params = new URLSearchParams(search || "");
  const rawView   = String(params.get("view") || "").toLowerCase();
  const rawStatus = String(params.get("status") || "").toLowerCase();
  return {
    view:   inventoryQueryViews.has(rawView) ? rawView : "",
    status: adjustmentStatusQueryValues.has(rawStatus) ? rawStatus : "",
  };
}

// ── ReasonDialog ──────────────────────────────────────────────────────────────
function ReasonDialog({ open, onOpenChange, title, description, reason, setReason, touched, setTouched, submitting, confirmLabel, onConfirm }) {
  const value   = reason.trim();
  const isValid = value.length >= 5;
  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason-input">Reason</Label>
          <Textarea
            id="reason-input" rows={4} value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Enter reason (min. 5 characters)"
            disabled={submitting}
          />
          {touched && !isValid && <p style={{ fontSize: 12, color: "#991b1b" }}>Reason must be at least 5 characters.</p>}
        </div>
        <DialogFooter>
          <button style={btnNeutral} onClick={() => onOpenChange(false)} disabled={submitting}>Back</button>
          <button style={{ ...btnDanger, opacity: (!isValid || submitting) ? 0.6 : 1 }}
            disabled={!isValid || submitting}
            onClick={() => { setTouched(true); if (isValid) onConfirm(value); }}>
            {submitting ? "Saving…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ children, loading }) {
  return (
    <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
      {children}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder = "Search…" }) {
  return (
    <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
      <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
      </svg>
      <input
        style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
        placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination(total, page, pageSize, setPage, setPageSize, disabled) {
  const totalPages = Math.max(1, Math.ceil(Math.max(1, total) / pageSize));
  return (
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
            {pageSizes.map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>
        {[
          { label: "Prev", disabled: disabled || page <= 1,          fn: () => setPage((p) => p - 1) },
          { label: "Next", disabled: disabled || page >= totalPages,  fn: () => setPage((p) => p + 1) },
        ].map((b) => (
          <button key={b.label} disabled={b.disabled} onClick={b.fn}
            style={{ ...btnOutline, opacity: b.disabled ? 0.4 : 1, cursor: b.disabled ? "not-allowed" : "pointer" }}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const InventoryPage = () => {
  const location  = useLocation();
  const auth      = useAuth();
  const { toast } = useToast();
  const session   = useMemo(() => toSessionContext(auth), [auth]);
  const roleId    = useMemo(() => normalizeRole(session.role_id), [session.role_id]);
  const cycleApprovalRoleId = useMemo(() => normalizeCycleCountApprovalRole(session.role_id), [session.role_id]);

  const canCreateCount      = useMemo(() => ["superadmin", "hqadmin"].includes(roleId), [roleId]);
  const canAssignCount      = canCreateCount;
  const canExecuteCount     = useMemo(() => ["operator", "storeoperator", "warehouseoperator"].includes(roleId), [roleId]);
  const canSubmitCount      = canExecuteCount;
  const canApproveCount     = useMemo(() => ["superadmin", "warehousemanager", "manager"].includes(cycleApprovalRoleId), [cycleApprovalRoleId]);
  const canCreateAdj        = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canSubmitAdj        = canCreateAdj;
  const canApproveAdj       = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canCancelAdjByRole  = canApproveAdj;

  const [activeTab, setActiveTab] = useState("stock");
  const [expandedRow, setExpandedRow]       = useState(null);
  const [selectedStockRow, setSelectedStockRow] = useState(null);
  const [selectedCountLine, setSelectedCountLine] = useState(null);
  const [busyKey, setBusyKey]     = useState("");

  const [warehouses, setWarehouses] = useState([]);
  const [zones, setZones]           = useState([]);
  const [locations, setLocations]   = useState([]);
  const [reasonCodes, setReasonCodes] = useState([]);
  const [countConfig, setCountConfig] = useState(null);

  // Stock
  const [stockFilters, setStockFilters]   = useState(stockInitialFilters);
  const [allStockRows, setAllStockRows]   = useState([]);
  const [stockPage, setStockPage]         = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);
  const [stockTotal, setStockTotal]       = useState(0);
  const [stockLoading, setStockLoading]   = useState(false);
  const [stockError, setStockError]       = useState("");

  // Cycle Count
  const [countFilters, setCountFilters]     = useState(countInitialFilters);
  const [allCountRows, setAllCountRows]     = useState([]);
  const [countPage, setCountPage]           = useState(1);
  const [countPageSize, setCountPageSize]   = useState(10);
  const [countLoading, setCountLoading]     = useState(false);
  const [countError, setCountError]         = useState("");
  const [selectedCountId, setSelectedCountId] = useState("");
  const [selectedCount, setSelectedCount]   = useState(null);
  const [countDetailLoading, setCountDetailLoading] = useState(false);

  const [createCountOpen, setCreateCountOpen]     = useState(false);
  const [createCountForm, setCreateCountForm]     = useState(createCountInitial);
  const [createCountErrors, setCreateCountErrors] = useState({});
  const [editCountTarget, setEditCountTarget]     = useState(null);
  const [countOperators, setCountOperators]       = useState([]);
  const [assignCountOpen, setAssignCountOpen]     = useState(false);
  const [assignCountUserId, setAssignCountUserId] = useState("");
  const [assignCountError, setAssignCountError]   = useState("");

  const [execForm, setExecForm]   = useState(execInitial);
  const [execError, setExecError] = useState("");

  const [approveForm, setApproveForm]   = useState({ reason_code: "", approval_note: "" });
  const [approveError, setApproveError] = useState("");

  const [rejectCountOpen, setRejectCountOpen]       = useState(false);
  const [rejectCountReason, setRejectCountReason]   = useState("");
  const [rejectCountTouched, setRejectCountTouched] = useState(false);
  const [cancelCountTarget, setCancelCountTarget]   = useState(null);

  // Adjustments
  const [adjustmentFilters, setAdjustmentFilters]     = useState(adjustmentInitialFilters);
  const [allAdjRows, setAllAdjRows]                   = useState([]);
  const [adjustmentPage, setAdjustmentPage]           = useState(1);
  const [adjustmentPageSize, setAdjustmentPageSize]   = useState(10);
  const [adjustmentLoading, setAdjustmentLoading]     = useState(false);
  const [adjustmentError, setAdjustmentError]         = useState("");
  const [selectedAdjustmentId, setSelectedAdjustmentId] = useState("");

  const [createAdjOpen, setCreateAdjOpen]             = useState(false);
  const [createAdjConfirmOpen, setCreateAdjConfirmOpen] = useState(false);
  const [createAdjForm, setCreateAdjForm]             = useState(createAdjustmentInitial);
  const [createAdjErrors, setCreateAdjErrors]         = useState({});
  const [adjustmentLocations, setAdjustmentLocations] = useState([]);
  const [adjustmentLocationsLoading, setAdjustmentLocationsLoading] = useState(false);
  const [adjustmentLocationsError, setAdjustmentLocationsError] = useState("");

  const [rejectAdjOpen, setRejectAdjOpen]       = useState(false);
  const [rejectAdjReason, setRejectAdjReason]   = useState("");
  const [rejectAdjTouched, setRejectAdjTouched] = useState(false);
  const [rejectAdjTarget, setRejectAdjTarget]   = useState(null);

  const [approveAdjOpen, setApproveAdjOpen]   = useState(false);
  const [approveAdjNote, setApproveAdjNote]   = useState("");
  const [approveAdjTarget, setApproveAdjTarget] = useState(null);

  const [cancelAdjTarget, setCancelAdjTarget] = useState(null);

  const reasonMap  = useMemo(() => new Map(reasonCodes.map((item) => [item.reason_code, item])), [reasonCodes]);
  const locationMap = useMemo(() => new Map(locations.map((item) => [item.location_id, item])), [locations]);
  const warehouseMap = useMemo(() => new Map(warehouses.map((item) => [item.warehouse_id, item])), [warehouses]);
  const operationalCountZones = useMemo(
    () => zones.filter((zone) => (
      String(zone.status || "").toLowerCase() === "active"
      && (!session.warehouse_id || zone.warehouse_id === session.warehouse_id)
    )),
    [zones, session.warehouse_id]
  );

  // ── Client-side filter + paginate ─────────────────────────────────────────
  const filteredCountRows = useMemo(() => {
    let rows = allCountRows;
    const q = countFilters.search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.count_id || "").toLowerCase().includes(q) || (r.zone_id || "").toLowerCase().includes(q));
    if (countFilters.status) rows = rows.filter((r) => normalizeCycleCountProcessStatus(r.status) === countFilters.status);
    if (countFilters.zone)   rows = rows.filter((r) => (r.zone_id || "") === countFilters.zone);
    if (countFilters.dateFrom || countFilters.dateTo) {
      const plannedMatches = filterByCreatedDate(
        rows.map((row) => ({ ...row, created_at: row.planned_date })),
        countFilters.dateFrom,
        countFilters.dateTo,
      );
      const plannedMatchIds = new Set(plannedMatches.map((row) => row.count_id));
      rows = rows.filter((row) => plannedMatchIds.has(row.count_id));
    }
    return rows;
  }, [allCountRows, countFilters]);

  const countTotal = filteredCountRows.length;
  const countRows  = useMemo(() => filteredCountRows.slice((countPage - 1) * countPageSize, countPage * countPageSize), [filteredCountRows, countPage, countPageSize]);
  const selectedCountHasVariance = cycleCountHasVariance(selectedCount?.lines || []);
  const selectedCountStatus = normalizeCycleCountProcessStatus(selectedCount?.status).toUpperCase();
  const selectedCountReviewBlocked = selectedCountStatus === "SUBMITTED"
    && canApproveCount
    && isCycleCountMakerCheckerBlocked(selectedCount, session.user_id);
  const canReviewSelectedCount = selectedCountStatus === "SUBMITTED"
    && canReviewCycleCount(selectedCount, {
      roleAllowed: canApproveCount,
      userId: session.user_id,
    });
  const canAssignSelectedCount = canAssignCount && selectedCountStatus === "DRAFT";
  const canEditSelectedCount = canCreateCount && selectedCountStatus === "DRAFT";
  const canStartSelectedCount = canExecuteCount && selectedCountStatus === "ASSIGNED";
  const canEditSelectedCountEntry = canExecuteCount && selectedCountStatus === "COUNTING";
  const countSubmittedAwaitingManager = selectedCountStatus === "SUBMITTED" && !canReviewSelectedCount && !selectedCountReviewBlocked;
  const canCancelSelectedCount = (() => {
    if (!selectedCountStatus) return false;
    if (["superadmin", "hqadmin"].includes(roleId)) {
      return ["DRAFT", "ASSIGNED"].includes(selectedCountStatus);
    }
    return false;
  })();

  const stockRows = allStockRows;

  const filteredAdjRows = useMemo(() => {
    let rows = [...allAdjRows].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
    const q = adjustmentFilters.search.trim().toLowerCase();
    if (q) rows = rows.filter((r) =>
      (r.adj_id || "").toLowerCase().includes(q) ||
      (r.sku_id || "").toLowerCase().includes(q) ||
      (locationMap.get(r.location_id)?.location_code || r.location_id || "").toLowerCase().includes(q) ||
      (r.reason_code || "").toLowerCase().includes(q)
    );
    if (adjustmentFilters.status) {
      rows = rows.filter((r) => (r.status || "").toUpperCase() === adjustmentFilters.status);
    }
    rows = filterByCreatedDate(
      rows.map((row) => ({ ...row, created_at: row.created_at || row.requested_at })),
      adjustmentFilters.dateFrom,
      adjustmentFilters.dateTo,
    );
    return rows;
  }, [allAdjRows, adjustmentFilters, locationMap]);

  const adjustmentTotal = filteredAdjRows.length;
  const adjustmentRows  = useMemo(() => filteredAdjRows.slice((adjustmentPage - 1) * adjustmentPageSize, adjustmentPage * adjustmentPageSize), [filteredAdjRows, adjustmentPage, adjustmentPageSize]);

  const selectedAdjustment = useMemo(() => filteredAdjRows.find((r) => r.adj_id === selectedAdjustmentId) || null, [filteredAdjRows, selectedAdjustmentId]);
  const selectedAdjustmentStatus = String(selectedAdjustment?.status || "").toUpperCase();
  const selectedAdjustmentCreatedBy = selectedAdjustment?.created_by || selectedAdjustment?.requested_by;
  const canSubmitSelectedAdjustment = canSubmitAdj && selectedAdjustmentStatus === "DRAFT";
  const canReviewSelectedAdjustment = canApproveAdj
    && selectedAdjustmentStatus === "SUBMITTED"
    && selectedAdjustmentCreatedBy !== session.user_id;
  const canCancelSelectedAdjustment = canCancelAdjByRole
    && ["DRAFT", "SUBMITTED"].includes(selectedAdjustmentStatus);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadOptions = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      const [data, canonicalLocations] = await Promise.all([
        fetchInventoryOptions(session),
        lookupLocations(session),
      ]);
      setWarehouses(Array.isArray(data?.warehouses) ? data.warehouses : []);
      setZones(Array.isArray(data?.zones) ? data.zones : []);
      setLocations(canonicalLocations);
      setReasonCodes(Array.isArray(data?.reason_codes) ? data.reason_codes : []);
      setCountConfig(data?.count_config || null);
    } catch (e) {
      toast({ title: "Options failed", description: e.message || "Unable to load options", variant: "destructive" });
    }
  }, [session, toast]);

  const loadStock = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setStockLoading(true); setStockError("");
      const data = await fetchInventoryBalances(session, {
        page: stockPage,
        pageSize: stockPageSize,
        search: stockFilters.search,
        warehouse_id: stockFilters.warehouse,
        location_id: stockFilters.location,
        zone_id: stockFilters.zone,
      });
      setAllStockRows(Array.isArray(data?.data) ? data.data : []);
      setStockTotal(Number(data?.total) || 0);
    } catch (e) {
      setStockError(e.message || "Unable to load stock summary");
      setAllStockRows([]);
      setStockTotal(0);
    } finally { setStockLoading(false); }
  }, [session, stockFilters, stockPage, stockPageSize]);

  useEffect(() => {
    if (!createAdjOpen || !createAdjForm.sku_id || !session.tenant_id) {
      setAdjustmentLocations([]);
      setAdjustmentLocationsLoading(false);
      setAdjustmentLocationsError("");
      return;
    }

    let cancelled = false;
    setAdjustmentLocationsLoading(true);
    setAdjustmentLocationsError("");

    fetchAdjustmentLocations(session, { sku_id: createAdjForm.sku_id })
      .then((result) => {
        if (cancelled) return;
        setAdjustmentLocations(Array.isArray(result?.data) ? result.data : []);
      })
      .catch((error) => {
        if (cancelled) return;
        setAdjustmentLocations([]);
        setAdjustmentLocationsError(error.message || "Unable to load locations for this SKU");
      })
      .finally(() => {
        if (!cancelled) setAdjustmentLocationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [createAdjForm.sku_id, createAdjOpen, session]);

  const loadCountPlans = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setCountLoading(true); setCountError("");
      const data = await fetchCountPlans(session, {
        page: 1,
        pageSize: 9999,
        status: countFilters.status || undefined,
      });
      setAllCountRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setCountError(e.message || "Unable to load count plans");
      setAllCountRows([]);
    } finally { setCountLoading(false); }
  }, [countFilters.status, session]);

  const loadCountOperators = useCallback(async () => {
    if (!session.tenant_id || !canAssignCount) {
      setCountOperators([]);
      return;
    }
    try {
      const data = await fetchCountPlanOperators(session);
      setCountOperators(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setCountOperators([]);
      toast({ title: "Operators failed", description: e.message || "Unable to load count operators", variant: "destructive" });
    }
  }, [canAssignCount, session, toast]);

  const loadCountDetail = useCallback(async (countId) => {
    if (!session.tenant_id || !countId) { setSelectedCount(null); return; }
    try {
      setCountDetailLoading(true);
      const data = await fetchCountPlanById(session, countId);
      setSelectedCount(data || null);
    } catch (e) {
      setCountError(e.message || "Unable to load count plan detail");
      setSelectedCount(null);
    } finally { setCountDetailLoading(false); }
  }, [session]);

  const loadAdjustments = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setAdjustmentLoading(true); setAdjustmentError("");
      const data = await fetchAdjustmentRequests(session, { page: 1, pageSize: 9999 });
      setAllAdjRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setAdjustmentError(e.message || "Unable to load adjustments");
      setAllAdjRows([]);
    } finally { setAdjustmentLoading(false); }
  }, [session]);

  useEffect(() => { loadOptions(); }, [loadOptions]);
  useEffect(() => { if (activeTab === "stock")       loadStock(); },       [activeTab, loadStock]);
  useEffect(() => { if (activeTab === "cycle")       loadCountPlans(); },  [activeTab, loadCountPlans]);
  useEffect(() => { if (activeTab === "cycle")       loadCountOperators(); }, [activeTab, loadCountOperators]);
  useEffect(() => { if (activeTab === "cycle")       loadCountDetail(selectedCountId); }, [activeTab, selectedCountId, loadCountDetail]);
  useEffect(() => { if (activeTab === "adjustments") loadAdjustments(); }, [activeTab, loadAdjustments]);

  useEffect(() => {
    const parsed = parseInventoryQuery(location.search);
    if (!parsed.view) return;
    if (parsed.view === "exceptions") {
      setActiveTab("adjustments");
      setAdjustmentFilters((c) => ({ ...c, status: parsed.status ? parsed.status.toUpperCase() : "" }));
      setAdjustmentPage(1);
      return;
    }
    if (["stock", "cycle", "adjustments"].includes(parsed.view)) {
      setActiveTab(parsed.view);
      if (parsed.view === "adjustments" && parsed.status) {
        setAdjustmentFilters((c) => ({ ...c, status: parsed.status.toUpperCase() }));
        setAdjustmentPage(1);
      }
    }
  }, [location.search]);

  const updateStockFilter      = (key, value) => { setStockFilters((c) => ({ ...c, [key]: value })); setStockPage(1); };
  const updateCountFilter      = (key, value) => { setCountFilters((c) => ({ ...c, [key]: value })); setCountPage(1); setSelectedCountId(""); };
  const updateAdjustmentFilter = (key, value) => { setAdjustmentFilters((c) => ({ ...c, [key]: value })); setAdjustmentPage(1); setSelectedAdjustmentId(""); };

  // ── Handlers (unchanged logic) ────────────────────────────────────────────
  const handleCreateCount = async () => {
    const errors = {};
    if (!createCountForm.zone_id) errors.zone_id = "Zone is required";
    if (createCountForm.scope_type === "BY_LOCATION" && !createCountForm.scope_location_id) errors.scope_location_id = "Location is required";
    let scopeSkus = [];
    if (createCountForm.scope_type === "BY_SKU") {
      const parsed = parseScopeSkus(createCountForm.scope_sku_ids);
      if (parsed.values.length === 0) errors.scope_sku_ids = "SKU list is required";
      else if (parsed.invalid) errors.scope_sku_ids = `Invalid SKU: ${parsed.invalid}`;
      else scopeSkus = parsed.values;
    }
    setCreateCountErrors(errors);
    if (Object.keys(errors).length > 0) return;
    try {
      const isEditing = Boolean(editCountTarget?.count_id);
      setBusyKey(isEditing ? "edit-count" : "create-count"); setCountError("");
      const payload = {
        zone_id: createCountForm.zone_id,
        planned_date: createCountForm.planned_date || undefined,
        scope_type: createCountForm.scope_type,
        scope_location_id: createCountForm.scope_type === "BY_LOCATION" ? createCountForm.scope_location_id : undefined,
        scope_sku_ids: createCountForm.scope_type === "BY_SKU" ? scopeSkus : undefined,
      };
      const data = isEditing
        ? await updateCountPlan(session, editCountTarget.count_id, payload)
        : await createCountPlan(session, payload);
      setCreateCountOpen(false); setCreateCountForm(createCountInitial); setCreateCountErrors({}); setEditCountTarget(null);
      setSelectedCountId(data.count_id); setSelectedCount(data);
      setCountError("");
      toast({ title: isEditing ? "Count plan updated" : "Count plan created", description: `${data.count_id} ${isEditing ? "updated" : "created"}` });
      await loadCountPlans();
    } catch (e) {
      setCountError(e.message || "Unable to save count plan");
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleAssignCount = async () => {
    if (!selectedCount) return;
    if (!assignCountUserId) {
      setAssignCountError("Select an operator.");
      return;
    }
    try {
      setBusyKey("assign-count"); setAssignCountError("");
      const data = await assignCountPlan(session, selectedCount.count_id, {
        assigned_to_user_id: assignCountUserId,
      });
      setSelectedCount(data || null);
      setAssignCountOpen(false);
      setAssignCountUserId("");
      toast({ title: "Count assigned", description: `${selectedCount.count_id} assigned` });
      await loadCountPlans();
    } catch (e) {
      setAssignCountError(e.message || "Unable to assign count plan");
      toast({ title: "Assign failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleStartCount = async () => {
    if (!selectedCount) return;
    try {
      setBusyKey("start-count");
      const data = await startCountPlan(session, selectedCount.count_id);
      setSelectedCount(data || null);
      toast({ title: "Counting started", description: `${selectedCount.count_id} is ready for entry` });
      await loadCountPlans();
    } catch (e) {
      setCountError(e.message || "Unable to start count");
      toast({ title: "Start failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleAddEntry = async () => {
    if (!selectedCount) return;
    const validationError = validateCycleCountEntry(execForm);
    if (validationError) { setExecError(validationError); return; }
    const qty = Number(execForm.qty_counted);
    try {
      setBusyKey("add-entry"); setExecError("");
      const data = await addCountPlanEntry(session, selectedCount.count_id, {
        line_id: execForm.line_id || undefined,
        scan_mode: execForm.scan_mode,
        scanned_value: execForm.scanned_value || undefined,
        qty_counted: qty,
      });
      setSelectedCount(data?.plan || null);
      setExecForm((c) => ({ ...c, line_id: "", scanned_value: "", qty_counted: "" }));
      toast({ title: "Count saved" });
      await loadCountPlans();
    } catch (e) {
      setExecError(e.message || "Unable to add count entry");
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleSubmitCount = async () => {
    if (!selectedCount) return;
    try {
      setBusyKey("submit-count");
      const data = await submitCountPlan(session, selectedCount.count_id);
      setSelectedCount(data || null);
      toast({ title: "Count plan submitted", description: `${selectedCount.count_id} submitted` });
      await loadCountPlans();
    } catch (e) {
      setCountError(e.message || "Unable to submit count plan");
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleApproveCount = async () => {
    if (!selectedCount) return;
    if (!canReviewSelectedCount) {
      setApproveError("You cannot approve or reject this count because you created or submitted it.");
      return;
    }
    if (selectedCountHasVariance && !approveForm.reason_code) {
      setApproveError("Reason Code is required when cycle count contains inventory variance.");
      return;
    }
    try {
      setBusyKey("approve-count"); setApproveError("");
      const data = await approveCountPlan(session, selectedCount.count_id, {
        reason_code: approveForm.reason_code || undefined,
        approval_note: approveForm.approval_note.trim() || undefined,
      });
      setSelectedCount(data || null);
      toast({ title: "Count plan approved", description: `${selectedCount.count_id} approved` });
      await loadCountPlans(); await loadStock();
    } catch (e) {
      setApproveError(e.message || "Unable to approve count plan");
      toast({ title: "Approve failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleRejectCount = async (reason) => {
    if (!selectedCount) return;
    if (!canReviewSelectedCount) {
      setCountError("You cannot approve or reject this count because you created or submitted it.");
      return;
    }
    try {
      setBusyKey("reject-count");
      const data = await rejectCountPlan(session, selectedCount.count_id, { reason });
      setSelectedCount(data || null);
      setRejectCountOpen(false); setRejectCountReason(""); setRejectCountTouched(false);
      toast({ title: "Count plan rejected", description: `${selectedCount.count_id} rejected` });
      await loadCountPlans();
    } catch (e) {
      setCountError(e.message || "Unable to reject count plan");
      toast({ title: "Reject failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleCancelCount = async (reason) => {
    if (!cancelCountTarget) return;
    try {
      setBusyKey(`cancel-count-${cancelCountTarget.count_id}`);
      const data = await cancelCountPlan(session, cancelCountTarget.count_id, { reason });
      setCancelCountTarget(null);
      if (data?.count_id === selectedCountId) setSelectedCount(data);
      toast({ title: "Count plan cancelled", description: `${data?.count_id || cancelCountTarget.count_id} cancelled` });
      await loadCountPlans();
    } catch (e) {
      setCountError(e.message || "Unable to cancel count plan");
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const validateCreateAdjustment = () => {
    const errors = {};
    if (!String(createAdjForm.sku_id || "").trim()) errors.sku_id = "SKU is required";
    if (!createAdjForm.location_id) errors.location_id = "Location is required";
    const qty = Number(createAdjForm.qty_delta);
    if (!Number.isFinite(qty) || qty === 0) errors.qty_delta = "Quantity delta must be non-zero";
    if (!createAdjForm.reason_code) errors.reason_code = "Reason code is required";
    setCreateAdjErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateAdjustment = async () => {
    if (!validateCreateAdjustment()) { setCreateAdjConfirmOpen(false); return; }
    try {
      setBusyKey("create-adjustment"); setAdjustmentError("");
      const created = await createAdjustmentRequest(session, {
        sku_id: createAdjForm.sku_id,
        location_id: createAdjForm.location_id,
        qty_delta: Number(createAdjForm.qty_delta),
        reason_code: createAdjForm.reason_code,
      });
      setCreateAdjOpen(false); setCreateAdjConfirmOpen(false);
      setCreateAdjForm(createAdjustmentInitial); setCreateAdjErrors({});
      setAdjustmentError("");
      toast({ title: "Adjustment created", description: `${created.adj_id} created as Draft` });
      await loadAdjustments();
      setSelectedAdjustmentId(created.adj_id);
    } catch (e) {
      setAdjustmentError(e.message || "Unable to submit adjustment");
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleSubmitDraftAdjustment = async (adjId) => {
    try {
      setBusyKey(`submit-adj-${adjId}`);
      await submitAdjustmentRequest(session, adjId);
      toast({ title: "Adjustment submitted", description: `${adjId} submitted` });
      await loadAdjustments();
    } catch (e) {
      setAdjustmentError(e.message || "Unable to submit adjustment");
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleApproveAdjustment = async () => {
    if (!approveAdjTarget) return;
    const adjId = approveAdjTarget.adj_id;
    try {
      setBusyKey(`approve-adj-${adjId}`);
      const response = await approveAdjustment(session, adjId, { approval_note: approveAdjNote.trim() || undefined });
      setApproveAdjOpen(false); setApproveAdjNote(""); setApproveAdjTarget(null);
      toast({
        title: "Adjustment approved",
        description: response?.message || `${adjId} approved`,
      });
      await loadAdjustments(); await loadStock();
    } catch (e) {
      setAdjustmentError(e.message || "Unable to approve adjustment");
      toast({ title: "Approve failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleRejectAdjustment = async (reason) => {
    if (!rejectAdjTarget) return;
    try {
      setBusyKey(`reject-adj-${rejectAdjTarget.adj_id}`);
      await rejectAdjustment(session, rejectAdjTarget.adj_id, { reason });
      setRejectAdjOpen(false); setRejectAdjReason(""); setRejectAdjTouched(false); setRejectAdjTarget(null);
      toast({ title: "Adjustment rejected" });
      await loadAdjustments();
    } catch (e) {
      setAdjustmentError(e.message || "Unable to reject adjustment");
      toast({ title: "Reject failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleCancelAdjustment = async (reason) => {
    if (!cancelAdjTarget) return;
    try {
      setBusyKey(`cancel-adj-${cancelAdjTarget.adj_id}`);
      await cancelAdjustment(session, cancelAdjTarget.adj_id, { reason, confirmed: true });
      setCancelAdjTarget(null);
      toast({ title: "Adjustment cancelled" });
      await loadAdjustments();
    } catch (e) {
      setAdjustmentError(e.message || "Unable to cancel adjustment");
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  if (!session.tenant_id) {
    return (
      <GlossaryRegistry>
      <AppLayout>
        <Breadcrumbs items={[{ label: "Inventory" }]} />
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Inventory</h1>
        </div>
        <div style={cardStyle}>
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>
            Select a tenant before accessing inventory data.
          </div>
        </div>
      </AppLayout>
    </GlossaryRegistry>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <GlossaryRegistry>
    <AppLayout>
      <Breadcrumbs items={[{ label: "Inventory" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Inventory</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Manage stock, cycle counts and adjustment requests</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stock">Stock on Hand</TabsTrigger>
          <TabsTrigger value="cycle">Cycle Count</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
        </TabsList>

        {/* ── STOCK ON HAND ── */}
        <TabsContent value="stock" className="mt-4">
          <div style={cardStyle}>
            {/* Toolbar */}
            <Toolbar>
              <SearchInput
                value={stockFilters.search}
                onChange={(v) => updateStockFilter("search", v)}
                placeholder="Search SKU, description, location…"
              />
              <Select value={stockFilters.warehouse || "all"} onValueChange={(v) => {
                const warehouse = v === "all" ? "" : v;
                setStockFilters((current) => ({
                  ...current,
                  warehouse,
                  location: "",
                  zone: "",
                }));
                setStockPage(1);
              }}>
                <SelectTrigger style={{ height: 40, width: 190, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.warehouse_id} value={warehouse.warehouse_id}>
                      {warehouse.warehouse_code} - {warehouse.warehouse_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stockFilters.location || "all"} onValueChange={(v) => updateStockFilter("location", v === "all" ? "" : v)}>
                <SelectTrigger style={{ height: 40, width: 220, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations
                    .filter((item) => !stockFilters.warehouse || item.warehouse_id === stockFilters.warehouse)
                    .map((item) => (
                      <SelectItem key={item.location_id} value={item.location_id}>
                        {item.display_name || item.location_code}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={stockFilters.zone || "all"} onValueChange={(v) => updateStockFilter("zone", v === "all" ? "" : v)}>
                <SelectTrigger style={{ height: 40, width: 175, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Zones</SelectItem>
                  {zones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_code} — {z.zone_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div style={{ flex: 1 }} />
              <button style={btnNeutral} onClick={() => { setStockFilters(stockInitialFilters); setStockPage(1); }}>Clear</button>
              <button style={{ ...btnNeutral, opacity: stockLoading ? 0.6 : 1 }} onClick={loadStock} disabled={stockLoading}>Refresh</button>
            </Toolbar>

            {stockError && (
              <div style={{ margin: "10px 16px", padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
                {stockError}
              </div>
            )}

            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafbff" }}>
                  {["SKU ID", "Location", "Zone", "On Hand", "Reserved", "Available", "Quarantine"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: i >= 3 ? "right" : "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                      {h === "Quarantine" ? <GlossaryTerm term="Quarantine" /> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockLoading && (
                  <tr><td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading stock…</span>
                  </td></tr>
                )}
                {!stockLoading && stockRows.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No stock rows found.</td></tr>
                )}
                {!stockLoading && stockRows.map((row) => {
                  const isSel = selectedStockRow?.sku_id === row.sku_id && selectedStockRow?.location_id === row.location_id;
                  return (
                    <tr key={row.inventory_id || row.inv_balance_id || `${row.sku_id}-${row.location_id}-${row.lot_no || ""}-${row.serial_no || ""}`}
                      style={{ borderBottom: "0.5px solid #f0f0f0", cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent" }}
                      onClick={() => setSelectedStockRow(isSel ? null : row)}
                      onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#fafbff"; }}
                      onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.sku_id}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{row.display_name || row.location_code || row.location_id}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{row.zone_name ? `${row.zone_code || row.zone_id} - ${row.zone_name}` : row.zone_code || row.zone_id || "-"}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{fmtQty(row.on_hand_qty)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, color: T_SECONDARY }}>{fmtQty(row.reserved_qty)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, color: T_SECONDARY }}>{fmtQty(row.qty_available ?? row.available_qty)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, fontWeight: Number(row.quarantine_qty) > 0 ? 600 : 400, color: Number(row.quarantine_qty) > 0 ? "#991b1b" : T_SECONDARY }}>
                        {fmtQty(row.quarantine_qty)}
                      </td>
                    </tr>
                );
                })}
              </tbody>
            </table>

            {renderPagination(stockTotal, stockPage, stockPageSize, setStockPage, setStockPageSize, stockLoading)}

            {/* ── Stock Detail Panel ── */}
            {selectedStockRow && (
              <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
                <div style={{ padding: "16px 16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{selectedStockRow.sku_id}</span>
                    <span style={{ fontSize: 12, color: T_MUTED }}>Stock Detail</span>
                  </div>
                  <div style={{ overflowX: "auto", width: "100%" }}>
                    <div style={{ minWidth: 1040 }}>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(180px, 1.4fr) 80px minmax(250px, 2fr) minmax(150px, 1.2fr) repeat(4, minmax(95px, 0.8fr))",
                        columnGap: 16,
                        paddingBottom: 7,
                        borderBottom: "0.5px solid #eef0fc",
                      }}>
                        {["Product Name", "UOM", "Location", "Zone", "On Hand", "Reserved", "Available", "Quarantine"].map((label) => (
                          <div key={label} style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: T_LABEL,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            textAlign: ["On Hand", "Reserved", "Available", "Quarantine"].includes(label) ? "right" : "left",
                            whiteSpace: "nowrap",
                          }}>
                            {label}
                          </div>
                        ))}
                      </div>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(180px, 1.4fr) 80px minmax(250px, 2fr) minmax(150px, 1.2fr) repeat(4, minmax(95px, 0.8fr))",
                        columnGap: 16,
                        alignItems: "start",
                        paddingTop: 9,
                      }}>
                        <div style={{ minWidth: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                          {selectedStockRow.sku_description || selectedStockRow.description || "-"}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45 }}>
                          {selectedStockRow.uom || "-"}
                        </div>
                        <div
                          title={selectedStockRow.display_name || selectedStockRow.location_code || selectedStockRow.location_id}
                          style={{ minWidth: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.45, overflowWrap: "anywhere", wordBreak: "break-word" }}
                        >
                          {selectedStockRow.display_name || selectedStockRow.location_code || selectedStockRow.location_id || "-"}
                        </div>
                        <div style={{ minWidth: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                          {selectedStockRow.zone_name ? `${selectedStockRow.zone_code || selectedStockRow.zone_id} - ${selectedStockRow.zone_name}` : selectedStockRow.zone_code || selectedStockRow.zone_id || "-"}
                        </div>
                        {[
                          fmtQty(selectedStockRow.on_hand_qty),
                          fmtQty(selectedStockRow.reserved_qty),
                          fmtQty(selectedStockRow.qty_available ?? selectedStockRow.available_qty),
                          fmtQty(selectedStockRow.quarantine_qty),
                        ].map((value, index) => (
                          <div key={index} style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, textAlign: "right", whiteSpace: "nowrap" }}>
                            {value}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── CYCLE COUNT ── */}
        <TabsContent value="cycle" className="mt-4">
          <div style={cardStyle}>
            {/* Toolbar */}
            <Toolbar>
              <SearchInput
                value={countFilters.search}
                onChange={(v) => updateCountFilter("search", v)}
                placeholder="Search count ID or zone…"
              />
              <Select value={countFilters.status || "all"} onValueChange={(v) => updateCountFilter("status", v === "all" ? "" : v)}>
                <SelectTrigger style={{ height: 40, width: 155, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {cycleCountProcessStatuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={countFilters.zone || "all"} onValueChange={(v) => updateCountFilter("zone", v === "all" ? "" : v)}>
                <SelectTrigger style={{ height: 40, width: 155, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Zones</SelectItem>
                  {operationalCountZones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_id} — {z.zone_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <input type="date" placeholder="dd/mm/yyyy" value={countFilters.dateFrom}
                onChange={(e) => updateCountFilter("dateFrom", e.target.value)}
                style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
                aria-label="From Date"
              />
              <input type="date" placeholder="dd/mm/yyyy" value={countFilters.dateTo}
                onChange={(e) => updateCountFilter("dateTo", e.target.value)}
                style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
                aria-label="To Date"
              />
              <div style={{ flex: 1 }} />
              <button style={btnNeutral} onClick={() => { setCountFilters(countInitialFilters); setCountPage(1); setSelectedCountId(""); }}>Clear</button>
              <button style={{ ...btnNeutral, opacity: countLoading ? 0.6 : 1 }} onClick={loadCountPlans} disabled={countLoading}>Refresh</button>
              {canCreateCount && (
                <button style={btnPrimary} onClick={() => setCreateCountOpen(true)} disabled={Boolean(busyKey)}>+ New Count Plan</button>
              )}
            </Toolbar>

            {countError && (
              <div style={{ margin: "10px 16px", padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
                {countError}
              </div>
            )}

            {/* Count Plans Table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafbff" }}>
                  {["Count ID", "Zone", "Planned Date", "Lines", "Status"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: i === 3 ? "right" : "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {countLoading && (
                  <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>Loading…</td></tr>
                )}
                {!countLoading && countRows.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No count plans found.</td></tr>
                )}
                {!countLoading && countRows.map((row) => {
                  const isSel = selectedCountId === row.count_id;
                  return (
                    <tr key={row.count_id}
                      style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                      onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                      onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                      onClick={() => setSelectedCountId((prev) => prev === row.count_id ? "" : row.count_id)}
                    >
                      <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.count_id}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: T_PRIMARY }}>{row.zone_name ? `${row.zone_code || row.zone_id} - ${row.zone_name}` : row.zone_code || row.zone_id || "-"}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{formatDate(row.planned_date)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{Number(row.lines_count || 0).toLocaleString("en-US")}</td>
                      <td style={{ padding: "14px 16px" }}><StatusPill status={normalizeStatus(row.status)} /></td>
                    </tr>
                );
                })}
              </tbody>
            </table>

            {renderPagination(countTotal, countPage, countPageSize, setCountPage, setCountPageSize, countLoading)}

            {/* ── Count Detail Panel ── */}
            {selectedCountId && (
              <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
                <div style={{ padding: "18px 16px 16px" }}>

                  {countDetailLoading && (
                    <p style={{ fontSize: 13, color: T_SECONDARY, display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <Loader2 style={{ width: 14, height: 14 }} /> Loading detail…
                    </p>
                  )}

                  {selectedCount && (
                    <>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{selectedCount.count_id}</span>
                        <StatusPill status={normalizeStatus(selectedCount.status)} />
                      </div>

                      <DetailFieldGrid title="Cycle Count Information">
                        <DetailField label="Zone" value={selectedCount.zone_name ? `${selectedCount.zone_code || selectedCount.zone_id} - ${selectedCount.zone_name}` : selectedCount.zone_code || selectedCount.zone_id || "-"} />
                        <DetailField label="Planned Date" value={formatDate(selectedCount.planned_date)} />
                        <DetailField label="Lines" value={String((selectedCount.lines || []).length)} />
                        <DetailField label="Threshold" value={countConfig?.variance_threshold_mode === "absolute" ? `${countConfig?.variance_threshold_abs || 0} units` : `${countConfig?.variance_threshold_percent || 0}%`} />
                      </DetailFieldGrid>

                      <DetailFieldGrid title="Plan Information">
                        <DetailField label="Created By" value={actorDisplay(selectedCount, "created_by")} />
                        <DetailField label="Created At" value={formatDateTime(selectedCount.created_at)} />
                        <DetailField label="Assigned To" value={actorDisplay(selectedCount, "assigned_to")} />
                        <DetailField label="Assigned By" value={actorDisplay(selectedCount, "assigned_by")} />
                        <DetailField label="Assigned At" value={formatDateTime(selectedCount.assigned_at)} />
                      </DetailFieldGrid>

                      {(selectedCount.submitted_by || selectedCount.submitted_at) && (
                        <DetailFieldGrid title="Submission Information">
                          <DetailField label="Submitted By" value={actorDisplay(selectedCount, "submitted_by")} />
                          <DetailField label="Submitted At" value={formatDateTime(selectedCount.submitted_at)} />
                        </DetailFieldGrid>
                      )}

                      {["APPROVED", "REJECTED"].includes(String(selectedCount.status || "").toUpperCase()) && (() => {
                        const st = String(selectedCount.status || "").toUpperCase();
                        const note = st === "REJECTED"
                          ? selectedCount.rejection_note || selectedCount.rejection_reason || selectedCount.approval_note
                          : selectedCount.approval_note;
                        return (
                          <DetailFieldGrid title="Approval Information">
                            <DetailField
                              label={st === "REJECTED" ? "Rejected By" : "Approved By"}
                              value={actorDisplay(selectedCount, st === "REJECTED" ? "rejected_by" : "approved_by")}
                            />
                            <DetailField
                              label={st === "REJECTED" ? "Rejected At" : "Approved At"}
                              value={formatDateTime(st === "REJECTED" ? selectedCount.rejected_at : selectedCount.approved_at)}
                            />
                            <DetailField
                              label={st === "REJECTED" ? "Rejection Note" : "Approval Note"}
                              value={note || "-"}
                              danger={st === "REJECTED"}
                            />
                          </DetailFieldGrid>
                        );
                      })()}

                      {String(selectedCount.status || "").toUpperCase() === "CANCELLED" && selectedCount.cancellation_reason && (
                        <DetailFieldGrid title="Approval Information">
                          <DetailField label="Cancellation Reason" value={selectedCount.cancellation_reason} danger span />
                        </DetailFieldGrid>
                      )}
                      {/* Approve form */}
                      {selectedCountReviewBlocked && (
                        <div style={{ padding: "9px 12px", borderRadius: 8, border: "0.5px solid #fbbf24", background: "#fffbeb", marginBottom: 10 }}>
                          <p style={{ fontSize: 13, lineHeight: "20px", color: "#92400e", fontWeight: 600 }}>
                            You cannot approve or reject this count because you created or submitted it.
                          </p>
                        </div>
                      )}

                      {countSubmittedAwaitingManager && (
                        <div style={{ padding: "9px 12px", borderRadius: 8, border: "0.5px solid #bfdbfe", background: "#eff6ff", marginBottom: 10 }}>
                          <p style={{ fontSize: 13, lineHeight: "20px", color: "#1e40af", fontWeight: 600 }}>
                            This cycle count has been submitted and is awaiting Warehouse Manager approval.
                          </p>
                        </div>
                      )}

                      {canReviewSelectedCount && (
                        <div style={{ display: "grid", gridTemplateColumns: selectedCountHasVariance ? "1fr 1fr" : "1fr", gap: 10, padding: "11px 14px", borderRadius: 8, border: "0.5px solid #e5e7eb", marginBottom: 10 }}>
                          {selectedCountHasVariance && <div>
                            <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Reason Code <span style={{ color: "#991b1b" }}>*</span></p>
                            <Select value={approveForm.reason_code || "none"} onValueChange={(v) => { setApproveError(""); setApproveForm((c) => ({ ...c, reason_code: v === "none" ? "" : v })); }}>
                              <SelectTrigger style={{ height: 40, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff" }}>
                                <SelectValue placeholder="Select Reason" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Select Reason</SelectItem>
                                {reasonCodes.map((r) => <SelectItem key={r.reason_code} value={r.reason_code}>{r.reason_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>}
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Approval Note</p>
                            <Input value={approveForm.approval_note}
                              onChange={(e) => { setApproveError(""); setApproveForm((c) => ({ ...c, approval_note: e.target.value })); }}
                              placeholder="Optional note…"
                              style={{ height: 40, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7 }}
                            />
                          </div>
                          {(approveError || (selectedCountHasVariance && !approveForm.reason_code)) && (
                            <p style={{ gridColumn: "1/-1", fontSize: 12, color: "#991b1b" }}>
                              {approveError || "Reason Code is required when cycle count contains inventory variance."}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Count entry form */}
                      {canEditSelectedCountEntry && (
                        <div style={{ padding: "14px 16px", borderRadius: 8, border: "0.5px solid #e5e7eb", marginBottom: 14 }}>
                          <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Count Entry</p>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 10 }}>
                            {[
                              {
                                label: "Line",
                                content: (
                                  <Select value={execForm.line_id || "none"} onValueChange={(v) => { setExecError(""); setExecForm((c) => ({ ...c, line_id: v === "none" ? "" : v })); }}>
                                    <SelectTrigger style={{ height: 40, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff" }}><SelectValue placeholder="Auto Resolve" /></SelectTrigger>
                                    <SelectContent style={{ minWidth: 560, maxWidth: "min(760px, calc(100vw - 32px))" }}>
                                      <SelectItem value="none">Auto Resolve By Scan</SelectItem>
                                      {(selectedCount.lines || []).map((line) => (
                                        <SelectItem key={line.line_id} value={line.line_id} textValue={cycleCountLineLabel(line)}>
                                          <div style={{ minWidth: 0, padding: "3px 0" }}>
                                            <div style={{ fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>
                                              {line.line_id} · {line.sku_code || line.sku_id}
                                              {line.sku_code && line.sku_id ? ` / ${line.sku_id}` : ""}
                                            </div>
                                            <div style={{ fontSize: 12, color: T_SECONDARY, whiteSpace: "normal", overflowWrap: "anywhere" }}>
                                              {line.sku_description || line.description || "Unnamed product"} · {line.display_name || line.location_code || line.location_id || "Unknown location"} · System Qty {fmtQty(line.system_qty)}
                                            </div>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ),
                              },
                              {
                                label: "Scan Mode",
                                content: (
                                  <Select value={execForm.scan_mode} onValueChange={(v) => setExecForm((c) => ({ ...c, scan_mode: v }))}>
                                    <SelectTrigger style={{ height: 40, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff" }}><SelectValue /></SelectTrigger>
                                    <SelectContent>{scanModes.map((m) => <SelectItem key={m} value={m}>{fmtStatusLabel(m)}</SelectItem>)}</SelectContent>
                                  </Select>
                                ),
                              },
                              {
                                label: "Scan / Type SKU, Barcode, EPC, or Location",
                                content: (
                                  <>
                                    <Input value={execForm.scanned_value} onChange={(e) => { setExecError(""); setExecForm((c) => ({ ...c, scanned_value: e.target.value })); }} placeholder="e.g. SKU000006, TEST-BRG-001, EPC..., or location code" style={{ height: 40, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7 }} />
                                    <p style={{ marginTop: 5, fontSize: 11, lineHeight: 1.4, color: T_LABEL }}>
                                      Use this when scanning labels or typing SKU/location manually. The system will resolve it to a count line.
                                    </p>
                                  </>
                                ),
                              },
                              {
                                label: "Qty Counted",
                                content: <Input type="number" min="0" step="0.01" value={execForm.qty_counted} onChange={(e) => { setExecError(""); setExecForm((c) => ({ ...c, qty_counted: e.target.value })); }} placeholder="0" style={{ height: 40, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7 }} />,
                              },
                            ].map(({ label, content }) => (
                              <div key={label}>
                                <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</p>
                                {content}
                              </div>
                            ))}
                          </div>
                          {execError && <p style={{ fontSize: 12, color: "#991b1b", marginBottom: 8 }}>{execError}</p>}
                          <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)} onClick={handleAddEntry}>
                            {busyKey === "add-entry" ? "Saving..." : "Save"}
                          </button>
                        </div>
                      )}

                      <DetailSection title="Count Entry Lines">
                        <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflowX: "auto", overflowY: "hidden", background: "#fff" }}>
                        <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#f9fafb" }}>
                              {[["Line","left"],["SKU ID","left"],["Product Name","left"],["Category","left"],["Location","left"],["System Qty","right"],["Counted Qty","right"],["Variance","right"]].map(([h, align]) => (
                                <th key={h} style={{ padding: "9px 16px", textAlign: align, fontSize: 12, fontWeight: 500, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL, whiteSpace: "nowrap" }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {!(selectedCount.lines || []).length && (
                              <tr><td colSpan={8} style={{ padding: "20px 14px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No lines found.</td></tr>
                            )}
                            {(selectedCount.lines || []).map((line) => {
                              const variance = getCycleCountVariance(line);
                              return (
                              <tr key={line.line_id} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                                <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: T_SECONDARY }}>{line.line_id}</td>
                                <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{line.sku_id}</td>
                                <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY }}>{line.sku_description || line.description || "-"}</td>
                                <td style={{ padding: "10px 16px" }}>
                                  <span style={{ fontSize: 11, color: "#6366f1", background: "#eef2ff", padding: "2px 8px", borderRadius: 4, fontWeight: 600, whiteSpace: "nowrap" }}>{line.category || "-"}</span>
                                </td>
                                <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{line.display_name || locationMap.get(line.location_id)?.display_name || line.location_code || locationMap.get(line.location_id)?.location_code || line.location_id || "-"}</td>
                                <td style={{ padding: "10px 16px", textAlign: "right", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{fmtQty(line.system_qty)}</td>
                                <td style={{ padding: "10px 16px", textAlign: "right", fontSize: 13, color: T_PRIMARY }}>{line.counted_qty == null ? "-" : fmtQty(line.counted_qty)}</td>
                                <td style={{ padding: "10px 16px", textAlign: "right", fontSize: 13, color: variance < 0 ? "#991b1b" : variance > 0 ? "#065f46" : T_PRIMARY, fontWeight: variance !== null ? 600 : 400 }}>
                                  {variance === null ? "-" : (variance > 0 ? "+" : "") + fmtQty(variance)}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </DetailSection>

                      {/* Actions */}
                      {(canEditSelectedCount || canAssignSelectedCount || canStartSelectedCount || canSubmitCount || canReviewSelectedCount || canCancelSelectedCount) && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canEditSelectedCount && (
                            <button
                              style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }}
                              disabled={Boolean(busyKey)}
                              onClick={() => {
                                setEditCountTarget(selectedCount);
                                setCreateCountForm({
                                  zone_id: selectedCount.zone_id || "",
                                  planned_date: String(selectedCount.planned_date || "").slice(0, 10),
                                  scope_type: selectedCount.scope_type || "FULL_ZONE",
                                  scope_location_id: selectedCount.scope_location_id || "",
                                  scope_sku_ids: Array.isArray(selectedCount.scope_sku_ids)
                                    ? selectedCount.scope_sku_ids.join(",")
                                    : String(selectedCount.scope_sku_ids || ""),
                                });
                                setCreateCountErrors({});
                                setCreateCountOpen(true);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {canAssignSelectedCount && (
                            <button
                              style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }}
                              disabled={Boolean(busyKey)}
                              onClick={() => {
                                setAssignCountUserId(selectedCount.assigned_to_user_id || "");
                                setAssignCountError("");
                                setAssignCountOpen(true);
                              }}
                            >
                              Assign
                            </button>
                          )}
                          {canStartSelectedCount && (
                            <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)} onClick={handleStartCount}>
                              {busyKey === "start-count" ? "Starting..." : "Start Counting"}
                            </button>
                          )}
                          {canSubmitCount && selectedCountStatus === "COUNTING" && (
                            <button style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)} onClick={handleSubmitCount}>
                              {busyKey === "submit-count" ? "Submitting…" : "Submit For Approval"}
                            </button>
                          )}
                          {canReviewSelectedCount && (
                            <button
                              style={{ ...btnPrimary, opacity: Boolean(busyKey) || (selectedCountHasVariance && !approveForm.reason_code) ? 0.55 : 1 }}
                              disabled={Boolean(busyKey) || (selectedCountHasVariance && !approveForm.reason_code)}
                              onClick={handleApproveCount}
                            >
                              {busyKey === "approve-count" ? "Approving…" : "Approve"}
                            </button>
                          )}
                          {canReviewSelectedCount && (
                            <button style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                              onClick={() => { setRejectCountOpen(true); setRejectCountReason(""); setRejectCountTouched(false); }}>
                              Reject
                            </button>
                          )}
                          {canCancelSelectedCount && (
                            <button style={{ ...btnDanger, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)} onClick={() => setCancelCountTarget(selectedCount)}>
                              {busyKey === `cancel-count-${selectedCount.count_id}` ? "Cancelling…" : "Cancel Count"}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── ADJUSTMENTS ── */}
        <TabsContent value="adjustments" className="mt-4">
          <div style={cardStyle}>
            {/* Toolbar */}
            <Toolbar>
              <SearchInput
                value={adjustmentFilters.search}
                onChange={(v) => updateAdjustmentFilter("search", v)}
                placeholder="Search ADJ ID, SKU, location…"
              />
              <Select value={adjustmentFilters.status || "all"} onValueChange={(v) => updateAdjustmentFilter("status", v === "all" ? "" : v)}>
              <SelectTrigger style={{ height: 40, width: 175, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {adjustmentStatuses.map((s) => <SelectItem key={s} value={s}>{fmtStatusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <input type="date" placeholder="dd/mm/yyyy" value={adjustmentFilters.dateFrom}
                onChange={(e) => updateAdjustmentFilter("dateFrom", e.target.value)}
                style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
                aria-label="From Date"
              />
              <input type="date" placeholder="dd/mm/yyyy" value={adjustmentFilters.dateTo}
                onChange={(e) => updateAdjustmentFilter("dateTo", e.target.value)}
                style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
                aria-label="To Date"
              />
              <div style={{ flex: 1 }} />
              <button style={btnNeutral} onClick={() => { setAdjustmentFilters(adjustmentInitialFilters); setAdjustmentPage(1); setSelectedAdjustmentId(""); }}>Clear</button>
              <button style={{ ...btnNeutral, opacity: adjustmentLoading ? 0.6 : 1 }} onClick={loadAdjustments} disabled={adjustmentLoading}>Refresh</button>
              {canCreateAdj && (
                <button style={btnPrimary} onClick={() => setCreateAdjOpen(true)} disabled={Boolean(busyKey)}>+ New Adjustment</button>
              )}
            </Toolbar>

            {adjustmentError && (
              <div style={{ margin: "10px 16px", padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
                {adjustmentError}
              </div>
            )}

            {/* Adjustments Table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafbff" }}>
                  {[["ADJ ID","left"],["SKU ID","left"],["Location","left"],["Adjustment Qty","right"],["Reason","left"],["Status","left"],["Requested At","left"]].map(([h, align]) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: align, fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                      {h === "Adjustment Qty" ? <GlossaryTerm term="Qty Delta" /> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adjustmentLoading && (
                  <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>Loading…</td></tr>
                )}
                {!adjustmentLoading && adjustmentRows.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No adjustments found.</td></tr>
                )}
                {!adjustmentLoading && adjustmentRows.map((row) => {
                  const isSel = selectedAdjustmentId === row.adj_id;
                  return (
                    <tr key={row.adj_id}
                      style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                      onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                      onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                      onClick={() => setSelectedAdjustmentId((prev) => prev === row.adj_id ? "" : row.adj_id)}
                    >
                      <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.adj_id}</td>
                      <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.sku_id}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{row.display_name || locationMap.get(row.location_id)?.display_name || row.location_code || locationMap.get(row.location_id)?.location_code || row.location_id || "-"}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: Number(row.qty_delta) < 0 ? "#991b1b" : "#065f46" }}>{Number(row.qty_delta) > 0 ? "+" : ""}{fmtQty(row.qty_delta)}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{reasonMap.get(row.reason_code)?.reason_name || row.reason_code}</td>
                      <td style={{ padding: "14px 16px" }}><StatusPill status={normalizeStatus(row.status)} /></td>
                      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_MUTED }}>{formatDateTime(row.requested_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {renderPagination(adjustmentTotal, adjustmentPage, adjustmentPageSize, setAdjustmentPage, setAdjustmentPageSize, adjustmentLoading)}

            {/* ── Adjustment Detail Panel ── */}
            {selectedAdjustment && (
              <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
                <div style={{ padding: "18px 16px 16px" }}>

                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{selectedAdjustment.adj_id}</span>
                    <StatusPill status={normalizeStatus(selectedAdjustment.status)} />
                  </div>

                  <DetailFieldGrid title="Adjustment Information">
                    <DetailField label="Warehouse" value={warehouseMap.get(selectedAdjustment.warehouse_id)?.warehouse_name || warehouseMap.get(selectedAdjustment.warehouse_id)?.warehouse_code || selectedAdjustment.warehouse_id || "-"} />
                    <DetailField label="Location" value={selectedAdjustment.display_name || locationMap.get(selectedAdjustment.location_id)?.display_name || selectedAdjustment.location_code || locationMap.get(selectedAdjustment.location_id)?.location_code || selectedAdjustment.location_id || "-"} />
                    <DetailField label="Reason Code" value={selectedAdjustment.reason_code ? (reasonMap.get(selectedAdjustment.reason_code)?.reason_name || selectedAdjustment.reason_code) : "-"} />
                    <DetailField label="Adjustment Type" value={Number(selectedAdjustment.qty_delta) >= 0 ? "Increase" : "Decrease"} />
                    <DetailField label="Total Lines" value="1" />
                  </DetailFieldGrid>

                  <DetailFieldGrid title="Request Information">
                    <DetailField label="Requested By" value={actorDisplay(selectedAdjustment, "requested_by")} />
                    <DetailField label="Requested At" value={formatDateTime(selectedAdjustment.requested_at)} />
                    <DetailField label="Notes" value={selectedAdjustment.notes || "-"} />
                    {selectedAdjustment.assigned_to_user_id && <DetailField label="Assigned To" value={actorDisplay(selectedAdjustment, "assigned_to")} />}
                    {selectedAdjustment.assigned_by && <DetailField label="Assigned By" value={actorDisplay(selectedAdjustment, "assigned_by")} />}
                    {selectedAdjustment.assigned_at && <DetailField label="Assigned At" value={formatDateTime(selectedAdjustment.assigned_at)} />}
                  </DetailFieldGrid>

                  {(["APPROVED", "REJECTED"].includes(String(selectedAdjustment.status).toUpperCase())) && (() => {
                    const st = String(selectedAdjustment.status).toUpperCase();
                    const note = st === "REJECTED"
                      ? selectedAdjustment.rejection_reason || selectedAdjustment.approval_note
                      : selectedAdjustment.approval_note;
                    return (
                      <DetailFieldGrid title="Approval Information">
                        <DetailField
                          label={st === "REJECTED" ? "Rejected By" : "Approved By"}
                          value={actorDisplay(selectedAdjustment, st === "REJECTED" ? "rejected_by" : "approved_by")}
                        />
                        <DetailField
                          label={st === "REJECTED" ? "Rejected At" : "Approved At"}
                          value={formatDateTime(st === "REJECTED" ? selectedAdjustment.rejected_at : selectedAdjustment.approved_at)}
                        />
                        <DetailField
                          label={st === "REJECTED" ? "Rejection Note" : "Approval Note"}
                          value={note || "-"}
                          danger={st === "REJECTED"}
                        />
                      </DetailFieldGrid>
                    );
                  })()}

                  <DetailSection title="Adjustment Lines">
                    <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflowX: "auto", overflowY: "hidden", background: "#fff" }}>
                      <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#f9fafb" }}>
                            {[["SKU ID","left"],["Product Name","left"],["Location","left"],["Adjustment Qty","right"],["Reason","left"]].map(([h, align]) => (
                              <th key={h} style={{ padding: "9px 16px", textAlign: align, fontSize: 12, fontWeight: 500, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL, whiteSpace: "nowrap" }}>
                                {h === "Adjustment Qty" ? <GlossaryTerm term="Qty Delta" /> : h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderTop: "0.5px solid #f0f0f0" }}>
                            <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: T_SECONDARY }}>{selectedAdjustment.sku_id}</td>
                            <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY }}>{selectedAdjustment.sku_description || selectedAdjustment.description || "-"}</td>
                            <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{selectedAdjustment.display_name || locationMap.get(selectedAdjustment.location_id)?.display_name || selectedAdjustment.location_code || locationMap.get(selectedAdjustment.location_id)?.location_code || selectedAdjustment.location_id || "-"}</td>
                            <td style={{ padding: "10px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: Number(selectedAdjustment.qty_delta) < 0 ? "#991b1b" : "#065f46" }}>{Number(selectedAdjustment.qty_delta) > 0 ? "+" : ""}{fmtQty(selectedAdjustment.qty_delta)}</td>
                            <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{reasonMap.get(selectedAdjustment.reason_code)?.reason_name || selectedAdjustment.reason_code || "-"}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </DetailSection>

                  {/* Actions */}
                  {(canSubmitSelectedAdjustment || canReviewSelectedAdjustment || canCancelSelectedAdjustment) && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 12, borderTop: "0.5px solid #eef0fc" }}>
                        {canSubmitSelectedAdjustment && (
                          <button style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                            onClick={() => handleSubmitDraftAdjustment(selectedAdjustment.adj_id)}>
                            {busyKey === `submit-adj-${selectedAdjustment.adj_id}` ? "Submitting…" : "Submit For Approval"}
                          </button>
                        )}
                        {canReviewSelectedAdjustment && (
                          <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                            onClick={() => { setApproveAdjTarget(selectedAdjustment); setApproveAdjNote(""); setApproveAdjOpen(true); }}>
                            Approve
                          </button>
                        )}
                        {canReviewSelectedAdjustment && (
                          <button style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                            onClick={() => { setRejectAdjTarget(selectedAdjustment); setRejectAdjReason(""); setRejectAdjTouched(false); setRejectAdjOpen(true); }}>
                            Reject
                          </button>
                        )}
                        {canCancelSelectedAdjustment && (
                          <button style={{ ...btnDanger, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                            onClick={() => setCancelAdjTarget(selectedAdjustment)}>
                            {busyKey === `cancel-adj-${selectedAdjustment.adj_id}` ? "Cancelling…" : "Cancel Adjustment"}
                          </button>
                        )}
                      </div>
                  )}
                </div>
              </div>
            )}


          </div>
        </TabsContent>
      </Tabs>

      {/* ── DIALOGS ── */}

      {/* Create Count Plan */}
      <Dialog open={createCountOpen} onOpenChange={(open) => { setCreateCountOpen(open); if (!open) { setCreateCountForm(createCountInitial); setCreateCountErrors({}); setEditCountTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCountTarget ? "Edit Count Plan" : "New Count Plan"}</DialogTitle>
            <DialogDescription>{editCountTarget ? "Edit this draft cycle count plan by zone and scope." : "Create a cycle count plan by zone and scope."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Zone</Label>
              <Select value={createCountForm.zone_id || "none"} onValueChange={(v) => { setCreateCountErrors((c) => ({ ...c, zone_id: "" })); setCreateCountForm((c) => ({ ...c, zone_id: v === "none" ? "" : v })); }}>
                <SelectTrigger><SelectValue placeholder="Select Zone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select Zone</SelectItem>
                  {operationalCountZones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_id} — {z.zone_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {createCountErrors.zone_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createCountErrors.zone_id}</p>}
            </div>
            <div className="space-y-1">
              <Label>Planned Date</Label>
              <Input type="date" value={createCountForm.planned_date} onChange={(e) => setCreateCountForm((c) => ({ ...c, planned_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Scope Type</Label>
              <Select value={createCountForm.scope_type} onValueChange={(v) => setCreateCountForm((c) => ({ ...c, scope_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_ZONE">Full Zone</SelectItem>
                  <SelectItem value="BY_LOCATION">By Location</SelectItem>
                  <SelectItem value="BY_SKU">By SKU</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createCountForm.scope_type === "BY_LOCATION" && (
              <div className="space-y-1">
                <Label>Location</Label>
                <Select value={createCountForm.scope_location_id || "none"} onValueChange={(v) => { setCreateCountErrors((c) => ({ ...c, scope_location_id: "" })); setCreateCountForm((c) => ({ ...c, scope_location_id: v === "none" ? "" : v })); }}>
                  <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select Location</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.location_id} value={l.location_id}>
                        {l.display_name || l.location_code} ({l.location_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createCountErrors.scope_location_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createCountErrors.scope_location_id}</p>}
              </div>
            )}
            {createCountForm.scope_type === "BY_SKU" && (
              <div className="space-y-1">
                <Label>SKUs</Label>
                <SkuCombobox
                  session={session}
                  value=""
                  excludeIds={parseScopeSkus(createCountForm.scope_sku_ids).values}
                  onChange={(skuId) => {
                    if (!skuId) return;
                    setCreateCountErrors((current) => ({ ...current, scope_sku_ids: "" }));
                    setCreateCountForm((current) => {
                      const selected = parseScopeSkus(current.scope_sku_ids).values;
                      return {
                        ...current,
                        scope_sku_ids: [...selected, skuId].join(","),
                      };
                    });
                  }}
                  placeholder="Search and add active SKU..."
                />
                {parseScopeSkus(createCountForm.scope_sku_ids).values.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {parseScopeSkus(createCountForm.scope_sku_ids).values.map((skuId) => (
                      <button
                        type="button"
                        key={skuId}
                        onClick={() => setCreateCountForm((current) => ({
                          ...current,
                          scope_sku_ids: parseScopeSkus(current.scope_sku_ids).values
                            .filter((id) => id !== skuId)
                            .join(","),
                        }))}
                        style={{ ...btnOutline, height: 26 }}
                      >
                        {skuId} x
                      </button>
                    ))}
                  </div>
                )}
                {createCountErrors.scope_sku_ids && <p style={{ fontSize: 12, color: "#991b1b" }}>{createCountErrors.scope_sku_ids}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <button style={btnNeutral} onClick={() => setCreateCountOpen(false)} disabled={Boolean(busyKey)}>Back</button>
            <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.6 : 1 }} onClick={handleCreateCount} disabled={Boolean(busyKey)}>
              {busyKey === "create-count" ? "Creating…" : busyKey === "edit-count" ? "Saving..." : editCountTarget ? "Save Changes" : "Create Plan"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Adjustment */}
      <Dialog open={createAdjOpen} onOpenChange={(open) => { setCreateAdjOpen(open); if (!open) { setCreateAdjConfirmOpen(false); setCreateAdjForm(createAdjustmentInitial); setCreateAdjErrors({}); setAdjustmentLocations([]); setAdjustmentLocationsError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Adjustment</DialogTitle>
            <DialogDescription>Create a new adjustment request. Review and submit for approval after.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>SKU</Label>
              <SkuCombobox session={session} value={createAdjForm.sku_id} onChange={(v) => { setCreateAdjErrors((c) => ({ ...c, sku_id: "", location_id: "" })); setCreateAdjForm((c) => ({ ...c, sku_id: v, location_id: "" })); }} error={createAdjErrors.sku_id} />
              {createAdjErrors.sku_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createAdjErrors.sku_id}</p>}
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Select
                value={createAdjForm.location_id || "none"}
                onValueChange={(v) => { setCreateAdjErrors((c) => ({ ...c, location_id: "" })); setCreateAdjForm((c) => ({ ...c, location_id: v === "none" ? "" : v })); }}
                disabled={!createAdjForm.sku_id || adjustmentLocationsLoading}
              >
                <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {!createAdjForm.sku_id ? "Select SKU first" : adjustmentLocationsLoading ? "Loading locations..." : "Select Location"}
                  </SelectItem>
                  {adjustmentLocations.map((l) => (
                    <SelectItem key={l.location_id} value={l.location_id} textValue={`${l.display_name || l.location_code || l.location_id} ${l.location_id}`}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, whiteSpace: "normal" }}>
                        <span style={{ fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>
                          {l.display_name || l.location_code || l.location_id}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_LABEL }}>
                          On Hand: {fmtQty(l.on_hand_qty ?? l.qty_on_hand)} · Available: {fmtQty(l.available_qty ?? l.qty_available)} · Reserved: {fmtQty(l.reserved_qty ?? l.qty_reserved)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {adjustmentLocationsError && <p style={{ fontSize: 12, color: "#991b1b" }}>{adjustmentLocationsError}</p>}
              {createAdjForm.sku_id && !adjustmentLocationsLoading && !adjustmentLocationsError && adjustmentLocations.length === 0 && (
                <p style={{ fontSize: 12, color: T_LABEL }}>No active adjustment locations are available for this SKU in the selected warehouse.</p>
              )}
              {createAdjErrors.location_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createAdjErrors.location_id}</p>}
            </div>
            <div className="space-y-1">
              <Label>Adjustment Qty</Label>
              <Input type="number" step="0.01" value={createAdjForm.qty_delta}
                onChange={(e) => { setCreateAdjErrors((c) => ({ ...c, qty_delta: "" })); setCreateAdjForm((c) => ({ ...c, qty_delta: e.target.value })); }}
                placeholder="Positive / negative quantity"
              />
              {createAdjErrors.qty_delta && <p style={{ fontSize: 12, color: "#991b1b" }}>{createAdjErrors.qty_delta}</p>}
            </div>
            <div className="space-y-1">
              <Label>Reason Code</Label>
              <Select value={createAdjForm.reason_code || "none"} onValueChange={(v) => { setCreateAdjErrors((c) => ({ ...c, reason_code: "" })); setCreateAdjForm((c) => ({ ...c, reason_code: v === "none" ? "" : v })); }}>
                <SelectTrigger><SelectValue placeholder="Select Reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select Reason</SelectItem>
                  {reasonCodes.map((r) => <SelectItem key={r.reason_code} value={r.reason_code}>{r.reason_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {createAdjErrors.reason_code && <p style={{ fontSize: 12, color: "#991b1b" }}>{createAdjErrors.reason_code}</p>}
            </div>
          </div>
          <DialogFooter>
            <button style={btnNeutral} onClick={() => setCreateAdjOpen(false)} disabled={Boolean(busyKey)}>Back</button>
            <button style={btnPrimary} onClick={() => { if (validateCreateAdjustment()) setCreateAdjConfirmOpen(true); }} disabled={Boolean(busyKey)}>
              Review & Submit
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Adjustment */}
      <Dialog open={approveAdjOpen} onOpenChange={(open) => { if (!Boolean(busyKey)) { setApproveAdjOpen(open); if (!open) { setApproveAdjNote(""); setApproveAdjTarget(null); } } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Adjustment</DialogTitle>
            <DialogDescription>
              This Adjustment will be approved. Inventory quantities will be updated. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {approveAdjTarget && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 14px", borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", marginBottom: 4 }}>
              <DetailField label="SKU"       value={approveAdjTarget.sku_id} mono />
              <DetailField label="Adjustment Qty">
                <span style={{ color: Number(approveAdjTarget.qty_delta) < 0 ? "#991b1b" : "#065f46" }}>
                  {Number(approveAdjTarget.qty_delta) > 0 ? "+" : ""}{fmtQty(approveAdjTarget.qty_delta)}
                </span>
              </DetailField>
              <DetailField label="Reason" value={reasonMap.get(approveAdjTarget.reason_code)?.reason_name || approveAdjTarget.reason_code} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Approval Note <span style={{ color: T_MUTED, fontWeight: 400 }}>(optional)</span></Label>
            <Input value={approveAdjNote} onChange={(e) => setApproveAdjNote(e.target.value)} placeholder="e.g. Verified physically, approved." disabled={Boolean(busyKey)} />
          </div>
          <DialogFooter>
            <button style={btnNeutral} onClick={() => setApproveAdjOpen(false)} disabled={Boolean(busyKey)}>Back</button>
            <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.6 : 1 }} onClick={handleApproveAdjustment} disabled={Boolean(busyKey)}>
              {Boolean(busyKey) ? "Approving…" : "Confirm Approve"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={createAdjConfirmOpen}
        onClose={() => setCreateAdjConfirmOpen(false)}
        onConfirm={handleCreateAdjustment}
        title="Confirm New Adjustment"
        description="Create this adjustment request as Draft?"
        confirmLabel={busyKey === "create-adjustment" ? "Creating…" : "Confirm Create"}
      />

      <Dialog open={assignCountOpen} onOpenChange={(open) => { if (!Boolean(busyKey)) { setAssignCountOpen(open); if (!open) { setAssignCountError(""); setAssignCountUserId(""); } } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Cycle Count</DialogTitle>
            <DialogDescription>Select the warehouse operator who will perform {selectedCount?.count_id || "this count"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Operator</Label>
            <Select value={assignCountUserId || "none"} onValueChange={(v) => { setAssignCountError(""); setAssignCountUserId(v === "none" ? "" : v); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select operator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select operator</SelectItem>
                {countOperators.map((operator) => (
                  <SelectItem key={operator.user_id} value={operator.user_id}>
                    {operator.display_name || `${operator.user_name || "Operator"} (${operator.user_id})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignCountError && <p style={{ fontSize: 12, color: "#991b1b" }}>{assignCountError}</p>}
            {!countOperators.length && (
              <p style={{ fontSize: 12, color: T_SECONDARY }}>No operational warehouse operators are available for this warehouse.</p>
            )}
          </div>
          <DialogFooter>
            <button style={btnNeutral} onClick={() => setAssignCountOpen(false)} disabled={Boolean(busyKey)}>Back</button>
            <button
              style={{ ...btnPrimary, opacity: Boolean(busyKey) || !assignCountUserId ? 0.55 : 1 }}
              onClick={handleAssignCount}
              disabled={Boolean(busyKey) || !assignCountUserId}
            >
              {busyKey === "assign-count" ? "Assigning..." : "Confirm Assign"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={rejectCountOpen} onOpenChange={setRejectCountOpen}
        title="Reject Count Plan"
        description={`Provide rejection reason for ${selectedCount?.count_id || "count plan"}.`}
        reason={rejectCountReason} setReason={setRejectCountReason}
        touched={rejectCountTouched} setTouched={setRejectCountTouched}
        submitting={busyKey === "reject-count"}
        confirmLabel="Confirm Reject"
        onConfirm={handleRejectCount}
      />

      <ReasonDialog
        open={rejectAdjOpen} onOpenChange={setRejectAdjOpen}
        title="Reject Adjustment"
        description={(
          <>
            This Adjustment request will be rejected. No inventory movement will be posted. Reason is required.
          </>
        )}
        reason={rejectAdjReason} setReason={setRejectAdjReason}
        touched={rejectAdjTouched} setTouched={setRejectAdjTouched}
        submitting={Boolean(rejectAdjTarget && busyKey === `reject-adj-${rejectAdjTarget.adj_id}`)}
        confirmLabel="Confirm Reject"
        onConfirm={handleRejectAdjustment}
      />

      <CancellationConfirmModal
        open={Boolean(cancelCountTarget)}
        documentType="count plan"
        documentId={cancelCountTarget?.count_id || ""}
        onClose={() => setCancelCountTarget(null)}
        onConfirm={handleCancelCount}
        submitting={Boolean(cancelCountTarget && busyKey === `cancel-count-${cancelCountTarget.count_id}`)}
      />

      <CancellationConfirmModal
        open={Boolean(cancelAdjTarget)}
        documentType="adjustment"
        documentId={cancelAdjTarget?.adj_id || ""}
        title="Cancel Adjustment"
        description={(
          <>
            This will cancel the Adjustment request before approval. This action will not update inventory stock. The request status will become Cancelled. Reason is required.
          </>
        )}
        confirmLabel="Cancel Adjustment"
        onClose={() => setCancelAdjTarget(null)}
        onConfirm={handleCancelAdjustment}
        submitting={Boolean(cancelAdjTarget && busyKey === `cancel-adj-${cancelAdjTarget.adj_id}`)}
      />
    </AppLayout>
    </GlossaryRegistry>
  );
};

export default InventoryPage;
