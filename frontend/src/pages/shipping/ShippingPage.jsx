import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { fetchShipments, toSessionContext } from "@/services/api";

const initialFilters = { search: "", status: "", carrier: "" };

const roleAliases = {
  superadmin: "superadmin", hqadmin: "hqadmin", storemanager: "storemanager",
  warehouseadmin: "storemanager", warehousemanager: "storemanager",
  storeoperator: "storeoperator", storekeeper: "storeoperator",
  warehouseclerk: "storeoperator", auditor: "auditor", readonly: "readonly",
};

const shippingStatuses = new Set([
  "open", "overdue", "pending", "ready", "packed",
  "carton_generated", "dispatched", "closed", "cancelled",
]);

const ACTION_ROLES = new Set(["superadmin", "hqadmin", "storemanager", "storeoperator"]);

const CARRIERS = [
  "DHL Express", "FedEx Ground", "UPS Standard", "Pos Laju",
  "J&T Express", "City-Link Express", "Ninja Van", "GDex",
];

const DISPATCHABLE = new Set(["packed", "carton_generated"]);

const STATUS_CONFIG = {
  open:              { bg: "#DBEAFE", color: "#1E40AF", label: "Open" },
  overdue:           { bg: "#FEE2E2", color: "#991B1B", label: "Overdue" },
  pending:           { bg: "#F1EFE8", color: "#5F5E5A", label: "Pending" },
  ready:             { bg: "#DBEAFE", color: "#1E40AF", label: "Ready" },
  packed:            { bg: "#DBEAFE", color: "#1E40AF", label: "Packed" },
  carton_generated:  { bg: "#DBEAFE", color: "#1E40AF", label: "Carton Generated" },
  dispatched:        { bg: "#FEF3C7", color: "#92400E", label: "Dispatched" },
  closed:            { bg: "#D1FAE5", color: "#065F46", label: "Closed" },
  cancelled:         { bg: "#F3F4F6", color: "#6B7280", label: "Cancelled" },
};

