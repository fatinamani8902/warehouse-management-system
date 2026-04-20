import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
import { cn } from "@/lib/utils";

function KpiProgress({ value, max, color }) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div className="mt-2 h-1 rounded-full bg-border/40 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

const kpiCards = [
  {
    label: "Today's Inbound", value: dashboardKPIs.todayInbound,
    icon: ArrowDownToLine, color: "text-blue-600", iconBg: "bg-blue-50",
    progressValue: dashboardKPIs.todayInbound, progressMax: dashboardKPIs.todayInboundYesterday || 10,
    progressColor: "#185FA5", hint: `${dashboardKPIs.todayInboundYesterday} yesterday`,
    to: "/inbound?tab=asn&date=today&status=open",
  },
  {
    label: "Pending Putaway", value: dashboardKPIs.pendingPutaway,
    icon: PackageOpen, color: "text-amber-600", iconBg: "bg-amber-50",
    progressValue: dashboardKPIs.pendingPutaway, progressMax: dashboardKPIs.pendingPutawayMax,
    progressColor: "#BA7517", hint: `of ${dashboardKPIs.pendingPutawayMax} max`,
    to: "/putaway?status=pending",
  },
  {
    label: "Stock Accuracy", value: `${dashboardKPIs.stockAccuracy}%`,
    icon: Target, color: "text-emerald-600", iconBg: "bg-emerald-50",
    progressValue: dashboardKPIs.stockAccuracy, progressMax: 100,
    progressColor: "#3B6D11", hint: "target 100%", to: null,
  },
  {
    label: "Picks Done", value: `${dashboardKPIs.picksDone}/${dashboardKPIs.openPicksTotal}`,
    icon: ClipboardList, color: "text-violet-600", iconBg: "bg-violet-50",
    progressValue: dashboardKPIs.picksDone, progressMax: dashboardKPIs.openPicksTotal,
    progressColor: "#534AB7", hint: `${dashboardKPIs.openPicks} still open`,
    to: "/picking?status=open",
  },
  {
    label: "Overdue Shipments", value: dashboardKPIs.overdueShipments,
    icon: Truck, color: "text-red-600", iconBg: "bg-red-50",
    progressValue: dashboardKPIs.overdueShipments, progressMax: 5,
    progressColor: "#E24B4A", hint: "needs dispatch",
    to: "/shipping?status=overdue",
  },
  {
    label: "Exceptions", value: dashboardKPIs.exceptionsCount,
    icon: AlertTriangle, color: "text-orange-600", iconBg: "bg-orange-50",
    progressValue: dashboardKPIs.exceptionsCount, progressMax: dashboardKPIs.exceptionsMax,
    progressColor: "#D85A30", hint: `${dashboardKPIs.exceptionsMax - dashboardKPIs.exceptionsCount} resolved`,
    to: "/inventory?view=exceptions&status=open",
  },
];

const agingColors = [
  { textColor: "text-blue-600",   barColor: "#185FA5" },
  { textColor: "text-teal-600",   barColor: "#1D9E75" },
  { textColor: "text-amber-600",  barColor: "#EF9F27" },
  { textColor: "text-red-600",    barColor: "#E24B4A" },
];

