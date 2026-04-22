import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  confirmPacking,
  fetchPackingOptions,
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

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 34, padding: "0 14px", borderRadius: 7, fontSize: 14, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 34, padding: "0 16px", borderRadius: 7, fontSize: 14, background: ACCENT, color: "#fff" };

const cardStyle = {
  background: "#fff", borderRadius: 12,
  border: "0.5px solid #e8ebf8", overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:            { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Draft" },
  carton_generated: { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Carton Generated" },
  packed:           { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Packed" },
  shipped:          { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Shipped" },
  pending:          { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
  picking:          { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "Picking" },
  completed:        { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Completed" },
  cancelled:        { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db", dot: "#9ca3af",  label: "Cancelled" },
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

// ── Constants ─────────────────────────────────────────────────────────────────
const initialFilters = { search: "", status: "" };

const roleAliases = {
  superadmin: "superadmin",
  hqadmin: "hqadmin",
  storemanager: "storemanager",
  warehouseadmin: "storemanager",
  warehousemanager: "storemanager",
  storeoperator: "storeoperator",
  storekeeper: "storeoperator",
  warehouseclerk: "storeoperator",
  auditor: "auditor",
  readonly: "readonly",
};

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function isPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

// ── Page ──────────────────────────────────────────────────────────────────────
const PackingPage = () => {
  const auth    = useAuth();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const roleId  = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);
  const canView = useMemo(
    () => ["superadmin", "hqadmin", "storemanager", "storeoperator", "auditor", "readonly"].includes(roleId),
    [roleId],
  );
  const canManage = useMemo(
    () => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId),
    [roleId],
  );

  const [filters, setFilters]               = useState(initialFilters);
  const [page, setPage]                     = useState(1);
  const [pageSize, setPageSize]             = useState(10);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState("");
  const [rows, setRows]                     = useState([]);
  const [total, setTotal]                   = useState(0);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [selectedOrder, setSelectedOrder]   = useState(null);
  const [packagingTypes, setPackagingTypes] = useState([]);
  const [packagingType, setPackagingType]   = useState("");
  const [weightKg, setWeightKg]             = useState("");
  const [busyAction, setBusyAction]         = useState("");
  const [confirmPackOpen, setConfirmPackOpen] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const canConfirmPack = useMemo(
    () => isPositiveNumber(weightKg) && Boolean(packagingType),
    [weightKg, packagingType],
  );
  const isPickListCompleted = useMemo(
    () => String(selectedOrder?.pick_list_status || "").toLowerCase() === "completed",
    [selectedOrder?.pick_list_status],
  );
  const isAlreadyPacked = useMemo(
    () => ["packed", "shipped"].includes(String(selectedOrder?.status || "").toLowerCase()),
    [selectedOrder?.status],
  );

  const loadList = useCallback(async () => {
    if (!session.tenant_id || !canView) { setRows([]); setTotal(0); setLoading(false); return; }
    try {
      setLoading(true); setError("");
      const result = await fetchPackingOrders(session, { page, pageSize, ...filters });
      const items  = Array.isArray(result?.data) ? result.data : [];
      setRows(items);
      setTotal(Number(result?.total || 0));
      setSelectedPackId((cur) => (cur && items.some((i) => i.pack_id === cur)) ? cur : "");
    } catch (e) {
      setRows([]); setTotal(0);
      setError(e.message || "Failed to load packing orders");
    } finally { setLoading(false); }
  }, [canView, filters, page, pageSize, session]);

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

  const loadOptions = useCallback(async () => {
    if (!session.tenant_id || !canView) { setPackagingTypes([]); return; }
    try {
      const result = await fetchPackingOptions(session);
      setPackagingTypes(Array.isArray(result?.packaging_types) ? result.packaging_types : []);
    } catch { setPackagingTypes([]); }
  }, [canView, session]);

  useEffect(() => { loadList(); },                   [loadList]);
  useEffect(() => { loadOptions(); },                [loadOptions]);
  useEffect(() => { loadDetail(selectedPackId); },   [selectedPackId, loadDetail]);

  useEffect(() => {
    if (!selectedOrder) { setPackagingType(""); setWeightKg(""); return; }
    setPackagingType(selectedOrder.packaging_type || "");
    setWeightKg(selectedOrder.weight_kg ? String(selectedOrder.weight_kg) : "");
  }, [selectedOrder]);

  const refreshData = async (packId = selectedPackId) => {
    await loadList();
    if (packId) await loadDetail(packId);
  };

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };
  const clearFilters = () => { setFilters(initialFilters); setPage(1); };

  const handleConfirmPacking = async () => {
    if (!selectedOrder || !canManage) return;
    if (!canConfirmPack) { setError("Packaging type and weight are required before confirming packing"); return; }
    try {
      setBusyAction("confirm-pack"); setError("");
      await confirmPacking(session, selectedOrder.pack_id, {
        weight_kg: Number(weightKg),
        packaging_type: packagingType,
      });
      toast({ title: "Packing confirmed", description: `Pack order ${selectedOrder.pack_id} marked as packed` });
      setConfirmPackOpen(false);
      await refreshData(selectedOrder.pack_id);
    } catch (e) {
      const msg = e.message || "Unable to confirm packing";
      setError(msg);
      toast({ title: "Confirm packing failed", description: msg, variant: "destructive" });
    } finally { setBusyAction(""); }
  };

  const confirmDisabled = !canManage || !isPickListCompleted || busyAction !== "" || !canConfirmPack;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Packing" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Packing</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>View and manage packing orders</p>
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
              style={{ width: "100%", height: 34, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 14, color: T_PRIMARY, outline: "none", background: "#fff" }}
              placeholder="Search Pack ID, Pick List, Carton…"
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
              <SelectItem value="carton_generated">Carton Generated</SelectItem>
              <SelectItem value="packed">Packed</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
            </SelectContent>
          </Select>
          <div style={{ flex: 1 }} />
          <button style={btnNeutral} onClick={clearFilters}>Clear</button>
          <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={loadList} disabled={loading}>Refresh</button>
        </div>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafbff" }}>
              {["Pack ID", "Pick List", "Pick Status", "Status", "Created"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading packing orders…
                </span>
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No packing orders found.</td></tr>
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
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{row.pack_id}</td>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: T_SECONDARY }}>{row.pick_list_id || "—"}</td>
                  <td style={{ padding: "14px 16px" }}>{row.pick_list_status ? <StatusPill status={row.pick_list_status} /> : <span style={{ color: T_MUTED }}>—</span>}</td>
                  <td style={{ padding: "14px 16px" }}><StatusPill status={row.status} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{formatDateTime(row.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
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

        {/* ── Detail Panel ── */}
        {selectedOrder && (
          <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
            <div style={{ padding: "18px 16px 16px" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: T_PRIMARY }}>{selectedOrder.pack_id}</span>
                <StatusPill status={selectedOrder.status} />
              </div>

              {/* Info grid */}
              <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
                  {[
                    { label: "Pick List",        value: selectedOrder.pick_list_id || "—", mono: true },
                    { label: "Pick List Status", badge: selectedOrder.pick_list_status },
                    { label: "Carton ID",        value: selectedOrder.carton_id || "—" },
                    { label: "Packed At",        value: formatDateTime(selectedOrder.packed_at) },
                  ].map(({ label, value, mono, badge }) => (
                    <div key={label}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</p>
                      {badge
                        ? <StatusPill status={badge} />
                        : <p style={{ fontSize: 14, fontWeight: 500, color: T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>{value}</p>
                      }
                    </div>
                  ))}
                </div>
              </div>

              {/* Pack station controls */}
              {!isAlreadyPacked && (
                <>
                  {!isPickListCompleted && (
                    <div style={{ padding: "10px 14px", borderRadius: 8, border: "0.5px solid #fde68a", background: "#fefce8", fontSize: 13, color: "#713f12", marginBottom: 12 }}>
                      Packing can start only when linked Pick List status is COMPLETED.
                    </div>
                  )}

                  <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", padding: 16, marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
                      Pack Station Controls
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                          Packaging Type <span style={{ color: "#ef4444" }}>*</span>
                        </p>
                        <Select
                          value={packagingType || "none"}
                          onValueChange={(v) => setPackagingType(v === "none" ? "" : v)}
                          disabled={!canManage || busyAction !== ""}
                        >
                          <SelectTrigger style={{ height: 34, fontSize: 14, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                            <SelectValue placeholder="Select packaging type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select packaging type</SelectItem>
                            {packagingTypes.map((item) => (
                              <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                          Weight (kg) <span style={{ color: "#ef4444" }}>*</span>
                        </p>
                        <input
                          type="number" step="0.01" min="0"
                          value={weightKg}
                          onChange={(e) => setWeightKg(e.target.value)}
                          disabled={!canManage || busyAction !== ""}
                          placeholder="e.g. 2.5"
                          style={{ width: "100%", height: 34, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 14, color: T_PRIMARY, outline: "none", background: "#fff", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>
                    <div style={{ borderTop: "0.5px solid #e5e7eb", paddingTop: 12 }}>
                      <button
                        onClick={() => setConfirmPackOpen(true)}
                        disabled={confirmDisabled}
                        style={{ ...btnPrimary, opacity: confirmDisabled ? 0.5 : 1, cursor: confirmDisabled ? "not-allowed" : "pointer" }}
                      >
                        {busyAction === "confirm-pack"
                          ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Confirming…</>
                          : "Confirm Packing"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {isAlreadyPacked && (
                <div style={{ padding: "10px 14px", borderRadius: 8, border: "0.5px solid #86efac", background: "#f0fdf4", fontSize: 13, color: "#065f46", marginBottom: 16 }}>
                  This pack order is <strong>{selectedOrder.status}</strong> — ready for shipping.
                </div>
              )}

              {/* Lines table */}
              <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Line", "SKU", "Qty"].map((h) => (
                        <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!(selectedOrder.lines || []).length && (
                      <tr><td colSpan={3} style={{ padding: "20px 14px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No line items.</td></tr>
                    )}
                    {(selectedOrder.lines || []).map((line) => (
                      <tr key={`${selectedOrder.pack_id}-${line.line_no}`} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: T_SECONDARY }}>{line.line_no}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: T_SECONDARY }}>{line.sku_id}</td>
                        <td style={{ padding: "11px 14px", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{line.qty_required ?? line.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmPackOpen}
        onClose={() => setConfirmPackOpen(false)}
        onConfirm={handleConfirmPacking}
        title="Confirm Packing"
        description={selectedOrder
          ? `Confirm pack order ${selectedOrder.pack_id} as PACKED? This action cannot be undone.`
          : "Confirm packing"}
        confirmLabel={busyAction === "confirm-pack" ? "Confirming..." : "Confirm Pack"}
        cancelLabel="Back"
        variant="default"
      />
    </AppLayout>
  );
};

export default PackingPage;