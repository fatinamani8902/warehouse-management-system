/**
 * app/(picking)/[pickListId].tsx
 *
 * Fixed:
 *  1. Undo — shows inline toast on error instead of silent catch.
 *             Handles already_zero gracefully (no crash, no red toast).
 *  2. Short pick complete — handleShortPickComplete now correctly calls
 *     completePickList with { force: true, short_pick_reason } and surfaces
 *     any API error inside the modal so user sees what went wrong.
 *  3. handleCompleteTap — calls /complete with force=false first so backend
 *     returns the canonical short_lines list. Modal is driven by API response,
 *     not local line state (single source of truth).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  fetchPickListById,
  scanPickListUnit,
  manualPickLine,
  apiClient,
} from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { normalizeRole } from "@/services/rbac";
import { getAssignedUserDisplay } from "@/utils/pickingDisplay";
import { unwrapPickListRecord } from "@/utils/pickingResponse";

// ── Inline API hook for picking endpoints not yet in api.ts ─────────────────
function usePickingApi() {
  const post = useCallback(async (path: string, body?: object): Promise<any> => {
    const response = await apiClient.post(path, body || {});
    return response.data;
  }, []);

  return { post };
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:         "#f4f6fb",
  card:       "#ffffff",
  border:     "#e8eaf0",
  accent:     "#3b5bdb",
  accentSoft: "#eef2ff",
  success:    "#16a34a",
  successBg:  "#dcfce7",
  successBdr: "#86efac",
  warning:    "#d97706",
  warningBg:  "#fef3c7",
  warningBdr: "#fde68a",
  danger:     "#dc2626",
  dangerBg:   "#fee2e2",
  dangerBdr:  "#fca5a5",
  t1:         "#111827",
  t2:         "#374151",
  t3:         "#6b7280",
  t4:         "#9ca3af",
  white:      "#ffffff",
  overlay:    "rgba(0,0,0,0.55)",
};

const { width: SW } = Dimensions.get("window");
const SCAN_BOX = Math.min(SW * 0.65, 260);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface PickLine {
  line_id:      string;
  sku_id:       string;
  location_id:  string;
  barcode?:     string;
  qty_required: number;
  qty_picked?:  number;
  scan_count?:  number;
  status:       string;
  scan_mode?:   string;
  picked_by?:   string;
}

interface ShortLine {
  line_id:      string;
  sku_id:       string;
  location_id:  string;
  qty_required: number;
  qty_picked:   number;
  short_qty:    number;
}

interface PickList {
  assigned_to_user_id?:   string;
  assigned_to_user_name?: string;
  pick_list_id:         string;
  wave_id?:             string;
  status:               string;
  lines:                PickLine[];
  is_short_pick?:       boolean;
  short_pick_reason?:   string;
  completed_at?:        string;
  completed_by?:        string;
  cancellation_reason?: string;
  cancelled_by?:        string;
  cancelled_at?:        string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getPicked(line: PickLine): number {
  return Number(line.qty_picked ?? line.scan_count ?? 0);
}
function getRequired(line: PickLine): number {
  return Number(line.qty_required ?? 0);
}
function isDone(line: PickLine): boolean {
  return getRequired(line) > 0 && getPicked(line) >= getRequired(line);
}
function isPartial(line: PickLine): boolean {
  return getPicked(line) > 0 && !isDone(line);
}

function normalizePickStatus(status: string | undefined | null): string {
  const value = String(status ?? "").toLowerCase();
  return value === "done" ? "completed" : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast — lightweight inline notification
// ─────────────────────────────────────────────────────────────────────────────
interface ToastState {
  msg:     string;
  type:    "success" | "warning" | "error";
  visible: boolean;
}

function Toast({ toast }: { toast: ToastState }) {
  if (!toast.visible) return null;
  const bg  = toast.type === "success" ? C.successBg  : toast.type === "warning" ? C.warningBg  : C.dangerBg;
  const bdr = toast.type === "success" ? C.successBdr : toast.type === "warning" ? C.warningBdr : C.dangerBdr;
  const col = toast.type === "success" ? C.success    : toast.type === "warning" ? C.warning    : C.danger;
  return (
    <View style={{
      position: "absolute", top: 12, left: 16, right: 16, zIndex: 99,
      backgroundColor: bg, borderRadius: 10, borderWidth: 1, borderColor: bdr,
      paddingHorizontal: 14, paddingVertical: 10,
      flexDirection: "row", alignItems: "center", gap: 8,
    }}>
      <Ionicons
        name={toast.type === "success" ? "checkmark-circle" : toast.type === "warning" ? "warning" : "close-circle"}
        size={16} color={col}
      />
      <Text style={{ flex: 1, fontSize: 13, color: col, fontWeight: "600" }}>{toast.msg}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────
const BADGE: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  pending:     { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: "Pending"     },
  open:        { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Open"        },
  assigned:    { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Assigned"    },
  released:    { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Released"    },
  in_progress: { bg: "#fef9c3", color: "#713f12", dot: "#eab308", label: "In Progress" },
  picking:     { bg: "#fef9c3", color: "#713f12", dot: "#eab308", label: "Picking"     },
  completed:   { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Completed"   },
  cancelled:   { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af", label: "Cancelled"   },
};

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizePickStatus(status);
  const c = BADGE[normalized] ?? { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: normalized || status };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: c.color }}>{c.label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated scan line
// ─────────────────────────────────────────────────────────────────────────────
function ScanLine() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, SCAN_BOX - 4] });
  return (
    <Animated.View style={{
      position: "absolute", left: 0, right: 0, height: 2,
      backgroundColor: C.accent, opacity: 0.9, transform: [{ translateY }],
    }} />
  );
}

function ScanCorners() {
  const s = { position: "absolute" as const, width: 22, height: 22, borderColor: C.white };
  return (
    <>
      <View style={{ ...s, top: 0,    left: 0,  borderTopWidth: 3,    borderLeftWidth: 3,  borderTopLeftRadius: 4     }} />
      <View style={{ ...s, top: 0,    right: 0, borderTopWidth: 3,    borderRightWidth: 3, borderTopRightRadius: 4    }} />
      <View style={{ ...s, bottom: 0, left: 0,  borderBottomWidth: 3, borderLeftWidth: 3,  borderBottomLeftRadius: 4  }} />
      <View style={{ ...s, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 }} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScanModal
// ─────────────────────────────────────────────────────────────────────────────
function ScanModal({ visible, line, onScan, onClose, processing }: {
  visible:    boolean;
  line:       PickLine | null;
  onScan:     (payload: string) => void;
  onClose:    () => void;
  processing: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cooldown = useRef(false);

  useEffect(() => { if (visible) cooldown.current = false; }, [visible]);

  const handleBarcode = useCallback(({ data }: { data: string }) => {
    if (!data || cooldown.current || processing) return;
    cooldown.current = true;
    Vibration.vibrate(50);
    onScan(data);
    setTimeout(() => { cooldown.current = false; }, 1000);
  }, [onScan, processing]);

  if (!visible || !line) return null;

  const picked   = getPicked(line);
  const required = getRequired(line);
  const progress = required > 0 ? Math.min(picked / required, 1) : 0;
  const done     = progress >= 1;

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
        {/* Header */}
        <View style={{
          paddingTop: Platform.OS === "ios" ? 58 : 38,
          paddingHorizontal: 20, paddingBottom: 12,
          flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        }}>
          <View>
            <Text style={{ color: C.white, fontSize: 17, fontWeight: "700" }}>Scan Units</Text>
            <Text style={{ color: C.white, fontSize: 12, opacity: 0.6, marginTop: 2 }}>Each scan = 1 unit</Text>
          </View>
          <TouchableOpacity onPress={onClose}
            style={{ backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
            <Text style={{ color: C.white, fontSize: 14, fontWeight: "600" }}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Counter card */}
        <View style={{ marginHorizontal: 20, marginBottom: 14,
          backgroundColor: "rgba(59,91,219,0.35)", borderRadius: 14, padding: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <View>
              <Text style={{ color: C.white, fontSize: 11, opacity: 0.65, marginBottom: 2 }}>SKU</Text>
              <Text style={{ color: C.white, fontSize: 16, fontWeight: "700",
                fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{line.sku_id}</Text>
              <Text style={{ color: C.white, fontSize: 12, opacity: 0.65, marginTop: 2 }}>{line.location_id}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: C.white, fontSize: 11, opacity: 0.65, marginBottom: 2 }}>Scanned</Text>
              <Text style={{ color: C.white, fontSize: 30, fontWeight: "800", lineHeight: 34 }}>
                {picked}<Text style={{ fontSize: 16, opacity: 0.65 }}> / {required}</Text>
              </Text>
            </View>
          </View>
          <View style={{ height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" }}>
            <View style={{ height: 6, borderRadius: 3,
              backgroundColor: done ? "#4ade80" : C.white,
              width: `${Math.round(progress * 100)}%` }} />
          </View>
          {done ? (
            <Text style={{ color: "#4ade80", fontSize: 13, fontWeight: "700", marginTop: 8, textAlign: "center" }}>
              ✓  All units scanned — tap Done
            </Text>
          ) : (
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 8, textAlign: "center" }}>
              {required - picked} more to go · tap Done to save partial
            </Text>
          )}
        </View>

        {/* Camera */}
        {!permission?.granted ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
            <Ionicons name="camera-outline" size={48} color={C.white} style={{ marginBottom: 16 }} />
            <Text style={{ color: C.white, fontSize: 15, textAlign: "center", marginBottom: 20 }}>Camera permission required</Text>
            <TouchableOpacity onPress={requestPermission}
              style={{ backgroundColor: C.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
              <Text style={{ color: C.white, fontSize: 14, fontWeight: "600" }}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8"] }}
              onBarcodeScanned={done ? undefined : handleBarcode}
            />
            <View style={{ position: "absolute", inset: 0 }}>
              <View style={{ flex: 1, backgroundColor: C.overlay }} />
              <View style={{ flexDirection: "row", height: SCAN_BOX }}>
                <View style={{ flex: 1, backgroundColor: C.overlay }} />
                <View style={{ width: SCAN_BOX, height: SCAN_BOX, overflow: "hidden" }}>
                  {!done && <ScanLine />}
                  <ScanCorners />
                </View>
                <View style={{ flex: 1, backgroundColor: C.overlay }} />
              </View>
              <View style={{ flex: 1, backgroundColor: C.overlay }} />
            </View>
            {processing && (
              <View style={{
                position: "absolute", bottom: 48, alignSelf: "center",
                backgroundColor: "rgba(59,91,219,0.9)",
                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
                flexDirection: "row", alignItems: "center", gap: 8,
              }}>
                <ActivityIndicator size="small" color={C.white} />
                <Text style={{ color: C.white, fontSize: 13, fontWeight: "600" }}>Processing…</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ManualModal
// ─────────────────────────────────────────────────────────────────────────────
function ManualModal({ visible, line, onConfirm, onClose, submitting }: {
  visible:    boolean;
  line:       PickLine | null;
  onConfirm:  (qty: number) => void;
  onClose:    () => void;
  submitting: boolean;
}) {
  const [qty, setQty] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (visible && line) { setQty(String(getRequired(line))); setErr(""); }
  }, [visible, line]);

  const confirm = () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) { setErr("Enter a quantity greater than 0"); return; }
    if (n > getRequired(line!))         { setErr(`Max allowed is ${getRequired(line!)}`); return; }
    Keyboard.dismiss();
    onConfirm(n);
  };

  if (!line) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: C.overlay }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 24, paddingBottom: Platform.OS === "ios" ? 42 : 24 }}>

            <Text style={{ fontSize: 16, fontWeight: "700", color: C.t1, marginBottom: 4 }}>Manual Pick</Text>
            <Text style={{ fontSize: 13, color: C.t3, marginBottom: 16 }}>Enter the quantity you are picking.</Text>

            <View style={{ backgroundColor: C.accentSoft, borderRadius: 10, padding: 12, marginBottom: 18 }}>
              {[
                { label: "SKU",      value: line.sku_id,              mono: true  },
                { label: "Location", value: line.location_id                      },
                { label: "Required", value: String(getRequired(line)), accent: true },
                ...(getPicked(line) > 0
                  ? [{ label: "Already picked", value: String(getPicked(line)), warn: true }]
                  : []),
              ].map((r) => (
                <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: C.t3 }}>{r.label}</Text>
                  <Text style={{
                    fontSize: 13, fontWeight: "600",
                    color: (r as any).accent ? C.accent : (r as any).warn ? C.warning : C.t1,
                    fontFamily: (r as any).mono ? (Platform.OS === "ios" ? "Courier" : "monospace") : undefined,
                  }}>{r.value}</Text>
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2, marginBottom: 6 }}>
              Quantity <Text style={{ color: C.danger }}>*</Text>
            </Text>
            <TextInput
              style={{ height: 52, borderWidth: 1.5, borderColor: err ? C.danger : C.accent,
                borderRadius: 10, paddingHorizontal: 16, fontSize: 22, fontWeight: "700",
                color: C.t1, textAlign: "center", backgroundColor: "#fafbff" }}
              value={qty}
              onChangeText={(v) => { setQty(v); setErr(""); }}
              keyboardType="numeric"
              selectTextOnFocus
              autoFocus
            />
            {err
              ? <Text style={{ fontSize: 12, color: C.danger, marginTop: 4 }}>{err}</Text>
              : <Text style={{ fontSize: 11, color: C.t4, textAlign: "center", marginTop: 4 }}>Max: {getRequired(line)}</Text>}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <TouchableOpacity onPress={onClose} disabled={submitting}
                style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: 1,
                  borderColor: C.border, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.t2 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirm} disabled={submitting}
                style={{ flex: 2, height: 48, borderRadius: 12,
                  backgroundColor: submitting ? "#93c5fd" : C.accent,
                  justifyContent: "center", alignItems: "center" }}>
                {submitting
                  ? <ActivityIndicator color={C.white} />
                  : <Text style={{ fontSize: 14, fontWeight: "700", color: C.white }}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmCompleteModal  (all lines fully done)
// onRequestClose is blocked — Android back button should NOT accidentally dismiss
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmCompleteModal({ visible, onConfirm, onClose, submitting }: {
  visible: boolean; onConfirm: () => void; onClose: () => void; submitting: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { /* blocked */ }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center",
        backgroundColor: C.overlay, padding: 24 }}>
        <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 24, width: "100%" }}>

          <Text style={{ fontSize: 17, fontWeight: "700", color: C.t1, marginBottom: 4 }}>
            Complete Pick List?
          </Text>
          <Text style={{ fontSize: 13, color: C.t3, marginBottom: 14 }}>
            This action cannot be undone. Make sure all items are correctly picked.
          </Text>

          <View style={{ backgroundColor: C.successBg, borderRadius: 10,
            borderWidth: 1, borderColor: C.successBdr, padding: 12, marginBottom: 20 }}>
            <Text style={{ fontSize: 13, color: C.success, fontWeight: "600" }}>
              ✓  All lines fully picked. Ready to complete.
            </Text>
          </View>

          {/* Cancel is full-width on top — hard to miss */}
          <TouchableOpacity onPress={onClose} disabled={submitting}
            style={{ height: 46, borderRadius: 12, borderWidth: 1.5,
              borderColor: C.border, justifyContent: "center", alignItems: "center",
              marginBottom: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.t2 }}>Go Back</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onConfirm} disabled={submitting}
            style={{ height: 46, borderRadius: 12,
              backgroundColor: submitting ? "#86efac" : C.success,
              justifyContent: "center", alignItems: "center" }}>
            {submitting
              ? <ActivityIndicator color={C.white} />
              : <Text style={{ fontSize: 15, fontWeight: "700", color: C.white }}>
                  Yes, Complete Pick List
                </Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// ReviewCompleteModal
// Shows full line summary before confirming complete.
// User reviews qty picked vs required for each line, then confirms.
// ─────────────────────────────────────────────────────────────────────────────
function ReviewCompleteModal({ visible, lines, isShortPick, onConfirm, onClose, submitting }: {
  visible:     boolean;
  lines:       PickLine[];
  isShortPick: boolean;
  onConfirm:   () => void;
  onClose:     () => void;
  submitting:  boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { /* blocked */ }}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: C.overlay }}>
        <View style={{
          backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: 24, paddingBottom: Platform.OS === "ios" ? 42 : 24, maxHeight: "88%",
        }}>
          {/* Title */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: C.t1 }}>Review Before Completing</Text>
            <TouchableOpacity onPress={onClose} disabled={submitting}
              style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={C.t3} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 13, color: C.t3, marginBottom: 16 }}>
            Check all lines before confirming. This cannot be undone.
          </Text>

          {/* Lines summary table */}
          <ScrollView style={{ maxHeight: 260, marginBottom: 16 }} nestedScrollEnabled>
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
              {/* Header */}
              <View style={{ flexDirection: "row", backgroundColor: C.bg,
                paddingHorizontal: 12, paddingVertical: 8,
                borderBottomWidth: 1, borderBottomColor: C.border }}>
                {["SKU", "Loc", "Req", "Picked", ""].map((h, i) => (
                  <Text key={i} style={{
                    flex: i === 0 ? 2 : i === 4 ? 0.6 : 1,
                    fontSize: 11, fontWeight: "700", color: C.t3,
                    textAlign: i > 1 ? "right" : "left",
                  }}>{h}</Text>
                ))}
              </View>
              {/* Rows */}
              {lines.map((line, i) => {
                const picked   = getPicked(line);
                const required = getRequired(line);
                const done     = isDone(line);
                const short    = picked < required;
                return (
                  <View key={line.line_id} style={{
                    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.border,
                    backgroundColor: done ? C.successBg : short && picked > 0 ? C.warningBg : C.card,
                    alignItems: "center",
                  }}>
                    <Text style={{ flex: 2, fontSize: 12, fontWeight: "700", color: C.t1,
                      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}
                      numberOfLines={1}>{line.sku_id}</Text>
                    <Text style={{ flex: 1, fontSize: 11, color: C.t3 }} numberOfLines={1}>
                      {line.location_id}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: C.accent, textAlign: "right" }}>
                      {required}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right",
                      color: done ? C.success : short && picked > 0 ? C.warning : C.t4 }}>
                      {picked}
                    </Text>
                    <View style={{ flex: 0.6, alignItems: "flex-end" }}>
                      {done
                        ? <Ionicons name="checkmark-circle" size={16} color={C.success} />
                        : picked > 0
                        ? <Ionicons name="warning"          size={16} color={C.warning} />
                        : <Ionicons name="ellipse-outline"  size={16} color={C.t4} />}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Short pick warning */}
          {isShortPick && (
            <View style={{ backgroundColor: C.warningBg, borderRadius: 10,
              borderWidth: 1, borderColor: C.warningBdr, padding: 12, marginBottom: 16,
              flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="warning-outline" size={16} color={C.warning} />
              <Text style={{ flex: 1, fontSize: 12, color: C.warning, fontWeight: "600" }}>
                Some lines are incomplete — this will be flagged as a short pick
              </Text>
            </View>
          )}

          {/* Buttons — Go Back on top, Confirm below */}
          <TouchableOpacity onPress={onClose} disabled={submitting}
            style={{ height: 48, borderRadius: 12, borderWidth: 1.5,
              borderColor: C.border, justifyContent: "center", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.t2 }}>Go Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onConfirm} disabled={submitting}
            style={{ height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center",
              backgroundColor: submitting ? (isShortPick ? C.warningBdr : "#86efac") : (isShortPick ? C.warning : C.success) }}>
            {submitting
              ? <ActivityIndicator color={C.white} />
              : <Text style={{ fontSize: 15, fontWeight: "700", color: C.white }}>
                  {isShortPick ? "Confirm Short Pick Complete" : "Yes, Complete Pick List"}
                </Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm cancellation with mandatory reason.
// ─────────────────────────────────────────────────────────────────────────────
// ShortPickModal
// Driven by API response short_lines — single source of truth.
// Error from API is shown inline so user knows what happened.
// ─────────────────────────────────────────────────────────────────────────────
function ShortPickModal({ visible, shortLines, onConfirm, onClose, submitting, apiError }: {
  visible:    boolean;
  shortLines: ShortLine[];
  onConfirm:  (reason: string) => void;
  onClose:    () => void;
  submitting: boolean;
  apiError:   string;
}) {
  const [reason, setReason] = useState("");
  const [err,    setErr]    = useState("");

  useEffect(() => {
    if (visible) { setReason(""); setErr(""); }
  }, [visible]);

  const confirm = () => {
    if (!reason.trim())           { setErr("Reason is required"); return; }
    if (reason.trim().length < 5) { setErr("Minimum 5 characters"); return; }
    Keyboard.dismiss();
    onConfirm(reason.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: C.overlay }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 24, paddingBottom: Platform.OS === "ios" ? 42 : 24, maxHeight: "88%" }}>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Ionicons name="warning-outline" size={20} color={C.warning} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: C.warning }}>Short Pick Warning</Text>
            </View>
            <Text style={{ fontSize: 13, color: C.t3, marginBottom: 16 }}>
              Some lines are incomplete. You can still proceed — a reason is required and this pick list will be flagged as a short pick.
            </Text>

            {/* API error banner */}
            {apiError ? (
              <View style={{ backgroundColor: C.dangerBg, borderRadius: 8, borderWidth: 1,
                borderColor: C.dangerBdr, padding: 10, marginBottom: 12,
                flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="close-circle" size={16} color={C.danger} />
                <Text style={{ flex: 1, fontSize: 12, color: C.danger }}>{apiError}</Text>
              </View>
            ) : null}

            {/* Short lines table */}
            <ScrollView style={{ maxHeight: 180, marginBottom: 16 }} nestedScrollEnabled>
              <View style={{ borderRadius: 10, borderWidth: 1,
                borderColor: C.warningBdr, overflow: "hidden" }}>
                {/* Table header */}
                <View style={{ flexDirection: "row", backgroundColor: C.warningBg,
                  paddingHorizontal: 12, paddingVertical: 7,
                  borderBottomWidth: 1, borderBottomColor: C.warningBdr }}>
                  {["SKU", "Req", "Picked", "Short"].map((h, i) => (
                    <Text key={h} style={{ flex: i === 0 ? 2 : 1, fontSize: 11, fontWeight: "700",
                      color: C.warning, textAlign: i > 0 ? "right" : "left" }}>{h}</Text>
                  ))}
                </View>
                {/* Table rows */}
                {shortLines.map((l, i) => (
                  <View key={l.line_id} style={{ flexDirection: "row",
                    paddingHorizontal: 12, paddingVertical: 9,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.warningBdr,
                    backgroundColor: C.card }}>
                    <Text style={{ flex: 2, fontSize: 12, fontWeight: "600", color: C.t1,
                      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}
                      numberOfLines={1}>{l.sku_id}</Text>
                    <Text style={{ flex: 1, fontSize: 12, color: C.t2,      textAlign: "right" }}>{l.qty_required}</Text>
                    <Text style={{ flex: 1, fontSize: 12, color: C.warning,  textAlign: "right", fontWeight: "600" }}>{l.qty_picked}</Text>
                    <Text style={{ flex: 1, fontSize: 12, color: C.danger,   textAlign: "right", fontWeight: "700" }}>-{l.short_qty}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Reason input */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2, marginBottom: 6 }}>
              Reason <Text style={{ color: C.danger }}>*</Text>
            </Text>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: err ? C.danger : C.border,
                borderRadius: 10, paddingHorizontal: 14, paddingTop: 10,
                fontSize: 14, color: C.t1, backgroundColor: "#fafbff",
                minHeight: 76, textAlignVertical: "top" }}
              value={reason}
              onChangeText={(v) => { setReason(v); setErr(""); }}
              placeholder="e.g. Stock shortage, item not found at location…"
              placeholderTextColor={C.t4}
              multiline
              numberOfLines={3}
            />
            {err ? <Text style={{ fontSize: 12, color: C.danger, marginTop: 4 }}>{err}</Text> : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <TouchableOpacity onPress={onClose} disabled={submitting}
                style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: 1,
                  borderColor: C.border, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.t2 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirm} disabled={submitting}
                style={{ flex: 2, height: 48, borderRadius: 12,
                  backgroundColor: submitting ? C.warningBdr : C.warning,
                  justifyContent: "center", alignItems: "center" }}>
                {submitting
                  ? <ActivityIndicator color={C.white} />
                  : <Text style={{ fontSize: 14, fontWeight: "700", color: C.white }}>Proceed with Short Pick</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LineCard({ line, canPick, onScanPress, onManualPress, onUndo }: {
  line:         PickLine;
  canPick:      boolean;
  onScanPress:  (l: PickLine) => void;
  onManualPress:(l: PickLine) => void;
  onUndo:       (l: PickLine) => void;
}) {
  const picked   = getPicked(line);
  const required = getRequired(line);
  const done     = isDone(line);
  const partial  = isPartial(line);
  const progress = required > 0 ? Math.min(picked / required, 1) : 0;

  const cardBg  = done ? C.successBg  : partial ? C.warningBg  : C.card;
  const cardBdr = done ? C.successBdr : partial ? C.warningBdr : C.border;

  return (
    <View style={{ backgroundColor: cardBg, borderRadius: 12, padding: 14,
      marginBottom: 10, borderWidth: 1, borderColor: cardBdr }}>

      {/* SKU + badge */}
      <View style={{ flexDirection: "row", justifyContent: "space-between",
        alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.t1, flex: 1,
          fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}
          numberOfLines={1}>{line.sku_id}</Text>
        {done    && <View style={{ backgroundColor: C.successBg, borderRadius: 20,
          paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: C.successBdr, marginLeft: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: C.success }}>✓ Done</Text></View>}
        {partial && <View style={{ backgroundColor: C.warningBg, borderRadius: 20,
          paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: C.warningBdr, marginLeft: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: C.warning }}>Partial</Text></View>}
        {!done && !partial && <View style={{ backgroundColor: "#f3f4f6", borderRadius: 20,
          paddingHorizontal: 10, paddingVertical: 3, marginLeft: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: C.t3 }}>Pending</Text></View>}
      </View>

      {/* Info row */}
      <View style={{ flexDirection: "row", gap: 16, marginBottom: picked > 0 ? 10 : 0 }}>
        <View>
          <Text style={{ fontSize: 11, color: C.t3, marginBottom: 2 }}>Location</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2 }}>{line.location_id}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 11, color: C.t3, marginBottom: 2 }}>Required</Text>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.accent }}>{required}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 11, color: C.t3, marginBottom: 2 }}>Picked</Text>
          <Text style={{ fontSize: 13, fontWeight: "700",
            color: done ? C.success : partial ? C.warning : C.t4 }}>{picked}</Text>
        </View>
      </View>

      {/* Progress bar */}
      {picked > 0 && (
        <View style={{ height: 4, backgroundColor: "#e5e7eb",
          borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
          <View style={{ height: 4, borderRadius: 2,
            backgroundColor: done ? C.success : C.warning,
            width: `${Math.round(progress * 100)}%` }} />
        </View>
      )}

      {/* Action buttons — shown when canPick AND line not fully done */}
      {canPick && !done && (
        <View style={{ gap: 6, marginTop: picked > 0 ? 0 : 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => onScanPress(line)}
              style={{ flex: 2, height: 38, borderRadius: 9, backgroundColor: C.accent,
                flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}>
              <Ionicons name="qr-code-outline" size={15} color={C.white} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.white }}>
                {partial && line.scan_mode !== "MANUAL"
                  ? `Scan  (${picked}/${required})`
                  : "Scan QR"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onManualPress(line)}
              style={{ flex: 1, height: 38, borderRadius: 9, borderWidth: 1,
                borderColor: C.border, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2 }}>Manual</Text>
            </TouchableOpacity>
          </View>

          {/* Undo — only when has picks */}
          {picked > 0 && (
            <TouchableOpacity onPress={() => onUndo(line)}
              style={{ height: 32, borderRadius: 9, borderWidth: 1,
                borderColor: C.warningBdr, backgroundColor: C.warningBg,
                flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5 }}>
              <Ionicons name="arrow-undo-outline" size={13} color={C.warning} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.warning }}>
                Undo  ({picked} picked)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function PickListDetailScreen() {
  const { pickListId } = useLocalSearchParams<{ pickListId: string }>();
  const router         = useRouter();
  const insets         = useSafeAreaInsets();
  const { post }       = usePickingApi();
  const user       = useAuthStore((s) => s.user);
const roleId     = normalizeRole(user?.role_id || "readonly");
const isOperator = roleId === "storeoperator";

  const [pickList,   setPickList]   = useState<PickList | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState<ToastState>({ msg: "", type: "success", visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local metadata ref — persists short_pick_reason / cancellation_reason
  // even if the store doesn't save meta fields. Merged into setPickList on every update.
  const localMeta = useRef<Partial<PickList>>({});

  // Wrapper around setPickList that merges localMeta so reasons always display
  const setPickListMerged = useCallback((data: PickList | null) => {
    if (!data) { setPickList(null); return; }
    setPickList({ ...data, ...localMeta.current });
  }, []);

  // Scan
  const [scanLine,   setScanLine]   = useState<PickLine | null>(null);
  const [scanning,   setScanning]   = useState(false);

  // Manual
  const [manualLine, setManualLine] = useState<PickLine | null>(null);
  const [manualBusy, setManualBusy] = useState(false);

  // Complete modals
  const [showConfirm,    setShowConfirm]    = useState(false);
  const [showShortPick,  setShowShortPick]  = useState(false);
  const [shortLines,     setShortLines]     = useState<ShortLine[]>([]);
  const [completeBusy,   setCompleteBusy]   = useState(false);
  const [completeApiErr, setCompleteApiErr] = useState("");
  // Review
  const [showReview,     setShowReview]     = useState(false);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: ToastState["type"] = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }, []);

  // ── Load + auto-start ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!pickListId) return;
    try {
      setLoading(true); setError("");
      const res  = await fetchPickListById(pickListId);
      const data: PickList = unwrapPickListRecord(res?.data ?? res) ?? null;
      setPickListMerged(data);

      if (["pending", "open", "assigned", "released"].includes(String(data?.status || "").toLowerCase()) && isOperator) {
        try {
          const upd = await post(`/picking/pick-lists/${pickListId}/status`, { status: "in_progress", source: "MOBILE" });
          setPickListMerged(upd?.data?.data ?? upd?.data ?? data);
        } catch (_) {}
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load pick list");
    } finally {
      setLoading(false);
    }
  }, [isOperator, pickListId, post, setPickListMerged]);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(async () => {
    if (!pickListId) return;
    try {
      const res = await fetchPickListById(pickListId);
      setPickListMerged(unwrapPickListRecord(res?.data ?? res));
    } catch (_) {}
  }, [pickListId, setPickListMerged]);

  // ── Scan ────────────────────────────────────────────────────────────────────
  const handleScan = async (payload: string) => {
    if (!pickListId || !scanLine || scanning) return;
    try {
      setScanning(true);
      const res  = await scanPickListUnit(pickListId, scanLine.line_id, payload);
      const data = unwrapPickListRecord(res?.data ?? res);
      if (data) {
        setPickList(data);
        const updated = (data.lines ?? []).find((l: PickLine) => l.line_id === scanLine.line_id);
        if (updated) setScanLine(updated);
      }
      Vibration.vibrate(res?.data?.line_completed ? [0, 60, 60, 60] : 50);
    } catch (e: any) {
      Vibration.vibrate([0, 80, 80, 80]);
      // Bad scan (wrong QR) — don't close scanner, just ignore
    } finally {
      setScanning(false);
    }
  };

  const handleScanClose = async () => {
    setScanLine(null);
    await refresh();
  };

  // ── Manual ──────────────────────────────────────────────────────────────────
  const handleManualConfirm = async (qty: number) => {
    if (!pickListId || !manualLine) return;
    try {
      setManualBusy(true);
      const res  = await manualPickLine(pickListId, manualLine.line_id, qty);
      const data = unwrapPickListRecord(res?.data ?? res);
      if (data) setPickList(data);
      setManualLine(null);
      showToast(`${manualLine.sku_id} — ${qty} unit(s) picked`, "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to confirm manual pick", "error");
    } finally {
      setManualBusy(false);
    }
  };

  // ── Undo ────────────────────────────────────────────────────────────────────
  // Optimistic: update UI immediately (-1), then confirm from API.
  // If API fails, rollback to previous state.
  const handleUndo = async (line: PickLine) => {
    if (!pickListId) return;

    const currentPicked = getPicked(line);
    if (currentPicked <= 0) {
      showToast("Nothing to undo — already at 0", "warning");
      return;
    }

    // Optimistic update — decrement by 1 immediately so UI feels instant
    const newCount = currentPicked - 1;
    setPickList((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: prev.lines.map((l) =>
          l.line_id !== line.line_id ? l : {
            ...l,
            qty_picked:  newCount,
            scan_count:  newCount,
            status:      newCount <= 0 ? "pending" : l.status,
            scan_mode:   newCount <= 0 ? undefined  : l.scan_mode,
            picked_by:   newCount <= 0 ? undefined  : l.picked_by,
          }
        ),
      };
    });

    try {
      const res  = await post(`/picking/pick-lists/${pickListId}/lines/${line.line_id}/undo-scan`);
      const body = res?.data ?? res;

      if (body?.already_zero) {
        showToast("Nothing to undo — already at 0", "warning");
        // Rollback optimistic
        setPickList((prev) => {
          if (!prev) return prev;
          return { ...prev, lines: prev.lines.map((l) => l.line_id !== line.line_id ? l : line) };
        });
        return;
      }

      // Confirm from API (handles any edge cases in store)
      const data = unwrapPickListRecord(body?.data ?? body);
      if (data) setPickList(data);

      const confirmed = body?.scan_count ?? newCount;
      showToast(`${line.sku_id} — ${confirmed} / ${getRequired(line)} picked`, "warning");
    } catch (e: any) {
      // Rollback on error
      setPickList((prev) => {
        if (!prev) return prev;
        return { ...prev, lines: prev.lines.map((l) => l.line_id !== line.line_id ? l : line) };
      });
      showToast(e.message ?? "Undo failed", "error");
    }
  };

  // ── Complete tap — always open Review modal first ──────────────────────────
  // Option D: user sees full line summary before confirming.
  // Review modal has "Go Back" and "Confirm" — no accidental complete.
  const handleCompleteTap = () => setShowReview(true);

  // ── Confirm from ReviewCompleteModal ────────────────────────────────────────
  // If all done → force=false. If short pick → show ShortPickModal for reason.
  const handleReviewConfirm = async () => {
    if (!pickListId) return;
    try {
      setCompleteBusy(true);
      setCompleteApiErr("");
      const res  = await post(`/picking/pick-lists/${pickListId}/complete`, { force: false, source: "MOBILE" });
      const data = unwrapPickListRecord(res?.data ?? res);
      if (data) setPickListMerged(data);
      await refresh();
      setShowReview(false);
      showToast("Pick list completed!", "success");
    } catch (e: any) {
      const body = e?.data ?? {};
      if ((e?.status === 422 || e?.status === 409) && body?.partial) {
        // Has short lines — close review, open short pick modal for reason
        setShortLines(body.short_lines ?? []);
        setCompleteApiErr("");
        setShowReview(false);
        setShowShortPick(true);
      } else {
        showToast(e.message ?? "Failed to complete pick list", "error");
      }
    } finally {
      setCompleteBusy(false);
    }
  };

  // ── Short pick complete — force=true + reason ───────────────────────────────
  const handleShortPickComplete = async (reason: string) => {
    if (!pickListId) return;
    try {
      setCompleteBusy(true);
      setCompleteApiErr("");
      const res  = await post(`/picking/pick-lists/${pickListId}/complete`, {
        force:             true,
        short_pick_reason: reason,
        source:            "MOBILE",
      });
      // Backend: { success, is_short_pick, short_pick_reason, data: pickListObj }
      const data = unwrapPickListRecord(res?.data ?? res);
      const savedReason = res?.short_pick_reason ?? reason;

      // Always persist to localMeta FIRST — survives any subsequent refresh
      localMeta.current = {
        ...localMeta.current,
        is_short_pick:     true,
        short_pick_reason: savedReason,
      };

      // Update state with merged data
      setPickListMerged(data ? {
        ...data,
        is_short_pick:     true,
        short_pick_reason: savedReason,
        status:            data.status ?? "completed",
      } : null);
      await refresh();

      setShowShortPick(false);
      showToast("Pick list completed (short pick)", "warning");
    } catch (e: any) {
      setCompleteApiErr(e.message ?? "Failed to complete pick list");
    } finally {
      setCompleteBusy(false);
    }
  };

  // ── Cancel pick list ────────────────────────────────────────────────────────
    const lines        = pickList?.lines ?? [];
  const totalLines   = lines.length;
  const doneCount    = lines.filter(isDone).length;
  const hasAnyPicked = lines.some((l) => getPicked(l) > 0);
  const allDone      = totalLines > 0 && doneCount === totalLines;
  const isShortPick  = hasAnyPicked && !allDone;
  const pickStatus = normalizePickStatus(pickList?.status);
  const assignedDisplay = getAssignedUserDisplay(pickList);
  const canPick = !!pickList
    && ["pending", "open", "assigned", "released", "in_progress", "picking"].includes(pickStatus)
    && isOperator;
  const isCompleted  = pickStatus === "completed";
  const isCancelled  = pickStatus === "cancelled";

  // Complete button
  const btnDisabled = !canPick || !hasAnyPicked;
  const btnBg       = allDone ? C.success : hasAnyPicked ? C.warning : "#d1d5db";
  const btnLabel    = allDone
    ? "✓  Complete Pick List"
    : hasAnyPicked
    ? `Complete  (Short Pick  ⚠)  — ${doneCount}/${totalLines} done`
    : `${totalLines - doneCount} line(s) remaining — pick to start`;

  const onCompletePress = handleCompleteTap;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={{ backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color={C.accent} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.t1,
              fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
              {pickListId}
            </Text>
            {pickList?.wave_id ? (
              <Text style={{ fontSize: 12, color: C.t3 }}>Wave: {pickList.wave_id}</Text>
            ) : null}
            {assignedDisplay !== "Unassigned" ? (
            <Text style={{ fontSize: 12, color: C.t3 }}>
              Assigned: {assignedDisplay}
            </Text>
          ) : (
            <Text style={{ fontSize: 12, color: C.t4 }}>Unassigned</Text>
          )}
          </View>
          {pickList ? <StatusBadge status={pickList.status} /> : null}
        </View>

        {/* Progress bar */}
        {totalLines > 0 && (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
              <Text style={{ fontSize: 12, color: C.t3 }}>Progress</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.t2 }}>
                {doneCount} / {totalLines} lines done
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
              <View style={{
                height: 6, borderRadius: 3,
                backgroundColor: allDone ? C.success : hasAnyPicked ? C.accent : "#d1d5db",
                width: `${Math.round((doneCount / totalLines) * 100)}%`,
              }} />
            </View>
          </View>
        )}
      </View>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      <View style={{ position: "relative" }}>
        <Toast toast={toast} />
      </View>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 14 }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ fontSize: 14, color: C.t3 }}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={{ margin: 16, backgroundColor: C.dangerBg, borderRadius: 10, padding: 14 }}>
          <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {/* Pick order info */}
          <View style={{
            backgroundColor: C.card,
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: C.border,
            marginBottom: 14,
          }}>
            <Text style={{
              fontSize: 12,
              fontWeight: "700",
              color: C.t3,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 10,
            }}>
              Pick Order Info
            </Text>
            {[
              { label: "Pick ID", value: pickListId, mono: true },
              { label: "Wave ID", value: pickList?.wave_id || "—", mono: true },
              { label: "Sales Order ID", value: pickList?.order_ref || pickList?.so_id || "—", mono: true },
              { label: "Assigned To", value: assignedDisplay, dim: assignedDisplay === "Unassigned" },
              { label: "Warehouse", value: pickList?.warehouse_id || "—" },
              { label: "Pick Status", badge: pickList?.status || "—" },
              { label: "Picked Qty", value: `${doneCount}/${totalLines}` },
              { label: "Picked At", value: pickList?.completed_at ? new Date(pickList.completed_at).toLocaleString() : "—" },
            ].map((row) => (
              <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: C.t3 }}>{row.label}</Text>
                {"badge" in row ? (
                  <StatusBadge status={(row as any).badge} />
                ) : (
                  <Text style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: (row as any).dim ? C.t4 : C.t1,
                    fontFamily: (row as any).mono ? (Platform.OS === "ios" ? "Courier" : "monospace") : undefined,
                    textAlign: "right",
                  }}>
                    {(row as any).value}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* ── Cancelled banner ─────────────────────────────────────────── */}
          {isCancelled && (
            <View style={{ borderRadius: 12, padding: 14, marginBottom: 16,
              backgroundColor: C.dangerBg, borderWidth: 1, borderColor: C.dangerBdr }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.danger, marginBottom: 4 }}>
                ✕  Pick List Cancelled
              </Text>
              {pickList?.cancellation_reason ? (
                <>
                  <Text style={{ fontSize: 11, color: C.t3, marginBottom: 2 }}>Reason</Text>
                  <Text style={{ fontSize: 13, color: C.t2, fontStyle: "italic" }}>
                    &quot;{pickList.cancellation_reason}&quot;
                  </Text>
                </>
              ) : null}
            </View>
          )}

          {/* ── Completed summary banner ──────────────────────────────────── */}
          {(isCompleted || pickList?.is_short_pick) && (
            <View style={{
              borderRadius: 12, padding: 14, marginBottom: 16,
              backgroundColor: pickList?.is_short_pick ? C.warningBg : C.successBg,
              borderWidth: 1,
              borderColor: pickList?.is_short_pick ? C.warningBdr : C.successBdr,
            }}>
              <Text style={{
                fontSize: 14, fontWeight: "700", marginBottom: 6,
                color: pickList?.is_short_pick ? C.warning : C.success,
              }}>
                {pickList?.is_short_pick ? "⚠️  Completed with Short Pick" : "✓  Pick List Completed"}
              </Text>
              {pickList?.short_pick_reason ? (
                <>
                  <Text style={{ fontSize: 11, color: C.t3, marginBottom: 2 }}>Short Pick Reason</Text>
                  <Text style={{ fontSize: 13, color: C.t2, fontStyle: "italic" }}>
                    &quot;{pickList.short_pick_reason}&quot;
                  </Text>
                </>
              ) : null}
              {pickList?.completed_by ? (
                <Text style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>
                  Completed by {pickList.completed_by}
                  {pickList?.completed_at ? "  ·  " + new Date(pickList.completed_at).toLocaleString() : ""}
                </Text>
              ) : null}
            </View>
          )}
          {totalLines === 0 ? (
            <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, alignItems: "center" }}>
              <Text style={{ textAlign: "center", color: C.t3, fontSize: 14 }}>
                No lines in this pick list.
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: "hidden", marginBottom: 16 }}>
              <View style={{ backgroundColor: "#f9fafb", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.t3, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Lines
                </Text>
              </View>
              <View style={{ padding: 14 }}>
                {lines.map((line) => (
                  <LineCard
                    key={line.line_id}
                    line={line}
                    canPick={canPick}
                    onScanPress={setScanLine}
                    onManualPress={setManualLine}
                    onUndo={handleUndo}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Complete button ─────────────────────────────────────────────────── */}
      {!loading && canPick && (
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: 16, paddingBottom: insets.bottom + 8,
          backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
        }}>
          <TouchableOpacity
            onPress={onCompletePress}
            disabled={btnDisabled || isCompleted || completeBusy}
            style={{ height: 52, borderRadius: 14, justifyContent: "center",
              alignItems: "center", backgroundColor: btnBg }}
          >
            {completeBusy
              ? <ActivityIndicator color={C.white} />
              : <Text style={{ fontSize: 15, fontWeight: "700",
                  color: btnDisabled ? C.t3 : C.white }}>
                  {btnLabel}
                </Text>}
          </TouchableOpacity>
          {canPick && !allDone && hasAnyPicked && (
            <Text style={{ fontSize: 11, color: C.warning, textAlign: "center", marginTop: 6 }}>
              Incomplete lines will be flagged as short pick · reason required
            </Text>
          )}
        </View>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <ScanModal
        visible={!!scanLine}
        line={scanLine}
        onScan={handleScan}
        onClose={handleScanClose}
        processing={scanning}
      />
      <ManualModal
        visible={!!manualLine}
        line={manualLine}
        onConfirm={handleManualConfirm}
        onClose={() => setManualLine(null)}
        submitting={manualBusy}
      />
      <ReviewCompleteModal
        visible={showReview}
        lines={lines}
        isShortPick={isShortPick}
        onConfirm={handleReviewConfirm}
        onClose={() => setShowReview(false)}
        submitting={completeBusy}
      />
      <ShortPickModal
        visible={showShortPick}
        shortLines={shortLines}
        onConfirm={handleShortPickComplete}
        onClose={() => { setShowShortPick(false); setCompleteApiErr(""); }}
        submitting={completeBusy}
        apiError={completeApiErr}
      />
    </View>
  );
}
