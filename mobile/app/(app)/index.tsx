import { useCallback, useEffect, useMemo, useState } from "react";
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
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useDrawer } from "@/context/DrawerContext";
import { useAuthStore } from "@/stores/authStore";
import { fetchDashboardSummary } from "@/services/api";
import { buildDashboardView } from "@/utils/dashboardSummary";

const ACCENT = "#3b5bdb";
const T_PRIMARY = "#111827";
const T_SECONDARY = "#374151";
const T_LABEL = "#6b7280";
const T_MUTED = "#9ca3af";
const CARD_BG = "#fff";
const PAGE_BG = "#f3f4f6";

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRole(roleId) {
  return String(roleId || "user")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function OperationCard({ item, onPress }) {
  const pressable = Boolean(onPress);
  return (
    <TouchableOpacity
      style={[styles.operationCard, item.key === "returns" && styles.operationCardWide]}
      onPress={onPress}
      activeOpacity={pressable ? 0.75 : 1}
      accessibilityRole={pressable ? "button" : "text"}
      accessibilityLabel={`${item.accessibilityLabel}. Count ${item.total}. ${item.breakdown}`}
    >
      <View style={styles.operationTop}>
        <View style={styles.iconBox}>
          <Ionicons name={item.icon} size={17} color={ACCENT} />
        </View>
        {pressable ? <Ionicons name="chevron-forward" size={16} color={T_MUTED} /> : null}
      </View>
      <Text style={styles.operationValue}>{item.total}</Text>
      <Text style={styles.operationLabel}>{item.label}</Text>
      <Text style={styles.operationBreakdown} numberOfLines={2}>{item.breakdown}</Text>
    </TouchableOpacity>
  );
}

function AttentionRow({ item, onPress }) {
  const pressable = Boolean(onPress);
  return (
    <TouchableOpacity
      style={styles.attentionRow}
      onPress={onPress}
      activeOpacity={pressable ? 0.75 : 1}
      accessibilityRole={pressable ? "button" : "text"}
      accessibilityLabel={`${item.label}. Count ${item.count}. ${item.description}`}
    >
      <View style={styles.attentionBody}>
        <Text style={styles.attentionLabel}>{item.label}</Text>
        <Text style={styles.attentionDescription}>{item.description}</Text>
      </View>
      <Text style={styles.attentionCount}>{item.count}</Text>
      {pressable ? <Ionicons name="chevron-forward" size={16} color={T_MUTED} /> : null}
    </TouchableOpacity>
  );
}

function ChoiceModal({ visible, title, message, actions, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={T_LABEL} />
            </TouchableOpacity>
          </View>
          {message ? <Text style={styles.modalMessage}>{message}</Text> : null}
          <View style={styles.modalActions}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.modalAction}
                onPress={() => {
                  onClose();
                  action.onPress?.();
                }}
                accessibilityRole="button"
              >
                <Ionicons name={action.icon} size={16} color={ACCENT} />
                <Text style={styles.modalActionText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { openDrawer } = useDrawer();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [fulfilmentOpen, setFulfilmentOpen] = useState(false);
  const [portalOnlyOpen, setPortalOnlyOpen] = useState(false);

  const dashboard = useMemo(() => buildDashboardView(summary || {}), [summary]);

  const loadData = useCallback(async () => {
    try {
      setError("");
      const response = await fetchDashboardSummary();
      setSummary(response?.data?.data || response?.data || null);
    } catch (err) {
      setError(err?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, user?.warehouse_id]);

  const onRefresh = () => {
    if (refreshing || loading) return;
    setRefreshing(true);
    loadData();
  };

  const handleOperationPress = (item) => {
    if (item.key === "fulfilment") {
      setFulfilmentOpen(true);
      return;
    }
    if (item.portalOnly) {
      setPortalOnlyOpen(true);
      return;
    }
    if (item.route) router.push(item.route);
  };

  const handleAttentionPress = (item) => {
    if (item.portalOnly) {
      setPortalOnlyOpen(true);
      return;
    }
    if (item.route) router.push(item.route);
  };

  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const roleName = formatRole(user?.role_id);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.logoRow}>
            <TouchableOpacity onPress={openDrawer} style={styles.hamburgerBtn} accessibilityRole="button" accessibilityLabel="Open navigation">
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>W</Text>
            </View>
            <Text style={styles.logoText}>WMS</Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push("/(app)/profile")} accessibilityRole="button" accessibilityLabel="Open profile">
            <Text style={styles.avatarText}>{(displayName[0] || "U").toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>Compact warehouse control tower</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText}>{roleName}</Text>
          </View>
          {user?.warehouse_name || user?.warehouse_id ? (
            <View style={[styles.metaBadge, styles.metaBadgeBlue]}>
              <Text style={[styles.metaBadgeText, { color: "#93c5fd" }]}>
                {user?.warehouse_name || user?.warehouse_id}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.refreshRow}>
          <Text style={styles.refreshedText}>Last refreshed {formatDateTime(dashboard.generatedAt)}</Text>
          <TouchableOpacity
            style={[styles.refreshButton, (loading || refreshing) && styles.disabledButton]}
            onPress={onRefresh}
            disabled={loading || refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh dashboard"
          >
            <Ionicons name="refresh-outline" size={15} color="#fff" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} colors={[ACCENT]} />}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadData} accessibilityRole="button">
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading && !summary ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.loadingText}>Loading dashboard summary...</Text>
          </View>
        ) : null}

        {!loading && !error ? (
          <>
            <View style={styles.card}>
              <SectionHeader title="Today's Operations" subtitle="Tap a stage to view more details." />
              <View style={styles.operationGrid}>
                {dashboard.operations.map((item) => (
                  <OperationCard key={item.key} item={item} onPress={() => handleOperationPress(item)} />
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <SectionHeader title="Need Attention" />
              {dashboard.attention.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-circle-outline" size={22} color="#16a34a" />
                  <Text style={styles.emptyText}>No operational issues requiring attention.</Text>
                </View>
              ) : (
                <View style={styles.attentionList}>
                  {dashboard.attention.map((item) => (
                    <AttentionRow key={item.key} item={item} onPress={() => handleAttentionPress(item)} />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>

      <ChoiceModal
        visible={fulfilmentOpen}
        title="Fulfilment"
        message="Choose which mobile execution queue to open."
        onClose={() => setFulfilmentOpen(false)}
        actions={[
          { label: "View Picking", icon: "clipboard-outline", onPress: () => router.push("/(app)/picking") },
          { label: "View Packing", icon: "cube-outline", onPress: () => router.push("/(app)/packing") },
        ]}
      />

      <ChoiceModal
        visible={portalOnlyOpen}
        title="Portal Required"
        message="Manage Returns and RMA in the Portal."
        onClose={() => setPortalOnlyOpen(false)}
        actions={[]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  header: {
    backgroundColor: "#0f172a",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hamburgerBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  logoBox: { width: 30, height: 30, borderRadius: 8, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  logoLetter: { fontSize: 15, fontWeight: "700", color: "#fff" },
  logoText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  avatarBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#1e40af", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#3b82f6" },
  avatarText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  title: { fontSize: 22, fontWeight: "700", lineHeight: 30, color: "#fff" },
  subtitle: { fontSize: 13, lineHeight: 20, color: "#cbd5e1", marginTop: 1 },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 },
  metaBadge: { backgroundColor: "#1e293b", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  metaBadgeBlue: { backgroundColor: "#1e3a5f" },
  metaBadgeText: { fontSize: 11, color: "#94a3b8", fontWeight: "600" },
  refreshRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  refreshedText: { flex: 1, fontSize: 12, lineHeight: 16, color: "#94a3b8" },
  refreshButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  refreshButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  disabledButton: { opacity: 0.55 },
  body: { flex: 1 },
  bodyContent: { padding: 14, paddingTop: 14 },
  errorBox: { backgroundColor: "#fee2e2", borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 0.5, borderColor: "#fecaca" },
  errorText: { fontSize: 13, lineHeight: 20, color: "#991b1b", textAlign: "center" },
  retryButton: { alignSelf: "center", marginTop: 8, minHeight: 34, paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#fff", borderWidth: 0.5, borderColor: "#fca5a5", alignItems: "center", justifyContent: "center" },
  retryButtonText: { fontSize: 13, fontWeight: "600", color: "#991b1b" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 24, justifyContent: "center" },
  loadingText: { color: T_LABEL, fontSize: 13 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: "#e8ebf8",
    shadowColor: "#3b5bdb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
    overflow: "hidden",
  },
  sectionHeader: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 9, borderBottomWidth: 0.5, borderBottomColor: "#eef0fc" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: T_PRIMARY, textTransform: "uppercase", letterSpacing: 0.6 },
  sectionSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 16, color: T_LABEL },
  operationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 10 },
  operationCard: {
    width: "48%",
    minHeight: 118,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: "#e5e7eb",
    padding: 12,
  },
  operationCardWide: { width: "100%" },
  operationTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  iconBox: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  operationValue: { fontSize: 24, fontWeight: "700", lineHeight: 28, color: T_PRIMARY },
  operationLabel: { fontSize: 13, fontWeight: "600", lineHeight: 18, color: T_SECONDARY, marginTop: 1 },
  operationBreakdown: { fontSize: 11, lineHeight: 15, color: T_LABEL, marginTop: 4 },
  attentionList: { paddingHorizontal: 10, paddingVertical: 6 },
  attentionRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef0fc" },
  attentionBody: { flex: 1, minWidth: 0 },
  attentionLabel: { fontSize: 13, fontWeight: "600", lineHeight: 18, color: T_PRIMARY },
  attentionDescription: { fontSize: 11, lineHeight: 15, color: T_LABEL, marginTop: 1 },
  attentionCount: { minWidth: 28, textAlign: "right", fontSize: 18, fontWeight: "700", color: ACCENT },
  emptyState: { paddingHorizontal: 12, paddingVertical: 16, alignItems: "center", gap: 6 },
  emptyText: { fontSize: 13, lineHeight: 18, color: T_LABEL, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.42)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: "#e5e7eb" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 15, fontWeight: "700", lineHeight: 22, color: T_PRIMARY },
  modalMessage: { fontSize: 13, lineHeight: 20, color: T_LABEL, marginBottom: 10 },
  modalActions: { gap: 8 },
  modalAction: { minHeight: 44, borderRadius: 9, borderWidth: 0.5, borderColor: "#dbe3ff", backgroundColor: "#f8faff", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  modalActionText: { fontSize: 13, fontWeight: "600", color: T_PRIMARY },
});
