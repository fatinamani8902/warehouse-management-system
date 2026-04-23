import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchAsns,
  fetchGrns,
  fetchPutawayTasks,
  fetchShipments,
  fetchAuditLogs,
} from "@/services/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditLog {
  log_id?: string;
  entity_id?: string;
  entity_type?: string;
  action?: string;
  user_id?: string;
  created_at?: string;
  timestamp?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function greetingByTime(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(isoString?: string): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
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
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth()    === n.getMonth()    &&
    d.getDate()     === n.getDate()
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

interface KpiCardProps {
  icon: string;
  label: string;
  value: number;
  accent: string;
  onPress?: () => void;
}

function KpiCard({ icon, label, value, accent, onPress }: KpiCardProps) {
  return (
    <TouchableOpacity
      style={[styles.kpiCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <Text style={styles.kpiIcon}>{icon}</Text>
      <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

interface QuickActionBtnProps {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}

function QuickActionBtn({ icon, label, color, onPress }: QuickActionBtnProps) {
  return (
    <TouchableOpacity style={styles.qaBtn} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.qaIconBox, { backgroundColor: color + "22" }]}>
        <Text style={[styles.qaIcon, { color }]}>{icon}</Text>
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

interface ActivityRowProps {
  action: string;
  entity: string;
  entityId?: string;
  user: string;
  time: string;
}

function ActivityRow({ action, entity, entityId, user, time }: ActivityRowProps) {
  const dotColor =
    action === "create"  ? "#22c55e" :
    action === "cancel"  ? "#ef4444" :
    action === "approve" ? "#3b82f6" :
    action === "reject"  ? "#f97316" : "#94a3b8";

  return (
    <View style={styles.actRow}>
      <View style={[styles.actDot, { backgroundColor: dotColor }]} />
      <View style={styles.actBody}>
        <Text style={styles.actText}>
          <Text style={styles.actAction}>{action}</Text>
          {"  "}
          <Text style={styles.actEntity}>{entity}</Text>
          {entityId ? <Text style={styles.actId}> #{entityId}</Text> : null}
        </Text>
        <Text style={styles.actMeta}>{user}  ·  {time}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [refreshing,  setRefreshing]  = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [openAsns,    setOpenAsns]    = useState(0);
  const [openGrns,    setOpenGrns]    = useState(0);
  const [pendingPut,  setPendingPut]  = useState(0);
  const [todayShip,   setTodayShip]   = useState(0);
  const [recentLogs,  setRecentLogs]  = useState<AuditLog[]>([]);

  const loadData = useCallback(async () => {
    try {
      setError("");

      const [asnRes, grnRes, putRes, shipRes, logRes] = await Promise.allSettled([
        fetchAsns({ status: "open", pageSize: 1 }),
        fetchGrns({ status: "open", pageSize: 1 }),
        fetchPutawayTasks({ status: "pending", pageSize: 1 }),
        fetchShipments({ pageSize: 200 }),
        fetchAuditLogs(),
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
        const todayCount = (Array.isArray(items) ? items : []).filter(
          (s: any) => isToday(s.dispatched_at) || isToday(s.created_at)
        ).length;
        setTodayShip(todayCount);
      }

      if (logRes.status === "fulfilled") {
        const logs = logRes.value?.data || [];
        setRecentLogs((Array.isArray(logs) ? logs : []).slice(0, 5));
      }

    } catch (_) {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const roleName    = user?.role_id
    ? user.role_id.charAt(0).toUpperCase() + user.role_id.slice(1)
    : "User";

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.logoRow}>
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>W</Text>
            </View>
            <Text style={styles.logoText}>WMS Portal</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push("/(app)/profile")}
          >
            <Text style={styles.avatarText}>
              {(displayName[0] || "U").toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.greeting}>
          {greetingByTime()},{" "}
          <Text style={styles.greetingName}>{displayName}</Text> 👋
        </Text>

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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
          />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* KPI Cards */}
        <SectionTitle>Overview</SectionTitle>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#3b82f6" />
            <Text style={styles.loadingText}>Loading data…</Text>
          </View>
        ) : (
          <View style={styles.kpiGrid}>
            <KpiCard icon="📥" label="Open ASNs"         value={openAsns}   accent="#3b82f6" onPress={() => router.push("/(app)/inbound")} />
            <KpiCard icon="📋" label="Open GRNs"         value={openGrns}   accent="#22c55e" onPress={() => router.push("/(app)/inbound")} />
            <KpiCard icon="🏷️" label="Pending Putaway"   value={pendingPut} accent="#f59e0b" />
            <KpiCard icon="🚚" label="Today's Shipments" value={todayShip}  accent="#8b5cf6" />
          </View>
        )}

        {/* Quick Actions */}
        <SectionTitle>Quick Actions</SectionTitle>
        <View style={styles.qaGrid}>
          <QuickActionBtn icon="＋" label="Create ASN" color="#3b82f6" onPress={() => router.push("/(app)/inbound")} />
          <QuickActionBtn icon="✓" label="Create GRN" color="#22c55e" onPress={() => router.push("/(app)/inbound")} />
          <QuickActionBtn icon="⊟" label="Inventory"  color="#f59e0b" onPress={() => router.push("/(app)/inventory")} />
          <QuickActionBtn icon="↗" label="Shipping"   color="#8b5cf6" onPress={() => router.push("/(app)/profile")} />
          <QuickActionBtn icon="↩" label="Returns"    color="#ef4444" onPress={() => router.push("/(app)/profile")} />
          <QuickActionBtn icon="📊" label="Audit Log" color="#64748b" onPress={() => router.push("/(app)/profile")} />
        </View>

        {/* Recent Activity */}
        <SectionTitle>Recent Activity</SectionTitle>
        <View style={styles.actCard}>
          {recentLogs.length === 0 && !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No recent activity</Text>
            </View>
          ) : (
            recentLogs.map((log, i) => (
              <ActivityRow
                key={log.log_id || log.entity_id || String(i)}
                action={log.action || "update"}
                entity={log.entity_type || "record"}
                entityId={log.entity_id}
                user={log.user_id || "system"}
                time={timeAgo(log.created_at || log.timestamp)}
              />
            ))
          )}
        </View>

        {user?.tenant_id ? (
          <Text style={styles.tenantFooter}>Tenant: {user.tenant_id}</Text>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f5f9" },

  header: {
    backgroundColor: "#0f172a",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  logoRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBox:    { width: 30, height: 30, borderRadius: 8, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center" },
  logoLetter: { fontSize: 15, fontWeight: "700", color: "#fff" },
  logoText:   { fontSize: 15, fontWeight: "700", color: "#fff" },
  avatarBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1e40af", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#3b82f6" },
  avatarText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  greeting:     { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 10 },
  greetingName: { color: "#60a5fa" },
  metaRow:      { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaBadge:    { backgroundColor: "#1e293b", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  metaBadgeBlue:{ backgroundColor: "#1e3a5f" },
  metaBadgeText:{ fontSize: 11, color: "#94a3b8", fontWeight: "600" },

  body:        { flex: 1 },
  bodyContent: { padding: 16, paddingTop: 20 },

  errorBox:   { backgroundColor: "#fee2e2", borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText:  { fontSize: 13, color: "#991b1b", textAlign: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 24, justifyContent: "center" },
  loadingText:{ color: "#64748b", fontSize: 13 },

  sectionTitle: { fontSize: 11, fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  kpiCard: { flex: 1, minWidth: "45%", backgroundColor: "#fff", borderRadius: 14, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  kpiIcon:  { fontSize: 22, marginBottom: 8 },
  kpiValue: { fontSize: 28, fontWeight: "800", marginBottom: 2 },
  kpiLabel: { fontSize: 12, color: "#64748b", fontWeight: "600" },

  qaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  qaBtn:  { width: "30%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  qaIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 7 },
  qaIcon:    { fontSize: 20 },
  qaLabel:   { fontSize: 11, fontWeight: "600", color: "#374151", textAlign: "center" },

  actCard: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 4, paddingHorizontal: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  actRow:  { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f1f5f9", gap: 10 },
  actDot:  { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  actBody: { flex: 1 },
  actText: { fontSize: 13, color: "#1e293b", lineHeight: 18 },
  actAction: { fontWeight: "700" },
  actEntity: { color: "#475569" },
  actId:     { color: "#94a3b8" },
  actMeta:   { fontSize: 11, color: "#94a3b8", marginTop: 2 },

  emptyState: { alignItems: "center", paddingVertical: 24 },
  emptyIcon:  { fontSize: 28, marginBottom: 6 },
  emptyText:  { fontSize: 13, color: "#94a3b8" },

  tenantFooter: { textAlign: "center", fontSize: 11, color: "#cbd5e1", marginBottom: 4 },
});