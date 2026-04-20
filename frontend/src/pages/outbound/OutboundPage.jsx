import CreateOrder from "./CreateOrder";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { WorkflowStepper } from "@/components/shared/WorkflowStepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchOrders, releaseOrder, toSessionContext } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { canCreateOutbound, canReleaseOutbound, canCancelOutbound } from "@/services/rbac";

const SKU_OPTIONS = [
  { sku_id: "SKU000001", description: "Industrial Bearing 6205" },
  { sku_id: "SKU000002", description: "Hydraulic Pump HP-200" },
  { sku_id: "SKU000003", description: "Lithium Battery Pack LB-12" },
  { sku_id: "SKU000004", description: "Steel Fastener M10x50" },
  { sku_id: "SKU000005", description: "Safety Gloves SG-XL" },
];

const orderFlow = ["draft", "released", "picking", "packed", "shipped", "completed"];

const STATUS_CONFIG = {
  draft:      { bg: "#F1EFE8", color: "#5F5E5A", label: "Draft" },
  released:   { bg: "#DBEAFE", color: "#1E40AF", label: "Released" },
  picking:    { bg: "#FEF3C7", color: "#92400E", label: "Picking" },
  packed:     { bg: "#DBEAFE", color: "#1E40AF", label: "Packed" },
  shipped:    { bg: "#D1FAE5", color: "#065F46", label: "Shipped" },
  completed:  { bg: "#D1FAE5", color: "#065F46", label: "Completed" },
  cancelled:  { bg: "#FEE2E2", color: "#991B1B", label: "Cancelled" },
};