function StatusBadge({ status }) {
  const key = String(status || "").toLowerCase().replace(/ /g, "_");
  const cfg = STATUS_CONFIG[key] || { bg: "#F1EFE8", color: "#5F5E5A", label: status || "-" };
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

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

// Roles that can dispatch shipments
const DISPATCH_ROLES = new Set(["superadmin", "hqadmin", "storemanager", "storeoperator"]);
// Roles that can close shipments
const CLOSE_ROLES = new Set(["superadmin", "hqadmin", "storemanager"]);
// Roles that can cancel shipments
const CANCEL_ROLES = new Set(["superadmin", "hqadmin", "storemanager"]);

function canDispatchShipment(roleId) {
  return DISPATCH_ROLES.has(normalizeRole(roleId));
}

function canCloseShipment(roleId) {
  return CLOSE_ROLES.has(normalizeRole(roleId));
}

function canCancelShipment(roleId) {
  return CANCEL_ROLES.has(normalizeRole(roleId));
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function parseShippingStatusFilter(search) {
  const params = new URLSearchParams(search || "");
  const status = String(params.get("status") || "").toLowerCase();
  return shippingStatuses.has(status) ? status : "";
}

function DispatchModal({ shipment, onClose, onSuccess }) {
  const defaultCarrier = shipment?.carrier || "";
  const isKnownCarrier = CARRIERS.includes(defaultCarrier);
  const [carrierMode, setCarrierMode] = useState(defaultCarrier && !isKnownCarrier ? "manual" : "select");
  const [carrier, setCarrier] = useState(defaultCarrier);
  const [trackingNo, setTrackingNo] = useState(shipment?.tracking_no || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDispatch = async () => {
    if (!carrier.trim()) { setError("Carrier is required."); return; }
    if (!trackingNo.trim()) { setError("Tracking number is required."); return; }
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/v1/shipping/${shipment.shipment_id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier: carrier.trim(), tracking_no: trackingNo.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Dispatch failed");
      onSuccess(data.data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Dispatch Shipment</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
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
              <SelectTrigger><SelectValue placeholder="Select carrier..." /></SelectTrigger>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
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

function CloseModal({ shipment, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClose = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/shipping/${shipment.shipment_id}/close`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Close failed");
      onSuccess(data.data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Close Shipment</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground mb-3">
          Confirm close shipment <span className="font-mono font-medium">{shipment.shipment_id}</span>? This marks the shipment as received by customer and cannot be undone.
        </p>
        <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm space-y-2">
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
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
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

function CancelModal({ shipment, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCancel = async () => {
    if (!reason.trim()) { setError("Cancellation reason is required."); return; }
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/shipping/${shipment.shipment_id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Cancel failed");
      onSuccess(data.data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cancel Shipment</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cancel shipment <span className="font-mono font-medium">{shipment.shipment_id}</span> — {shipment.customer_name || "Unknown Customer"}?
        </p>
        <div className="space-y-1 mt-2">
          <Label>Reason <span className="text-destructive">*</span></Label>
          <Input placeholder="e.g. Customer cancelled order" value={reason}
            onChange={(e) => { setError(""); setReason(e.target.value); }} disabled={loading} />
          {error && <p className="text-sm text-destructive mt-1">{error}</p>}
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
  const auth = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const roleId = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);
  const canView = useMemo(
    () => ["superadmin", "hqadmin", "storemanager", "storeoperator", "auditor", "readonly"].includes(roleId),
    [roleId],
  );
  const canDispatch = useMemo(() => canDispatchShipment(roleId), [roleId]);
  const canClose = useMemo(() => canCloseShipment(roleId), [roleId]);
  const canCancelShip = useMemo(() => canCancelShipment(roleId), [roleId]);

  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const selectedShipment = useMemo(() => rows.find((r) => r.shipment_id === selectedShipmentId) || null, [rows, selectedShipmentId]);

  useEffect(() => {
    const status = parseShippingStatusFilter(location.search);
    setFilters((current) => ({ ...current, status }));
    setPage(1);
  }, [location.search]);

  const loadShipments = useCallback(async () => {
    if (!session.tenant_id || !canView) { setRows([]); setTotal(0); setLoading(false); return; }
    try {
      setLoading(true);
      setError("");
      const result = await fetchShipments(session, {
        page, pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
        carrier: filters.carrier || undefined,
      });
      const items = Array.isArray(result?.data) ? result.data : [];
      setRows(items);
      setTotal(Number(result?.total || 0));
      setSelectedShipmentId((current) => {
        if (current && items.some((r) => r.shipment_id === current)) return current;
        return items[0]?.shipment_id || "";
      });
    } catch (loadError) {
      setRows([]); setTotal(0);
      setError(loadError.message || "Failed to load shipments");
    } finally { setLoading(false); }
  }, [canView, filters, page, pageSize, session]);

  useEffect(() => { loadShipments(); }, [loadShipments]);

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };

  const handleActionSuccess = (updated) => {
    setRows((current) => current.map((r) => r.shipment_id === updated.shipment_id ? updated : r));
    setDispatchTarget(null);
    setCloseTarget(null);
    setCancelTarget(null);
  };

  const colSpan = 7;

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Shipping" }]} />
      <h1 className="text-2xl font-bold mb-4">Shipping</h1>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-9 min-w-[220px] flex-1"
              placeholder="Search Shipment ID, Customer, Carrier, Tracking..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
            <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="packed">Packed</SelectItem>
                <SelectItem value="carton_generated">Carton Generated</SelectItem>
                <SelectItem value="dispatched">Dispatched</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-9" onClick={() => { setFilters(initialFilters); setPage(1); }}>Clear</Button>
            <Button variant="outline" className="h-9" onClick={loadShipments} disabled={loading}>Refresh</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-left">Shipment ID</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Carrier</th>
                  <th className="px-3 py-2 text-left">Tracking</th>
                  <th className="px-3 py-2 text-left">Dispatch Due</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Cancellation Reason</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading shipments...
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      No shipments found.
                    </td>
                  </tr>
                )}
                {!loading && rows.map((row) => (
                  <tr
                    key={row.shipment_id}
                    className={`border-t cursor-pointer hover:bg-accent/40 ${selectedShipmentId === row.shipment_id ? "bg-accent/30" : ""}`}
                    onClick={() => setSelectedShipmentId(row.shipment_id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.shipment_id}</td>
                    <td className="px-3 py-2">{row.customer_name || "-"}</td>
                    <td className="px-3 py-2">{row.carrier || "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.tracking_no || "-"}</td>
                    <td className="px-3 py-2">{formatDateTime(row.dispatch_due_at || row.ship_by)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={row.status} />
                        {row.is_overdue && <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: "#FEE2E2", color: "#991B1B" }}>Overdue</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{row.cancellation_reason || "-"}</td>
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
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[92px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail panel */}
      {selectedShipment && (
        <div className="mt-4 rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="font-mono">{selectedShipment.shipment_id}</span>
              <StatusBadge status={selectedShipment.status} />
              {selectedShipment.is_overdue && (
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: "#FEE2E2", color: "#991B1B" }}>Overdue</span>
              )}
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Info grid */}
            <div className="rounded-md border bg-muted/20 px-4 py-3">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Customer</p>
                  <p className="font-medium">{selectedShipment.customer_name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Carrier</p>
                  <p>{selectedShipment.carrier || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Tracking No</p>
                  <p className="font-mono text-xs">{selectedShipment.tracking_no || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Dispatch Due</p>
                  <p>{formatDateTime(selectedShipment.dispatch_due_at || selectedShipment.ship_by)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Dispatched At</p>
                  <p>{formatDateTime(selectedShipment.dispatched_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Closed At</p>
                  <p>{formatDateTime(selectedShipment.closed_at || selectedShipment.updated_at)}</p>
                </div>
                {selectedShipment.cancellation_reason && (
                  <div className="col-span-2 md:col-span-4">
                    <p className="text-xs text-muted-foreground mb-0.5">Cancellation Reason</p>
                    <p className="font-medium text-destructive">{selectedShipment.cancellation_reason}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            {(canDispatch || canClose || canCancelShip) && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                {canDispatch && DISPATCHABLE.has(selectedShipment.status) && (
                  <Button size="sm" onClick={() => setDispatchTarget(selectedShipment)}>
                    Dispatch Shipment
                  </Button>
                )}
                {canClose && selectedShipment.status === "dispatched" && (
                  <Button size="sm" variant="outline" onClick={() => setCloseTarget(selectedShipment)}>
                    Close Shipment
                  </Button>
                )}
                {canCancelShip && ["pending", "packed", "carton_generated"].includes(selectedShipment.status) && (
                  <Button size="sm" variant="destructive" onClick={() => setCancelTarget(selectedShipment)}>
                    Cancel Shipment
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {dispatchTarget && <DispatchModal shipment={dispatchTarget} onClose={() => setDispatchTarget(null)} onSuccess={handleActionSuccess} />}
      {closeTarget && <CloseModal shipment={closeTarget} onClose={() => setCloseTarget(null)} onSuccess={handleActionSuccess} />}
      {cancelTarget && <CancelModal shipment={cancelTarget} onClose={() => setCancelTarget(null)} onSuccess={handleActionSuccess} />}
    </AppLayout>
  );
};

export default ShippingPage;