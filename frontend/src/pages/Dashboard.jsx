import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import {
  dashboardKPIs, chartData, recentActivities, alerts, floorStatus,
} from "@/data/mockData";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ArrowDownToLine, PackageOpen, Target, ClipboardList,
  Truck, AlertTriangle, Activity, Bell, X, Users, FileText,
} from "lucide-react";

// ── Design tokens (identical to InboundPage / OutboundPage) ──────────────────
const ACCENT      = "#3b5bdb";
const T_PRIMARY   = "#111827";
const T_SECONDARY = "#374151";
const T_LABEL     = "#6b7280";
const T_MUTED     = "#9ca3af";

// ── Card shell ────────────────────────────────────────────────────────────────
const cardStyle = {
  background: "#fff",
  borderRadius: 12,
  border: "0.5px solid #e8ebf8",
  overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

// ── KPI config ────────────────────────────────────────────────────────────────
const kpiCards = [
  {
    label: "Today's Inbound",   value: dashboardKPIs.todayInbound,
    iconEl: ArrowDownToLine,    iconBg: "#eff6ff", iconColor: "#1d4ed8",
    barColor: "#185FA5",        hint: `${dashboardKPIs.todayInboundYesterday} yesterday`,
    progVal: dashboardKPIs.todayInbound, progMax: dashboardKPIs.todayInboundYesterday || 10,
    to: "/inbound?tab=asn&date=today&status=open",
  },
  {
    label: "Pending Putaway",   value: dashboardKPIs.pendingPutaway,
    iconEl: PackageOpen,        iconBg: "#fffbeb", iconColor: "#d97706",
    barColor: "#BA7517",        hint: `of ${dashboardKPIs.pendingPutawayMax} max`,
    progVal: dashboardKPIs.pendingPutaway, progMax: dashboardKPIs.pendingPutawayMax,
    to: "/putaway?status=pending",
  },
  {
    label: "Stock Accuracy",    value: `${dashboardKPIs.stockAccuracy}%`,
    iconEl: Target,             iconBg: "#f0fdf4", iconColor: "#16a34a",
    barColor: "#3B6D11",        hint: "target 100%",
    progVal: dashboardKPIs.stockAccuracy, progMax: 100,
    to: null,
  },
  {
    label: "Picks Done",        value: `${dashboardKPIs.picksDone}/${dashboardKPIs.openPicksTotal}`,
    iconEl: ClipboardList,      iconBg: "#f5f3ff", iconColor: "#7c3aed",
    barColor: "#534AB7",        hint: `${dashboardKPIs.openPicks} still open`,
    progVal: dashboardKPIs.picksDone, progMax: dashboardKPIs.openPicksTotal,
    to: "/picking?status=open",
  },
  {
    label: "Overdue Shipments", value: dashboardKPIs.overdueShipments,
    iconEl: Truck,              iconBg: "#fff1f2", iconColor: "#dc2626",
    barColor: "#E24B4A",        hint: "needs dispatch",
    progVal: dashboardKPIs.overdueShipments, progMax: 5,
    to: "/shipping?status=overdue",
  },
  {
    label: "Exceptions",        value: dashboardKPIs.exceptionsCount,
    iconEl: AlertTriangle,      iconBg: "#fff7ed", iconColor: "#ea580c",
    barColor: "#D85A30",        hint: `${dashboardKPIs.exceptionsMax - dashboardKPIs.exceptionsCount} resolved`,
    progVal: dashboardKPIs.exceptionsCount, progMax: dashboardKPIs.exceptionsMax,
    to: "/inventory?view=exceptions&status=open",
  },
];

const agingColors = ["#185FA5", "#1D9E75", "#EF9F27", "#E24B4A"];
const agingTextColors = ["#1d4ed8", "#0f766e", "#d97706", "#dc2626"];

const floorStatusCfg = {
  active: { bg: "#f0fdf4", color: "#15803d", label: "Active" },
  idle:   { bg: "#f9fafb", color: "#6b7280", label: "Idle" },
  break:  { bg: "#fffbeb", color: "#d97706", label: "Break" },
};

const alertCfg = {
  error:   { bg: "#fff1f2", border: "#fecdd3", dot: "#ef4444", color: "#b91c1c" },
  warning: { bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b", color: "#92400e" },
  info:    { bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6", color: "#1d4ed8" },
};

// ── KPI progress bar ──────────────────────────────────────────────────────────
function KpiProgress({ value, max, color }) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: "#f1f5f9", overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: color, transition: "width 0.5s" }} />
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 16px 10px", borderBottom: "0.5px solid #eef0fc" }}>
      {Icon && <Icon size={13} color={T_LABEL} />}
      <span style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {children}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const criticalAlerts = alerts.filter((a) => a.type === "error");
  const showBanner = !bannerDismissed && criticalAlerts.length > 0;

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Dashboard" }]} />

      {/* Page header — matches Inbound/Returns/etc */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>Warehouse overview & key metrics</p>
      </div>

      {/* Critical alert banner */}
      {showBanner && (
        <div style={{
          marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 10,
          background: "#fff1f2", border: "0.5px solid #fecdd3", borderRadius: 8,
          padding: "10px 14px", fontSize: 13, color: "#b91c1c",
        }}>
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0, color: "#ef4444" }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600 }}>
              {criticalAlerts.length === 1 ? "1 critical item needs attention" : `${criticalAlerts.length} critical items need attention`}
            </span>
            <span style={{ color: "#dc2626", marginLeft: 8 }}>
              — {criticalAlerts.map((a) => a.message).join(" · ")}
            </span>
          </div>
          <button onClick={() => setBannerDismissed(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171", padding: 0, flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {kpiCards.map((kpi) => {
          const Icon = kpi.iconEl;
          return (
            <div key={kpi.label}
              onClick={() => kpi.to && navigate(kpi.to)}
              style={{
                ...cardStyle,
                cursor: kpi.to ? "pointer" : "default",
                transition: "transform 0.15s, box-shadow 0.15s",
                padding: 16,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(59,91,219,.13)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(59,91,219,.07)"; }}
            >
              <div style={{ display: "inline-flex", padding: 8, borderRadius: 8, background: kpi.iconBg, marginBottom: 12 }}>
                <Icon size={15} color={kpi.iconColor} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T_PRIMARY, lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: T_LABEL, marginTop: 4, lineHeight: 1.3 }}>{kpi.label}</div>
              <KpiProgress value={kpi.progVal} max={kpi.progMax} color={kpi.barColor} />
              <div style={{ fontSize: 11, color: T_MUTED, marginTop: 4 }}>{kpi.hint}</div>
            </div>
          );
        })}
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Bar chart */}
        <div style={cardStyle}>
          <SectionLabel>Inbound vs Outbound — Last 7 Days</SectionLabel>
          <div style={{ padding: "12px 16px 16px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData.inboundOutbound} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: T_LABEL }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: T_LABEL }} axisLine={false} tickLine={false} width={24} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "0.5px solid #e8ebf8", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}
                  cursor={{ fill: "#f5f7ff" }}
                />
                <Bar dataKey="inbound"  name="Inbound"  fill="#378ADD" radius={[3, 3, 0, 0]} />
                <Bar dataKey="outbound" name="Outbound" fill="#1D9E75" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Inventory Aging */}
        <div style={cardStyle}>
          <SectionLabel>Inventory Aging</SectionLabel>
          <div style={{ padding: "12px 16px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {chartData.inventoryAging.map((item, i) => (
              <div key={item.range} style={{ borderRadius: 8, background: "#fafbff", padding: 12, border: "0.5px solid #eef0fc" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: agingTextColors[i] }}>{item.pct}%</div>
                <div style={{ fontSize: 11, color: T_LABEL, marginTop: 2, marginBottom: 8 }}>{item.range}</div>
                <div style={{ height: 4, borderRadius: 4, background: "#f1f5f9", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, width: `${item.pct}%`, background: agingColors[i] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

        {/* Floor Status */}
        <div style={cardStyle}>
          <SectionLabel icon={Users}>Floor Status</SectionLabel>
          <div style={{ padding: "8px 8px 12px" }}>
            {floorStatus.map((person) => (
              <div key={person.userId} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 8,
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f5f7ff"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: "#dbeafe", color: "#1d4ed8",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                }}>
                  {person.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.name}</div>
                  <div style={{ fontSize: 12, color: T_LABEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.task}</div>
                </div>
                {(() => {
                  const cfg = floorStatusCfg[person.status] || floorStatusCfg.idle;
                  return (
                    <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activities */}
        <div style={cardStyle}>
          <SectionLabel icon={Activity}>Recent Activities</SectionLabel>
          <div style={{ padding: "8px 8px 12px" }}>
            {recentActivities.filter((a) => a.action !== "Login").map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "8px 10px", borderRadius: 8,
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f5f7ff"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ fontSize: 12, color: T_MUTED, width: 48, flexShrink: 0, paddingTop: 1, lineHeight: 1.4 }}>{a.time}</span>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, color: T_PRIMARY }}>{a.action}</span>
                  <span style={{ color: T_LABEL }}> — {a.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div style={cardStyle}>
          <SectionLabel icon={Bell}>Alerts</SectionLabel>
          <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((a, i) => {
              const cfg = alertCfg[a.type] || { bg: "#f9fafb", border: "#e5e7eb", dot: "#9ca3af", color: T_SECONDARY };
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  fontSize: 13, padding: "10px 12px", borderRadius: 8,
                  background: cfg.bg, border: `0.5px solid ${cfg.border}`,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0, marginTop: 3 }} />
                  <span style={{ color: cfg.color, lineHeight: 1.5 }}>{a.message}</span>
                </div>
              );
            })}
            <div style={{ marginTop: 4, paddingTop: 10, borderTop: "0.5px solid #eef0fc" }}>
              <button
                onClick={() => navigate("/audit")}
                style={{
                  width: "100%", height: 32, borderRadius: 7, fontSize: 13,
                  border: "0.5px solid #d1d5db", background: "#fff", color: T_SECONDARY,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f5f7ff"}
                onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
              >
                <FileText size={13} />
                View Audit Log
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;