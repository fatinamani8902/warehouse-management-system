import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate, formatDateTime } from "@/utils/dateTimeFormatter";
import {
  cancelShipment,
  closeShipment,
  dispatchShipment,
  fetchShipments,
  toSessionContext,
} from "@/services/api";

const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: "#e03131", color: "#fff" };

const cardStyle = {
  background: "#fff", borderRadius: 12,
  border: "0.5px solid #e8ebf8", overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

const STATUS_CFG = {
  planned:          { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
  pending:          { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
  packed:           { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Ready to Dispatch" },
  carton_generated: { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Ready to Dispatch" },
  dispatched:       { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "Dispatched" },
  closed:           { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Closed" },
  cancelled:        { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", dot: "#ef4444",  label: "Cancelled" },
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

function isShipmentOverdue(shipment) {
  const status = String(shipment?.status || "").toLowerCase();
  if (["closed", "cancelled"].includes(status)) return false;
  const requiredShipBy = shipment?.required_ship_by || shipment?.ship_by || shipment?.dispatch_due_at;
  if (!requiredShipBy) return false;
  const dateText = String(requiredShipBy).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && dateText < new Date().toISOString().slice(0, 10);
}

function OverdueBadge() {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 500,
      lineHeight: "16px",
      padding: "3px 10px",
      borderRadius: 20,
      background: "#fff1f2",
      color: "#be123c",
      border: "0.5px solid #fecdd3",
      whiteSpace: "nowrap",
    }}>
      Overdue
    </span>
  );
}

function DetailField({ label, value, mono, danger, span }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: danger ? "#991b1b" : T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
        {value ?? "-"}
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function DetailFieldGrid({ title, children, columns = 4 }) {
  const desktopColumns = columns === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4";
  return (
    <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", padding: "12px 16px", marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
        {title}
      </p>
      <div className={`grid grid-cols-1 md:grid-cols-2 ${desktopColumns}`} style={{ columnGap: 14, rowGap: 11 }}>
        {children}
      </div>
    </div>
  );
}

function EmptyGridCell() {
  return <div className="hidden xl:block" aria-hidden="true" />;
}

function SummaryCard({ label, value, status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <div style={{
      minWidth: 150,
      flex: "1 1 150px",
      background: "#fff",
      border: "0.5px solid #e5e7eb",
      borderRadius: 9,
      padding: "8px 12px",
      boxShadow: "0 1px 4px rgba(17,24,39,.035)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_SECONDARY }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 600, color: T_PRIMARY }}>{Number(value || 0)}</div>
    </div>
  );
}

const initialFilters = { search: "", status: "", dateFrom: "", dateTo: "" };
const shippingStatusOptions = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "packed", label: "Ready to Dispatch" },
  { value: "dispatched", label: "Dispatched" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

const roleAliases = {
  superadmin: "superadmin", hqadmin: "hqadmin", manager: "manager", storemanager: "storemanager",
  warehouseadmin: "storemanager", warehousemanager: "storemanager",
  storeoperator: "storeoperator", storekeeper: "storeoperator",
  warehouseclerk: "storeoperator", auditor: "auditor", readonly: "readonly",
};

const shippingStatuses = new Set([
  "planned", "pending", "packed", "carton_generated",
  "dispatched", "closed", "cancelled",
]);

const CARRIERS = [
  "DHL Express", "FedEx Ground", "UPS Standard", "Pos Laju",
  "J&T Express", "City-Link Express", "Ninja Van", "GDex",
];

const DISPATCHABLE = new Set(["packed", "carton_generated"]);
const DISPATCH_ROLES = new Set(["manager", "storemanager"]);
const CLOSE_ROLES    = new Set(["manager", "storemanager"]);
const CANCEL_ROLES   = new Set(["manager", "storemanager"]);

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}
function canDispatchShipment(roleId) { return DISPATCH_ROLES.has(normalizeRole(roleId)); }
function canCloseShipment(roleId)    { return CLOSE_ROLES.has(normalizeRole(roleId)); }
function canCancelShipment(roleId)   { return CANCEL_ROLES.has(normalizeRole(roleId)); }

function parseShippingStatusFilter(search) {
  const params = new URLSearchParams(search || "");
  const status = String(params.get("status") || "").toLowerCase();
  return shippingStatuses.has(status) ? status : "";
}

function DispatchModal({ shipment, session, onClose, onSuccess }) {
  const defaultCarrier = shipment?.carrier || "";
  const isKnownCarrier = CARRIERS.includes(defaultCarrier);
  const [carrierMode, setCarrierMode] = useState(defaultCarrier && !isKnownCarrier ? "manual" : "select");
  const [carrier, setCarrier]         = useState(defaultCarrier);
  const [trackingNo, setTrackingNo]   = useState(shipment?.tracking_no || "");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  const handleDispatch = async () => {
    if (!carrier.trim())    { setError("Carrier is required."); return; }
    if (!trackingNo.trim()) { setError("Tracking number is required."); return; }
    try {
      setLoading(true); setError("");
      const data = await dispatchShipment(session, shipment.shipment_id, {
        carrier: carrier.trim(),
        tracking_no: trackingNo.trim(),
      });
      onSuccess(data.data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Dispatch Shipment</DialogTitle></DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          Shipment <span className="font-mono font-medium">{shipment.shipment_id}</span> — {shipment.customer_name || "Unknown Customer"}
        </p>
        <div className="space-y-3 mt-1">
          <div className="space-y-1">
            <Label>Carrier <span className="text-destructive">*</span></Label>
            <Select
              value={carrierMode === "manual" ? "other" : carrier}
              onValueChange={(v) => {
                if (v === "other") { setCarrierMode("manual"); setCarrier(""); }
                else { setCarrierMode("select"); setCarrier(v); }
              }}
              disabled={loading}
            >
              <SelectTrigger><SelectValue placeholder="Select Carrier" /></SelectTrigger>
              <SelectContent>
                {CARRIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                <SelectItem value="other">Other (manual input)</SelectItem>
              </SelectContent>
            </Select>
            {carrierMode === "manual" && (
              <Input className="mt-1" placeholder="Enter carrier name" value={carrier}
                onChange={(e) => setCarrier(e.target.value)} disabled={loading} />
            )}
          </div>
          <div className="space-y-1">
            <Label>Tracking Number <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. JT1234567890MY" value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)} disabled={loading} />
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Back</Button>
          <Button onClick={handleDispatch} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseModal({ shipment, session, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleClose = async () => {
    try {
      setLoading(true);
      const data = await closeShipment(session, shipment.shipment_id);
      onSuccess(data.data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Close Shipment</DialogTitle></DialogHeader>
        <p className="text-[13px] text-muted-foreground mb-3">
          Confirm close shipment <span className="font-mono font-medium">{shipment.shipment_id}</span>? This marks the shipment as received by customer and cannot be undone.
        </p>
        <div className="rounded-md border bg-muted/20 px-4 py-3 text-[13px] space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Customer</span>
            <span className="font-medium">{shipment.customer_name || "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Carrier</span>
            <span>{shipment.carrier || "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Tracking</span>
            <span className="font-mono text-xs">{shipment.tracking_no || "-"}</span>
          </div>
        </div>
        {error && <p className="text-[13px] text-destructive mt-2">{error}</p>}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Back</Button>
          <Button variant="destructive" onClick={handleClose} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Close Shipment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelModal({ shipment, session, onClose, onSuccess }) {
  const [reason, setReason]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleCancel = async () => {
    if (!reason.trim()) { setError("Cancellation reason is required."); return; }
    try {
      setLoading(true);
      const data = await cancelShipment(session, shipment.shipment_id, reason.trim());
      onSuccess(data.data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cancel Shipment</DialogTitle></DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          Cancel shipment <span className="font-mono font-medium">{shipment.shipment_id}</span> — {shipment.customer_name || "Unknown Customer"}?
        </p>
        <div className="space-y-1 mt-2">
          <Label>Reason <span className="text-destructive">*</span></Label>
          <Input placeholder="e.g. Customer cancelled order" value={reason}
            onChange={(e) => { setError(""); setReason(e.target.value); }} disabled={loading} />
          {error && <p className="text-[13px] text-destructive mt-1">{error}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Back</Button>
          <Button variant="destructive" onClick={handleCancel} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ShippingPage = () => {
  const location = useLocation();
  const auth     = useAuth();
  const session  = useMemo(() => toSessionContext(auth), [auth]);
  const roleId   = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);
  const canView  = useMemo(
    () => ["superadmin", "hqadmin", "manager", "storemanager", "storeoperator", "auditor", "readonly"].includes(roleId),
    [roleId],
  );
  const canDispatch   = useMemo(() => canDispatchShipment(roleId), [roleId]);
  const canClose      = useMemo(() => canCloseShipment(roleId), [roleId]);
  const canCancelShip = useMemo(() => canCancelShipment(roleId), [roleId]);

  const [filters, setFilters]                       = useState(initialFilters);
  const [page, setPage]                             = useState(1);
  const [pageSize, setPageSize]                     = useState(10);
  const [loading, setLoading]                       = useState(true);
  const [error, setError]                           = useState("");
  const [rows, setRows]                             = useState([]);
  const [total, setTotal]                           = useState(0);
  const [summary, setSummary]                       = useState({ pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 });
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [dispatchTarget, setDispatchTarget]         = useState(null);
  const [closeTarget, setCloseTarget]               = useState(null);
  const [cancelTarget, setCancelTarget]             = useState(null);

  const totalPages       = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const selectedShipment = useMemo(() => rows.find((r) => r.shipment_id === selectedShipmentId) || null, [rows, selectedShipmentId]);
  const selectedPackingLines = useMemo(
    () => (Array.isArray(selectedShipment?.items) ? selectedShipment.items : []),
    [selectedShipment],
  );
  const dateRangeError = filters.dateFrom && filters.dateTo && filters.dateTo < filters.dateFrom
    ? "To Date cannot be earlier than From Date."
    : "";

  useEffect(() => {
    const status = parseShippingStatusFilter(location.search);
    setFilters((c) => ({ ...c, status }));
    setPage(1);
  }, [location.search]);

  const loadShipments = useCallback(async () => {
    if (!session.tenant_id || !canView) { setRows([]); setTotal(0); setSummary({ pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 }); setLoading(false); return; }
    try {
      setLoading(true); setError("");
      if (dateRangeError) {
        setRows([]);
        setTotal(0);
        setSummary({ pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 });
        setError(dateRangeError);
        return;
      }
      const result = await fetchShipments(session, {
        page, pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      });
      const items = Array.isArray(result?.data) ? result.data : [];
      setRows(items);
      setTotal(Number(result?.total || 0));
      setSummary(result?.summary || { pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 });
      setSelectedShipmentId((cur) => (cur && items.some((r) => r.shipment_id === cur)) ? cur : "");
    } catch (e) {
      setRows([]); setTotal(0); setSummary({ pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 });
      setError(e.message || "Failed to load shipments");
    } finally { setLoading(false); }
  }, [canView, dateRangeError, filters, page, pageSize, session]);

  useEffect(() => { loadShipments(); }, [loadShipments]);

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };
  const clearFilters = () => { setFilters(initialFilters); setPage(1); };

  const handleActionSuccess = (updated) => {
    setRows((cur) => cur.map((r) => {
      if (r.shipment_id !== updated.shipment_id) return r;
      return { ...r, ...updated, items: r.items };
    }));
    setDispatchTarget(null); setCloseTarget(null); setCancelTarget(null);
    loadShipments();
  };

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Shipping" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Shipping</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Manage and track outbound shipments</p>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <SummaryCard label="Pending" value={summary.pending} status="pending" />
        <SummaryCard label="Ready to Dispatch" value={summary.packed} status="packed" />
        <SummaryCard label="Dispatched" value={summary.dispatched} status="dispatched" />
        <SummaryCard label="Closed" value={summary.closed} status="closed" />
        <SummaryCard label="Cancelled" value={summary.cancelled} status="cancelled" />
      </div>

      <div style={cardStyle}>
        {/* Toolbar */}
        <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 420px", minWidth: 320, maxWidth: 560 }}>
            <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
              placeholder="Search shipment, order, customer, carrier, tracking..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
          </div>
          <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
            <SelectTrigger style={{ height: 40, width: 175, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {shippingStatusOptions.map((opt) => (
                <SelectItem key={opt.value || "all"} value={opt.value || "all"}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="date"
            aria-label="Created from date"
            style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
            value={filters.dateFrom}
            onChange={(e) => updateFilter("dateFrom", e.target.value)}
          />
          <input
            type="date"
            aria-label="Created to date"
            style={{ height: 40, width: 150, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
            value={filters.dateTo}
            onChange={(e) => updateFilter("dateTo", e.target.value)}
          />
          <div style={{ flex: 1 }} />
          <button style={btnNeutral} onClick={clearFilters}>Clear</button>
          <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={loadShipments} disabled={loading}>Refresh</button>
        </div>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafbff" }}>
              {["Shipment ID", "Customer", "Carrier", "Tracking No", "Dispatched By", "Status"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading shipments…
                </span>
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No shipments found.</td></tr>
            )}
            {!loading && rows.map((row) => {
              const isSel = selectedShipmentId === row.shipment_id;
              return (
                <tr key={row.shipment_id}
                  style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  onClick={() => setSelectedShipmentId((prev) => prev === row.shipment_id ? "" : row.shipment_id)}
                >
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.shipment_id}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{row.customer_name || "-"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{row.carrier || "-"}</td>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{row.tracking_no || "-"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: row.dispatched_by_name ? T_PRIMARY : T_MUTED }}>
                    {row.dispatched_by_name || "-"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusPill status={row.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

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

        {/* Detail Panel */}
        {selectedShipment && (
          <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
            <div style={{ padding: "18px 16px 16px" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{selectedShipment.shipment_id}</span>
                <StatusPill status={selectedShipment.status} />
                {isShipmentOverdue(selectedShipment) && <OverdueBadge />}
              </div>

              <DetailFieldGrid title="Shipment Information" columns={5}>
                <DetailField label="Shipment ID" value={selectedShipment.shipment_id} mono />
                <DetailField label="Sales Order" value={selectedShipment.order_id} mono />
                <DetailField label="Customer" value={selectedShipment.customer_name} />
                <DetailField label="Required Ship By" value={formatDate(selectedShipment.required_ship_by || selectedShipment.ship_by || selectedShipment.dispatch_due_at)} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                    Status
                  </p>
                  <StatusPill status={selectedShipment.status} />
                </div>
              </DetailFieldGrid>

              {selectedShipment.cancellation_reason && (
                <DetailFieldGrid title="Cancellation Information">
                  <DetailField label="Cancellation Reason" value={selectedShipment.cancellation_reason} danger />
                  <EmptyGridCell />
                  <EmptyGridCell />
                  <EmptyGridCell />
                </DetailFieldGrid>
              )}

              <DetailFieldGrid title="Dispatch Information" columns={5}>
                <DetailField label="Carrier" value={selectedShipment.carrier} />
                <DetailField label="Tracking Number" value={selectedShipment.tracking_no} mono />
                <DetailField label="Dispatched By" value={selectedShipment.dispatched_by_name} />
                <DetailField label="Dispatched At" value={formatDateTime(selectedShipment.dispatched_at)} />
                <EmptyGridCell />
              </DetailFieldGrid>

              <DetailSection title="Packing Information">
              {/* Pack Orders */}
              {Array.isArray(selectedShipment.pack_ids) && selectedShipment.pack_ids.length > 0 && (
                <div style={{ gridColumn: "1 / -1", marginBottom: 2 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                    Pack Order
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedShipment.pack_ids.map((pid) => (
                      <span key={pid} style={{
                        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px",
                        padding: "3px 10px", borderRadius: 6,
                        background: "#eef2ff", color: "#3b5bdb",
                        border: "0.5px solid #c7d2fe",
                      }}>{pid}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedPackingLines.length > 0 && (
                <div style={{ gridColumn: "1 / -1", borderRadius: 8, border: "0.5px solid #e5e7eb", overflowX: "auto", overflowY: "hidden", background: "#fff" }}>
                  <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["SKU", "SKU Name / Description", "Location", "Qty", "Packing Task"].map((h) => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPackingLines.map((item, i) => (
                        <tr key={i} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                          <td style={{ padding: "11px 14px", color: T_SECONDARY }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px" }}>{item.sku_id}</div>
                          </td>
                          <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY }}>
                            {item.sku_name || item.product_name || item.sku_description || item.description || "Unnamed product"}
                          </td>
                          <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
                            <div>{item.location_id || "-"}</div>
                            {item.location_code && item.location_code !== item.location_id && (
                              <div style={{ marginTop: 2, fontFamily: "inherit", fontSize: 11, color: T_MUTED }}>{item.location_code}</div>
                            )}
                          </td>
                          <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 600, color: T_PRIMARY }}>{item.qty}</td>
                          <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 12, color: T_MUTED }}>{item.pack_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </DetailSection>

              {/* Action buttons */}
              {(canDispatch || canClose || canCancelShip) && (
                <div style={{ borderTop: "0.5px solid #e5e7eb", paddingTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {canDispatch && DISPATCHABLE.has(selectedShipment.status) && (
                    <button style={btnPrimary} onClick={() => setDispatchTarget(selectedShipment)}>
                      Dispatch Shipment
                    </button>
                  )}
                  {canClose && selectedShipment.status === "dispatched" && (
                    <button style={btnNeutral} onClick={() => setCloseTarget(selectedShipment)}>
                      Close Shipment
                    </button>
                  )}
                  {canCancelShip && ["pending", "packed", "carton_generated"].includes(selectedShipment.status) && (
                    <button style={btnDanger} onClick={() => setCancelTarget(selectedShipment)}>
                      Cancel Shipment
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {dispatchTarget && <DispatchModal shipment={dispatchTarget} session={session} onClose={() => setDispatchTarget(null)} onSuccess={handleActionSuccess} />}
      {closeTarget    && <CloseModal    shipment={closeTarget}    session={session} onClose={() => setCloseTarget(null)}    onSuccess={handleActionSuccess} />}
      {cancelTarget   && <CancelModal   shipment={cancelTarget}   session={session} onClose={() => setCancelTarget(null)}   onSuccess={handleActionSuccess} />}
    </AppLayout>
  );
};

export default ShippingPage;
