import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Keyboard, KeyboardEvent, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  cancelAdjustment,
  fetchAdjustmentById,
  submitAdjustment,
} from "@/services/api";
import { useAuthStore } from "@/stores/authStore";

const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", text: "#111827",
  textSub: "#374151", textLabel: "#6b7280", textMuted: "#9ca3af",
  danger: "#e03131", success: "#16a34a",
};

const STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  DRAFT:      { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Draft" },
  SUBMITTED:  { bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "Submitted" },
  APPROVED:   { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Approved" },
  REJECTED:   { bg: "#fee2e2", color: "#7f1d1d", dot: "#ef4444", label: "Rejected" },
  CANCELLED:  { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Cancelled" },
};

const ROLE_ALIASES: Record<string, string> = {
  superadmin: "warehousemanager", hqadmin: "warehousemanager",
  storemanager: "warehousemanager", warehouseclerk: "storekeeper",
  warehousemanager: "warehousemanager", storekeeper: "storekeeper",
  auditor: "auditor", readonly: "readonly",
};
function normalizeRole(r: string) { return ROLE_ALIASES[String(r || "readonly").toLowerCase()] || "readonly"; }
function canSubmitAdj(roleId: string)  { return ["warehousemanager", "storekeeper"].includes(normalizeRole(roleId)); }
function canCancelAdj(roleId: string)  { return ["warehousemanager", "storekeeper"].includes(normalizeRole(roleId)); }

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e: KeyboardEvent) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_CFG[status] || STATUS_CFG[status?.toUpperCase()] || { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: status };
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function Field({ label, value, highlight }: { label: string; value?: string; highlight?: "positive" | "negative" }) {
  const color = highlight === "positive" ? C.success : highlight === "negative" ? C.danger : C.text;
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={[s.fieldVal, !!highlight && { color, fontWeight: "700" }]}>{value || "—"}</Text>
    </View>
  );
}

