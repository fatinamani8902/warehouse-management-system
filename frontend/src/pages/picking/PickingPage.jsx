import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime as formatDt } from "@/utils/dateTimeFormatter";
import {
  fetchPickListById,
  fetchPickLists,
  fetchPickingOperators,
  assignPickList,
  toSessionContext,
} from "@/services/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";
const WARNING      = "#d97706";
const WARNING_BG   = "#fef3c7";
const WARNING_BDR  = "#fde68a";
const DANGER       = "#dc2626";
const DANGER_BG    = "#fee2e2";
const DANGER_BDR   = "#fca5a5";
const SUCCESS      = "#16a34a";
const SUCCESS_BG   = "#dcfce7";
const SUCCESS_BDR  = "#86efac";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnOutline = { ...btnBase, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: ACCENT, color: "#fff", border: "none" };

const cardStyle = {
  background: "#fff", borderRadius: 12,
  border: "0.5px solid #e8ebf8", overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:      { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Draft" },
  open:       { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Open" },
  picking:    { bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "In Progress" },
  in_progress:{ bg: "#fef9c3", color: "#713f12", border: "#fde68a", dot: "#eab308",  label: "In Progress" },
  picked:     { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6",  label: "Picked" },
  completed:  { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Picked" },
  done:       { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Picked" },
  packed:     { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Packed" },
  shipped:    { bg: "#dcfce7", color: "#065f46", border: "#86efac", dot: "#22c55e",  label: "Shipped" },
  cancelled:  { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db", dot: "#9ca3af",  label: "Cancelled" },
  pending:    { bg: "#f3f4f6", color: "#111827", border: "#d1d5db", dot: "#6b7280",  label: "Pending" },
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
function DetailField({ label, value, mono, span, accent }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: accent ? ACCENT : T_PRIMARY, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>
        {value ?? "-"}
      </p>
    </div>
  );
}

// ── Assign Operator Modal ─────────────────────────────────────────────────────
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

function AssignModal({ pickList, operators, onAssign, onClose }) {
  const [selectedUserId, setSelectedUserId] = useState(pickList?.assigned_to_user_id || "");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");

  const handleAssign = async () => {
    if (!selectedUserId) { setError("Please select an operator"); return; }
    setAssigning(true);
    setError("");
    try {
      await onAssign(selectedUserId);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to assign operator");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: 24,
        width: 420, maxWidth: "90vw",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, lineHeight: "22px", color: T_PRIMARY, margin: 0 }}>
            Assign Operator
          </h3>
          <button onClick={onClose} style={{ ...btnBase, background: "none", color: T_MUTED, fontSize: 20, padding: 0 }}>✕</button>
        </div>

        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY, marginBottom: 16 }}>
          Pick List: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{pickList?.pick_list_id}</span>
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
            Select Operator
          </label>
          <select
            style={{ width: "100%", height: 38, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px", fontSize: 13, color: T_PRIMARY, background: "#fff", outline: "none" }}
            value={selectedUserId}
            onChange={(e) => { setSelectedUserId(e.target.value); setError(""); }}
          >
            <option value="">— Select operator —</option>
            {operators.map((op) => (
              <option key={op.user_id} value={op.user_id}>
                {op.user_name} {op.role_id ? `(${op.role_id})` : ""}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", borderRadius: 6, background: DANGER_BG, border: `0.5px solid ${DANGER_BDR}`, fontSize: 13, color: DANGER, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btnNeutral} onClick={onClose} disabled={assigning}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: assigning ? 0.7 : 1 }}
            onClick={handleAssign}
            disabled={assigning}
          >
            {assigning ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Short Pick Banner ─────────────────────────────────────────────────────────
function ShortPickBanner({ pickList }) {
  const lines = pickList?.lines || [];
  const shortLines = lines.filter(
    (l) => Number(l.qty_picked ?? l.scan_count ?? 0) < Number(l.qty_required ?? 0)
  );
  const reason = pickList?.short_pick_reason;
  const isShortPick = pickList?.is_short_pick || shortLines.length > 0;

  if (!isShortPick) return null;

  return (
    <div style={{ padding: "12px 14px", borderRadius: 8, background: WARNING_BG, border: `0.5px solid ${WARNING_BDR}`, marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: WARNING, marginBottom: 6 }}>
        Short Pick — {shortLines.length} line(s)
      </p>
      <p style={{ fontSize: 12, color: WARNING, marginBottom: shortLines.length > 0 ? 8 : 0 }}>
        The following lines were picked with less than required quantity. Manual follow-up required.
      </p>
      {shortLines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: reason ? 10 : 0 }}>
          {shortLines.map((l, i) => {
            const picked   = Number(l.qty_picked ?? l.scan_count ?? 0);
            const required = Number(l.qty_required ?? 0);
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T_SECONDARY }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{l.sku_id}</span>
                <span style={{ color: WARNING }}>
                  Picked {picked} / Required {required}
                  {" "}<span style={{ fontWeight: 700 }}>({required - picked} short)</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {reason && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${WARNING_BDR}` }}>
          <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: WARNING, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
            Short Pick Reason
          </p>
          <p style={{ fontSize: 13, color: T_SECONDARY, fontStyle: "italic" }}>"{reason}"</p>
        </div>
      )}
    </div>
  );
}

// ── Cancellation Banner ───────────────────────────────────────────────────────
function CancellationBanner({ pickList }) {
  if (String(pickList?.status || "").toLowerCase() !== "cancelled") return null;
  const reason      = pickList?.cancellation_reason;
  const cancelledBy = pickList?.cancelled_by;
  const cancelledAt = pickList?.cancelled_at;

  return (
    <div style={{ padding: "12px 14px", borderRadius: 8, background: DANGER_BG, border: `0.5px solid ${DANGER_BDR}`, marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: DANGER, marginBottom: 6 }}>✕ Pick List Cancelled</p>
      {reason ? (
        <>
          <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: DANGER, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Cancellation Reason</p>
          <p style={{ fontSize: 13, color: T_SECONDARY, fontStyle: "italic", marginBottom: cancelledBy || cancelledAt ? 8 : 0 }}>"{reason}"</p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: DANGER }}>No reason provided.</p>
      )}
      {(cancelledBy || cancelledAt) && (
        <p style={{ fontSize: 11, color: T_LABEL, marginTop: 4 }}>
          {cancelledBy && <>Cancelled by {cancelledBy}</>}
          {cancelledBy && cancelledAt && "  ·  "}
          {cancelledAt && formatDt(cancelledAt)}
        </p>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const initialFilters = { search: "", status: "", dateFrom: "", dateTo: "" };

function canonicalPickListId(item) {
  return item?.wave_id || item?.pick_list_id || "";
}

function pickLineProductName(line) {
  return line?.sku_name
    || line?.product_name
    || line?.sku_description
    || line?.description
    || "Unnamed product";
}

function canShowPickAssignmentAction(pickList) {
  if (!pickList) return false;
  const safeStatuses = new Set(["open", "pending", "assigned"]);
  const startedStatuses = new Set(["in_progress", "picking", "picked", "done", "completed", "cancelled"]);
  const status = String(pickList.status || "").toLowerCase();
  if (startedStatuses.has(status)) return false;
  if (status && !safeStatuses.has(status)) return false;
  const lines = Array.isArray(pickList.lines) ? pickList.lines : [];
  return !lines.some((line) => {
    const lineStatus = String(line.status || "").toLowerCase();
    const pickedValues = [line.qty_picked, line.scan_count, line.picked_qty]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    return startedStatuses.has(lineStatus) || pickedValues.some((value) => value > 0);
  });
}

const roleAliases = {
  superadmin: "superadmin", hqadmin: "hqadmin",
  storemanager: "storemanager", warehouseadmin: "storemanager",
  warehousemanager: "storemanager", storeoperator: "storeoperator",
  storekeeper: "storeoperator", warehouseclerk: "storeoperator",
  auditor: "auditor", readonly: "readonly",
};

const pickStatusFilters = new Set([
  "open", "assigned", "in_progress", "picked",
]);

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
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
  const roleId   = useMemo(() => normalizeRole(auth.currentUser?.role_id || auth.currentUser?.role), [auth.currentUser?.role_id, auth.currentUser?.role]);
  const canView  = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator", "auditor", "readonly"].includes(roleId), [roleId]);
  const canAssign = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);

  // storeoperator only sees tasks assigned to themselves
  const isOperator = roleId === "storeoperator";

  const [filters, setFilters]                       = useState(initialFilters);
  const [page, setPage]                             = useState(1);
  const [pageSize, setPageSize]                     = useState(10);
  const [loading, setLoading]                       = useState(true);
  const [error, setError]                           = useState("");
  const [rows, setRows]                             = useState([]);
  const [total, setTotal]                           = useState(0);
  const [selectedPickListId, setSelectedPickListId] = useState("");
  const [selectedPickList, setSelectedPickList]     = useState(null);
  const [operators, setOperators]                   = useState([]);
  const [showAssignModal, setShowAssignModal]       = useState(false);
  const [assignSuccess, setAssignSuccess]           = useState("");

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

      // storeoperator: auto-filter by their own user_id
      const extraParams = isOperator ? { assigned_user: session.user_id } : {};

      const result = await fetchPickLists(session, { page, pageSize, ...filters, ...extraParams });
      const items  = Array.isArray(result?.data) ? result.data : [];
      setRows(items);
      setTotal(Number(result?.total || 0));
      setSelectedPickListId((cur) => (
        cur && items.some((item) => canonicalPickListId(item) === cur)
      ) ? cur : "");
    } catch (e) {
      setRows([]); setTotal(0);
      setError(e.message || "Failed to load pick lists");
    } finally { setLoading(false); }
  }, [canView, filters, isOperator, page, pageSize, session]);

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

  const loadOperators = useCallback(async () => {
    try {
      const res = await fetchPickingOperators(session);
      setOperators(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch (e) {
      console.error("Failed to load operators:", e.message);
    }
  }, [session]);

  useEffect(() => { loadList(); },                     [loadList]);
  useEffect(() => { loadDetail(selectedPickListId); }, [selectedPickListId, loadDetail]);

  const handleOpenAssign = async () => {
    await loadOperators();
    setShowAssignModal(true);
  };

  const handleAssign = async (userId) => {
    await assignPickList(session, selectedPickListId, userId);
    setAssignSuccess("Operator assigned successfully");
    await loadDetail(selectedPickListId);
    await loadList();
    setTimeout(() => setAssignSuccess(""), 3000);
  };

  const updateFilter = (key, value) => { setFilters((c) => ({ ...c, [key]: value })); setPage(1); };
  const clearFilters = () => { setFilters(initialFilters); setPage(1); };

  const canAssignThis = canAssign && canShowPickAssignmentAction(selectedPickList);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Picking" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Picking</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
          {isOperator ? "Your assigned pick lists" : "View and track pick list operations"}
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
              placeholder="Search pick list, wave, user…"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
          </div>
          <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
            <SelectTrigger style={{ height: 40, width: 175, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="picked">Picked</SelectItem>
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
              {["Pick List ID", "Order Ref", "Wave Ref", "Assigned User", "Status", "Created", "Started", "Completed"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading pick lists…
                </span>
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>
                {isOperator ? "No pick lists assigned to you." : "No pick lists found."}
              </td></tr>
            )}
            {!loading && rows.map((row) => {
              const rowId = canonicalPickListId(row);
              const isSel = selectedPickListId === rowId;
              return (
                <tr key={rowId}
                  style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent", borderBottom: "0.5px solid #f0f0f0" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  onClick={() => setSelectedPickListId((prev) => prev === rowId ? "" : rowId)}
                >
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{rowId}</td>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: row.order_ref || row.order_id ? ACCENT : T_MUTED }}>{row.order_ref || row.order_id || row.so_id || "-"}</td>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_SECONDARY }}>{row.wave_id || rowId}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: row.assigned_to_user_name ? T_PRIMARY : T_MUTED }}>{row.assigned_to_user_name || "Unassigned"}</td>
                  <td style={{ padding: "14px 16px" }}><StatusPill status={row.status} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{formatDt(row.created_at)}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{formatDt(row.started_at)}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{formatDt(row.completed_at)}</td>
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
        {selectedPickList && (
          <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
            <div style={{ padding: "18px 16px 16px" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{canonicalPickListId(selectedPickList)}</span>
                  <StatusPill status={selectedPickList.status} />
                </div>
              </div>

              {/* Assign success toast */}
              {assignSuccess && (
                <div style={{ padding: "8px 12px", borderRadius: 6, background: SUCCESS_BG, border: `0.5px solid ${SUCCESS_BDR}`, fontSize: 13, color: SUCCESS, marginBottom: 12 }}>
                  ✓ {assignSuccess}
                </div>
              )}

              {/* Cancellation banner */}
              <CancellationBanner pickList={selectedPickList} />

              {/* Short pick banner */}
              <ShortPickBanner pickList={selectedPickList} />

              {/* Execution notice */}
              <div style={{ padding: "12px 14px", borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#fafbff", marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, lineHeight: "20px", color: T_PRIMARY, marginBottom: 4 }}>Execution Ownership</p>
                <p style={{ fontSize: 12, color: T_LABEL }}>
                  Pick execution and item verification are controlled by mobile only. Web portal is view-only.
                </p>
              </div>

              <DetailFieldGrid title="Pick List Information">
                <DetailField label="Order Ref"     value={selectedPickList.order_ref || selectedPickList.order_id || selectedPickList.so_id || "-"} mono accent={!!(selectedPickList.order_ref || selectedPickList.order_id || selectedPickList.so_id)} />
                <DetailField label="Wave Ref"      value={selectedPickList.wave_id || canonicalPickListId(selectedPickList)} mono />
                <DetailField label="Assigned User" value={selectedPickList.assigned_to_user_name || "Unassigned"} />
                <DetailField label="Started At"    value={formatDt(selectedPickList.started_at)} />
                <DetailField label="Completed At"  value={formatDt(selectedPickList.completed_at)} />
              </DetailFieldGrid>

              {/* Lines table */}
              <div style={{ borderRadius: 8, border: "0.5px solid #e5e7eb", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Line", "SKU", "Location", "Required", "Picked", "Status"].map((h, i) => (
                        <th key={h} style={{ padding: "9px 14px", textAlign: i >= 3 && i <= 4 ? "right" : "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.05em", textTransform: "uppercase", color: T_LABEL }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!(selectedPickList.lines || []).length && (
                      <tr><td colSpan={6} style={{ padding: "20px 14px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No line items.</td></tr>
                    )}
                    {(selectedPickList.lines || []).map((line, idx) => {
                      const picked   = Number(line.qty_picked ?? line.scan_count ?? 0);
                      const required = Number(line.qty_required ?? 0);
                      const isShort  = line.status === "picked" && picked < required;
                      return (
                        <tr key={`${canonicalPickListId(selectedPickList)}-${line.pick_task_id || line.line_id || line.line_no || idx}`}
                          style={{ borderTop: "0.5px solid #f0f0f0", background: isShort ? WARNING_BG : "transparent" }}>
                          <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{line.line_no ?? idx + 1}</td>
                          <td style={{ padding: "11px 14px", color: T_SECONDARY }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px" }}>{line.sku_id}</div>
                            <div style={{ marginTop: 2, fontSize: 12, color: T_PRIMARY }}>
                              {pickLineProductName(line)}
                            </div>
                          </td>
                          <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
                            <div>{line.location_id || "-"}</div>
                            {line.location_code && line.location_code !== line.location_id && (
                              <div style={{ marginTop: 2, fontFamily: "inherit", fontSize: 11, color: T_MUTED }}>{line.location_code}</div>
                            )}
                          </td>
                          <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{required}</td>
                          <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13, fontWeight: 700, color: isShort ? WARNING : T_PRIMARY }}>
                            {picked}
                            {isShort && (
                              <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4, color: WARNING }}>
                                ({required - picked} short)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "11px 14px" }}><StatusPill status={line.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {canAssignThis && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                  <button style={btnPrimary} onClick={handleOpenAssign}>
                    {selectedPickList.assigned_to_user_name ? "Reassign Operator" : "Assign Operator"}
                  </button>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {/* Assign Operator Modal */}
      {showAssignModal && (
        <AssignModal
          pickList={selectedPickList}
          operators={operators}
          onAssign={handleAssign}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </AppLayout>
  );
};

export default PickingPage;
export { canShowPickAssignmentAction, pickLineProductName };