function StatusBadge({ status }) {
  const key = String(status || "").toLowerCase();
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

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function toStepperSteps(currentStatus) {
  let reachedCurrent = false;
  return orderFlow.map((status) => {
    if (status === currentStatus) {
      reachedCurrent = true;
      return { label: status.replace(/_/g, " "), status: "current" };
    }
    if (!reachedCurrent) return { label: status.replace(/_/g, " "), status: "completed" };
    return { label: status.replace(/_/g, " "), status: "pending" };
  });
}

const initialFilters = { search: "", status: "" };

export default function OutboundPage() {
  const auth = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const userRole = auth.currentUser?.role || "";
  const canCreate = canCreateOutbound(userRole);
  const canRelease = canReleaseOutbound(userRole);
  const canCancel = canCancelOutbound(userRole);

  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showAddSku, setShowAddSku] = useState(false);
  const [skuForm, setSkuForm] = useState({ sku_id: "", qty: "" });
  const [skuError, setSkuError] = useState("");

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");

  // Client-side filter + paginate
  const filteredOrders = useMemo(() => {
    let rows = [...orders].sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));
    const q = filters.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((o) =>
        (o.order_id || "").toLowerCase().includes(q) ||
        (o.customer_name || "").toLowerCase().includes(q) ||
        (o.status || "").toLowerCase().includes(q)
      );
    }
    if (filters.status) {
      rows = rows.filter((o) => (o.status || "").toLowerCase() === filters.status);
    }
    return rows;
  }, [orders, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pagedOrders = useMemo(() => {
    const offset = (page - 1) * pageSize;
    return filteredOrders.slice(offset, offset + pageSize);
  }, [filteredOrders, page, pageSize]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.order_id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetchOrders(session);
      const items = (response?.data || []).map((order) => ({
        ...order,
        customer_name: order.customer_name || "N/A",
        created_at: order.createdAt || order.created_at || new Date().toISOString(),
        lines_count: order.lines_count || (order.lines ? order.lines.length : 0),
        lines: order.lines || [],
        notes: order.notes || "",
      }));
      setOrders(items);
      setSelectedOrderId((current) => {
        if (current && items.some((o) => o.order_id === current)) return current;
        return items[0]?.order_id || "";
      });
    } catch (err) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrders(); }, [session]);

  const handleRelease = async (orderId) => {
    const order = orders.find((o) => o.order_id === orderId);
    if (!order || order.lines_count === 0) {
      setError("Add at least one SKU line before releasing order");
      return;
    }
    try {
      await releaseOrder(session, orderId);
      setOrders((prev) => prev.map((o) => o.order_id === orderId ? { ...o, status: "released" } : o));
    } catch (err) {
      setError(err.message || "Failed to release order");
    }
  };

  const confirmCancel = () => {
    if (!cancelReason.trim()) {
      setCancelError("Cancellation reason is required");
      return;
    }
    setOrders((prev) => prev.map((o) =>
      o.order_id === cancelTarget
        ? { ...o, status: "cancelled", cancellation_reason: cancelReason.trim() }
        : o
    ));
    setCancelTarget(null);
    setCancelReason("");
  };

  const confirmAddSku = () => {
    if (!skuForm.sku_id) { setSkuError("Please select a SKU"); return; }
    const qty = Number(skuForm.qty);
    if (!skuForm.qty || isNaN(qty) || qty <= 0) { setSkuError("Please enter a valid quantity"); return; }

    const newLine = { sku_id: skuForm.sku_id, ordered_qty: qty, picked_qty: 0 };
    setOrders((prev) => prev.map((order) => {
      if (order.order_id !== selectedOrderId) return order;
      const updatedLines = [...(order.lines || []), newLine];
      return { ...order, lines: updatedLines, lines_count: updatedLines.length };
    }));
    setShowAddSku(false);
  };

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Outbound" }]} />
      <h1 className="text-2xl font-bold mb-4">Outbound Orders</h1>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-9 min-w-[220px] flex-1"
              placeholder="Search Order ID, Customer..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
            <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="released">Released</SelectItem>
                <SelectItem value="picking">Picking</SelectItem>
                <SelectItem value="packed">Packed</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-9" onClick={() => { setFilters(initialFilters); setPage(1); }}>Clear</Button>
            <Button variant="outline" className="h-9" onClick={loadOrders} disabled={loading}>Refresh</Button>
            {canCreate && (
              <Button className="h-9" onClick={() => setShowCreateOrder(true)}>Create Order</Button>
            )}
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
                  <th className="px-3 py-2 text-left">Order ID</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Lines</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Cancellation Reason</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading orders...</td></tr>
                )}
                {!loading && pagedOrders.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No orders found.</td></tr>
                )}
                {!loading && pagedOrders.map((row) => (
                  <tr
                    key={row.order_id}
                    className={`border-t cursor-pointer hover:bg-accent/40 ${selectedOrderId === row.order_id ? "bg-accent/30" : ""}`}
                    onClick={() => setSelectedOrderId(row.order_id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.order_id}</td>
                    <td className="px-3 py-2">{row.customer_name || row.customer || "-"}</td>
                    <td className="px-3 py-2">{formatDateTime(row.created_at || row.createdAt)}</td>
                    <td className="px-3 py-2">{row.lines_count || 0}</td>
                    <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-2 text-muted-foreground">{row.cancellation_reason || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <div className="text-muted-foreground">
              {filteredOrders.length} result{filteredOrders.length === 1 ? "" : "s"} · Page {page} of {totalPages}
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
      {selectedOrder && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {selectedOrder.order_id}
              <StatusBadge status={selectedOrder.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <WorkflowStepper steps={toStepperSteps(selectedOrder.status)} />

            {/* Info grid */}
            <div className="rounded-md border bg-muted/20 px-4 py-3">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Customer</p>
                  <p className="font-medium">{selectedOrder.customer_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                  <p>{formatDateTime(selectedOrder.created_at || selectedOrder.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Lines</p>
                  <p>{selectedOrder.lines_count || 0}</p>
                </div>
                {selectedOrder.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                    <p>{selectedOrder.notes}</p>
                  </div>
                )}
                {selectedOrder.cancellation_reason && (
                  <div className="col-span-2 md:col-span-4">
                    <p className="text-xs text-muted-foreground mb-0.5">Cancellation Reason</p>
                    <p className="text-destructive font-medium">{selectedOrder.cancellation_reason}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Lines table */}
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-right">Ordered Qty</th>
                    <th className="px-3 py-2 text-right">Picked Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrder.lines || []).length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-5 text-center text-muted-foreground">No line items.</td></tr>
                  )}
                  {(selectedOrder.lines || []).map((line) => (
                    <tr key={`${selectedOrder.order_id}-${line.sku_id}`} className="border-t">
                      <td className="px-3 py-2">{line.sku_id}</td>
                      <td className="px-3 py-2 text-right">{line.ordered_qty}</td>
                      <td className="px-3 py-2 text-right">{line.picked_qty || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            {selectedOrder.status === "draft" && (canRelease || canCancel) && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                {canRelease && (
                  <Button size="sm" disabled={!selectedOrder.lines_count} onClick={() => handleRelease(selectedOrder.order_id)}>
                    Release Order
                  </Button>
                )}
                {canRelease && (
                  <Button size="sm" variant="outline" onClick={() => { setSkuForm({ sku_id: "", qty: "" }); setSkuError(""); setShowAddSku(true); }}>
                    + Add SKU Line
                  </Button>
                )}
                {canCancel && (
                  <Button size="sm" variant="destructive" onClick={() => { setCancelTarget(selectedOrder.order_id); setCancelReason(""); setCancelError(""); }}>
                    Cancel Order
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add SKU dialog */}
      <Dialog open={showAddSku} onOpenChange={setShowAddSku}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add SKU Line</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>SKU</Label>
              <Select value={skuForm.sku_id || "none"} onValueChange={(v) => { setSkuError(""); setSkuForm((p) => ({ ...p, sku_id: v === "none" ? "" : v })); }}>
                <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select SKU</SelectItem>
                  {SKU_OPTIONS.map((sku) => (
                    <SelectItem key={sku.sku_id} value={sku.sku_id}>{sku.sku_id} — {sku.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input
                type="number" min="1"
                value={skuForm.qty}
                onChange={(e) => { setSkuError(""); setSkuForm((p) => ({ ...p, qty: e.target.value })); }}
                placeholder="Enter quantity"
              />
            </div>
            {skuError && <p className="text-xs text-destructive">{skuError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddSku(false)}>Back</Button>
              <Button onClick={confirmAddSku}>Add Line</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to cancel order <strong>{cancelTarget}</strong>?
            </p>
            <div className="space-y-1">
              <Label>Cancellation Reason</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => { setCancelError(""); setCancelReason(e.target.value); }}
                placeholder="Please provide the reason for cancellation"
                rows={3}
              />
            </div>
            {cancelError && <p className="text-xs text-destructive">{cancelError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCancelTarget(null)}>Back</Button>
              <Button variant="destructive" onClick={confirmCancel}>Confirm Cancellation</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Order modal */}
      {showCreateOrder && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white p-6 rounded-md w-[420px] shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Create Order</h2>
            <CreateOrder
              onCreated={(order) => {
                setOrders((prev) => [order, ...prev]);
                setSelectedOrderId(order.order_id);
                setShowCreateOrder(false);
              }}
              onCancel={() => setShowCreateOrder(false)}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}