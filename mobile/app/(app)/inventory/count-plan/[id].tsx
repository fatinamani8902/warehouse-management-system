// @ts-nocheck
import { useCallback, useEffect, useState } from "react"; 
import {
  ActivityIndicator, Keyboard, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  addCountEntry,
  fetchCountPlanById,
  submitCountPlan,
} from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { formatDate, formatDateTime } from "@/utils/dateTimeFormatter";

const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", borderLight: "#f1f5f9",
  text: "#111827", textSub: "#374151",
  textLabel: "#6b7280", textMuted: "#9ca3af",
  danger: "#e03131", success: "#16a34a", warning: "#d97706",
};

const STATUS_CFG = {
  draft:       { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Draft" },
  in_progress: { bg: "#ffedd5", color: "#7c2d12", dot: "#f97316", label: "In Progress" },
  submitted:   { bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "Submitted" },
  approved:    { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Approved" },
  rejected:    { bg: "#fee2e2", color: "#7f1d1d", dot: "#ef4444", label: "Rejected" },
  cancelled:   { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Cancelled" },
};

const ROLE_ALIASES = {
  superadmin: "superadmin", hqadmin: "hqadmin",
  manager: "manager", storemanager: "storemanager",
  warehousemanager: "warehousemanager",
  storeoperator: "storeoperator", warehouseoperator: "warehouseoperator",
  warehouseclerk: "storeoperator", storekeeper: "storeoperator",
  auditor: "auditor", readonly: "readonly",
};
function normalizeRole(r) { return ROLE_ALIASES[String(r || "readonly").toLowerCase()] || "readonly"; }
function canExecute(roleId)    { return ["storeoperator", "warehouseoperator"].includes(normalizeRole(roleId)); }
function canSubmitPlan(roleId) { return ["storeoperator", "warehouseoperator"].includes(normalizeRole(roleId)); }

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

function StatusPill({ status }) {
  const key = (status || "").toLowerCase();
  const c   = STATUS_CFG[key] || { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: status };
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function Field({ label, value }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldVal}>{value || "-"}</Text>
    </View>
  );
}

// ── Entry Modal ───────────────────────────────────────────────────
function EntryModal({ visible, lines, loading, onConfirm, onClose }) {
  const [lineId, setLineId]             = useState("");
  const [scannedValue, setScannedValue] = useState("");
  const [qtyCounted, setQtyCounted]     = useState("");
  const [err, setErr]                   = useState("");
  const keyboardHeight                  = useKeyboardHeight();

  useEffect(() => {
    if (visible) { setLineId(""); setScannedValue(""); setQtyCounted(""); setErr(""); }
  }, [visible]);

  const handleLineSelect = (selectedLineId) => {
    setLineId(selectedLineId);
    if (selectedLineId) {
      const selectedLine = (lines || []).find(l => l.line_id === selectedLineId);
      if (selectedLine) setScannedValue(selectedLine.sku_id || "");
    } else {
      setScannedValue("");
    }
  };

  const submit = () => {
    if (!qtyCounted || isNaN(Number(qtyCounted)) || Number(qtyCounted) < 0) {
      setErr("Valid quantity is required"); return;
    }
    onConfirm({
      line_id: lineId || null,
      qty_counted: Number(qtyCounted),
      scan_mode: "MANUAL",
      scanned_value: scannedValue.trim() || "",
    });
  };

  const lineSelected = Boolean(lineId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose} />
      <View style={[s.bottomSheet, { marginBottom: keyboardHeight }]}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Add Count Entry</Text>

        <Text style={s.inputLabel}>Line (optional)</Text>
        <ScrollView style={s.pickerBox} nestedScrollEnabled>
          <TouchableOpacity
            style={[s.pickerItem, !lineId && s.pickerItemActive]}
            onPress={() => handleLineSelect("")}
          >
            <Text style={[s.pickerItemText, !lineId && { color: C.accent, fontWeight: "600" }]}>Auto Resolve</Text>
            {!lineId && <Ionicons name="checkmark" size={14} color={C.accent} />}
          </TouchableOpacity>
          {(lines || []).map((l) => (
            <TouchableOpacity
              key={l.line_id}
              style={[s.pickerItem, lineId === l.line_id && s.pickerItemActive]}
              onPress={() => handleLineSelect(l.line_id)}
            >
              <Text style={[s.pickerItemText, lineId === l.line_id && { color: C.accent, fontWeight: "600" }]}>
                {l.sku_id} — {l.location_id}
              </Text>
              {lineId === l.line_id && <Ionicons name="checkmark" size={14} color={C.accent} />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[s.inputLabel, { marginTop: 12 }]}>
          Scanned / Typed Value{" "}
          <Text style={{ color: C.textMuted, fontWeight: "400" }}>(optional)</Text>
        </Text>
        <TextInput
          style={[s.input, lineSelected && { backgroundColor: "#f0f4ff", borderColor: C.accent }]}
          value={scannedValue}
          onChangeText={setScannedValue}
          placeholder={lineSelected ? "Auto-filled from line" : "e.g. SKU000001"}
          placeholderTextColor={C.textMuted}
          autoCapitalize="none"
        />
        {lineSelected && (
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
            Auto-filled from selected line. You may override.
          </Text>
        )}

        <Text style={[s.inputLabel, { marginTop: 12 }]}>
          Qty Counted <Text style={{ color: C.danger }}>*</Text>
        </Text>
        <TextInput
          style={[s.input, !!err && s.inputErr]}
          value={qtyCounted}
          onChangeText={(v) => { setQtyCounted(v); setErr(""); }}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={C.textMuted}
        />
        {!!err && <Text style={s.errText}>{err}</Text>}

        <View style={s.sheetActions}>
          <TouchableOpacity style={s.btnGhost} onPress={onClose} disabled={loading}>
            <Text style={s.btnGhostText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnPrimary, loading && { opacity: 0.6 }]}
            onPress={submit} disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.btnPrimaryText}>Add Entry</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Reason Modal ──────────────────────────────────────────────────
export default function CountPlanDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const user   = useAuthStore((s) => s.user);
  const roleId = user?.role_id || "readonly";

  const [record, setRecord]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState("");

  const [showEntry,   setShowEntry]   = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res  = await fetchCountPlanById(id);
      const data = res?.data?.data ?? res?.data;
      if (!data) { setError("Count plan not found"); return; }
      setRecord(data);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const allLinesCounted = () => {
    const lines = record?.lines || [];
    if (lines.length === 0) return false;
    return lines.every(l => (l.status || "").toLowerCase() === "counted");
  };

  const handleAddEntry = async (payload) => {
    try {
      setBusy("entry"); setError("");
      await addCountEntry(id, payload);
      await load();
      setShowEntry(false);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to add entry");
    } finally { setBusy(""); }
  };

  const handleSubmit = async () => {
    if (!allLinesCounted()) {
      setError("All lines must be counted before submission. Please add count entries for all pending lines.");
      return;
    }
    try {
      setBusy("submit"); setError("");
      const res  = await submitCountPlan(id);
      const data = res?.data?.data ?? res?.data;
      if (data) setRecord(data);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Submit failed");
    } finally { setBusy(""); }
  };

  const statusLower    = (record?.status || "").toLowerCase();
  const isCountable    = ["draft", "in_progress"].includes(statusLower);
  const showAddEntry   = canExecute(roleId) && isCountable;
  const showSubmit     = canSubmitPlan(roleId) && isCountable;
  const pendingLines   = (record?.lines || []).filter(l => (l.status || "").toLowerCase() !== "counted");
  const readyToSubmit  = allLinesCounted();

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
          <View style={s.statusHeader}>
            <Text style={s.docId}>{record.count_id}</Text>
            <StatusPill status={record.status} />
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Details</Text>
            <View style={s.fieldRow}>
              <View style={{ flex: 1 }}><Field label="Zone"         value={record.zone_id} /></View>
              <View style={{ flex: 1 }}><Field label="Planned Date" value={formatDate(record.planned_date)} /></View>
            </View>
            <View style={s.fieldRow}>
              <View style={{ flex: 1 }}><Field label="Scope"      value={(record.scope_type || "").replace(/_/g, " ")} /></View>
              <View style={{ flex: 1 }}><Field label="Created By" value={record.created_by} /></View>
            </View>

            {/* Approval info — only show bila dah approved/rejected */}
            {["approved", "rejected"].includes(statusLower) && (
              <>
                <View style={s.fieldDivider} />
                <View style={s.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={statusLower === "approved" ? "Approved By" : "Rejected By"}
                      value={record.approved_by}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={statusLower === "approved" ? "Approved At" : "Rejected At"}
                      value={formatDateTime(record.approved_at)}
                    />
                  </View>
                </View>
                {record.approval_reason_code && (
                  <View style={s.fieldRow}>
                    <View style={{ flex: 1 }}>
                      <Field label="Reason Code" value={record.approval_reason_code} />
                    </View>
                    <View style={{ flex: 1 }} />
                  </View>
                )}
                {record.approval_note && (
                  <View style={s.noteBox}>
                    <Text style={s.noteLabel}>
                      {statusLower === "approved" ? "Approval Note" : "Rejection Reason"}
                    </Text>
                    <Text style={s.noteText}>{record.approval_note}</Text>
                  </View>
                )}
              </>
            )}

            {/* Cancellation info */}
            {statusLower === "cancelled" && record.cancellation_reason && (
              <>
                <View style={s.fieldDivider} />
                <View style={s.noteBox}>
                  <Text style={s.noteLabel}>Cancellation Reason</Text>
                  <Text style={s.noteText}>{record.cancellation_reason}</Text>
                </View>
              </>
            )}

            {/* Submitted info */}
            {record.submitted_by && (
              <>
                <View style={s.fieldDivider} />
                <View style={s.fieldRow}>
                  <View style={{ flex: 1 }}><Field label="Submitted By" value={record.submitted_by} /></View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Submitted At"
                      value={formatDateTime(record.submitted_at)}
                    />
                  </View>
                </View>
              </>
            )}
          </View>

          {(record.lines || []).length > 0 && (
            <View style={s.section}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={[s.sectionTitle, { marginBottom: 0 }]}>Lines ({record.lines.length})</Text>
                {isCountable && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: readyToSubmit ? C.success : C.warning }} />
                    <Text style={{ fontSize: 11, color: readyToSubmit ? C.success : C.warning, fontWeight: "600" }}>
                      {readyToSubmit ? "All counted" : `${pendingLines.length} pending`}
                    </Text>
                  </View>
                )}
              </View>
              {record.lines.map((line, i) => {
                const lineStatus = (line.status || "pending").toLowerCase();
                const isCounted  = lineStatus === "counted";
                const variance   = line.variance_qty;
                return (
                  <View key={i} style={[s.lineCard, i > 0 && { marginTop: 8 }]}>
                    <View style={s.lineCardHeader}>
                      <Text style={s.lineSkuText}>{line.sku_id}</Text>
                      <View style={[s.lineBadge, { backgroundColor: isCounted ? "#dcfce7" : "#fff7ed" }]}>
                        <Text style={[s.lineBadgeText, { color: isCounted ? C.success : C.warning }]}>
                          {isCounted ? "Counted" : "Pending"}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.lineLocation}>{line.location_id || "—"}</Text>
                    <View style={s.lineQtyRow}>
                      <View style={s.lineQtyItem}>
                        <Text style={s.lineQtyLabel}>System</Text>
                        <Text style={s.lineQtyVal}>{line.system_qty ?? "—"}</Text>
                      </View>
                      <View style={s.lineQtyItem}>
                        <Text style={s.lineQtyLabel}>Counted</Text>
                        <Text style={[s.lineQtyVal, line.counted_qty != null && { color: C.accent }]}>
                          {line.counted_qty ?? "—"}
                        </Text>
                      </View>
                      <View style={s.lineQtyItem}>
                        <Text style={s.lineQtyLabel}>Variance</Text>
                        <Text style={[s.lineQtyVal, {
                          color: variance == null ? C.textMuted : variance < 0 ? C.danger : variance > 0 ? C.warning : C.success,
                          fontWeight: variance != null ? "700" : "400",
                        }]}>
                          {variance == null ? "—" : variance > 0 ? `+${variance}` : variance}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {(record.entries || []).length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Count Entries ({record.entries.length})</Text>
              {record.entries.map((entry, i) => (
                <View key={i} style={[s.entryRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.borderLight }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.entrySkuText}>{entry.sku_id || entry.scanned_value || `Entry ${entry.entry_id}`}</Text>
                    <Text style={s.entryMeta}>{entry.scan_mode} · {entry.scanned_by}</Text>
                  </View>
                  <Text style={s.entryQty}>{entry.qty_counted}</Text>
                </View>
              ))}
            </View>
          )}

          {!!error && (
            <View style={s.inlineError}>
              <Ionicons name="alert-circle-outline" size={13} color="#991b1b" />
              <Text style={s.inlineErrorText}>{error}</Text>
            </View>
          )}

          {(showAddEntry || showSubmit) && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Actions</Text>
              <View style={s.actionGrid}>
                {showAddEntry && (
                  <TouchableOpacity
                    style={[s.actionBtn, s.actionBtnSecondary, !!busy && { opacity: 0.6 }]}
                    onPress={() => setShowEntry(true)} disabled={!!busy}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={C.accent} />
                    <Text style={[s.actionBtnText, { color: C.accent }]}>Add Count Entry</Text>
                  </TouchableOpacity>
                )}
                {showSubmit && (
                  <TouchableOpacity
                    style={[s.actionBtn, readyToSubmit ? s.actionBtnPrimary : s.actionBtnDisabled, !!busy && { opacity: 0.6 }]}
                    onPress={handleSubmit} disabled={!!busy}
                  >
                    {busy === "submit"
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <Ionicons name="send-outline" size={16} color={readyToSubmit ? "#fff" : C.textMuted} />
                          <View>
                            <Text style={[s.actionBtnText, { color: readyToSubmit ? "#fff" : C.textMuted }]}>
                              Submit For Approval
                            </Text>
                            {!readyToSubmit && pendingLines.length > 0 && (
                              <Text style={{ fontSize: 10, color: C.textMuted, textAlign: "center" }}>
                                {pendingLines.length} line{pendingLines.length > 1 ? "s" : ""} still pending
                              </Text>
                            )}
                          </View>
                        </>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      ) : null}

      <EntryModal   visible={showEntry}   lines={record?.lines} loading={busy === "entry"}   onConfirm={handleAddEntry} onClose={() => { setShowEntry(false); setError(""); }} />
    </View>
  );
}

const s = StyleSheet.create({
  root:                  { flex: 1, backgroundColor: C.bg },
  navbar:                { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:               { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginRight: 10 },
  navTitle:              { flex: 1, fontSize: 16, fontWeight: "700", color: C.text },
  refreshBtn:            { width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentLight, alignItems: "center", justifyContent: "center" },
  center:                { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorMsg:              { fontSize: 14, color: C.danger, textAlign: "center", paddingHorizontal: 32 },
  retryBtn:              { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent },
  retryText:             { color: "#fff", fontWeight: "600" },
  scrollContent:         { padding: 16, gap: 16, paddingBottom: 40 },
  statusHeader:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  docId:                 { fontSize: 18, fontWeight: "700", color: C.text },
  section:               { backgroundColor: C.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  sectionTitle:          { fontSize: 13, fontWeight: "700", color: C.textLabel, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  fieldRow:              { flexDirection: "row", gap: 12, marginBottom: 10 },
  field:                 {},
  fieldLabel:            { fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  fieldVal:              { fontSize: 13, fontWeight: "500", color: C.text },
  fieldDivider:          { height: 1, backgroundColor: "#f1f5f9", marginVertical: 10 },
  noteBox:               { backgroundColor: "#f8fafc", borderRadius: 8, padding: 12, borderWidth: 1, borderColor: "#f1f5f9", marginTop: 4 },
  noteLabel:             { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  noteText:              { fontSize: 13, color: "#374151", lineHeight: 18 },
  lineCard:              { backgroundColor: C.bg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.borderLight },
  lineCardHeader:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  lineSkuText:           { fontSize: 14, fontWeight: "700", color: C.text },
  lineBadge:             { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  lineBadgeText:         { fontSize: 11, fontWeight: "600" },
  lineLocation:          { fontSize: 12, color: C.textMuted, marginBottom: 8 },
  lineQtyRow:            { flexDirection: "row", gap: 8 },
  lineQtyItem:           { flex: 1, backgroundColor: C.surface, borderRadius: 8, padding: 8, alignItems: "center" },
  lineQtyLabel:          { fontSize: 10, color: C.textMuted, fontWeight: "600", textTransform: "uppercase", marginBottom: 2 },
  lineQtyVal:            { fontSize: 16, fontWeight: "700", color: C.text },
  entryRow:              { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  entrySkuText:          { fontSize: 13, fontWeight: "600", color: C.text },
  entryMeta:             { fontSize: 11, color: C.textMuted, marginTop: 2 },
  entryQty:              { fontSize: 18, fontWeight: "700", color: C.accent },
  inlineError:           { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fee2e2", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#fca5a5" },
  inlineErrorText:       { flex: 1, fontSize: 13, color: "#991b1b" },
  actionGrid:            { gap: 10 },
  actionBtn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 10 },
  actionBtnSecondary:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.accent },
  actionBtnPrimary:      { backgroundColor: C.accent },
  actionBtnDisabled:     { backgroundColor: "#e2e8f0", borderWidth: 1, borderColor: "#cbd5e1" },
  actionBtnSuccess:      { backgroundColor: C.success },
  actionBtnDanger:       { backgroundColor: C.danger },
  actionBtnOutlineDanger:{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.danger },
  actionBtnText:         { fontSize: 14, fontWeight: "600" },
  pill:                  { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillText:              { fontSize: 12, fontWeight: "600" },
  modalOverlay:          { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  bottomSheet:           { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  sheetHandle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0", alignSelf: "center", marginBottom: 16 },
  sheetTitle:            { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 12 },
  inputLabel:            { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 6 },
  input:                 { height: 46, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.bg },
  textarea:              { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.text, height: 90, backgroundColor: C.bg, textAlignVertical: "top" },
  inputErr:              { borderColor: C.danger },
  errText:               { fontSize: 12, color: C.danger, marginTop: 4 },
  dropdownTrigger:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropdownText:          { fontSize: 15, color: C.text, flex: 1 },
  dropdownList:          { borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.bg, marginTop: 4, marginBottom: 4, overflow: "hidden" },
  pickerBox:             { borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.bg, maxHeight: 110, marginBottom: 4 },
  pickerItem:            { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  pickerItemActive:      { backgroundColor: C.accentLight },
  pickerItemText:        { fontSize: 13, color: C.textSub },
  sheetActions:          { flexDirection: "row", gap: 10, marginTop: 16 },
  btnGhost:              { flex: 1, height: 46, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  btnGhostText:          { fontSize: 14, fontWeight: "600", color: C.textSub },
  btnPrimary:            { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  btnPrimaryText:        { fontSize: 14, fontWeight: "700", color: "#fff" },
  btnSuccess:            { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.success, alignItems: "center", justifyContent: "center" },
  btnSuccessText:        { fontSize: 14, fontWeight: "700", color: "#fff" },
  btnDanger:             { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.danger, alignItems: "center", justifyContent: "center" },
  btnDangerText:         { fontSize: 14, fontWeight: "700", color: "#fff" },
});
