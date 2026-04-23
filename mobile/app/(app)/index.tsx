import { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, StatusBar,
  ActivityIndicator, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useDrawer } from "@/context/DrawerContext";
import { useAuthStore } from "@/stores/authStore";
import { apiClient } from "@/services/api";

// ── Design tokens (same as portal) ───────────────────────────────────────────
const ACCENT     = "#3b5bdb";
const T_PRIMARY  = "#111827";
const T_LABEL    = "#6b7280";
const T_MUTED    = "#9ca3af";
const CARD_BG    = "#fff";
const PAGE_BG    = "#f3f4f6";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AuditLog {
  log_id?:      string;
  entity_id?:   string;
  entity_type?: string;
  action?:      string;
  user_id?:     string;
  created_at?:  string;
  timestamp?:   string;
  message?:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function greetingByTime(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(isoString?: string): string {
  if (!isoString) return "";
  const diff  = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function isToday(isoString?: string): boolean {
  if (!isoString) return false;
  const d = new Date(isoString);
  const n = new Date();
  return d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate();
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionLabel({ icon, children }: { icon?: string; children: string }) {
  return (
    <View style={styles.sectionLabel}>
      {icon ? <Text style={styles.sectionLabelIcon}>{icon}</Text> : null}
      <Text style={styles.sectionLabelText}>{children}</Text>
    </View>
  );
}

interface KpiCardProps {
  icon:      string;
  label:     string;
  value:     string | number;
  hint:      string;
  iconBg:    string;
  barColor:  string;
  progVal:   number;
  progMax:   number;
  onPress?:  () => void;
}

function KpiCard({ icon, label, value, hint, iconBg, barColor, progVal, progMax, onPress }: KpiCardProps) {
  const pct = Math.min(Math.round((progVal / (progMax || 1)) * 100), 100);
  return (
    <TouchableOpacity
      style={styles.kpiCard}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={[styles.kpiIconBox, { backgroundColor: iconBg }]}>
        <Text style={styles.kpiIconText}>{icon}</Text>
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {/* Progress bar */}
      <View style={styles.kpiProgBg}>
        <View style={[styles.kpiProgFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.kpiHint}>{hint}</Text>
    </TouchableOpacity>
  );
}

interface AlertRowProps {
  type:    "error" | "warning" | "info";
  message: string;
}

const alertCfg = {
  error:   { bg: "#fff1f2", dot: "#ef4444", color: "#b91c1c" },
  warning: { bg: "#fffbeb", dot: "#f59e0b", color: "#92400e" },
  info:    { bg: "#eff6ff", dot: "#3b82f6", color: "#1d4ed8" },
};

function AlertRow({ type, message }: AlertRowProps) {
  const cfg = alertCfg[type] || alertCfg.info;
  return (
    <View style={[styles.alertRow, { backgroundColor: cfg.bg }]}>
      <View style={[styles.alertDot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.alertText, { color: cfg.color }]}>{message}</Text>
    </View>
  );
}

interface ActivityRowProps {
  action:   string;
  detail:   string;
  time:     string;
}

function ActivityRow({ action, detail, time }: ActivityRowProps) {
  return (
    <View style={styles.actRow}>
      <Text style={styles.actTime}>{time}</Text>
      <Text style={styles.actText} numberOfLines={2}>
        <Text style={styles.actAction}>{action}</Text>
        <Text style={styles.actDetail}> — {detail}</Text>
      </Text>
    </View>
  );
}

interface AgingCardProps {
  range:    string;
  pct:      number;
  color:    string;
  textColor:string;
}

function AgingCard({ range, pct, color, textColor }: AgingCardProps) {
  return (
    <View style={styles.agingCard}>
      <Text style={[styles.agingPct, { color: textColor }]}>{pct}%</Text>
      <Text style={styles.agingRange}>{range}</Text>
      <View style={styles.agingProgBg}>
        <View style={[styles.agingProgFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { openDrawer } = useDrawer();

  const [refreshing, setRefreshing] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  // KPI state
  const [openAsns,   setOpenAsns]   = useState(0);
  const [openGrns,   setOpenGrns]   = useState(0);
  const [pendingPut, setPendingPut] = useState(0);
  const [todayShip,  setTodayShip]  = useState(0);
  const [picksDone,  setPicksDone]  = useState(0);
  const [exceptions, setExceptions] = useState(0);

  // Activity & alerts
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [alerts,     setAlerts]     = useState<AlertRowProps[]>([]);

  const loadData = useCallback(async () => {
    try {
      setError("");

      const [asnRes, grnRes, putRes, shipRes, logRes] = await Promise.allSettled([
        apiClient.get("/inbound/asn",  { params: { status: "open",    pageSize: 1 } }),
        apiClient.get("/inbound/grn",  { params: { status: "open",    pageSize: 1 } }),
        apiClient.get("/putaway",      { params: { status: "pending", pageSize: 1 } }),
        apiClient.get("/shipping",     { params: { pageSize: 200 } }),
        apiClient.get("/audit/logs"),
      ]);

      if (asnRes.status === "fulfilled") {
        const d = asnRes.value?.data;
        setOpenAsns(d?.total ?? (Array.isArray(d) ? d.length : 0));
      }
      if (grnRes.status === "fulfilled") {
        const d = grnRes.value?.data;
        setOpenGrns(d?.total ?? (Array.isArray(d) ? d.length : 0));
      }
      if (putRes.status === "fulfilled") {
        const d = putRes.value?.data;
        setPendingPut(d?.total ?? 0);
      }
      if (shipRes.status === "fulfilled") {
        const items = shipRes.value?.data?.data || shipRes.value?.data || [];
        setTodayShip((Array.isArray(items) ? items : []).filter(
          (s: any) => isToday(s.dispatched_at) || isToday(s.created_at)
        ).length);
      }
      if (logRes.status === "fulfilled") {
        const logs: AuditLog[] = logRes.value?.data || [];
        const arr = Array.isArray(logs) ? logs : [];
        setRecentLogs(arr.slice(0, 5));

        // Derive alerts from recent logs
        const derived: AlertRowProps[] = arr
          .filter((l) => l.action === "cancel" || l.action === "reject")
          .slice(0, 3)
          .map((l) => ({
            type:    "warning" as const,
            message: l.message || `${l.action} on ${l.entity_type} ${l.entity_id || ""}`,
          }));
        if (derived.length === 0) {
          derived.push({ type: "info", message: "No active alerts — all systems normal" });
        }
        setAlerts(derived);
      }
    } catch (_) {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const roleName    = user?.role_id
    ? user.role_id.charAt(0).toUpperCase() + user.role_id.slice(1)
    : "User";

  const kpiCards: KpiCardProps[] = [
    { icon: "📥", label: "Today's Inbound",   value: openAsns,   hint: "open ASNs",         iconBg: "#eff6ff", barColor: "#185FA5", progVal: openAsns,   progMax: 20,  onPress: () => router.push("/(app)/inbound") },
    { icon: "📦", label: "Pending Putaway",   value: pendingPut, hint: "awaiting putaway",   iconBg: "#fffbeb", barColor: "#BA7517", progVal: pendingPut, progMax: 20,  onPress: () => router.push("/(app)/inbound") },
    { icon: "📋", label: "Open GRNs",         value: openGrns,   hint: "goods receipts",     iconBg: "#f0fdf4", barColor: "#3B6D11", progVal: openGrns,   progMax: 20,  onPress: () => router.push("/(app)/inbound") },
    { icon: "🚚", label: "Today's Shipments", value: todayShip,  hint: "dispatched today",   iconBg: "#f5f3ff", barColor: "#534AB7", progVal: todayShip,  progMax: 20  },
    { icon: "✅", label: "Picks Done",        value: picksDone,  hint: "completed picks",    iconBg: "#fff1f2", barColor: "#E24B4A", progVal: picksDone,  progMax: 20  },
    { icon: "⚠️", label: "Exceptions",        value: exceptions, hint: "needs attention",    iconBg: "#fff7ed", barColor: "#D85A30", progVal: exceptions,  progMax: 10  },
  ];

  const agingData = [
    { range: "0–30 days",  pct: 45, color: "#185FA5", textColor: "#1d4ed8" },
    { range: "31–60 days", pct: 28, color: "#1D9E75", textColor: "#0f766e" },
    { range: "61–90 days", pct: 18, color: "#EF9F27", textColor: "#d97706" },
    { range: "90+ days",   pct: 9,  color: "#E24B4A", textColor: "#dc2626" },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.logoRow}>
            <TouchableOpacity onPress={openDrawer} style={styles.hamburgerBtn}>
            <Text style={styles.hamburgerIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>W</Text>
            </View>
            <Text style={styles.logoText}>WMS Portal</Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push("/(app)/profile")}>
            <Text style={styles.avatarText}>{(displayName[0] || "U").toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.greeting}>
          {greetingByTime()}, <Text style={styles.greetingName}>{displayName}</Text> 👋
        </Text>
        <Text style={styles.greetingSub}>Warehouse overview & key metrics</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText}>{roleName}</Text>
          </View>
          {user?.warehouse_name || user?.warehouse_id ? (
            <View style={[styles.metaBadge, styles.metaBadgeBlue]}>
              <Text style={[styles.metaBadgeText, { color: "#93c5fd" }]}>
                📦 {user?.warehouse_name || user?.warehouse_id}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Body ── */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} colors={[ACCENT]} />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── KPI Cards 2-col grid ── */}
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.loadingText}>Loading data…</Text>
          </View>
        ) : (
          <View style={styles.kpiGrid}>
            {kpiCards.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </View>
        )}

        {/* ── Inventory Aging ── */}
        <View style={styles.card}>
          <SectionLabel>Inventory Aging</SectionLabel>
          <View style={styles.agingGrid}>
            {agingData.map((a) => (
              <AgingCard key={a.range} {...a} />
            ))}
          </View>
        </View>

        {/* ── Recent Activities ── */}
        <View style={styles.card}>
          <SectionLabel icon="⚡">Recent Activities</SectionLabel>
          {recentLogs.length === 0 && !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No recent activity</Text>
            </View>
          ) : (
            recentLogs.map((log, i) => (
              <ActivityRow
                key={log.log_id || log.entity_id || String(i)}
                action={log.action || "update"}
                detail={`${log.entity_type || "record"} ${log.entity_id ? "#" + log.entity_id : ""}`}
                time={timeAgo(log.created_at || log.timestamp)}
              />
            ))
          )}
        </View>

        {/* ── Alerts ── */}
        <View style={styles.card}>
          <SectionLabel icon="🔔">Alerts</SectionLabel>
          <View style={styles.alertsList}>
            {alerts.map((a, i) => (
              <AlertRow key={i} {...a} />
            ))}
          </View>
          <TouchableOpacity
            style={styles.auditBtn}
            onPress={() => router.push("/(app)/profile")}
          >
            <Text style={styles.auditBtnText}>📄  View Audit Log</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },

  // Header
  header: {
    backgroundColor: "#0f172a",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTop:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  logoRow:      { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBox:      { width: 30, height: 30, borderRadius: 8, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  logoLetter:   { fontSize: 15, fontWeight: "700", color: "#fff" },
  logoText:     { fontSize: 15, fontWeight: "700", color: "#fff" },
  avatarBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: "#1e40af", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#3b82f6" },
  avatarText:   { fontSize: 13, fontWeight: "700", color: "#fff" },
  greeting:     { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 2 },
  greetingName: { color: "#60a5fa" },
  greetingSub:  { fontSize: 12, color: "#94a3b8", marginBottom: 10 },
  metaRow:      { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaBadge:    { backgroundColor: "#1e293b", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  metaBadgeBlue:{ backgroundColor: "#1e3a5f" },
  metaBadgeText:{ fontSize: 11, color: "#94a3b8", fontWeight: "600" },
  hamburgerBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginRight: 4 },
  hamburgerIcon: { fontSize: 18, color: "#fff" },

  body:        { flex: 1 },
  bodyContent: { padding: 14, paddingTop: 16 },

  errorBox:    { backgroundColor: "#fee2e2", borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText:   { fontSize: 13, color: "#991b1b", textAlign: "center" },
  loadingRow:  { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 24, justifyContent: "center" },
  loadingText: { color: T_LABEL, fontSize: 13 },

  // KPI grid — 2 columns
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  kpiCard: {
    width: "48%", backgroundColor: CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 0.5, borderColor: "#e8ebf8",
    shadowColor: "#3b5bdb", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  kpiIconBox:  { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  kpiIconText: { fontSize: 16 },
  kpiValue:    { fontSize: 22, fontWeight: "700", color: T_PRIMARY, lineHeight: 26, marginBottom: 2 },
  kpiLabel:    { fontSize: 11, color: T_LABEL, marginBottom: 6, lineHeight: 14 },
  kpiProgBg:   { height: 4, borderRadius: 4, backgroundColor: "#f1f5f9", overflow: "hidden", marginBottom: 4 },
  kpiProgFill: { height: "100%", borderRadius: 4 },
  kpiHint:     { fontSize: 10, color: T_MUTED },

  // Card
  card: {
    backgroundColor: CARD_BG, borderRadius: 12, marginBottom: 14,
    borderWidth: 0.5, borderColor: "#e8ebf8",
    shadowColor: "#3b5bdb", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
    overflow: "hidden",
  },

  // Section label
  sectionLabel:     { flexDirection: "row", alignItems: "center", gap: 6, padding: 12, borderBottomWidth: 0.5, borderBottomColor: "#eef0fc" },
  sectionLabelIcon: { fontSize: 13 },
  sectionLabelText: { fontSize: 11, fontWeight: "700", color: T_LABEL, textTransform: "uppercase", letterSpacing: 0.8 },

  // Inventory aging
  agingGrid: { flexDirection: "row", flexWrap: "wrap", padding: 10, gap: 8 },
  agingCard: {
    width: "47%", backgroundColor: "#fafbff", borderRadius: 8, padding: 12,
    borderWidth: 0.5, borderColor: "#eef0fc",
  },
  agingPct:     { fontSize: 20, fontWeight: "700", marginBottom: 2 },
  agingRange:   { fontSize: 11, color: T_LABEL, marginBottom: 8 },
  agingProgBg:  { height: 4, borderRadius: 4, backgroundColor: "#f1f5f9", overflow: "hidden" },
  agingProgFill:{ height: "100%", borderRadius: 4 },

  // Activities
  actRow:    { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f1f5f9" },
  actTime:   { fontSize: 11, color: T_MUTED, width: 52, paddingTop: 1 },
  actText:   { flex: 1, fontSize: 13, lineHeight: 18 },
  actAction: { fontWeight: "600", color: T_PRIMARY },
  actDetail: { color: T_LABEL },

  // Alerts
  alertsList: { padding: 10, gap: 8, flexDirection: "column" },
  alertRow:   { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 8 },
  alertDot:   { width: 7, height: 7, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  alertText:  { flex: 1, fontSize: 13, lineHeight: 18 },

  auditBtn:     { margin: 12, height: 36, borderRadius: 8, borderWidth: 0.5, borderColor: "#d1d5db", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  auditBtnText: { fontSize: 13, color: T_LABEL, fontWeight: "500" },

  emptyState: { alignItems: "center", padding: 24 },
  emptyText:  { fontSize: 13, color: T_MUTED },
});