function ReasonModal({ visible, title, loading, onConfirm, onClose, isDanger }: any) {
  const [reason, setReason]   = useState("");
  const [err, setErr]         = useState("");
  const keyboardHeight        = useKeyboardHeight();
  useEffect(() => { if (visible) { setReason(""); setErr(""); } }, [visible]);
  const submit = () => {
    if (!reason.trim() || reason.trim().length < 3) { setErr("Reason required (min 3 chars)"); return; }
    onConfirm(reason.trim());
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose} />
      <View style={[s.bottomSheet, { marginBottom: keyboardHeight }]}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>{title}</Text>
        <Text style={s.inputLabel}>Reason <Text style={{ color: C.danger }}>*</Text></Text>
        <TextInput style={[s.textarea, !!err && s.inputErr]} value={reason} onChangeText={(v) => { setReason(v); setErr(""); }}
          placeholder="Min. 3 characters…" placeholderTextColor={C.textMuted} multiline textAlignVertical="top" editable={!loading} />
        {!!err && <Text style={s.errText}>{err}</Text>}
        <View style={s.sheetActions}>
          <TouchableOpacity style={s.btnGhost} onPress={onClose} disabled={loading}><Text style={s.btnGhostText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[isDanger ? s.btnDanger : s.btnPrimary, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={isDanger ? s.btnDangerText : s.btnPrimaryText}>Confirm</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function AdjustmentDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user   = useAuthStore((s) => s.user);
  const roleId = user?.role_id || "readonly";

  const [record, setRecord]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState("");
  const [showCancel, setShowCancel]   = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res  = await fetchAdjustmentById(id!);
      const data = res?.data?.data ?? res?.data;
      console.log("DATA:", JSON.stringify(data, null, 2));
      if (!data) { setError("Adjustment not found"); return; }
      setRecord(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    try {
      setBusy("submit");
      const res  = await submitAdjustment(id!);
      const data = res?.data?.data ?? res?.data;
      if (data) setRecord(data);
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || "Submit failed"); }
    finally { setBusy(""); }
  };

  const handleCancel = async (reason: string) => {
    try {
      setBusy("cancel");
      const res  = await cancelAdjustment(id!, { reason });
      const data = res?.data?.data ?? res?.data;
      if (data) setRecord(data);
      setShowCancel(false);
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || "Cancel failed"); }
    finally { setBusy(""); }
  };

  const isTerminal = record && ["APPROVED", "REJECTED", "CANCELLED"].includes(record.status);
  const qtyDelta   = Number(record?.qty_delta ?? 0);

  // FIX 2: derive the correct label for the note field based on status
  const noteLabel = record?.status === "REJECTED"
    ? "Rejection Reason"
    : record?.status === "CANCELLED"
    ? "Cancellation Reason"
    : "Approval Note";

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.navbar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{id}</Text>
        <TouchableOpacity style={s.refreshBtn} onPress={load}>
          <Ionicons name="refresh-outline" size={18} color={C.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : error && !record ? (
        <View style={s.center}>
          <Text style={s.errorMsg}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
        </View>
      ) : record ? (
        <ScrollView contentContainerStyle={s.scrollContent}>
          {/* Header */}
          <View style={s.statusHeader}>
            <View>
              <Text style={s.docId}>{record.adj_id}</Text>
              {/* FIX 1: show created_at prominently under the ID */}
              {!!record.requested_at && (
                <Text style={s.createdAt}>
                  {new Date(record.requested_at).toLocaleString("en-GB")}
                </Text>
              )}
            </View>
            <StatusPill status={record.status} />
          </View>

          {/* Delta card */}
          <View style={[s.deltaCard, { borderColor: qtyDelta > 0 ? "#86efac" : "#fca5a5" }]}>
            <Text style={s.deltaLabel}>Quantity Adjustment</Text>
            <Text style={[s.deltaValue, { color: qtyDelta > 0 ? C.success : C.danger }]}>
              {qtyDelta > 0 ? "+" : ""}{qtyDelta}
            </Text>
          </View>

          {/* Details */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Details</Text>
            <View style={s.fieldGrid}>
              <Field label="SKU"          value={record.sku_id} />
              <Field label="Location"     value={record.location_id} />
              <Field label="Reason Code"  value={record.reason_code} />
              <Field label="Requested By" value={record.requested_by} />
              {/* FIX 1: created_at also kept here in the details grid for completeness */}
              <Field label="Requested At" value={record.requested_at ? new Date(record.requested_at).toLocaleString("en-GB") : "—"} />
              {record.approved_by   && <Field label="Actioned By"  value={record.approved_by} />}
              {/* FIX 2: use dynamic noteLabel instead of hardcoded "Approval Note" */}
              {record.approval_note && <Field label={noteLabel} value={record.approval_note} />}
              {record.cancellation_reason && <Field label="Cancellation Reason" value={record.cancellation_reason} />}
            </View>
          </View>

          {!!error && (
            <View style={s.inlineError}>
              <Ionicons name="alert-circle-outline" size={13} color="#991b1b" />
              <Text style={s.inlineErrorText}>{error}</Text>
            </View>
          )}

          {/* Actions */}
          {!isTerminal && ((canSubmitAdj(roleId) && record.status === "DRAFT") || canCancelAdj(roleId)) && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Actions</Text>
              <View style={s.actionGrid}>
                {canSubmitAdj(roleId) && record.status === "DRAFT" && (
                  <TouchableOpacity style={[s.actionBtn, s.actionBtnPrimary, !!busy && { opacity: 0.6 }]}
                    onPress={handleSubmit} disabled={!!busy}>
                    {busy === "submit" ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="send-outline" size={16} color="#fff" /><Text style={[s.actionBtnText, { color: "#fff" }]}>Submit</Text></>}
                  </TouchableOpacity>
                )}
                {canCancelAdj(roleId) && (
                  <TouchableOpacity style={[s.actionBtn, s.actionBtnOutlineDanger, !!busy && { opacity: 0.6 }]}
                    onPress={() => setShowCancel(true)} disabled={!!busy}>
                    <Ionicons name="ban-outline" size={16} color={C.danger} />
                    <Text style={[s.actionBtnText, { color: C.danger }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      ) : null}

      <ReasonModal visible={showCancel} title="Cancel Adjustment" loading={busy === "cancel"} onConfirm={handleCancel} onClose={() => setShowCancel(false)} isDanger />
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  navbar:         { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginRight: 10 },
  navTitle:       { flex: 1, fontSize: 16, fontWeight: "700", color: C.text },
  refreshBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentLight, alignItems: "center", justifyContent: "center" },
  center:         { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorMsg:       { fontSize: 14, color: C.danger, textAlign: "center", paddingHorizontal: 32 },
  retryBtn:       { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent },
  retryText:      { color: "#fff", fontWeight: "600" },
  scrollContent:  { padding: 16, gap: 16, paddingBottom: 40 },
  statusHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  docId:          { fontSize: 18, fontWeight: "700", color: C.text },
  // FIX 1: style for the subtitle timestamp under the doc ID
  createdAt:      { fontSize: 12, color: C.textMuted, marginTop: 3 },
  deltaCard:      { backgroundColor: C.surface, borderRadius: 12, padding: 20, borderWidth: 2, alignItems: "center" },
  deltaLabel:     { fontSize: 12, fontWeight: "600", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  deltaValue:     { fontSize: 36, fontWeight: "800" },
  section:        { backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  sectionTitle:   { fontSize: 13, fontWeight: "700", color: C.textLabel, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  fieldGrid:      { gap: 12 },
  field:          {},
  fieldLabel:     { fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  fieldVal:       { fontSize: 14, fontWeight: "500", color: C.text },
  inlineError:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fee2e2", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#fca5a5" },
  inlineErrorText:{ flex: 1, fontSize: 13, color: "#991b1b" },
  actionGrid:     { gap: 10 },
  actionBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 10 },
  actionBtnPrimary:      { backgroundColor: C.accent },
  actionBtnSuccess:      { backgroundColor: C.success },
  actionBtnDanger:       { backgroundColor: C.danger },
  actionBtnOutlineDanger:{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.danger },
  actionBtnText:         { fontSize: 15, fontWeight: "600" },
  pill:           { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillText:       { fontSize: 12, fontWeight: "600" },
  modalOverlay:   { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  bottomSheet:    { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  sheetHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", alignSelf: "center", marginBottom: 16 },
  sheetTitle:     { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 16 },
  inputLabel:     { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 6 },
  textarea:       { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.text, height: 90, backgroundColor: C.bg, textAlignVertical: "top" },
  inputErr:       { borderColor: C.danger },
  errText:        { fontSize: 12, color: C.danger, marginTop: 4 },
  sheetActions:   { flexDirection: "row", gap: 10, marginTop: 16 },
  btnGhost:       { flex: 1, height: 46, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  btnGhostText:   { fontSize: 14, fontWeight: "600", color: C.textSub },
  btnPrimary:     { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  btnDanger:      { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.danger, alignItems: "center", justifyContent: "center" },
  btnDangerText:  { fontSize: 14, fontWeight: "700", color: "#fff" },
});
