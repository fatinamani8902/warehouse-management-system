import CreateOrder from "./CreateOrder";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { WorkflowStepper } from "@/components/shared/WorkflowStepper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchOrders, releaseOrder, toSessionContext } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { canCreateOutbound, canReleaseOutbound, canCancelOutbound } from "@/services/rbac";

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:     { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Draft" },
  released:  { bg: "#dbeafe", color: "#1e3a8a", border: "#93c5fd", dot: "#3b82f6",  label: "Released" },
  picking:   { bg: "#ffedd5", color: "#7c2d12", border: "#fdba74", dot: "#f97316",  label: "Picking" },
  packed:    { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Packed" },
  shipped:   { bg: "#ede9fe", color: "#3b0764", border: "#c4b5fd", dot: "#8b5cf6",  label: "Shipped" },
  completed: { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e",  label: "Completed" },
  cancelled: { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5", dot: "#ef4444",  label: "Cancelled" },
};

function StatusPill({ status }) {
  const key = String(status || "").toLowerCase();
  const c = STATUS_CFG[key] || STATUS_CFG.draft;
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

// ── Button styles ─────────────────────────────────────────────────────────────
const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 34, padding: "0 14px", borderRadius: 7, fontSize: 14, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 34, padding: "0 16px", borderRadius: 7, fontSize: 14, fontWeight: 500, background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 34, padding: "0 16px", borderRadius: 7, fontSize: 14, fontWeight: 500, background: "#e03131", color: "#fff" };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };

// ── Helpers ───────────────────────────────────────────────────────────────────
const SKU_OPTIONS = [
  { sku_id: "SKU000001", description: "Industrial Bearing 6205" },
  { sku_id: "SKU000002", description: "Hydraulic Pump HP-200" },
  { sku_id: "SKU000003", description: "Lithium Battery Pack LB-12" },
  { sku_id: "SKU000004", description: "Steel Fastener M10x50" },
  { sku_id: "SKU000005", description: "Safety Gloves SG-XL" },
];

const orderFlow = ["draft", "released", "picking", "packed", "shipped", "completed"];

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
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

// DetailField — matches InboundPage exactly
function DetailField({ label, value, danger, span }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 14, fontWeight: 500, color: danger ? "#991b1b" : T_PRIMARY }}>
        {value ?? "—"}
      </p>
    </div>
  );
}

const initialFilters = { search: "", status: "" };

