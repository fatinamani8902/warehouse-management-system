import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime } from "@/utils/dateTimeFormatter";
import { formatKg } from "@/utils/formatKg";
import { formatPackingType } from "@/utils/formatPackingType";
import { normalizePackingRole } from "@/utils/packingOwnership";
import {
  fetchPackingOrderById,
  fetchPackingOrders,
  toSessionContext,
} from "@/services/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };

const cardStyle = {
  background: "#fff", borderRadius: 12,
  border: "0.5px solid #e8ebf8", overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:            { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
  pending:          { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
  in_progress:      { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "In Progress" },
  carton_generated: { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "In Progress" },
  packed:           { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Packed" },
  completed:        { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Packed" },
  shipped:          { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Shipped" },
  cancelled:        { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db", dot: "#9ca3af",  label: "Cancelled" },
  exception:        { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", dot: "#ef4444",  label: "Exception" },
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

const PICKING_STATUS_CFG = {
  open:        { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", label: "Open" },
  assigned:    { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", label: "Assigned" },
  in_progress: { bg: "#fef3c7", color: "#92400e", border: "#fde68a", label: "In Progress" },
  picking:     { bg: "#fef3c7", color: "#92400e", border: "#fde68a", label: "In Progress" },
  done:        { bg: "#dcfce7", color: "#065f46", border: "#86efac", label: "Picked" },
  completed:   { bg: "#dcfce7", color: "#065f46", border: "#86efac", label: "Picked" },
  picked:      { bg: "#dcfce7", color: "#065f46", border: "#86efac", label: "Picked" },
  cancelled:   { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "Cancelled" },
};

function PickingStatusPill({ status }) {
  const key = String(status || "").toLowerCase().replace(/ /g, "_");
  const c = PICKING_STATUS_CFG[key] || { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", label: status || "-" };
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

// ── Constants ─────────────────────────────────────────────────────────────────
function DetailField({ label, value, mono, children }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      {children || (
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
          {value ?? "-"}
        </p>
      )}
    </div>
  );
}

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
  return (
    <DetailSection title={title}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5" style={{ columnGap: 14, rowGap: 11, alignItems: "start" }}>
        {children}
      </div>
    </DetailSection>
  );
}

const initialFilters = { search: "", status: "", dateFrom: "", dateTo: "" };
const packingStatusOptions = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Page ──────────────────────────────────────────────────────────────────────
function normalizeRole(roleId) {
  return normalizePackingRole(roleId);
}

const PackingPage = () => {
  const auth    = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const roleId  = useMemo(() => normalizeRole(auth.currentUser?.role_id || auth.currentUser?.role), [auth.currentUser?.role_id, auth.currentUser?.role]);
  const canView = useMemo(
    () => ["superadmin", "hqadmin", "admin", "storemanager", "warehousemanager", "storeoperator", "auditor", "readonly"].includes(roleId),
    [roleId],
  );

  // storeoperator only sees packing orders linked to pick lists assigned to them
  const isOperator = roleId === "storeoperator";

  const [filters, setFilters]               = useState(initialFilters);
  const [page, setPage]                     = useState(1);
  const [pageSize, setPageSize]             = useState(10);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState("");
  const [rows, setRows]                     = useState([]);
  const [total, setTotal]                   = useState(0);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [selectedOrder, setSelectedOrder]   = useState(null);
  const dateRangeError = filters.dateFrom && filters.dateTo && filters.dateTo < filters.dateFrom
    ? "To Date cannot be earlier than From Date."
    : "";
  const bannerText = useMemo(() => {
    if (selectedOrder) {
      return "Packing execution is completed from the Mobile application by the assigned operator.";
    }
    if (["superadmin", "hqadmin", "admin", "storemanager", "warehousemanager"].includes(roleId)) {
      return "Viewing all packing tasks for this warehouse.";
    }
    return "View only — packing actions are restricted.";
  }, [roleId, selectedOrder]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const loadList = useCallback(async () => {
    if (!session.tenant_id || !canView) { setRows([]); setTotal(0); setLoading(false); return; }
    try {
      setLoading(true); setError("");
      if (dateRangeError) {
        setRows([]);
        setTotal(0);
        setError(dateRangeError);
        return;
      }

      // storeoperator: filter packing orders by their assigned picker user_id
      const extraParams = isOperator ? { assigned_picker: session.user_id } : {};

      const result = await fetchPackingOrders(session, { page, pageSize, ...filters, ...extraParams });
      const items  = Array.isArray(result?.data) ? result.data : [];
      setRows(items);
      setTotal(Number(result?.total || 0));
      setSelectedPackId((cur) => (cur && items.some((i) => i.pack_id === cur)) ? cur : "");
    } catch (e) {
      setRows([]); setTotal(0);
      setError(e.message || "Failed to load packing orders");
    } finally { setLoading(false); }
  }, [canView, dateRangeError, filters, isOperator, page, pageSize, session]);

  const loadDetail = useCallback(async (packId) => {
    if (!packId || !session.tenant_id || !canView) { setSelectedOrder(null); return; }
    try {
      const res = await fetchPackingOrderById(session, packId);
      setSelectedOrder(res?.data ?? res ?? null);
    } catch (e) {
      setSelectedOrder(null);
      setError(e.message || "Failed to load pack order details");
    }
  }, [canView, session]);

  useEffect(() => { loadList(); },                 [loadList]);
  useEffect(() => { loadDetail(selectedPackId); }, [selectedPackId, loadDetail]);

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };
  const clearFilters = () => { setFilters(initialFilters); setPage(1); };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Packing" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Packing</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
          {isOperator ? "Monitor your assigned packing orders" : "Monitor packing orders"}
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
          {error}
        </div>
      )}

      <div style={cardStyle}>
        {/* Toolbar */}
        <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
            <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
              placeholder="Search pack ID, wave, carton, order, customer…"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
          </div>
          <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
            <SelectTrigger style={{ height: 40, width: 175, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {packingStatusOptions.map((opt) => (
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
          <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={loadList} disabled={loading}>Refresh</button>
        </div>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafbff" }}>
              {["Pack ID", "Wave ID", "Sales Order", "Customer", "Packed By", "Packaging", "Weight", "Status", "Created"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading packing orders…
                </span>
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>
                {isOperator ? "No packing orders assigned to you." : "No packing orders found."}
              </td></tr>
            )}
            {!loading && rows.map((row) => {
              const isSel = selectedPackId === row.pack_id;
              return (
                <tr key={row.pack_id}
                  style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  onClick={() => setSelectedPackId((prev) => prev === row.pack_id ? "" : row.pack_id)}
                >
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.pack_id}</td>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.wave_id || row.pick_list_id || "-"}</td>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.so_id || row.order_ref || "-"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{row.customer_name || "-"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: row.packed_by_user_display ? 600 : 400, color: row.packed_by_user_display ? T_PRIMARY : T_MUTED }}>
                    {row.packed_by_user_display || row.packed_by || "-"}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
                    {formatPackingType(row.packaging_type)}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
                    {formatKg(row.weight_kg)}
                  </td>
                  <td style={{ padding: "14px 16px" }}><StatusPill status={row.status} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{formatDateTime(row.created_at)}</td>
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

        {/* ── Detail Panel ── */}
        {selectedOrder && (
          <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
            <div style={{ padding: "18px 16px 16px" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{selectedOrder.pack_id}</span>
                <StatusPill status={selectedOrder.status} />
              </div>

              <DetailFieldGrid title="Packing Information">
                <DetailField label="Pack ID" value={selectedOrder.pack_id || "-"} mono />
                <DetailField label="Wave ID" value={selectedOrder.wave_id || selectedOrder.pick_list_id || "-"} mono />
                <DetailField label="Sales Order" value={selectedOrder.so_id || selectedOrder.order_ref || "-"} mono />
                <DetailField label="Customer" value={selectedOrder.customer_name || "-"} />
                <DetailField label="Assigned Operator" value={selectedOrder.assigned_to_user_display || selectedOrder.assigned_to_user_name || selectedOrder.assigned_to_user_id || "-"} />
                <DetailField label="Packed By" value={selectedOrder.packed_by_user_display || selectedOrder.packed_by_display || selectedOrder.packed_by || "-"} />
                <DetailField label="Pick List Status">
                  <PickingStatusPill status={selectedOrder.pick_list_status} />
                </DetailField>
                <DetailField label="Carton ID" value={selectedOrder.carton_id || "-"} mono />
                <DetailField label="Packaging Type" value={formatPackingType(selectedOrder.packaging_type)} />
                <DetailField label="Weight (kg)" value={formatKg(selectedOrder.weight_kg)} />
                <DetailField label="Packed At" value={formatDateTime(selectedOrder.packed_at)} />
              </DetailFieldGrid>

              {/* Execution notice */}
              <div style={{ padding: "12px 14px", borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, lineHeight: "20px", color: T_PRIMARY, marginBottom: 4 }}>Execution Ownership</p>
                <p style={{ fontSize: 12, color: T_LABEL }}>
                  {bannerText}
                </p>
              </div>

              {/* Lines table */}
              <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Line", "SKU", "Qty"].map((h) => (
                        <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!(selectedOrder.lines || []).length && (
                      <tr><td colSpan={3} style={{ padding: "20px 14px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No line items.</td></tr>
                    )}
                    {(selectedOrder.lines || []).map((line) => (
                      <tr key={`${selectedOrder.pack_id}-${line.line_no}`} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{line.line_no}</td>
                        <td style={{ padding: "11px 14px", color: T_SECONDARY }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px" }}>{line.sku_id}</div>
                          <div style={{ marginTop: 2, fontSize: 12, color: T_PRIMARY }}>
                            {line.sku_name || line.product_name || line.sku_description || line.description || "Unnamed product"}
                          </div>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{line.qty_required ?? line.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        )}
      </div>

    </AppLayout>
  );
};

export default PackingPage;
