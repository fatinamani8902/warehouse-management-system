/**
 * app/(packing)/[packId].tsx
 *
 * Pack order detail — mobile
 * Flow:
 *  1. Load pack order + packaging options
 *  2. If pick list not completed → show warning, no action
 *  3. If already packed/shipped → show read-only summary
 *  4. Otherwise:
 *     a. (Optional) Scan carton QR to verify carton_id
 *     b. Select packaging type + enter weight
 *     c. Confirm modal → POST /packing/orders/:id/confirm-pack
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
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
import QRCode from "react-native-qrcode-svg";
import { useAuthStore } from "@/stores/authStore";
import { apiClient } from "@/services/api";
import { buildSessionHeaders } from "@/utils/sessionHeaders";
import { getPackingConfirmState } from "@/utils/packingConfirm";
import { formatKg } from "@/utils/formatKg";
import { formatPackingType } from "@/utils/formatPackingType";
import { cartonIdsMatch, getCartonQrPayload, validateScannedCartonLabel } from "@/utils/cartonScan";
import {
  CARTON_QR_BACKGROUND,
  CARTON_QR_COLOR,
  CARTON_QR_ERROR_CORRECTION,
  CARTON_QR_LABEL_STYLE,
  CARTON_QR_SIZE,
} from "@/utils/cartonQr";

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

function CartonQrCode({ value }: { value: string }) {
  return (
    <View style={CARTON_QR_LABEL_STYLE}>
      <QRCode
        value={value}
        size={CARTON_QR_SIZE}
        color={CARTON_QR_COLOR}
        backgroundColor={CARTON_QR_BACKGROUND}
        ecl={CARTON_QR_ERROR_CORRECTION}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface PackagingType {
  value: string;
  label: string;
}

interface PackLine {
  line_no:      number;
  sku_id:       string;
  sku_name?:    string;
  product_name?: string;
  qty_required?: number;
  qty?:         number;
  location_id?: string;
  location_code?: string;
}

interface PackOrder {
  pack_id:          string;
  order_ref?:       string;
  so_id?:           string;
  customer_name?:   string;
  pick_list_id:     string;
  pick_list_status: string;
  status:           string;
  packed_by_user_display?: string;
  packed_by_display?: string;
  packed_by_user_name?: string;
  assigned_to_user_id?: string;
  assigned_to?: string;
  assigned_to_user_name?: string;
  assigned_user_name?: string;
  assigned_to_user_display?: string;
  assigned_user_display?: string;
  carton_id?:       string;
  packaging_type?:  string;
  weight_kg?:       number;
  packed_at?:       string;
  created_at:       string;
  lines?:           PackLine[];
}

// ─────────────────────────────────────────────────────────────────────────────
// API hook
// ─────────────────────────────────────────────────────────────────────────────
function usePackingApi() {
  const token       = useAuthStore((s: any) => s.token);
  const tenantId    = useAuthStore((s: any) => s.user?.tenant_id    ?? "");
  const warehouseId = useAuthStore((s: any) => s.user?.warehouse_id ?? s.user?.warehouse_ids?.[0] ?? "");
  const userId      = useAuthStore((s: any) => s.user?.user_id      ?? "");
  const roleId      = useAuthStore((s: any) => s.user?.role_id      ?? "");
  const requestHeaders = useMemo(() => buildSessionHeaders({
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    user_id: userId,
    role_id: roleId,
  }), [tenantId, warehouseId, userId, roleId]);

  const get = useCallback(async (path: string, params?: Record<string, string | number | undefined>) => {
    const res = await apiClient.get(path, {
      params,
      headers: {
        "Authorization": token ? `Bearer ${token}` : "",
        ...requestHeaders,
      },
    });
    return res.data;
  }, [requestHeaders, roleId, tenantId, token, userId, warehouseId]);

  const post = useCallback(async (path: string, body: object) => {
    const res = await apiClient.post(path, body, {
      headers: {
        "Authorization": token ? `Bearer ${token}` : "",
        ...requestHeaders,
      },
    });
    return res.data;
  }, [requestHeaders, roleId, tenantId, token, userId, warehouseId]);

  return { get, post };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────
const BADGE: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  draft:            { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: "Draft"            },
  carton_generated: { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Carton Generated" },
  packed:           { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Packed"            },
  shipped:          { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Shipped"           },
  completed:        { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Completed"         },
  picking:          { bg: "#fef9c3", color: "#713f12", dot: "#eab308", label: "Picking"           },
  cancelled:        { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af", label: "Cancelled"         },
  pending:          { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: "Pending"           },
};

function StatusBadge({ status }: { status: string }) {
  const c = BADGE[String(status ?? "").toLowerCase()] ??
    { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: status ?? "—" };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: c.color }}>{c.label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan line animation
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
// CartonScanModal
// Scans QR/barcode and accepts only carton label IDs.
// Pack order, wave, and sales order IDs are rejected before state is updated.
// ─────────────────────────────────────────────────────────────────────────────
function CartonScanModal({ visible, expectedCartonId, blockedIds, onVerified, onClose }: {
  visible:          boolean;
  expectedCartonId: string | null;
  blockedIds:       Array<string | null | undefined>;
  onVerified:       (scannedId: string) => void;
  onClose:          () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanResult, setScanResult]     = useState<"idle" | "match" | "mismatch">("idle");
  const [scannedVal, setScannedVal]     = useState("");
  const [scanMessage, setScanMessage]   = useState("");
  const cooldown = useRef(false);

  useEffect(() => {
    if (visible) { setScanResult("idle"); setScannedVal(""); setScanMessage(""); cooldown.current = false; }
  }, [visible]);

  const handleBarcode = useCallback(({ data }: { data: string }) => {
    if (!data || cooldown.current) return;
    cooldown.current = true;
    const trimmed = data.trim();
    setScannedVal(trimmed);
    const validation = validateScannedCartonLabel({
      scannedValue: trimmed,
      expectedCartonId,
      blockedIds,
    });

    if (validation.valid) {
      // Match or no prior carton — accept
      setScanResult("match");
      setScanMessage("Carton verified!");
      Vibration.vibrate([0, 60, 60, 60]);
      setTimeout(() => { onVerified(validation.cartonId); }, 800);
    } else {
      setScanResult("mismatch");
      setScanMessage(validation.message);
      Vibration.vibrate([0, 80, 80, 80]);
      setTimeout(() => {
        setScanResult("idle");
        setScannedVal("");
        setScanMessage("");
        cooldown.current = false;
      }, 1500);
    }
  }, [blockedIds, expectedCartonId, onVerified]);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#0a0a0a" }}>

        {/* Header */}
        <View style={{
          paddingTop: Platform.OS === "ios" ? 58 : 38,
          paddingHorizontal: 20, paddingBottom: 12,
          flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        }}>
          <View>
            <Text style={{ color: C.white, fontSize: 17, fontWeight: "700" }}>Scan Carton</Text>
            <Text style={{ color: C.white, fontSize: 12, opacity: 0.6, marginTop: 2 }}>
              {expectedCartonId ? `Expected: ${expectedCartonId}` : "Scan to register carton ID"}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose}
            style={{ backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
            <Text style={{ color: C.white, fontSize: 14, fontWeight: "600" }}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Scan result banner */}
        {scanResult !== "idle" && (
          <View style={{
            marginHorizontal: 20, marginBottom: 12, borderRadius: 12, padding: 14,
            backgroundColor: scanResult === "match"
              ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)",
          }}>
            <Text style={{ color: C.white, fontSize: 14, fontWeight: "700", textAlign: "center" }}>
              {scanResult === "match" ? "Carton verified!" : scanMessage}
            </Text>
            {scannedVal ? (
              <Text style={{ color: C.white, fontSize: 12, opacity: 0.8, textAlign: "center", marginTop: 4 }}>
                Scanned: {scannedVal}
              </Text>
            ) : null}
          </View>
        )}

        {/* Camera */}
        {!permission?.granted ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
            <Ionicons name="camera-outline" size={48} color={C.white} style={{ marginBottom: 16 }} />
            <Text style={{ color: C.white, fontSize: 15, textAlign: "center", marginBottom: 20 }}>
              Camera permission required
            </Text>
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
              onBarcodeScanned={scanResult === "idle" ? handleBarcode : undefined}
            />
            {/* Dimmed overlay */}
            <View style={{ position: "absolute", inset: 0 }}>
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />
              <View style={{ flexDirection: "row", height: SCAN_BOX }}>
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />
                <View style={{ width: SCAN_BOX, height: SCAN_BOX, overflow: "hidden" }}>
                  {scanResult === "idle" && <ScanLine />}
                  <ScanCorners />
                </View>
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />
              </View>
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />
            </View>
            {scanResult === "idle" && (
              <Text style={{ position: "absolute", bottom: 80,
                color: C.white, fontSize: 14, opacity: 0.85,
                textAlign: "center", paddingHorizontal: 32, alignSelf: "center" }}>
                Point camera at carton QR/barcode
              </Text>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmPackModal
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmPackModal({ visible, packId, cartonId, packagingType, weightKg,
  onConfirm, onClose, submitting }: {
  visible:       boolean;
  packId:        string;
  cartonId:      string;
  packagingType: string;
  weightKg:      string;
  onConfirm:     () => void;
  onClose:       () => void;
  submitting:    boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { /* blocked */ }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center",
        backgroundColor: C.overlay, padding: 24 }}>
        <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 24, width: "100%" }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: C.t1, marginBottom: 4 }}>
            Confirm Packing?
          </Text>
          <Text style={{ fontSize: 13, color: C.t3, marginBottom: 16 }}>
            This action cannot be undone. The pack order will be marked as Packed.
          </Text>

          {/* Summary */}
          <View style={{ backgroundColor: C.accentSoft, borderRadius: 10, padding: 12, marginBottom: 20 }}>
            {[
              { label: "Pack Order",     value: packId        },
              { label: "Carton ID",      value: cartonId || "Will be generated on confirmation" },
              { label: "Packaging Type", value: packagingType },
              { label: "Weight",         value: formatKg(weightKg) },
            ].map((r) => (
              <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between",
                marginBottom: 6 }}>
                <Text style={{ fontSize: 12, color: C.t3 }}>{r.label}</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: C.t1,
                  fontFamily: (r.label === "Pack Order" || r.label === "Carton ID") && cartonId
                    ? (Platform.OS === "ios" ? "Courier" : "monospace") : undefined }}>
                  {r.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Buttons — Go Back on top */}
          <TouchableOpacity onPress={onClose} disabled={submitting}
            style={{ height: 48, borderRadius: 12, borderWidth: 1.5,
              borderColor: C.border, justifyContent: "center", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.t2 }}>Go Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onConfirm} disabled={submitting}
            style={{ height: 48, borderRadius: 12,
              backgroundColor: submitting ? "#86efac" : C.success,
              justifyContent: "center", alignItems: "center" }}>
            {submitting
              ? <ActivityIndicator color={C.white} />
              : <Text style={{ fontSize: 15, fontWeight: "700", color: C.white }}>
                  Yes, Confirm Packing
                </Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function PackOrderDetailScreen() {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const { get, post } = usePackingApi();
  const user = useAuthStore((s) => s.user);
  const roleId = user?.role_id || "readonly";
  const currentUserId = user?.user_id || "";

  const [order,          setOrder]          = useState<PackOrder | null>(null);
  const [packagingTypes, setPackagingTypes] = useState<PackagingType[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");

  // Form state
  const [selectedPkgType, setSelectedPkgType] = useState("");
  const [weightKg,        setWeightKg]        = useState("");
  const [weightErr,       setWeightErr]       = useState("");
  const [pkgTypeOpen,     setPkgTypeOpen]     = useState(false);
  const [scannedCartonId, setScannedCartonId] = useState("");
  const [generatingCarton, setGeneratingCarton] = useState(false);

  // Modals
  const [scanVisible,    setScanVisible]    = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirming,     setConfirming]     = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!packId) return;
    try {
      setLoading(true); setError("");
      const [orderRes, optionsRes] = await Promise.all([
        get(`/packing/orders/${packId}`),
        get(`/packing/options`),
      ]);
      const data: PackOrder = orderRes?.data?.data ?? orderRes?.data ?? null;
      setOrder(data);
      setPackagingTypes(optionsRes?.packaging_types ?? []);

      // Pre-fill from existing record
      if (data?.packaging_type) setSelectedPkgType(data.packaging_type);
      if (data?.weight_kg)      setWeightKg(String(data.weight_kg));
      if (!data?.carton_id) setScannedCartonId("");
    } catch (e: any) {
      setError(e.message ?? "Failed to load pack order");
    } finally {
      setLoading(false);
    }
  }, [packId, get]);

  useEffect(() => { load(); }, [load]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isPacked      = ["packed", "shipped"].includes(String(order?.status ?? "").toLowerCase());
  const pickCompleted = String(order?.pick_list_status ?? "").toLowerCase() === "completed";
  const reservedCartonId = getCartonQrPayload(order?.carton_id);
  const cartonIdForDisplay = reservedCartonId;
  const cartonVerified = cartonIdsMatch(scannedCartonId, reservedCartonId);
  const assignedOperatorUserId = order?.assigned_to_user_id || order?.assigned_to || "";
  const scanBlockedIds = useMemo(() => [
    packId,
    order?.pack_id,
    order?.pick_list_id,
    order?.so_id,
    order?.order_ref,
  ], [order?.order_ref, order?.pack_id, order?.pick_list_id, order?.so_id, packId]);
  const confirmState = getPackingConfirmState({
    roleId,
    packStatus: order?.status ?? "",
    cartonId: cartonIdForDisplay,
    cartonVerified,
    packagingType: selectedPkgType,
    weight: weightKg,
    submitting: confirming,
    currentUserId,
    assignedOperatorUserId,
    requireAssignedOperator: true,
  });
  const formValid = confirmState.formValid;
  const hasPermission = confirmState.hasPermission;
  const canConfirm = pickCompleted && !isPacked && formValid && hasPermission && confirmState.hasOwnership;
  const confirmDisabled = confirmState.confirmDisabled;
  const disabledReason = confirmState.disabledReason;
  const canEditPacking = pickCompleted && !isPacked && confirmState.hasOwnership && hasPermission;

  // ── Confirm packing ────────────────────────────────────────────────────────
  const handleConfirmPacking = async () => {
    if (!order) return;
    const w = Number(weightKg);
    if (!Number.isFinite(w) || w <= 0) {
      setWeightErr("Enter a valid positive weight"); return;
    }
    const cartonValidation = scannedCartonId
      ? validateScannedCartonLabel({
          scannedValue: scannedCartonId,
          expectedCartonId: reservedCartonId,
          blockedIds: scanBlockedIds,
        })
      : null;
    if (!cartonValidation || !cartonValidation.valid) {
      setScannedCartonId("");
      setScanVisible(true);
      return;
    }
    try {
      setConfirming(true);
      await post(`/packing/orders/${order.pack_id}/confirm-pack`, {
        weight_kg:      w,
        packaging_type: selectedPkgType,
        carton_id:      reservedCartonId,
        source:         "MOBILE",
});
      setConfirmVisible(false);
      await load();
    } catch (e: any) {
      setConfirmVisible(false);
      Alert.alert("Packing failed", e.message ?? "Unable to confirm packing");
    } finally {
      setConfirming(false);
    }
  };

  const handleGenerateCarton = async () => {
    if (!order || !canEditPacking) return;
    try {
      setGeneratingCarton(true);
      await post(`/packing/orders/${order.pack_id}/carton`, { source: "MOBILE" });
      await load();
    } catch (e: any) {
      Alert.alert("Carton generation failed", e.message ?? "Unable to generate carton label");
    } finally {
      setGeneratingCarton(false);
    }
  };

  const handlePrintLabel = async () => {
    if (!reservedCartonId) return;
    await Share.share({
      title: `Carton Label ${reservedCartonId}`,
      message: [
        "Carton Label",
        `Carton ID: ${reservedCartonId}`,
        `Pack Order: ${order?.pack_id ?? packId ?? "-"}`,
        "QR Content:",
        reservedCartonId,
      ].join("\n"),
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>

      {/* Header */}
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
              {packId}
            </Text>
          </View>
          {order && <StatusBadge status={order.status} />}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 14 }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ fontSize: 14, color: C.t3 }}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={{ margin: 16, backgroundColor: C.dangerBg, borderRadius: 10, padding: 14 }}>
          <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : order ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}>

            {/* Pack order info */}
            <View style={{ backgroundColor: C.card, borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: C.border, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.t3,
                textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                Pack Order Info
              </Text>
              {[
                { label: "Pack ID",        value: order.pack_id,         mono: true  },
                { label: "Sales Order ID", value: order.so_id || order.order_ref, mono: true  },
                { label: "Customer Name",  value: order.customer_name || "—" },
                { label: "Wave ID",       value: order.pick_list_id,    mono: true  },
                { label: "Pick Status",     badge: order.pick_list_status              },
                { label: "Packed By",       value: order.packed_by_user_display || order.packed_by_display || order.packed_by_user_name || "—" },
                { label: "Carton ID",       value: cartonIdForDisplay || "—", mono: true  },
                { label: "Packaging Type",  value: formatPackingType(order.packaging_type) },
                { label: "Weight",          value: formatKg(order.weight_kg) },
                { label: "Packed At",       value: order.packed_at
                  ? new Date(order.packed_at).toLocaleString() : "—" },
              ].map((r) => (
                <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: C.t3 }}>{r.label}</Text>
                  {(r as any).badge
                    ? <StatusBadge status={(r as any).badge} />
                    : <Text style={{ fontSize: 13, fontWeight: "600", color: C.t1,
                        fontFamily: (r as any).mono
                          ? (Platform.OS === "ios" ? "Courier" : "monospace") : undefined }}>
                        {(r as any).value}
                      </Text>}
                </View>
              ))}
            </View>

            {/* Lines */}
            {(order.lines ?? []).length > 0 && (
              <View style={{ backgroundColor: C.card, borderRadius: 12,
                borderWidth: 1, borderColor: C.border, overflow: "hidden", marginBottom: 14 }}>
                <View style={{ backgroundColor: "#f9fafb", paddingHorizontal: 14, paddingVertical: 8,
                  borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: C.t3,
                    textTransform: "uppercase", letterSpacing: 0.8 }}>Lines</Text>
                </View>
                {(order.lines ?? []).map((line, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between",
                    paddingHorizontal: 14, paddingVertical: 10,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.border }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: C.t1,
                        fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                        {line.sku_id}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>
                        {line.sku_name || line.product_name || "Unnamed product"}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                        Qty to Pack: {line.qty_required ?? line.qty ?? "—"}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                        Picked From: {line.location_code || line.location_id || "—"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Packed summary */}
            {isPacked && (
              <View style={{ backgroundColor: C.successBg, borderRadius: 12,
                borderWidth: 1, borderColor: C.successBdr, padding: 14, marginBottom: 14 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.success, marginBottom: 4 }}>
                  ✓ Packing Complete
                </Text>
                <Text style={{ fontSize: 13, color: C.success }}>
                  This pack order is {order.status} and ready for shipping.
                </Text>
              </View>
            )}

            {/* Pick not completed warning */}
            {!isPacked && !pickCompleted && (
              <View style={{ backgroundColor: C.warningBg, borderRadius: 12,
                borderWidth: 1, borderColor: C.warningBdr, padding: 14, marginBottom: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Ionicons name="warning-outline" size={16} color={C.warning} />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: C.warning }}>
                    Pick List Not Completed
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: C.warning }}>
                  Packing can only start when the linked pick list is fully completed.
                </Text>
              </View>
            )}

            {/* Pack station controls — only when pick completed and not yet packed */}
            {pickCompleted && !isPacked && (
              <View style={{ backgroundColor: C.card, borderRadius: 12, padding: 14,
                borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.t3,
                  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>
                  Pack Station
                </Text>
                {!canEditPacking && (
                  <View style={{ backgroundColor: C.warningBg, borderRadius: 10,
                    borderWidth: 1, borderColor: C.warningBdr, padding: 10, marginBottom: 14 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.warning }}>
                      Only the assigned operator can confirm this packing task.
                    </Text>
                  </View>
                )}

                {/* Step 1: Generate carton label */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2, marginBottom: 6 }}>
                    Step 1 - Generate Carton Label
                  </Text>
                  {cartonIdForDisplay ? (
                    <View style={{ backgroundColor: C.accentSoft, borderRadius: 12, borderWidth: 1,
                      borderColor: C.accent, padding: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <View>
                          <Text style={{ fontSize: 12, color: C.t3, marginBottom: 2 }}>Generated Carton ID</Text>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: C.accent,
                            fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                            {cartonIdForDisplay}
                          </Text>
                        </View>
                        <TouchableOpacity disabled={!canEditPacking} onPress={handlePrintLabel}
                          style={{ height: 36, paddingHorizontal: 12, borderRadius: 9,
                            backgroundColor: canEditPacking ? C.accent : C.border,
                            justifyContent: "center", alignItems: "center" }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: canEditPacking ? C.white : C.t4 }}>
                            Print Label
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ backgroundColor: C.card, borderRadius: 10, borderWidth: 1,
                        borderColor: C.border, padding: 14, alignItems: "center" }}>
                        <CartonQrCode value={cartonIdForDisplay} />
                        <Text style={{ marginTop: 8, fontSize: 12, color: C.t3 }}>QR Content</Text>
                        <Text style={{ marginTop: 2, fontSize: 14, fontWeight: "700", color: C.t1,
                          fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                          {cartonIdForDisplay}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <TouchableOpacity
                        disabled={!canEditPacking || generatingCarton}
                        onPress={handleGenerateCarton}
                        style={{ height: 44, borderRadius: 10, borderWidth: 1.5,
                          borderColor: canEditPacking ? C.accent : C.border, borderStyle: "dashed",
                          flexDirection: "row", justifyContent: "center",
                          alignItems: "center", gap: 8, backgroundColor: canEditPacking ? C.accentSoft : "#f3f4f6",
                          marginBottom: 8 }}
                      >
                        <Ionicons name="barcode-outline" size={18} color={canEditPacking ? C.accent : C.t4} />
                        <Text style={{ fontSize: 14, fontWeight: "600", color: canEditPacking ? C.accent : C.t4 }}>
                          {generatingCarton ? "Generating..." : "Generate Carton Label"}
                        </Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 12, color: C.t3, textAlign: "center" }}>Carton ID: -</Text>
                    </View>
                  )}
                </View>

                {/* Step 2: Scan carton QR */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2, marginBottom: 6 }}>
                    Step 2 - Scan Carton QR <Text style={{ color: C.danger }}>*</Text>
                  </Text>
                  {cartonIdForDisplay ? (
                    <>
                      <TouchableOpacity
                        disabled={!canEditPacking}
                        onPress={() => setScanVisible(true)}
                        style={{ height: 44, borderRadius: 10, borderWidth: 1.5,
                          borderColor: canEditPacking ? C.accent : C.border, borderStyle: "dashed",
                          flexDirection: "row", justifyContent: "center",
                          alignItems: "center", gap: 8, backgroundColor: canEditPacking ? C.accentSoft : "#f3f4f6" }}>
                        <Ionicons name="qr-code-outline" size={18} color={canEditPacking ? C.accent : C.t4} />
                        <Text style={{ fontSize: 14, fontWeight: "600", color: canEditPacking ? C.accent : C.t4 }}>
                          {cartonVerified ? "Re-scan Carton QR" : "Scan Carton QR"}
                        </Text>
                      </TouchableOpacity>
                      <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}>
                        <Ionicons
                          name={cartonVerified ? "checkmark-circle" : "ellipse-outline"}
                          size={16}
                          color={cartonVerified ? C.success : C.t3}
                        />
                        <Text style={{ fontSize: 12, color: cartonVerified ? C.success : C.t3 }}>
                          {cartonVerified ? "Verified" : `Waiting for scan: ${cartonIdForDisplay}`}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <Text style={{ fontSize: 12, color: C.t3 }}>
                      Generate a carton label before scanning.
                    </Text>
                  )}
                </View>

                {/* Step 3: Packaging type */}
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2, marginBottom: 6 }}>
                    Step 3 - Packaging Type <Text style={{ color: C.danger }}>*</Text>
                  </Text>
                  <TouchableOpacity disabled={!canEditPacking} onPress={() => setPkgTypeOpen(true)}
                    style={{ height: 44, borderRadius: 10, borderWidth: 1,
                      borderColor: canEditPacking && selectedPkgType ? C.accent : C.border,
                      paddingHorizontal: 12, flexDirection: "row",
                      alignItems: "center", justifyContent: "space-between",
                      backgroundColor: !canEditPacking ? "#f3f4f6" : selectedPkgType ? C.accentSoft : "#fafbff" }}>
                    <Text style={{ fontSize: 14, color: selectedPkgType ? C.t1 : C.t4 }}>
                      {selectedPkgType
                        ? (packagingTypes.find((p) => p.value === selectedPkgType)?.label ?? selectedPkgType)
                        : "Select packaging type"}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={C.t3} />
                  </TouchableOpacity>
                </View>

                {/* Step 4: Weight */}
                <View style={{ marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2, marginBottom: 6 }}>
                    Step 4 - Weight (kg) <Text style={{ color: C.danger }}>*</Text>
                  </Text>
                  <TextInput
                    style={{ height: 44, borderRadius: 10, borderWidth: 1,
                      borderColor: weightErr ? C.danger : (weightKg ? C.accent : C.border),
                      paddingHorizontal: 12, fontSize: 16, fontWeight: "600",
                      color: C.t1, backgroundColor: "#fafbff" }}
                    value={weightKg}
                    onChangeText={(v) => { setWeightKg(v); setWeightErr(""); }}
                    editable={canEditPacking}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 2.5"
                    placeholderTextColor={C.t4}
                  />
                  {weightErr ? (
                    <Text style={{ fontSize: 12, color: C.danger, marginTop: 4 }}>{weightErr}</Text>
                  ) : null}
                </View>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      {/* Bottom confirm button */}
      {order && pickCompleted && !isPacked && !loading && (
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: 16, paddingBottom: insets.bottom + 8,
          backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
        }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.t2, marginBottom: 8 }}>
            Step 5 - Confirm Packing
          </Text>
          <TouchableOpacity
            onPress={() => {
              const w = Number(weightKg);
              if (!selectedPkgType) { Alert.alert("Missing", "Select a packaging type"); return; }
              if (!Number.isFinite(w) || w <= 0) { setWeightErr("Enter a valid positive weight"); return; }
              Keyboard.dismiss();
              setConfirmVisible(true);
            }}
            disabled={confirmDisabled}
            style={{ height: 52, borderRadius: 14, justifyContent: "center",
              alignItems: "center", backgroundColor: canConfirm ? C.success : "#d1d5db" }}>
            <Text style={{ fontSize: 15, fontWeight: "700",
              color: canConfirm ? C.white : C.t3 }}>
              Confirm Packing
            </Text>
          </TouchableOpacity>
          {confirmDisabled && disabledReason ? (
            <Text style={{ marginTop: 8, fontSize: 12, color: C.t3, textAlign: "center" }}>
              {disabledReason}
            </Text>
          ) : null}
        </View>
      )}

      {/* Packaging type picker modal */}
      <Modal visible={pkgTypeOpen} transparent animationType="fade"
        onRequestClose={() => setPkgTypeOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: C.overlay }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 24, paddingBottom: Platform.OS === "ios" ? 42 : 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.t1, marginBottom: 16 }}>
              Select Packaging Type
            </Text>
            {packagingTypes.map((pt) => (
              <TouchableOpacity key={pt.value} onPress={() => { setSelectedPkgType(pt.value); setPkgTypeOpen(false); }}
                style={{ height: 48, borderRadius: 10, borderWidth: 1,
                  borderColor: selectedPkgType === pt.value ? C.accent : C.border,
                  backgroundColor: selectedPkgType === pt.value ? C.accentSoft : C.card,
                  paddingHorizontal: 14, flexDirection: "row",
                  alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "600",
                  color: selectedPkgType === pt.value ? C.accent : C.t1 }}>
                  {pt.label}
                </Text>
                {selectedPkgType === pt.value && (
                  <Ionicons name="checkmark-circle" size={18} color={C.accent} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setPkgTypeOpen(false)}
              style={{ height: 44, borderRadius: 10, borderWidth: 1,
                borderColor: C.border, justifyContent: "center", alignItems: "center", marginTop: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.t2 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Carton scan modal */}
      <CartonScanModal
        visible={scanVisible}
        expectedCartonId={reservedCartonId || null}
        blockedIds={scanBlockedIds}
        onVerified={(scannedId) => {
          setScannedCartonId(scannedId);
          setScanVisible(false);
        }}
        onClose={() => setScanVisible(false)}
      />

      {/* Confirm packing modal */}
        <ConfirmPackModal
          visible={confirmVisible}
          packId={packId ?? ""}
        cartonId={cartonIdForDisplay || ""}
          packagingType={packagingTypes.find((p) => p.value === selectedPkgType)?.label ?? selectedPkgType}
          weightKg={weightKg}
          onConfirm={handleConfirmPacking}
          onClose={() => setConfirmVisible(false)}
          submitting={confirming}
      />
    </View>
  );
}