// ── Page ──────────────────────────────────────────────────────────────────────
export default function OutboundPage() {
  const auth = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const userRole = auth.currentUser?.role || "";
  const canCreate  = canCreateOutbound(userRole);
  const canRelease = canReleaseOutbound(userRole);
  const canCancel  = canCancelOutbound(userRole);

  const [orders, setOrders]                   = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState("");

  const [filters, setFilters]   = useState(initialFilters);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showAddSku, setShowAddSku] = useState(false);
  const [skuForm, setSkuForm]       = useState({ sku_id: "", qty: "" });
  const [skuError, setSkuError]     = useState("");

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError]   = useState("");

  const filteredOrders = useMemo(() => {
    let rows = [...orders].sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));
    const q = filters.search.trim().toLowerCase();
    if (q) rows = rows.filter((o) =>
      (o.order_id || "").toLowerCase().includes(q) ||
      (o.customer_name || "").toLowerCase().includes(q) ||
      (o.status || "").toLowerCase().includes(q)
    );
    if (filters.status) rows = rows.filter((o) => (o.status || "").toLowerCase() === filters.status);
    return rows;
  }, [orders, filters]);

  const totalPages  = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pagedOrders = useMemo(() => filteredOrders.slice((page - 1) * pageSize, page * pageSize), [filteredOrders, page, pageSize]);
  const selectedOrder = useMemo(() => orders.find((o) => o.order_id === selectedOrderId) || null, [orders, selectedOrderId]);

  const loadOrders = async () => {
    try {
      setLoading(true); setError("");
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
      setSelectedOrderId((cur) => (cur && items.some((o) => o.order_id === cur)) ? cur : (items[0]?.order_id || ""));
    } catch (err) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrders(); }, [session]);

  const handleRelease = async (orderId) => {
    const order = orders.find((o) => o.order_id === orderId);
    if (!order || order.lines_count === 0) { setError("Add at least one SKU line before releasing order"); return; }
    try {
      await releaseOrder(session, orderId);
      setOrders((prev) => prev.map((o) => o.order_id === orderId ? { ...o, status: "released" } : o));
    } catch (err) { setError(err.message || "Failed to release order"); }
  };

  const confirmCancel = () => {
    if (!cancelReason.trim()) { setCancelError("Cancellation reason is required"); return; }
    if (cancelReason.trim().length < 5) { setCancelError("Reason must be at least 5 characters"); return; }
    setOrders((prev) => prev.map((o) =>
      o.order_id === cancelTarget ? { ...o, status: "cancelled", cancellation_reason: cancelReason.trim() } : o
    ));
    setCancelTarget(null); setCancelReason("");
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Outbound" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Outbound Orders</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>Manage and fulfil customer orders</p>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
          {error}
        </div>
      )}

      {/* ── Card ───────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" }}>

        {/* Toolbar */}
        <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
            <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              style={{ width: "100%", height: 34, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 14, color: T_PRIMARY, outline: "none", background: "#fff" }}
              placeholder="Search Order ID, Customer…"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
          </div>
          <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
            <SelectTrigger style={{ height: 34, width: 175, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
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
          <div style={{ flex: 1 }} />
          <button style={btnNeutral} onClick={() => { setFilters(initialFilters); setPage(1); }}>Clear</button>
          <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={loadOrders} disabled={loading}>Refresh</button>
          {canCreate && <button style={btnPrimary} onClick={() => setShowCreateOrder(true)}>+ Create Order</button>}
        </div>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafbff" }}>
              {["Order ID", "Customer", "Created", "Lines", "Status"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>Loading orders…</td></tr>
            )}
            {!loading && pagedOrders.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No orders found.</td></tr>
            )}
            {!loading && pagedOrders.map((row) => {
              const isSel = selectedOrderId === row.order_id;
              return (
                <tr
                  key={row.order_id}
                  style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  onClick={() => setSelectedOrderId((prev) => prev === row.order_id ? "" : row.order_id)}
                >
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>
                      {row.order_id}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>
                    {row.customer_name || row.customer || "—"}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>
                    {formatDateTime(row.created_at || row.createdAt)}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: T_SECONDARY }}>
                    {row.lines_count || 0}
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
          <span style={{ fontSize: 13, color: T_SECONDARY }}>
            {filteredOrders.length} result{filteredOrders.length === 1 ? "" : "s"} · Page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger style={{ height: 30, width: 110, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 5, color: T_PRIMARY }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
            {[
              { label: "Prev", disabled: page <= 1,         onClick: () => setPage((p) => p - 1) },
              { label: "Next", disabled: page >= totalPages, onClick: () => setPage((p) => p + 1) },
            ].map((b) => (
              <button key={b.label} disabled={b.disabled} onClick={b.onClick}
                style={{ ...btnOutline, opacity: b.disabled ? 0.4 : 1, cursor: b.disabled ? "not-allowed" : "pointer" }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        {selectedOrder && (
          <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
            <div style={{ padding: "18px 16px 16px" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: T_PRIMARY }}>
                  {selectedOrder.order_id}
                </span>
                <StatusPill status={selectedOrder.status} />
              </div>

              {/* Stepper */}
              <div style={{ marginBottom: 18 }}>
                <WorkflowStepper steps={toStepperSteps(selectedOrder.status)} />
              </div>

              {/* Info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
                <DetailField label="Customer" value={selectedOrder.customer_name} />
                <DetailField label="Created"  value={formatDateTime(selectedOrder.created_at || selectedOrder.createdAt)} />
                <DetailField label="Lines"    value={selectedOrder.lines_count || 0} />
                {selectedOrder.notes && <DetailField label="Notes" value={selectedOrder.notes} />}
                {selectedOrder.cancellation_reason && (
                  <DetailField label="Cancellation Reason" value={selectedOrder.cancellation_reason} danger span />
                )}
              </div>

              {/* SKU table */}
              <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {[["SKU", "left"], ["Ordered Qty", "right"], ["Picked Qty", "right"]].map(([h, align]) => (
                        <th key={h} style={{ padding: "9px 14px", textAlign: align, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.lines || []).length === 0 && (
                      <tr><td colSpan={3} style={{ padding: "20px 14px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No line items yet.</td></tr>
                    )}
                    {(selectedOrder.lines || []).map((line) => (
                      <tr key={`${selectedOrder.order_id}-${line.sku_id}`} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                        <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: T_SECONDARY }}>
                          {line.sku_id}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>
                          {line.ordered_qty}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 14, fontWeight: 500, color: line.picked_qty > 0 ? T_PRIMARY : T_SECONDARY }}>
                          {line.picked_qty || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action buttons */}
              {selectedOrder.status === "draft" && (canRelease || canCancel) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {canRelease && (
                    <button
                      style={{ ...btnPrimary, opacity: !selectedOrder.lines_count ? 0.5 : 1, cursor: !selectedOrder.lines_count ? "not-allowed" : "pointer" }}
                      disabled={!selectedOrder.lines_count}
                      onClick={() => handleRelease(selectedOrder.order_id)}
                    >
                      Release Order
                    </button>
                  )}
                  {canRelease && (
                    <button style={btnNeutral} onClick={() => { setSkuForm({ sku_id: "", qty: "" }); setSkuError(""); setShowAddSku(true); }}>
                      + Add SKU Line
                    </button>
                  )}
                  {canCancel && (
                    <button
                      style={btnDanger}
                      onClick={() => { setCancelTarget(selectedOrder.order_id); setCancelReason(""); setCancelError(""); }}
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add SKU dialog ─────────────────────────────────────────────────── */}
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
              <input
                type="number" min="1"
                value={skuForm.qty}
                onChange={(e) => { setSkuError(""); setSkuForm((p) => ({ ...p, qty: e.target.value })); }}
                placeholder="Enter quantity"
                style={{ width: "100%", height: 36, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 14, color: T_PRIMARY, outline: "none" }}
              />
            </div>
            {skuError && <p style={{ fontSize: 12, color: "#991b1b" }}>{skuError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setShowAddSku(false)}>Back</button>
              <button style={btnPrimary} onClick={confirmAddSku}>Add Line</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cancel dialog ──────────────────────────────────────────────────── */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p style={{ fontSize: 13, color: T_SECONDARY }}>
              Are you sure you want to cancel order <strong style={{ color: T_PRIMARY, fontFamily: "var(--font-mono)" }}>{cancelTarget}</strong>? This action cannot be undone.
            </p>
            <div className="space-y-1">
              <Label>Cancellation Reason <span style={{ color: "#e03131" }}>*</span></Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => { setCancelError(""); setCancelReason(e.target.value); }}
                placeholder="Please provide the reason for cancellation (min. 5 characters)"
                rows={3}
              />
            </div>
            {cancelError && <p style={{ fontSize: 12, color: "#991b1b" }}>{cancelError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setCancelTarget(null)}>Back</button>
              <button style={btnDanger} onClick={confirmCancel}>Confirm Cancellation</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create Order modal ─────────────────────────────────────────────── */}
      {showCreateOrder && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", zIndex: 50 }}>
          <div style={{ background: "#fff", padding: 24, borderRadius: 12, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: T_PRIMARY, marginBottom: 16 }}>Create Order</h2>
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