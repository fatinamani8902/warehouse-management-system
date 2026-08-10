import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  Box,
  Package,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Truck,
  Warehouse,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { useAuth } from "@/contexts/AuthContext";
import { fetchDashboardSummary, toSessionContext } from "@/services/api";

const ACCENT = "#3b5bdb";
const T_PRIMARY = "#111827";
const T_SECONDARY = "#374151";
const T_LABEL = "#6b7280";
const T_MUTED = "#9ca3af";

const cardStyle = {
  background: "#fff",
  borderRadius: 12,
  border: "0.5px solid #e8ebf8",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

const stageStyles = {
  inbound: { color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  storage: { color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  fulfilment: { color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  outbound: { color: "#dc2626", bg: "#fff1f2", border: "#fecdd3" },
  returns: { color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
};

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function formatNumber(value) {
  if (!hasValue(value) || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString();
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function partsText(parts, fallback = "-") {
  const visible = parts.filter((part) => part.show !== false);
  if (!visible.length) return fallback;
  return visible.map((part) => part.text).join(" \u00b7 ");
}

function CardShell({ title, subtitle, children }) {
  return (
    <section style={{ ...cardStyle, padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, lineHeight: "22px", color: T_PRIMARY }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ marginTop: 2, fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_LABEL }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function OperationCard({ item, onOpen }) {
  const Icon = item.icon;
  const tone = stageStyles[item.key] || stageStyles.inbound;

  return (
    <button
      type="button"
      aria-label={`${item.label}: ${formatNumber(item.value)}. ${item.breakdown}`}
      onClick={onOpen}
      style={{
        ...cardStyle,
        minHeight: 118,
        width: "100%",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        fontFamily: "inherit",
        cursor: "pointer",
        borderColor: tone.border,
        transition: "box-shadow 0.15s, transform 0.15s, border-color 0.15s",
      }}
      onFocus={(event) => {
        event.currentTarget.style.boxShadow = "0 0 0 2px rgba(59,91,219,.16), 0 4px 16px rgba(59,91,219,.13)";
      }}
      onBlur={(event) => {
        event.currentTarget.style.boxShadow = "0 2px 10px rgba(59,91,219,.07)";
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "translateY(-1px)";
        event.currentTarget.style.boxShadow = "0 4px 16px rgba(59,91,219,.13)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "none";
        event.currentTarget.style.boxShadow = "0 2px 10px rgba(59,91,219,.07)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: tone.bg,
            color: tone.color,
          }}
        >
          <Icon size={15} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: "20px", color: T_PRIMARY }}>
          {item.label}
        </span>
      </div>
      <div style={{ marginTop: 10, fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY }}>
        {formatNumber(item.value)}
      </div>
      <p style={{ marginTop: 4, fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_LABEL }}>
        {item.breakdown}
      </p>
    </button>
  );
}

function AttentionRow({ item, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.to)}
      aria-label={`${item.label}: ${formatNumber(item.value)}`}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 12,
        border: "0",
        borderBottom: "0.5px solid #eef0fc",
        background: "transparent",
        padding: "8px 0",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
      onFocus={(event) => {
        event.currentTarget.style.outline = "2px solid rgba(59,91,219,.24)";
        event.currentTarget.style.outlineOffset = "2px";
      }}
      onBlur={(event) => {
        event.currentTarget.style.outline = "none";
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "#f8fafc";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      <span>
        <span style={{ display: "block", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>
          {item.label}
        </span>
        {item.description && (
          <span style={{ display: "block", fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_MUTED }}>
            {item.description}
          </span>
        )}
      </span>
      <span
        style={{
          minWidth: 34,
          textAlign: "right",
          border: "0.5px solid #fecdd3",
          borderRadius: 999,
          background: "#fff1f2",
          color: "#be123c",
          padding: "1px 8px",
          fontSize: 12,
          fontWeight: 500,
          lineHeight: "16px",
        }}
      >
        {formatNumber(item.value)}
      </span>
    </button>
  );
}

const Dashboard = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const {
    currentTenantId,
    currentWarehouseId,
    currentUser,
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    user_id: userId,
    role_id: roleId,
    clerkToken,
    currentToken,
  } = auth;
  const session = useMemo(() => toSessionContext({
    currentTenantId,
    currentWarehouseId,
    currentUser,
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    user_id: userId,
    role_id: roleId,
    clerkToken,
    currentToken,
  }), [
    currentTenantId,
    currentWarehouseId,
    currentUser,
    tenantId,
    warehouseId,
    userId,
    roleId,
    clerkToken,
    currentToken,
  ]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fulfilmentOpen, setFulfilmentOpen] = useState(false);

  const loadSummary = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchDashboardSummary(session, { signal });
      if (!signal?.aborted) {
        setSummary(response?.data || null);
      }
    } catch (err) {
      if (!signal?.aborted) {
        setSummary(null);
        setError(err?.message || "Unable to load dashboard summary");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    const controller = new AbortController();
    loadSummary({ signal: controller.signal });
    return () => controller.abort();
  }, [loadSummary]);

  useEffect(() => {
    if (!fulfilmentOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setFulfilmentOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fulfilmentOpen]);

  const kpis = summary?.kpis || {};
  const statusSummary = summary?.status_summary || {};
  const inboundSummary = statusSummary.inbound || {};
  const pendingAsn = Number(inboundSummary.pending_asn || 0);
  const inTransitAsn = Number(inboundSummary.in_transit_asn || 0);
  const arrivedAsn = Number(inboundSummary.arrived_asn || 0);
  const receivingGrn = Number(inboundSummary.receiving_grn || 0);
  const activePutaway = Number(statusSummary.warehouse?.active_putaway || kpis.pending_putaway?.total || 0);
  const activePicking = Number(kpis.picking?.active || 0);
  const activePacking = Number(statusSummary.warehouse?.active_packing || 0);
  const readyToDispatch = Number(kpis.shipping?.ready_to_dispatch || 0);
  const dispatched = Number(kpis.shipping?.dispatched || 0);
  const returnsAwaitingRma = Number(kpis.returns?.return_created || 0);
  const openReturns = Number(kpis.returns?.open_returns || 0);
  const activeRmaFollowUp = Math.max(openReturns - returnsAwaitingRma, 0);
  const returnsAwaitingClosure = Number(kpis.returns?.returns_awaiting_closure || 0);

  const operations = [
    {
      key: "inbound",
      label: "Inbound",
      value: pendingAsn + inTransitAsn + arrivedAsn + receivingGrn,
      icon: ArrowDownToLine,
      breakdown: partsText([
        { text: `Pending ${formatNumber(pendingAsn)}` },
        { text: `In Transit ${formatNumber(inTransitAsn)}` },
        { text: `Awaiting Receiving ${formatNumber(arrivedAsn)}` },
        { text: `Receiving ${formatNumber(receivingGrn)}` },
      ]),
      onOpen: () => navigate("/inbound"),
    },
    {
      key: "storage",
      label: "Storage",
      value: activePutaway,
      icon: Warehouse,
      breakdown: `Active Putaway ${formatNumber(activePutaway)}`,
      onOpen: () => navigate("/putaway"),
    },
    {
      key: "fulfilment",
      label: "Fulfilment",
      value: activePicking + activePacking,
      icon: Package,
      breakdown: `Picking ${formatNumber(activePicking)} \u00b7 Packing ${formatNumber(activePacking)}`,
      onOpen: () => setFulfilmentOpen(true),
    },
    {
      key: "outbound",
      label: "Outbound",
      value: readyToDispatch + dispatched,
      icon: Truck,
      breakdown: `Ready ${formatNumber(readyToDispatch)} \u00b7 Dispatched ${formatNumber(dispatched)}`,
      onOpen: () => navigate("/shipping?status=packed"),
    },
    {
      key: "returns",
      label: "Returns",
      value: openReturns,
      icon: RotateCcw,
      breakdown: `Awaiting RMA ${formatNumber(returnsAwaitingRma)} \u00b7 RMA Follow-up ${formatNumber(activeRmaFollowUp)}`,
      onOpen: () => navigate("/returns"),
    },
  ];

  const attentionItems = [
    {
      label: "Overdue Shipments",
      value: Number(kpis.shipping?.overdue || 0),
      description: "Ready shipments past the planned ship date",
      to: "/shipping",
    },
    {
      label: "Putaway Exceptions",
      value: Number(kpis.pending_putaway?.exception || 0),
      description: "Putaway tasks requiring exception handling",
      to: "/putaway?status=exception",
    },
    {
      label: "Cycle Counts Awaiting Review",
      value: Number(kpis.approvals?.cycle_counts_submitted || 0),
      description: "Submitted cycle counts awaiting approval",
      to: "/inventory?view=cycle-count",
    },
    {
      label: "Adjustments Awaiting Approval",
      value: Number(kpis.approvals?.adjustments_submitted || 0),
      description: "Submitted inventory adjustments awaiting approval",
      to: "/inventory?view=adjustments",
    },
    {
      label: "Returns Awaiting Closure",
      value: returnsAwaitingClosure,
      description: "Completed RMA with linked Return still open",
      to: "/returns",
    },
  ].filter((item) => Number(item.value || 0) > 0);

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Dashboard" }]} />

      <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Dashboard</h1>
          <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Compact warehouse control tower</p>
          {summary?.generated_at && (
            <p style={{ fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_MUTED, marginTop: 3 }}>
              Last refreshed {formatDateTime(summary.generated_at)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => loadSummary()}
          disabled={loading}
          style={{
            height: 36,
            borderRadius: 7,
            border: "0.5px solid #d1d5db",
            background: "#fff",
            color: T_SECONDARY,
            cursor: loading ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "0 12px",
            fontSize: 13,
            fontWeight: 500,
            lineHeight: "20px",
            fontFamily: "inherit",
            opacity: loading ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading && (
        <div style={{ ...cardStyle, padding: 16, marginBottom: 12, fontSize: 13, lineHeight: "20px", color: T_LABEL }}>
          Loading dashboard summary...
        </div>
      )}

      {error && (
        <div style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "#fff1f2",
          border: "0.5px solid #fecdd3",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "#b91c1c",
        }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => loadSummary()}
            style={{
              height: 30,
              borderRadius: 6,
              border: "0.5px solid #fecdd3",
              background: "#fff",
              color: "#b91c1c",
              cursor: "pointer",
              padding: "0 10px",
              fontSize: 13,
              fontWeight: 500,
              lineHeight: "20px",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && !summary && (
        <div style={{ ...cardStyle, padding: 16, fontSize: 13, lineHeight: "20px", color: T_LABEL }}>
          No dashboard data available.
        </div>
      )}

      {summary && (
        <div style={{ display: "grid", gap: 12 }}>
          <CardShell title="Today’s Operations" subtitle="Click any stage to view more details.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              {operations.map((item) => (
                <OperationCard key={item.key} item={item} onOpen={item.onOpen} />
              ))}
            </div>
          </CardShell>

          <CardShell title="Need Attention">
            {attentionItems.length ? (
              <div>
                {attentionItems.map((item) => (
                  <AttentionRow key={item.label} item={item} onOpen={navigate} />
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_LABEL }}>
                No operational issues requiring attention.
              </p>
            )}
          </CardShell>
        </div>
      )}

      {fulfilmentOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFulfilmentOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15,23,42,.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fulfilment-selector-title"
            style={{ ...cardStyle, width: "100%", maxWidth: 360, padding: 16 }}
          >
            <h2 id="fulfilment-selector-title" style={{ fontSize: 15, fontWeight: 600, lineHeight: "22px", color: T_PRIMARY }}>
              View Fulfilment
            </h2>
            <p style={{ marginTop: 4, marginBottom: 12, fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_LABEL }}>
              Choose the fulfilment stage to open.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setFulfilmentOpen(false);
                  navigate("/picking");
                }}
                style={{
                  height: 38,
                  border: "0.5px solid #dbe3ff",
                  borderRadius: 8,
                  background: "#f8faff",
                  color: ACCENT,
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: "20px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                View Picking
              </button>
              <button
                type="button"
                onClick={() => {
                  setFulfilmentOpen(false);
                  navigate("/packing");
                }}
                style={{
                  height: 38,
                  border: "0.5px solid #dbe3ff",
                  borderRadius: 8,
                  background: "#fff",
                  color: ACCENT,
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: "20px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                View Packing
              </button>
            </div>
            <button
              type="button"
              onClick={() => setFulfilmentOpen(false)}
              style={{
                marginTop: 10,
                height: 34,
                width: "100%",
                border: "0.5px solid #e5e7eb",
                borderRadius: 8,
                background: "#fff",
                color: T_SECONDARY,
                fontSize: 13,
                fontWeight: 500,
                lineHeight: "20px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Dashboard;
