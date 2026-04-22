import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  addCountPlanEntry,
  approveAdjustmentRequest as approveAdjustment,
  approveCountPlan,
  cancelAdjustmentRequest as cancelAdjustment,
  cancelCountPlan,
  createAdjustmentRequest,
  createCountPlan,
  fetchAdjustmentRequests,
  fetchCountPlanById,
  fetchCountPlans,
  fetchInventoryOptions,
  fetchInventorySummary,
  rejectAdjustmentRequest as rejectAdjustment,
  rejectCountPlan,
  submitAdjustmentRequest,
  submitCountPlan,
  toSessionContext,
} from "@/services/api";

// ── Design tokens (identical to ReturnsPage) ──────────────────────────────────
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

const cardStyle = {
  background: "#fff", borderRadius: 12,
  border: "0.5px solid #e8ebf8", overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:       { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Draft" },
  in_progress: { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "In Progress" },
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
function DetailField({ label, value, danger, span, mono, children }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 14, fontWeight: 500, color: danger ? "#991b1b" : T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
        {children ?? value ?? "—"}
      </p>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const roleAliases = {
  superadmin: "superadmin", hqadmin: "hqadmin",
  storemanager: "storemanager", storeoperator: "storeoperator",
  warehousemanager: "storemanager", storekeeper: "storeoperator",
  warehouseclerk: "storeoperator",
};

const pageSizes = [10, 20, 50];
const countStatuses = ["DRAFT", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"];
const adjustmentStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"];
const scanModes = ["MANUAL", "QR", "RFID"];

const stockInitialFilters      = { search: "", zone: "" };
const countInitialFilters      = { search: "", status: "", zone: "", dateFrom: "", dateTo: "" };
const adjustmentInitialFilters = { search: "", status: "" };

const inventoryQueryViews          = new Set(["stock", "cycle", "adjustments", "exceptions"]);
const adjustmentStatusQueryValues  = new Set(["open", "draft", "submitted", "approved", "rejected", "cancelled"]);

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

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function fmtDate(value) {
  if (!value) return "—";
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) { const [, y, m, d] = dateOnly; return `${d}/${m}/${y}`; }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-GB");
}

function fmtDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtQty(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function fmtStatusLabel(value) {
  return String(value || "").toLowerCase().replace(/_/g, " ")
    .split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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
        style={{ width: "100%", height: 34, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 14, color: T_PRIMARY, outline: "none", background: "#fff" }}
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
      <span style={{ fontSize: 13, color: T_SECONDARY }}>
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

  const canCreateCount      = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canExecuteCount     = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canSubmitCount      = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canApproveCount     = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canCancelCountByRole = canApproveCount;
  const canCreateAdj        = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canSubmitAdj        = canCreateAdj;
  const canApproveAdj       = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canCancelAdjByRole  = canApproveAdj;

  const [activeTab, setActiveTab] = useState("stock");
  const [busyKey, setBusyKey]     = useState("");

  const [zones, setZones]           = useState([]);
  const [locations, setLocations]   = useState([]);
  const [reasonCodes, setReasonCodes] = useState([]);
  const [skus, setSkus]             = useState([]);
  const [countConfig, setCountConfig] = useState(null);

  // Stock
  const [stockFilters, setStockFilters]   = useState(stockInitialFilters);
  const [allStockRows, setAllStockRows]   = useState([]);
  const [stockPage, setStockPage]         = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);
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

  // ── Client-side filter + paginate ─────────────────────────────────────────
  const filteredCountRows = useMemo(() => {
    let rows = allCountRows;
    const q = countFilters.search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.count_id || "").toLowerCase().includes(q) || (r.zone_id || "").toLowerCase().includes(q));
    if (countFilters.status) rows = rows.filter((r) => (r.status || "").toUpperCase() === countFilters.status);
    if (countFilters.zone)   rows = rows.filter((r) => (r.zone_id || "") === countFilters.zone);
    if (countFilters.dateFrom) rows = rows.filter((r) => r.planned_date && String(r.planned_date).slice(0, 10) >= countFilters.dateFrom);
    if (countFilters.dateTo)   rows = rows.filter((r) => r.planned_date && String(r.planned_date).slice(0, 10) <= countFilters.dateTo);
    return rows;
  }, [allCountRows, countFilters]);

  const countTotal = filteredCountRows.length;
  const countRows  = useMemo(() => filteredCountRows.slice((countPage - 1) * countPageSize, countPage * countPageSize), [filteredCountRows, countPage, countPageSize]);

  const filteredStockRows = useMemo(() => {
    let rows = allStockRows;
    const q = stockFilters.search.trim().toLowerCase();
    if (q) rows = rows.filter((r) =>
      (r.sku_id || "").toLowerCase().includes(q) ||
      (r.sku_description || "").toLowerCase().includes(q) ||
      (r.location_code || r.location_id || "").toLowerCase().includes(q) ||
      (r.zone_id || "").toLowerCase().includes(q)
    );
    if (stockFilters.zone) rows = rows.filter((r) => (r.zone_id || "") === stockFilters.zone);
    return rows;
  }, [allStockRows, stockFilters]);

  const stockTotal = filteredStockRows.length;
  const stockRows  = useMemo(() => filteredStockRows.slice((stockPage - 1) * stockPageSize, stockPage * stockPageSize), [filteredStockRows, stockPage, stockPageSize]);

  const filteredAdjRows = useMemo(() => {
    let rows = [...allAdjRows].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
    const q = adjustmentFilters.search.trim().toLowerCase();
    if (q) rows = rows.filter((r) =>
      (r.adj_id || "").toLowerCase().includes(q) ||
      (r.sku_id || "").toLowerCase().includes(q) ||
      (locationMap.get(r.location_id)?.location_code || r.location_id || "").toLowerCase().includes(q) ||
      (r.reason_code || "").toLowerCase().includes(q)
    );
    if (adjustmentFilters.status && adjustmentFilters.status !== "OPEN") {
      rows = rows.filter((r) => (r.status || "").toUpperCase() === adjustmentFilters.status);
    } else if (adjustmentFilters.status === "OPEN") {
      rows = rows.filter((r) => !["APPROVED", "REJECTED", "CANCELLED"].includes((r.status || "").toUpperCase()));
    }
    return rows;
  }, [allAdjRows, adjustmentFilters, locationMap]);

  const adjustmentTotal = filteredAdjRows.length;
  const adjustmentRows  = useMemo(() => filteredAdjRows.slice((adjustmentPage - 1) * adjustmentPageSize, adjustmentPage * adjustmentPageSize), [filteredAdjRows, adjustmentPage, adjustmentPageSize]);

  const selectedAdjustment = useMemo(() => filteredAdjRows.find((r) => r.adj_id === selectedAdjustmentId) || null, [filteredAdjRows, selectedAdjustmentId]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadOptions = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      const data = await fetchInventoryOptions(session);
      setZones(Array.isArray(data?.zones) ? data.zones : []);
      setLocations(Array.isArray(data?.locations) ? data.locations : []);
      setReasonCodes(Array.isArray(data?.reason_codes) ? data.reason_codes : []);
      setSkus(Array.isArray(data?.skus) ? data.skus : []);
      setCountConfig(data?.count_config || null);
    } catch (e) {
      toast({ title: "Options failed", description: e.message || "Unable to load options", variant: "destructive" });
    }
  }, [session, toast]);

  const loadStock = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setStockLoading(true); setStockError("");
      const data = await fetchInventorySummary(session, { page: 1, pageSize: 9999 });
      setAllStockRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setStockError(e.message || "Unable to load stock summary");
      setAllStockRows([]);
    } finally { setStockLoading(false); }
  }, [session]);

  const loadCountPlans = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setCountLoading(true); setCountError("");
      const data = await fetchCountPlans(session, { page: 1, pageSize: 9999 });
      setAllCountRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setCountError(e.message || "Unable to load count plans");
      setAllCountRows([]);
    } finally { setCountLoading(false); }
  }, [session]);

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
  useEffect(() => { if (activeTab === "cycle")       loadCountDetail(selectedCountId); }, [activeTab, selectedCountId, loadCountDetail]);
  useEffect(() => { if (activeTab === "adjustments") loadAdjustments(); }, [activeTab, loadAdjustments]);

  useEffect(() => {
    const parsed = parseInventoryQuery(location.search);
    if (!parsed.view) return;
    if (parsed.view === "exceptions") {
      setActiveTab("adjustments");
      setAdjustmentFilters((c) => ({ ...c, status: parsed.status === "open" ? "OPEN" : "" }));
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
      setBusyKey("create-count");
      const data = await createCountPlan(session, {
        zone_id: createCountForm.zone_id,
        planned_date: createCountForm.planned_date || undefined,
        scope_type: createCountForm.scope_type,
        scope_location_id: createCountForm.scope_type === "BY_LOCATION" ? createCountForm.scope_location_id : undefined,
        scope_sku_ids: createCountForm.scope_type === "BY_SKU" ? scopeSkus : undefined,
      });
      setCreateCountOpen(false); setCreateCountForm(createCountInitial); setCreateCountErrors({});
      setSelectedCountId(data.count_id); setSelectedCount(data);
      toast({ title: "Count plan created", description: `${data.count_id} created` });
      await loadCountPlans();
    } catch (e) {
      setCountError(e.message || "Unable to create count plan");
      toast({ title: "Create failed", description: e.message, variant: "destructive" });
    } finally { setBusyKey(""); }
  };

  const handleAddEntry = async () => {
    if (!selectedCount) return;
    const qty = Number(execForm.qty_counted);
    if (!Number.isFinite(qty) || qty < 0) { setExecError("Counted quantity must be 0 or greater"); return; }
    if (!execForm.line_id && !execForm.scanned_value.trim()) { setExecError("Line or scanned value is required"); return; }
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
      toast({ title: "Entry posted" });
      await loadCountPlans();
    } catch (e) {
      setExecError(e.message || "Unable to add count entry");
      toast({ title: "Entry failed", description: e.message, variant: "destructive" });
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
    if (!approveForm.reason_code) { setApproveError("Reason code is required"); return; }
    try {
      setBusyKey("approve-count"); setApproveError("");
      const data = await approveCountPlan(session, selectedCount.count_id, {
        reason_code: approveForm.reason_code,
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
      setBusyKey("create-adjustment");
      const created = await createAdjustmentRequest(session, {
        sku_id: createAdjForm.sku_id.trim().toUpperCase(),
        location_id: createAdjForm.location_id,
        qty_delta: Number(createAdjForm.qty_delta),
        reason_code: createAdjForm.reason_code,
      });
      setCreateAdjOpen(false); setCreateAdjConfirmOpen(false);
      setCreateAdjForm(createAdjustmentInitial); setCreateAdjErrors({});
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
      await approveAdjustment(session, adjId, { approval_note: approveAdjNote.trim() || undefined });
      setApproveAdjOpen(false); setApproveAdjNote(""); setApproveAdjTarget(null);
      toast({ title: "Adjustment approved", description: `${adjId} approved` });
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
      await cancelAdjustment(session, cancelAdjTarget.adj_id, { reason });
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
      <AppLayout>
        <Breadcrumbs items={[{ label: "Inventory" }]} />
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Inventory</h1>
        </div>
        <div style={cardStyle}>
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>
            Select a tenant before accessing inventory data.
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Inventory" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Inventory</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>Manage stock, cycle counts and adjustment requests</p>
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
              <Select value={stockFilters.zone || "all"} onValueChange={(v) => updateStockFilter("zone", v === "all" ? "" : v)}>
                <SelectTrigger style={{ height: 34, width: 175, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Zones</SelectItem>
                  {zones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_id} — {z.zone_name}</SelectItem>)}
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
                  {["SKU", "Description", "Location", "Zone", "On Hand", "Reserved", "Available", "Quarantine"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: i >= 4 ? "right" : "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockLoading && (
                  <tr><td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading stock…</span>
                  </td></tr>
                )}
                {!stockLoading && stockRows.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No stock rows found.</td></tr>
                )}
                {!stockLoading && stockRows.map((row) => (
                  <tr key={`${row.sku_id}-${row.location_id}`} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                    <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{row.sku_id}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: T_PRIMARY }}>{row.sku_description || "—"}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{row.location_code || row.location_id}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{row.zone_id || "—"}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{fmtQty(row.on_hand_qty)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 14, color: T_SECONDARY }}>{fmtQty(row.reserved_qty)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 14, color: T_SECONDARY }}>{fmtQty(row.available_qty)}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 14, fontWeight: Number(row.quarantine_qty) > 0 ? 600 : 400, color: Number(row.quarantine_qty) > 0 ? "#991b1b" : T_SECONDARY }}>
                      {fmtQty(row.quarantine_qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {renderPagination(stockTotal, stockPage, stockPageSize, setStockPage, setStockPageSize, stockLoading)}
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
                <SelectTrigger style={{ height: 34, width: 155, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {countStatuses.map((s) => <SelectItem key={s} value={s}>{fmtStatusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={countFilters.zone || "all"} onValueChange={(v) => updateCountFilter("zone", v === "all" ? "" : v)}>
                <SelectTrigger style={{ height: 34, width: 155, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Zones</SelectItem>
                  {zones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_id} — {z.zone_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Date range */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: T_LABEL, whiteSpace: "nowrap" }}>Planned date</span>
                <input type="date" value={countFilters.dateFrom}
                  onChange={(e) => updateCountFilter("dateFrom", e.target.value)}
                  style={{ height: 34, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 8px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
                />
                <span style={{ fontSize: 12, color: T_MUTED }}>–</span>
                <input type="date" value={countFilters.dateTo}
                  onChange={(e) => updateCountFilter("dateTo", e.target.value)}
                  style={{ height: 34, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 8px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
                />
              </div>
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
                    <th key={h} style={{ padding: "10px 16px", textAlign: i === 3 ? "right" : "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {countLoading && (
                  <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>Loading…</td></tr>
                )}
                {!countLoading && countRows.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No count plans found.</td></tr>
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
                      <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{row.count_id}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: T_PRIMARY }}>{row.zone_id}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{fmtDate(row.planned_date)}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{fmtQty(row.lines_count)}</td>
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
                    <p style={{ fontSize: 14, color: T_SECONDARY, display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <Loader2 style={{ width: 14, height: 14 }} /> Loading detail…
                    </p>
                  )}

                  {selectedCount && (
                    <>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: T_PRIMARY }}>{selectedCount.count_id}</span>
                        <StatusPill status={normalizeStatus(selectedCount.status)} />
                      </div>

                      {/* Info grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
                        <DetailField label="Zone"     value={selectedCount.zone_id} />
                        <DetailField label="Created"  value={fmtDateTime(selectedCount.created_at)} />
                        <DetailField label="Threshold" value={countConfig?.variance_threshold_mode === "absolute" ? `${countConfig?.variance_threshold_abs || 0} units` : `${countConfig?.variance_threshold_percent || 0}%`} />
                        {["APPROVED", "REJECTED"].includes(String(selectedCount.status || "").toUpperCase()) && (() => {
                          const st = String(selectedCount.status || "").toUpperCase();
                          const reasonCode  = st === "APPROVED" ? selectedCount.approval_reason_code : null;
                          const reasonLabel = reasonCode ? (reasonMap.get(reasonCode)?.reason_name || reasonCode) : null;
                          const note        = selectedCount.approval_note;
                          return (
                            <>
                              {reasonLabel && <DetailField label="Reason" value={reasonLabel} />}
                              {note && <DetailField label={st === "REJECTED" ? "Rejection Reason" : "Note"} value={note} danger={st === "REJECTED"} span />}
                            </>
                          );
                        })()}
                        {String(selectedCount.status || "").toUpperCase() === "CANCELLED" && selectedCount.cancellation_reason && (
                          <DetailField label="Cancellation Reason" value={selectedCount.cancellation_reason} danger span />
                        )}
                      </div>

                      {/* Approve form */}
                      {canApproveCount && selectedCount.status === "SUBMITTED" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "14px 16px", borderRadius: 8, border: "0.5px solid #e5e7eb", marginBottom: 14 }}>
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Reason Code</p>
                            <Select value={approveForm.reason_code || "none"} onValueChange={(v) => { setApproveError(""); setApproveForm((c) => ({ ...c, reason_code: v === "none" ? "" : v })); }}>
                              <SelectTrigger style={{ height: 34, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff" }}>
                                <SelectValue placeholder="Select Reason" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Select Reason</SelectItem>
                                {reasonCodes.map((r) => <SelectItem key={r.reason_code} value={r.reason_code}>{r.reason_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Approval Note</p>
                            <Input value={approveForm.approval_note}
                              onChange={(e) => { setApproveError(""); setApproveForm((c) => ({ ...c, approval_note: e.target.value })); }}
                              placeholder="Optional note…"
                              style={{ height: 34, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7 }}
                            />
                          </div>
                          {approveError && <p style={{ gridColumn: "1/-1", fontSize: 12, color: "#991b1b" }}>{approveError}</p>}
                        </div>
                      )}

                      {/* Add entry form */}
                      {canExecuteCount && ["DRAFT", "IN_PROGRESS"].includes(selectedCount.status) && (
                        <div style={{ padding: "14px 16px", borderRadius: 8, border: "0.5px solid #e5e7eb", marginBottom: 14 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Add Count Entry</p>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 10 }}>
                            {[
                              {
                                label: "Line",
                                content: (
                                  <Select value={execForm.line_id || "none"} onValueChange={(v) => { setExecError(""); setExecForm((c) => ({ ...c, line_id: v === "none" ? "" : v })); }}>
                                    <SelectTrigger style={{ height: 34, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff" }}><SelectValue placeholder="Auto Resolve" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Auto Resolve By Scan</SelectItem>
                                      {(selectedCount.lines || []).map((l) => <SelectItem key={l.line_id} value={l.line_id}>{l.line_id} — {l.sku_id}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ),
                              },
                              {
                                label: "Scan Mode",
                                content: (
                                  <Select value={execForm.scan_mode} onValueChange={(v) => setExecForm((c) => ({ ...c, scan_mode: v }))}>
                                    <SelectTrigger style={{ height: 34, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff" }}><SelectValue /></SelectTrigger>
                                    <SelectContent>{scanModes.map((m) => <SelectItem key={m} value={m}>{fmtStatusLabel(m)}</SelectItem>)}</SelectContent>
                                  </Select>
                                ),
                              },
                              {
                                label: "Scanned / Typed Value",
                                content: <Input value={execForm.scanned_value} onChange={(e) => { setExecError(""); setExecForm((c) => ({ ...c, scanned_value: e.target.value })); }} placeholder="e.g. SKU000004" style={{ height: 34, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7 }} />,
                              },
                              {
                                label: "Qty Counted",
                                content: <Input type="number" min="0" step="0.01" value={execForm.qty_counted} onChange={(e) => { setExecError(""); setExecForm((c) => ({ ...c, qty_counted: e.target.value })); }} placeholder="0" style={{ height: 34, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7 }} />,
                              },
                            ].map(({ label, content }) => (
                              <div key={label}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</p>
                                {content}
                              </div>
                            ))}
                          </div>
                          {execError && <p style={{ fontSize: 12, color: "#991b1b", marginBottom: 8 }}>{execError}</p>}
                          <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)} onClick={handleAddEntry}>
                            {busyKey === "add-entry" ? "Posting…" : "Add Entry"}
                          </button>
                        </div>
                      )}

                      {/* Lines table */}
                      <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden", marginBottom: 14 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#f9fafb" }}>
                              {["Line", "SKU", "Location", "System Qty", "Counted Qty", "Variance", "Status"].map((h, i) => (
                                <th key={h} style={{ padding: "9px 14px", textAlign: i >= 3 && i <= 5 ? "right" : "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {!(selectedCount.lines || []).length && (
                              <tr><td colSpan={7} style={{ padding: "20px 14px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No lines found.</td></tr>
                            )}
                            {(selectedCount.lines || []).map((line) => (
                              <tr key={line.line_id} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                                <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: T_SECONDARY }}>{line.line_id}</td>
                                <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: T_SECONDARY }}>{line.sku_id}</td>
                                <td style={{ padding: "11px 14px", fontSize: 13, color: T_SECONDARY }}>{locationMap.get(line.location_id)?.location_code || line.location_id}</td>
                                <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{fmtQty(line.system_qty)}</td>
                                <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 14, color: T_PRIMARY }}>{line.counted_qty === null ? "—" : fmtQty(line.counted_qty)}</td>
                                <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 14, color: T_PRIMARY }}>{line.variance_qty === null ? "—" : fmtQty(line.variance_qty)}</td>
                                <td style={{ padding: "11px 14px" }}><StatusPill status={normalizeStatus(line.status)} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Actions */}
                      {(canSubmitCount || canApproveCount || canCancelCountByRole) && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canSubmitCount && ["DRAFT", "IN_PROGRESS"].includes(selectedCount.status) && (
                            <button style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)} onClick={handleSubmitCount}>
                              {busyKey === "submit-count" ? "Submitting…" : "Submit For Approval"}
                            </button>
                          )}
                          {canApproveCount && selectedCount.status === "SUBMITTED" && (
                            <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)} onClick={handleApproveCount}>
                              {busyKey === "approve-count" ? "Approving…" : "Approve"}
                            </button>
                          )}
                          {canApproveCount && selectedCount.status === "SUBMITTED" && (
                            <button style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                              onClick={() => { setRejectCountOpen(true); setRejectCountReason(""); setRejectCountTouched(false); }}>
                              Reject
                            </button>
                          )}
                          {canCancelCountByRole && ["DRAFT", "IN_PROGRESS", "SUBMITTED"].includes(selectedCount.status) && (
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
                <SelectTrigger style={{ height: 34, width: 175, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  {adjustmentStatuses.map((s) => <SelectItem key={s} value={s}>{fmtStatusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
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
                  {["ADJ ID", "SKU", "Location", "Qty Delta", "Reason", "Status", "Requested At"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: i === 3 ? "right" : "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adjustmentLoading && (
                  <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>Loading…</td></tr>
                )}
                {!adjustmentLoading && adjustmentRows.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No adjustments found.</td></tr>
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
                      <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{row.adj_id}</td>
                      <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{row.sku_id}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{locationMap.get(row.location_id)?.location_code || row.location_id}</td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 14, fontWeight: 500, color: Number(row.qty_delta) < 0 ? "#991b1b" : "#065f46" }}>{Number(row.qty_delta) > 0 ? "+" : ""}{fmtQty(row.qty_delta)}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{reasonMap.get(row.reason_code)?.reason_name || row.reason_code}</td>
                      <td style={{ padding: "14px 16px" }}><StatusPill status={normalizeStatus(row.status)} /></td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{fmtDateTime(row.requested_at)}</td>
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
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: T_PRIMARY }}>{selectedAdjustment.adj_id}</span>
                    <StatusPill status={normalizeStatus(selectedAdjustment.status)} />
                  </div>

                  {/* Info grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
                    <DetailField label="SKU"          value={selectedAdjustment.sku_id} mono />
                    <DetailField label="Location"     value={locationMap.get(selectedAdjustment.location_id)?.location_code || selectedAdjustment.location_id} />
                    <DetailField label="Qty Delta">
                      <span style={{ color: Number(selectedAdjustment.qty_delta) < 0 ? "#991b1b" : "#065f46" }}>
                        {Number(selectedAdjustment.qty_delta) > 0 ? "+" : ""}{fmtQty(selectedAdjustment.qty_delta)}
                      </span>
                    </DetailField>
                    <DetailField label="Reason"       value={reasonMap.get(selectedAdjustment.reason_code)?.reason_name || selectedAdjustment.reason_code} />
                    <DetailField label="Requested By" value={selectedAdjustment.requested_by} />
                    <DetailField label="Requested At" value={fmtDateTime(selectedAdjustment.requested_at)} />
                    {selectedAdjustment.approved_by && (
                      <DetailField
                        label={String(selectedAdjustment.status).toUpperCase() === "REJECTED" ? "Rejected By" : "Approved By"}
                        value={selectedAdjustment.approved_by}
                      />
                    )}
                    {selectedAdjustment.approved_at && (
                      <DetailField
                        label={String(selectedAdjustment.status).toUpperCase() === "REJECTED" ? "Rejected At" : "Approved At"}
                        value={fmtDateTime(selectedAdjustment.approved_at)}
                      />
                    )}
                    {String(selectedAdjustment.status).toUpperCase() === "CANCELLED" && (
                      <DetailField label="Cancellation Reason" value={selectedAdjustment.cancellation_reason || "—"} danger span />
                    )}
                    {String(selectedAdjustment.status).toUpperCase() === "REJECTED" && (
                      <DetailField label="Rejection Reason" value={selectedAdjustment.rejection_reason || selectedAdjustment.approval_note || "—"} danger span />
                    )}
                    {String(selectedAdjustment.status).toUpperCase() === "APPROVED" && selectedAdjustment.approval_note && (
                      <DetailField label="Approval Note" value={selectedAdjustment.approval_note} span />
                    )}
                  </div>

                  {/* Actions */}
                  {(canSubmitAdj || canApproveAdj || canCancelAdjByRole) && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {canSubmitAdj && selectedAdjustment.status === "DRAFT" && (
                        <button style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                          onClick={() => handleSubmitDraftAdjustment(selectedAdjustment.adj_id)}>
                          {busyKey === `submit-adj-${selectedAdjustment.adj_id}` ? "Submitting…" : "Submit For Approval"}
                        </button>
                      )}
                      {canApproveAdj && selectedAdjustment.status === "SUBMITTED" && (
                        <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                          onClick={() => { setApproveAdjTarget(selectedAdjustment); setApproveAdjNote(""); setApproveAdjOpen(true); }}>
                          Approve
                        </button>
                      )}
                      {canApproveAdj && selectedAdjustment.status === "SUBMITTED" && (
                        <button style={{ ...btnNeutral, opacity: Boolean(busyKey) ? 0.55 : 1 }} disabled={Boolean(busyKey)}
                          onClick={() => { setRejectAdjTarget(selectedAdjustment); setRejectAdjReason(""); setRejectAdjTouched(false); setRejectAdjOpen(true); }}>
                          Reject
                        </button>
                      )}
                      {canCancelAdjByRole && ["DRAFT", "SUBMITTED"].includes(selectedAdjustment.status) && (
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
      <Dialog open={createCountOpen} onOpenChange={(open) => { setCreateCountOpen(open); if (!open) { setCreateCountForm(createCountInitial); setCreateCountErrors({}); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Count Plan</DialogTitle>
            <DialogDescription>Create a cycle count plan by zone and scope.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Zone</Label>
              <Select value={createCountForm.zone_id || "none"} onValueChange={(v) => { setCreateCountErrors((c) => ({ ...c, zone_id: "" })); setCreateCountForm((c) => ({ ...c, zone_id: v === "none" ? "" : v })); }}>
                <SelectTrigger><SelectValue placeholder="Select Zone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select Zone</SelectItem>
                  {zones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_id} — {z.zone_name}</SelectItem>)}
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
                    {locations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.location_code} ({l.location_id})</SelectItem>)}
                  </SelectContent>
                </Select>
                {createCountErrors.scope_location_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createCountErrors.scope_location_id}</p>}
              </div>
            )}
            {createCountForm.scope_type === "BY_SKU" && (
              <div className="space-y-1">
                <Label>SKU IDs (comma separated)</Label>
                <Input value={createCountForm.scope_sku_ids}
                  onChange={(e) => { setCreateCountErrors((c) => ({ ...c, scope_sku_ids: "" })); setCreateCountForm((c) => ({ ...c, scope_sku_ids: e.target.value })); }}
                  placeholder="SKU000001, SKU000002"
                />
                {createCountErrors.scope_sku_ids && <p style={{ fontSize: 12, color: "#991b1b" }}>{createCountErrors.scope_sku_ids}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <button style={btnNeutral} onClick={() => setCreateCountOpen(false)} disabled={Boolean(busyKey)}>Back</button>
            <button style={{ ...btnPrimary, opacity: Boolean(busyKey) ? 0.6 : 1 }} onClick={handleCreateCount} disabled={Boolean(busyKey)}>
              {busyKey === "create-count" ? "Creating…" : "Create Plan"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Adjustment */}
      <Dialog open={createAdjOpen} onOpenChange={(open) => { setCreateAdjOpen(open); if (!open) { setCreateAdjConfirmOpen(false); setCreateAdjForm(createAdjustmentInitial); setCreateAdjErrors({}); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Adjustment</DialogTitle>
            <DialogDescription>Create a new adjustment request. Review and submit for approval after.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>SKU</Label>
              <Select value={createAdjForm.sku_id || "none"} onValueChange={(v) => { setCreateAdjErrors((c) => ({ ...c, sku_id: "" })); setCreateAdjForm((c) => ({ ...c, sku_id: v === "none" ? "" : v })); }}>
                <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select SKU</SelectItem>
                  {skus.map((s) => <SelectItem key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.description}</SelectItem>)}
                </SelectContent>
              </Select>
              {createAdjErrors.sku_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createAdjErrors.sku_id}</p>}
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Select value={createAdjForm.location_id || "none"} onValueChange={(v) => { setCreateAdjErrors((c) => ({ ...c, location_id: "" })); setCreateAdjForm((c) => ({ ...c, location_id: v === "none" ? "" : v })); }}>
                <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select Location</SelectItem>
                  {locations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.location_code} ({l.location_id})</SelectItem>)}
                </SelectContent>
              </Select>
              {createAdjErrors.location_id && <p style={{ fontSize: 12, color: "#991b1b" }}>{createAdjErrors.location_id}</p>}
            </div>
            <div className="space-y-1">
              <Label>Qty Delta</Label>
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
            <DialogDescription>Approve {approveAdjTarget?.adj_id || "adjustment"}? Stock will be updated immediately.</DialogDescription>
          </DialogHeader>
          {approveAdjTarget && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 14px", borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", marginBottom: 4 }}>
              <DetailField label="SKU"       value={approveAdjTarget.sku_id} mono />
              <DetailField label="Qty Delta">
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
        description={`Provide rejection reason for ${rejectAdjTarget?.adj_id || "adjustment"}.`}
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
        onClose={() => setCancelAdjTarget(null)}
        onConfirm={handleCancelAdjustment}
        submitting={Boolean(cancelAdjTarget && busyKey === `cancel-adj-${cancelAdjTarget.adj_id}`)}
      />
    </AppLayout>
  );
};

export default InventoryPage;