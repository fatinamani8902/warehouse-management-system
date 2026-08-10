import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchAsns } from "@/services/api";
import { formatDate, formatDateTime } from "@/utils/dateTimeFormatter";

const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", borderLight: "#f1f5f9",
  text: "#111827", textSub: "#374151",
  textLabel: "#6b7280", textMuted: "#9ca3af",
  danger: "#e03131",
};

const STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  draft:      { bg: "#f3f4f6", color: "#111827", dot: "#6b7280", label: "Draft" },
  pending:    { bg: "#fef9c3", color: "#713f12", dot: "#eab308", label: "Pending" },
  in_transit: { bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "In Transit" },
  arrived:    { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Arrived" },
  closed:     { bg: "#e0e7ff", color: "#3730a3", dot: "#6366f1", label: "Closed" },
  cancelled:  { bg: "#fee2e2", color: "#7f1d1d", dot: "#ef4444", label: "Cancelled" },
};

const ASN_FLOW = ["draft", "pending", "in_transit", "arrived", "closed"];

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] || { bg: "#f3f4f6", color: "#111827", dot: "#6b7280", label: status };
  return (
    <View style={[s.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[s.pillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function WorkflowStepper({ status }: { status: string }) {
  const isCancelled = status === "cancelled";
  return (
    <View style={s.stepper}>
      {ASN_FLOW.map((step, i) => {
        const idx   = ASN_FLOW.indexOf(status);
        const state = isCancelled ? (i === 0 ? "current" : "pending")
          : i < idx ? "done" : i === idx ? "current" : "pending";
        return (
          <View key={step} style={s.stepItem}>
            <View style={s.stepLineWrap}>
              {i > 0 && <View style={[s.stepLine, state !== "pending" && !isCancelled && i <= idx && s.stepLineDone]} />}
              <View style={[s.stepDot, state === "done" && s.stepDotDone, state === "current" && s.stepDotCurrent]}>
                {state === "done"    && <Ionicons name="checkmark" size={10} color="#fff" />}
                {state === "current" && <View style={s.stepDotInner} />}
              </View>
              {i < ASN_FLOW.length - 1 && <View style={[s.stepLine, state === "done" && s.stepLineDone]} />}
            </View>
            <Text style={[s.stepLabel, state === "current" && s.stepLabelActive]} numberOfLines={1}>
              {step.replace(/_/g, " ")}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Field({ label, value, danger }: { label: string; value?: string; danger?: boolean }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={[s.fieldVal, danger && { color: "#991b1b" }]}>{value || "-"}</Text>
    </View>
  );
}

export default function AsnDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [record, setRecord]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res   = await fetchAsns({ page: 1, pageSize: 200 });
      const items = res?.data?.items ?? res?.data?.data ?? res?.data ?? [];
      const found = items.find((r: any) => r.asn_id === id);
      if (!found) { setError("ASN not found"); return; }
      setRecord(found);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load ASN");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Navbar */}
      <View style={s.navbar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{id}</Text>
        <TouchableOpacity style={s.refreshIconBtn} onPress={load}>
          <Ionicons name="refresh-outline" size={18} color={C.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={s.loadingText}>Loading…</Text>
        </View>
      ) : error && !record ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={40} color={C.danger} />
          <Text style={s.errorMsg}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : record ? (
        <ScrollView contentContainerStyle={s.scrollContent}>
          {/* Status header */}
          <View style={s.statusHeader}>
            <Text style={s.docId}>{record.asn_id}</Text>
            <StatusPill status={record.status} />
          </View>

          {/* Workflow stepper */}
          <View style={s.section}>
            <WorkflowStepper status={record.status} />
          </View>

          {/* Details */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Details</Text>
            <View style={s.fieldGrid}>
              <Field label="Supplier"   value={record.supplier_name} />
              <Field label="Created At" value={formatDateTime(record.created_at)} />
              <Field label="Created By" value={record.created_by} />
              <Field label="ETA"        value={formatDate(record.eta)} />
              <Field label="Lines"      value={String(record.lines_count ?? "—")} />
              {record.notes && <Field label="Notes" value={record.notes} />}
              {record.cancellation_reason && (
                <Field label="Cancellation Reason" value={record.cancellation_reason} danger />
              )}
            </View>
          </View>

          {/* View-only notice */}
          <View style={s.readOnlyNotice}>
            <Ionicons name="eye-outline" size={14} color={C.textLabel} />
            <Text style={s.readOnlyText}>
              Inbound actions are managed from the web portal.
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  navbar:         { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginRight: 10 },
  navTitle:       { flex: 1, fontSize: 16, fontWeight: "700", color: C.text },
  refreshIconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentLight, alignItems: "center", justifyContent: "center" },
  center:         { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText:    { fontSize: 14, color: C.textLabel },
  errorMsg:       { fontSize: 14, color: C.danger, textAlign: "center", paddingHorizontal: 32 },
  retryBtn:       { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent },
  retryText:      { color: "#fff", fontWeight: "600", fontSize: 14 },
  scrollContent:  { padding: 16, gap: 16, paddingBottom: 40 },
  statusHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  docId:          { fontSize: 18, fontWeight: "700", color: C.text },
  section:        { backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  sectionTitle:   { fontSize: 13, fontWeight: "700", color: C.textLabel, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  fieldGrid:      { gap: 12 },
  field:          {},
  fieldLabel:     { fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  fieldVal:       { fontSize: 14, fontWeight: "500", color: C.text },
  readOnlyNotice: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  readOnlyText:   { fontSize: 13, color: C.textLabel, flex: 1 },
  pill:           { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillText:       { fontSize: 12, fontWeight: "600" },
  stepper:        { flexDirection: "row", alignItems: "flex-start" },
  stepItem:       { flex: 1, alignItems: "center" },
  stepLineWrap:   { flexDirection: "row", alignItems: "center", width: "100%", justifyContent: "center" },
  stepLine:       { flex: 1, height: 2, backgroundColor: C.borderLight },
  stepLineDone:   { backgroundColor: C.accent },
  stepDot:        { width: 22, height: 22, borderRadius: 11, backgroundColor: C.borderLight, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.border },
  stepDotDone:    { backgroundColor: C.accent, borderColor: C.accent },
  stepDotCurrent: { backgroundColor: C.surface, borderColor: C.accent, borderWidth: 2 },
  stepDotInner:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  stepLabel:      { fontSize: 10, color: C.textMuted, marginTop: 4, textAlign: "center", textTransform: "capitalize" },
  stepLabelActive:{ color: C.accent, fontWeight: "700" },
});
