import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPickListById, fetchPickLists, toSessionContext } from "@/services/api";

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

const cardStyle = {
  background: "#fff", borderRadius: 12,
  border: "0.5px solid #e8ebf8", overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:      { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Draft" },
  open:       { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Open" },
  picking:    { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "Picking" },
  picked:     { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Picked" },
  completed:  { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Completed" },
  packed:     { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Packed" },
  shipped:    { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Shipped" },
  cancelled:  { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db", dot: "#9ca3af",  label: "Cancelled" },
  pending:    { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
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
function DetailField({ label, value, mono, span }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 14, fontWeight: 500, color: T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
        {value ?? "—"}
      </p>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const initialFilters = { search: "", status: "" };

const roleAliases = {
  superadmin: "superadmin", hqadmin: "hqadmin",
  storemanager: "storemanager", warehouseadmin: "storemanager",
  warehousemanager: "storemanager", storeoperator: "storeoperator",
  storekeeper: "storeoperator", warehouseclerk: "storeoperator",
  auditor: "auditor", readonly: "readonly",
};

const pickStatusFilters = new Set([
  "open", "draft", "picking", "picked", "completed", "packed", "shipped", "cancelled",
]);

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

function parsePickingStatusFilter(search) {
  const params = new URLSearchParams(search || "");
  const status = String(params.get("status") || "").toLowerCase();
  return pickStatusFilters.has(status) ? status : "";
}

// ── Page ──────────────────────────────────────────────────────────────────────
const PickingPage = () => {
  const location = useLocation();
  const auth     = useAuth();
  const session  = useMemo(() => toSessionContext(auth), [auth]);
  const roleId   = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);
  const canView  = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator", "auditor", "readonly"].includes(roleId), [roleId]);

  const [filters, setFilters]                   = useState(initialFilters);
  const [page, setPage]                         = useState(1);
  const [pageSize, setPageSize]                 = useState(10);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState("");
  const [rows, setRows]                         = useState([]);
  const [total, setTotal]                       = useState(0);
  const [selectedPickListId, setSelectedPickListId] = useState("");
  const [selectedPickList, setSelectedPickList] = useState(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    const statusFilter = parsePickingStatusFilter(location.search);
    setFilters((c) => ({ ...c, status: statusFilter }));
    setPage(1);
  }, [location.search]);

  const loadList = useCallback(async () => {
    if (!session.tenant_id || !canView) { setRows([]); setTotal(0); setLoading(false); return; }
    try {
      setLoading(true); setError("");
      const result = await fetchPickLists(session, { page, pageSize, ...filters });
      const items  = Array.isArray(result?.data) ? result.data : [];
      setRows(items);
      setTotal(Number(result?.total || 0));
      // no auto-select
      setSelectedPickListId((cur) => (cur && items.some((i) => i.pick_list_id === cur)) ? cur : "");
    } catch (e) {
      setRows([]); setTotal(0);
      setError(e.message || "Failed to load pick lists");
    } finally { setLoading(false); }
  }, [canView, filters, page, pageSize, session]);

  const loadDetail = useCallback(async (id) => {
    if (!id || !session.tenant_id || !canView) { setSelectedPickList(null); return; }
    try {
      const res = await fetchPickListById(session, id);
      setSelectedPickList(res?.data ?? res ?? null);
    } catch (e) {
      setSelectedPickList(null);
      setError(e.message || "Failed to load pick list details");
    }
  }, [canView, session]);

  useEffect(() => { loadList(); },                    [loadList]);
  useEffect(() => { loadDetail(selectedPickListId); }, [selectedPickListId, loadDetail]);

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };
  const clearFilters = () => { setFilters(initialFilters); setPage(1); };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Picking" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Picking</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>View and track pick list operations</p>
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
              placeholder="Search pick list, wave, user…"
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
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="picking">Picking</SelectItem>
              <SelectItem value="picked">Picked</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="packed">Packed</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
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
              {["Pick List ID", "Wave Ref", "Assigned User", "Status", "Created", "Started", "Completed"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading pick lists…
                </span>
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No pick lists found.</td></tr>
            )}
            {!loading && rows.map((row) => {
              const isSel = selectedPickListId === row.pick_list_id;
              return (
                <tr key={row.pick_list_id}
                  style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  onClick={() => setSelectedPickListId((prev) => prev === row.pick_list_id ? "" : row.pick_list_id)}
                >
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{row.pick_list_id}</td>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: T_SECONDARY }}>{row.wave_id || "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 600, color: row.assigned_to_user_name ? T_PRIMARY : T_MUTED }}>{row.assigned_to_user_name || "Unassigned"}</td>
                  <td style={{ padding: "14px 16px" }}><StatusPill status={row.status} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{formatDt(row.created_at)}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{formatDt(row.started_at)}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: T_SECONDARY }}>{formatDt(row.completed_at)}</td>
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
              { label: "Prev", disabled: page <= 1,         fn: () => setPage((p) => p - 1) },
              { label: "Next", disabled: page >= totalPages, fn: () => setPage((p) => p + 1) },
            ].map((b) => (
              <button key={b.label} disabled={b.disabled} onClick={b.fn}
                style={{ ...btnOutline, opacity: b.disabled ? 0.4 : 1, cursor: b.disabled ? "not-allowed" : "pointer" }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail Panel ── */}
        {selectedPickList && (
          <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
            <div style={{ padding: "18px 16px 16px" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: T_PRIMARY }}>{selectedPickList.pick_list_id}</span>
                <StatusPill status={selectedPickList.status} />
              </div>

              {/* Execution notice */}
              <div style={{ padding: "12px 14px", borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: T_PRIMARY, marginBottom: 4 }}>Execution Ownership</p>
                <p style={{ fontSize: 12, color: T_LABEL }}>
                  Pick execution and item verification are controlled by mobile API only. Web portal is view-only.
                </p>
              </div>

              {/* Info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
                <DetailField label="Wave Ref"      value={selectedPickList.wave_id} mono />
                <DetailField label="Assigned User" value={selectedPickList.assigned_to_user_name || "Unassigned"} />
                <DetailField label="Started At"    value={formatDt(selectedPickList.started_at)} />
                <DetailField label="Completed At"  value={formatDt(selectedPickList.completed_at)} />
              </div>

              {/* Lines table */}
              <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Line", "SKU", "Location", "Required", "Picked", "Status"].map((h, i) => (
                        <th key={h} style={{ padding: "9px 14px", textAlign: i >= 3 && i <= 4 ? "right" : "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!(selectedPickList.lines || []).length && (
                      <tr><td colSpan={6} style={{ padding: "20px 14px", textAlign: "center", fontSize: 14, color: T_SECONDARY }}>No line items.</td></tr>
                    )}
                    {(selectedPickList.lines || []).map((line) => (
                      <tr key={`${selectedPickList.pick_list_id}-${line.line_no}`} style={{ borderTop: "0.5px solid #f0f0f0" }}>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: T_SECONDARY }}>{line.line_no}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: T_SECONDARY }}>{line.sku_id}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: T_SECONDARY }}>{line.location_id}</td>
                        <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{line.qty_required}</td>
                        <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{line.qty_picked}</td>
                        <td style={{ padding: "11px 14px" }}><StatusPill status={line.status} /></td>
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

export default PickingPage;