const floorBadge = {
  active: "bg-emerald-50 text-emerald-700",
  idle:   "bg-muted text-muted-foreground",
  break:  "bg-amber-50 text-amber-700",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const criticalAlerts = alerts.filter((a) => a.type === "error");
  const showBanner = !bannerDismissed && criticalAlerts.length > 0;

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Dashboard" }]} />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Warehouse overview & key metrics</p>
      </div>

      {/* Critical alert banner */}
      {showBanner && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
          <div className="flex-1">
            <span className="font-medium">{criticalAlerts.length === 1 ? "1 critical item needs attention" : `${criticalAlerts.length} critical items need attention`}</span>
            <span className="text-red-600/80 ml-2">— {criticalAlerts.map((a) => a.message).join(" · ")}</span>
          </div>
          <button onClick={() => setBannerDismissed(true)} className="shrink-0 text-red-400 hover:text-red-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPI Cards — 3 per row on md, 6 on xl */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {kpiCards.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => kpi.to && navigate(kpi.to)}
            className={cn("text-left rounded-xl w-full", kpi.to ? "cursor-pointer" : "cursor-default")}
          >
            <Card className={cn(
              "h-full border transition-all duration-200",
              kpi.to && "hover:-translate-y-0.5 hover:shadow-md hover:border-border/80"
            )}>
              <CardContent className="p-4">
                <div className={cn("inline-flex p-2 rounded-lg mb-3", kpi.iconBg)}>
                  <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                </div>
                <div className="text-2xl font-bold leading-none text-foreground">{kpi.value}</div>
                <div className="text-xs text-muted-foreground mt-1 leading-tight">{kpi.label}</div>
                <KpiProgress value={kpi.progressValue} max={kpi.progressMax} color={kpi.progressColor} />
                <div className="text-[10px] text-muted-foreground/70 mt-1">{kpi.hint}</div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inbound vs Outbound — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 px-5 pb-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData.inboundOutbound} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,93%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(220,13%,91%)" }}
                  cursor={{ fill: "hsl(220,13%,96%)" }}
                />
                <Bar dataKey="inbound" name="Inbound" fill="#378ADD" radius={[3, 3, 0, 0]} />
                <Bar dataKey="outbound" name="Outbound" fill="#1D9E75" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Inventory Aging */}
        <Card>
          <CardHeader className="pb-0 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inventory Aging</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              {chartData.inventoryAging.map((item, i) => (
                <div key={item.range} className="rounded-lg bg-muted/30 p-3 border border-border/40">
                  <div className={cn("text-xl font-bold", agingColors[i].textColor)}>{item.pct}%</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 mb-2">{item.range}</div>
                  <div className="h-1 rounded-full bg-border/50 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: agingColors[i].barColor }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Floor Status */}
        <Card>
          <CardHeader className="pb-0 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Floor Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 px-4 pb-4">
            <div className="space-y-1">
              {floorStatus.map((person) => (
                <div key={person.userId} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                    {person.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate leading-tight">{person.name}</div>
                    <div className="text-xs text-muted-foreground truncate leading-tight">{person.task}</div>
                  </div>
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0", floorBadge[person.status] || floorBadge.idle)}>
                    {person.status === "active" ? "Active" : person.status === "idle" ? "Idle" : "Break"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card>
          <CardHeader className="pb-0 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 px-4 pb-4">
            <div className="space-y-0.5">
              {recentActivities.filter((a) => a.action !== "Login").map((a, i) => (
                <div key={i} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5 leading-tight">{a.time}</span>
                  <div className="text-xs leading-relaxed">
                    <span className="font-medium text-foreground">{a.action}</span>
                    <span className="text-muted-foreground"> — {a.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="pb-0 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 px-4 pb-4">
            <div className="space-y-2">
              {alerts.map((a, i) => {
                const config = {
                  error:   { bg: "bg-red-50 border-red-200",    dot: "bg-red-500",    text: "text-red-700" },
                  warning: { bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500",  text: "text-amber-700" },
                  info:    { bg: "bg-blue-50 border-blue-200",   dot: "bg-blue-400",   text: "text-blue-700" },
                }[a.type] || { bg: "bg-muted border-border", dot: "bg-muted-foreground", text: "text-foreground" };

                return (
                  <div key={i} className={cn("flex items-start gap-2.5 text-xs p-3 rounded-lg border", config.bg)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full mt-1 shrink-0", config.dot)} />
                    <span className={config.text}>{a.message}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t">
              <Button variant="ghost" size="sm" className="w-full text-xs h-8" onClick={() => navigate("/audit")}>
                <FileText className="h-3 w-3 mr-1.5" /> View Audit Log
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Dashboard;