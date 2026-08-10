import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  completePutawayTask,
  fetchPutawayTaskById,
  markPutawayException,
} from "@/services/api";
import { useAuthStore } from "@/stores/authStore";

const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", borderLight: "#f1f5f9",
  text: "#111827", textSub: "#374151",
  textLabel: "#6b7280", textMuted: "#9ca3af",
  danger: "#e03131", dangerBg: "#fee2e2",
  success: "#16a34a", successBg: "#dcfce7",
  warning: "#d97706",
};

const STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  pending:     { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Pending" },
  in_progress: { bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "In Progress" },
  completed:   { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Completed" },
  exception:   { bg: "#fee2e2", color: "#7f1d1d", dot: "#ef4444", label: "Exception" },
};

const PRIORITY_CFG: Record<string, { color: string; label: string }> = {
  high:   { color: "#dc2626", label: "High" },
  medium: { color: "#d97706", label: "Medium" },
  low:    { color: "#6b7280", label: "Low" },
};

// RBAC
const ROLE_ALIASES: Record<string, string> = {
  superadmin: "warehousemanager", hqadmin: "warehousemanager",
  storemanager: "warehousemanager", warehouseclerk: "storekeeper",
  warehousemanager: "warehousemanager", storekeeper: "storekeeper",
  auditor: "auditor", readonly: "readonly",
};
function normalizeRole(r: string) {
  return ROLE_ALIASES[String(r || "readonly").toLowerCase()] || "readonly";
}

function canComplete(roleId: string) {
  const normalized = normalizeRole(roleId);
  console.log("canComplete:", roleId, "->", normalized);
  return ["storekeeper", "storeoperator"].includes(normalized);
}
function canException(roleId: string) { return ["superadmin", "hqadmin", "warehousemanager", "storemanager", "storekeeper", "storeoperator"].includes(normalizeRole(roleId)); }

// Keyboard height hook
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
  const cfg = STATUS_CFG[status] || { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: status };
  return (
    <View style={[s.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[s.pillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={[s.fieldVal, mono && s.fieldMono]}>{value || "—"}</Text>
    </View>
  );
}

// ── Assign Modal ──────────────────────────────────────────────────
// ── Complete Modal ────────────────────────────────────────────────
function CompleteModal({ visible, suggestedBin, loading, onConfirm, onClose }: any) {
  const [binCode, setBinCode] = useState("");
  const [err, setErr]         = useState("");
  const keyboardHeight        = useKeyboardHeight();

  useEffect(() => {
    if (visible) { setBinCode(suggestedBin || ""); setErr(""); }
  }, [visible, suggestedBin]);

  const submit = () => {
    if (!binCode.trim()) { setErr("Bin code is required"); return; }
    onConfirm(binCode.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose} />
      <View style={[s.bottomSheet, { marginBottom: keyboardHeight }]}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Complete Putaway</Text>
        <Text style={s.sheetSub}>Confirm the actual bin where the item was placed.</Text>
        <Text style={s.inputLabel}>Actual Bin Code <Text style={{ color: C.danger }}>*</Text></Text>
        <TextInput
          style={[s.input, !!err && s.inputErr]}
          value={binCode}
          onChangeText={(v) => { setBinCode(v); setErr(""); }}
          placeholder="e.g. A-01-01"
          placeholderTextColor={C.textMuted}
          autoCapitalize="characters"
        />
        {!!err && <Text style={s.errText}>{err}</Text>}
        {suggestedBin && (
          <TouchableOpacity onPress={() => setBinCode(suggestedBin)} style={s.useSuggestedBtn}>
            <Ionicons name="arrow-redo-outline" size={14} color={C.accent} />
            <Text style={s.useSuggestedText}>Use suggested: {suggestedBin}</Text>
          </TouchableOpacity>
        )}
        <View style={s.sheetActions}>
          <TouchableOpacity style={s.btnGhost} onPress={onClose} disabled={loading}>
            <Text style={s.btnGhostText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnSuccess, loading && { opacity: 0.6 }]}
            onPress={submit} disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnSuccessText}>Complete</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Exception Modal ───────────────────────────────────────────────
function ExceptionModal({ visible, loading, onConfirm, onClose }: any) {
  const [reason, setReason]   = useState("");
  const [err, setErr]         = useState("");
  const keyboardHeight        = useKeyboardHeight();

  useEffect(() => { if (visible) { setReason(""); setErr(""); } }, [visible]);

  const submit = () => {
    if (!reason.trim())           { setErr("Reason is required"); return; }
    if (reason.trim().length < 5) { setErr("Reason must be at least 5 characters"); return; }
    onConfirm(reason.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose} />
      <View style={[s.bottomSheet, { marginBottom: keyboardHeight }]}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Mark Exception</Text>
        <Text style={s.sheetSub}>Describe the issue with this putaway task.</Text>
        <Text style={s.inputLabel}>Reason <Text style={{ color: C.danger }}>*</Text></Text>
        <TextInput
          style={[s.textarea, !!err && s.inputErr]}
          value={reason}
          onChangeText={(v) => { setReason(v); setErr(""); }}
          placeholder="Min. 5 characters…"
          placeholderTextColor={C.textMuted}
          multiline textAlignVertical="top"
          editable={!loading}
        />
        {!!err && <Text style={s.errText}>{err}</Text>}
        <View style={s.sheetActions}>
          <TouchableOpacity style={s.btnGhost} onPress={onClose} disabled={loading}>
            <Text style={s.btnGhostText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnDanger, loading && { opacity: 0.6 }]}
            onPress={submit} disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnDangerText}>Mark Exception</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────
export default function PutawayDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user   = useAuthStore((s) => s.user);
  const roleId = user?.role_id || "readonly";

  const [record, setRecord]       = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [busy, setBusy]           = useState("");

  const [showComplete,  setShowComplete]  = useState(false);
  const [showException, setShowException] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const taskRes = await fetchPutawayTaskById(id!);
      const task = taskRes?.data?.data ?? taskRes?.data;
      if (!task) { setError("Task not found"); return; }
      setRecord(task);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load task");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleComplete = async (binCode: string) => {
    try {
      setBusy("complete");
      const res     = await completePutawayTask(id!, binCode);
      const updated = res?.data?.data ?? res?.data;
      if (updated) setRecord(updated);
      setShowComplete(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Complete failed");
    } finally { setBusy(""); }
  };

  const handleException = async (reason: string) => {
    try {
      setBusy("exception");
      const res     = await markPutawayException(id!, reason);
      const updated = res?.data?.data ?? res?.data;
      if (updated) setRecord(updated);
      setShowException(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Exception failed");
    } finally { setBusy(""); }
  };

  const isTerminal = record && ["completed", "exception"].includes(record.status);
  const hasExecutionActions = canComplete(roleId) || canException(roleId);

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
            <View>
              <Text style={s.docId}>{record.task_id}</Text>
              {record.priority && (
                <Text style={[s.priorityLabel, { color: PRIORITY_CFG[record.priority]?.color || C.textMuted }]}>
                  {PRIORITY_CFG[record.priority]?.label || record.priority} Priority
                </Text>
              )}
            </View>
            <StatusPill status={record.status} />
          </View>

          {/* Bin info */}
          <View style={s.binCard}>
            <View style={s.binItem}>
              <Text style={s.binLabel}>Suggested Bin</Text>
              <Text style={s.binValue}>{record.suggested_bin || "—"}</Text>
            </View>
            <View style={s.binDivider} />
            <View style={s.binItem}>
              <Text style={s.binLabel}>Actual Bin</Text>
              <Text style={[s.binValue, record.actual_bin_code && { color: C.success }]}>
                {record.actual_bin_code || "—"}
              </Text>
            </View>
          </View>

          {/* Details */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Details</Text>
            <View style={s.fieldGrid}>
              <Field label="SKU"             value={record.sku_id} mono />
              <Field label="Quantity"        value={String(record.qty ?? "—")} />
              <Field label="GRN"             value={record.grn_id} mono />
              <Field label="Source Location" value={record.source_location} />
              <Field label="Assigned To"     value={record.assigned_to_user_name || "Unassigned"} />
              <Field label="Device Type"     value={record.device_type} />
              {record.exception_reason && (
                <View style={s.exceptionBox}>
                  <Ionicons name="warning-outline" size={14} color="#991b1b" />
                  <Text style={s.exceptionText}>{record.exception_reason}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Evidence */}
          {(record.scan_method || record.validation_result) && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Evidence</Text>
              <View style={s.fieldGrid}>
                <Field label="Scan Method"      value={record.scan_method} />
                <Field label="EPC Expected"     value={String(record.epc_expected_count ?? "—")} />
                <Field label="EPC Confirmed"    value={String(record.epc_confirmed_count ?? "—")} />
                <Field label="Validation"       value={record.validation_result} />
              </View>
            </View>
          )}

          {/* Inline error */}
          {!!error && (
            <View style={s.inlineError}>
              <Ionicons name="alert-circle-outline" size={13} color="#991b1b" />
              <Text style={s.inlineErrorText}>{error}</Text>
            </View>
          )}

          {/* Actions */}
          {!isTerminal && hasExecutionActions && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Actions</Text>
              <View style={s.actionGrid}>
                {canComplete(roleId) && (
                  <TouchableOpacity
                    style={[s.actionBtn, s.actionBtnSuccess, !!busy && { opacity: 0.6 }]}
                    onPress={() => setShowComplete(true)}
                    disabled={!!busy}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={[s.actionBtnText, { color: "#fff" }]}>Complete Putaway</Text>
                  </TouchableOpacity>
                )}
                {canException(roleId) && (
                  <TouchableOpacity
                    style={[s.actionBtn, s.actionBtnDanger, !!busy && { opacity: 0.6 }]}
                    onPress={() => setShowException(true)}
                    disabled={!!busy}
                  >
                    <Ionicons name="warning-outline" size={16} color="#fff" />
                    <Text style={[s.actionBtnText, { color: "#fff" }]}>Mark Exception</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      ) : null}

      <CompleteModal
        visible={showComplete}
        suggestedBin={record?.suggested_bin}
        loading={busy === "complete"}
        onConfirm={handleComplete}
        onClose={() => setShowComplete(false)}
      />
      <ExceptionModal
        visible={showException}
        loading={busy === "exception"}
        onConfirm={handleException}
        onClose={() => setShowException(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: "#f8fafc" },
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
  docId:          { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 2 },
  priorityLabel:  { fontSize: 12, fontWeight: "600" },
  binCard:        { flexDirection: "row", backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  binItem:        { flex: 1, padding: 16, alignItems: "center" },
  binDivider:     { width: 1, backgroundColor: C.border },
  binLabel:       { fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  binValue:       { fontSize: 18, fontWeight: "700", color: C.text, fontVariant: ["tabular-nums"] },
  section:        { backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  sectionTitle:   { fontSize: 13, fontWeight: "700", color: C.textLabel, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  fieldGrid:      { gap: 12 },
  field:          {},
  fieldLabel:     { fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  fieldVal:       { fontSize: 14, fontWeight: "500", color: C.text },
  fieldMono:      { fontVariant: ["tabular-nums"] },
  exceptionBox:   { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#fff5f5", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#fecaca" },
  exceptionText:  { flex: 1, fontSize: 13, color: "#991b1b", lineHeight: 18 },
  inlineError:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fee2e2", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#fca5a5" },
  inlineErrorText:{ flex: 1, fontSize: 13, color: "#991b1b" },
  actionGrid:     { gap: 10 },
  actionBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 10 },
  actionBtnSecondary: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.accent },
  actionBtnSuccess:   { backgroundColor: C.success },
  actionBtnDanger:    { backgroundColor: C.danger },
  actionBtnText:      { fontSize: 15, fontWeight: "600" },
  pill:           { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillText:       { fontSize: 12, fontWeight: "600" },
  modalOverlay:   { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  bottomSheet:    { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  sheetHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", alignSelf: "center", marginBottom: 16 },
  sheetTitle:     { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 4 },
  sheetSub:       { fontSize: 13, color: C.textSub, marginBottom: 16, lineHeight: 18 },
  inputLabel:     { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 6 },
  input:          { height: 46, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.bg },
  textarea:       { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.text, height: 90, backgroundColor: C.bg, textAlignVertical: "top" },
  inputErr:       { borderColor: C.danger },
  errText:        { fontSize: 12, color: C.danger, marginTop: 4 },
  useSuggestedBtn:{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingVertical: 4 },
  useSuggestedText: { fontSize: 13, color: C.accent, fontWeight: "500" },
  sheetActions:   { flexDirection: "row", gap: 10, marginTop: 16 },
  btnGhost:       { flex: 1, height: 46, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  btnGhostText:   { fontSize: 14, fontWeight: "600", color: C.textSub },
  btnPrimary:     { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  btnSuccess:     { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.success, alignItems: "center", justifyContent: "center" },
  btnSuccessText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  btnDanger:      { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.danger, alignItems: "center", justifyContent: "center" },
  btnDangerText:  { fontSize: 14, fontWeight: "700", color: "#fff" },
  operatorItem:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  operatorItemActive: {},
  operatorAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.accentLight, alignItems: "center", justifyContent: "center" },
  operatorAvatarText: { fontSize: 13, fontWeight: "700", color: C.accent },
  operatorName:   { fontSize: 14, fontWeight: "500", color: C.text },
  operatorEmail:  { fontSize: 12, color: C.textMuted, marginTop: 1 },
  emptyText:      { fontSize: 14, color: C.textMuted, textAlign: "center", paddingVertical: 20 },
});
