import { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createAdjustment, fetchInventoryOptions } from "@/services/api";

const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", text: "#111827",
  textSub: "#374151", textMuted: "#9ca3af", danger: "#e03131",
};

function Field({ label, required, error, children }: any) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}{required && <Text style={{ color: C.danger }}> *</Text>}</Text>
      {children}
      {!!error && <Text style={s.errText}>{error}</Text>}
    </View>
  );
}

// FIX 3: helper to safely extract a string value from an item using multiple
// possible field names — guards against unpredictable API shapes.
function resolveField(item: any, ...candidates: string[]): string {
  for (const key of candidates) {
    if (item?.[key] !== undefined && item[key] !== null && item[key] !== "") {
      return String(item[key]);
    }
  }
  return "";
}

export default function CreateAdjustmentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [skus, setSkus]               = useState<any[]>([]);
  const [locations, setLocations]     = useState<any[]>([]);
  const [reasonCodes, setReasonCodes] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);

  const [skuId, setSkuId]             = useState("");
  const [skuLabel, setSkuLabel]       = useState("");         // FIX 3: track display label separately
  const [locationId, setLocationId]   = useState("");
  const [locationLabel, setLocationLabel] = useState("");     // FIX 3: track display label separately
  const [reasonCode, setReasonCode]   = useState("");
  const [reasonLabel, setReasonLabel] = useState("");         // FIX 3: track display label separately
  const [qtyDelta, setQtyDelta]       = useState("");
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [submitting, setSubmitting]   = useState(false);

  const [activePicker, setActivePicker] = useState<"sku" | "location" | "reason" | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetchInventoryOptions();
        const opts = res?.data;
        setSkus(Array.isArray(opts?.skus) ? opts.skus : []);
        setLocations(Array.isArray(opts?.locations) ? opts.locations : []);
        // FIX 3: also handle flat string arrays (["DAMAGE","THEFT",...]) in addition
        // to object arrays ([ {code:"DAMAGE", label:"Damage"}, ... ])
        const rc = opts?.reason_codes ?? opts?.reasonCodes ?? [];
        setReasonCodes(Array.isArray(rc) ? rc : []);
      } catch { }
      finally { setLoading(false); }
    })();
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!skuId)       e.sku_id       = "SKU is required";
    if (!locationId)  e.location_id  = "Location is required";
    if (!reasonCode)  e.reason_code  = "Reason code is required";
    if (!qtyDelta || isNaN(Number(qtyDelta)) || Number(qtyDelta) === 0)
                      e.qty_delta    = "Quantity delta must be non-zero";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSubmitting(true);
      await createAdjustment({ sku_id: skuId, location_id: locationId, qty_delta: Number(qtyDelta), reason_code: reasonCode });
      router.back();
    } catch (e: any) {
      setErrors(prev => ({ ...prev, form: e?.response?.data?.message || e?.message || "Failed to create adjustment" }));
    } finally { setSubmitting(false); }
  };

  // FIX 3: normalise a reason_codes item regardless of shape:
  //   - object with code/label, code/name, value/label, id/name …
  //   - plain string "DAMAGE"
  function resolveReasonItem(item: any): { key: string; label: string } {
    if (typeof item === "string") return { key: item, label: item };
    const key   = resolveField(item, "code", "value", "id", "reason_code");
    const label = resolveField(item, "label", "name", "description", "reason_name") || key;
    return { key, label };
  }

  // FIX 3: same normalisation for SKUs
  function resolveSkuItem(item: any): { key: string; label: string } {
    if (typeof item === "string") return { key: item, label: item };
    const key   = resolveField(item, "sku_id", "id", "code");
    const label = resolveField(item, "sku_name", "name", "label") || key;
    return { key, label };
  }

  // FIX 3: same normalisation for locations
  function resolveLocationItem(item: any): { key: string; label: string } {
    if (typeof item === "string") return { key: item, label: item };
    const key   = resolveField(item, "location_id", "id", "code");
    const label = resolveField(item, "location_name", "name", "label") || key;
    return { key, label };
  }

  const qtyNum   = Number(qtyDelta);
  const qtyColor = !qtyDelta ? C.textMuted : qtyNum > 0 ? "#16a34a" : qtyNum < 0 ? C.danger : C.text;

  // Build picker config from the active picker type
  type PickerConfig = {
    title: string;
    items: any[];
    selected: string;
    resolveItem: (item: any) => { key: string; label: string };
    onSelect: (key: string, label: string) => void;
  };

  const pickerConfigs: Record<"sku" | "location" | "reason", PickerConfig> = {
    sku: {
      title: "Select SKU",
      items: skus,
      selected: skuId,
      resolveItem: resolveSkuItem,
      onSelect: (key, label) => {
        setSkuId(key); setSkuLabel(label);
        setErrors(p => { const { sku_id, ...r } = p; return r; });
      },
    },
    location: {
      title: "Select Location",
      items: locations,
      selected: locationId,
      resolveItem: resolveLocationItem,
      onSelect: (key, label) => {
        setLocationId(key); setLocationLabel(label);
        setErrors(p => { const { location_id, ...r } = p; return r; });
      },
    },
    reason: {
      title: "Select Reason Code",
      items: reasonCodes,
      selected: reasonCode,
      resolveItem: resolveReasonItem,
      onSelect: (key, label) => {
        setReasonCode(key); setReasonLabel(label);
        setErrors(p => { const { reason_code, ...r } = p; return r; });
      },
    },
  };

  const active = activePicker ? pickerConfigs[activePicker] : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.navbar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={s.navTitle}>Create Adjustment</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          {/* SKU */}
          <Field label="SKU" required error={errors.sku_id}>
            <TouchableOpacity style={[s.selectBox, !!errors.sku_id && s.inputErr]} onPress={() => setActivePicker("sku")} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color={C.accent} />
                : <>
                    {/* FIX 3: show human-readable label, not raw key */}
                    <Text style={skuId ? s.selectVal : s.selectPlaceholder}>{skuLabel || skuId || "Select SKU…"}</Text>
                    <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                  </>}
            </TouchableOpacity>
          </Field>

          {/* Location */}
          <Field label="Location" required error={errors.location_id}>
            <TouchableOpacity style={[s.selectBox, !!errors.location_id && s.inputErr]} onPress={() => setActivePicker("location")} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color={C.accent} />
                : <>
                    <Text style={locationId ? s.selectVal : s.selectPlaceholder}>{locationLabel || locationId || "Select location…"}</Text>
                    <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                  </>}
            </TouchableOpacity>
          </Field>

          {/* Qty Delta */}
          <Field label="Quantity Delta" required error={errors.qty_delta}>
            <TextInput
              style={[s.input, s.qtyInput, !!errors.qty_delta && s.inputErr, { color: qtyColor }]}
              value={qtyDelta}
              onChangeText={(v) => { setQtyDelta(v); setErrors(p => { const { qty_delta, ...r } = p; return r; }); }}
              keyboardType="numbers-and-punctuation"
              placeholder="e.g. +10 or -5"
              placeholderTextColor={C.textMuted}
            />
            <Text style={s.hintText}>Positive = add stock, Negative = remove stock</Text>
          </Field>

          {/* Reason Code */}
          <Field label="Reason Code" required error={errors.reason_code}>
            <TouchableOpacity style={[s.selectBox, !!errors.reason_code && s.inputErr]} onPress={() => setActivePicker("reason")} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color={C.accent} />
                : <>
                    {/* FIX 3: show the human-readable label, not just the code key */}
                    <Text style={reasonCode ? s.selectVal : s.selectPlaceholder}>{reasonLabel || reasonCode || "Select reason…"}</Text>
                    <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                  </>}
            </TouchableOpacity>
          </Field>

          {!!errors.form && (
            <View style={s.formErr}>
              <Ionicons name="alert-circle-outline" size={14} color="#991b1b" />
              <Text style={s.formErrText}>{errors.form}</Text>
            </View>
          )}

          <View style={s.btnRow}>
            <TouchableOpacity style={s.btnCancel} onPress={() => router.back()} disabled={submitting}>
              <Text style={s.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSubmit, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnSubmitText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Generic picker sheet */}
        {activePicker && active && (
          <View style={s.pickerOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setActivePicker(null)} />
            <View style={s.pickerSheet}>
              <Text style={s.pickerTitle}>{active.title}</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                {active.items.length === 0 && (
                  <Text style={s.pickerEmpty}>No options available</Text>
                )}
                {/* FIX 3: use resolveItem() so every picker works regardless of API shape */}
                {active.items.map((item: any, idx: number) => {
                  const { key, label } = active.resolveItem(item);
                  if (!key) return null; // skip malformed entries
                  return (
                    <TouchableOpacity
                      key={key || idx}
                      style={s.pickerItem}
                      onPress={() => { active.onSelect(key, label); setActivePicker(null); }}
                    >
                      <Text style={[s.pickerItemText, active.selected === key && { color: C.accent, fontWeight: "600" }]}>
                        {label}
                      </Text>
                      {active.selected === key && <Ionicons name="checkmark" size={16} color={C.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  navbar:        { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginRight: 10 },
  navTitle:      { flex: 1, fontSize: 16, fontWeight: "700", color: C.text },
  scrollContent: { padding: 16, paddingBottom: 40 },
  field:         { marginBottom: 16 },
  label:         { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 6 },
  input:         { height: 46, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.surface },
  qtyInput:      { fontSize: 22, fontWeight: "700", textAlign: "center" },
  inputErr:      { borderColor: C.danger },
  errText:       { fontSize: 12, color: C.danger, marginTop: 4 },
  hintText:      { fontSize: 12, color: C.textMuted, marginTop: 4, textAlign: "center" },
  selectBox:     { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, backgroundColor: C.surface },
  selectVal:     { fontSize: 15, color: C.text, flex: 1 },
  selectPlaceholder: { fontSize: 15, color: C.textMuted, flex: 1 },
  formErr:       { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fee2e2", borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#fca5a5" },
  formErrText:   { flex: 1, fontSize: 13, color: "#991b1b" },
  btnRow:        { flexDirection: "row", gap: 10, marginTop: 8 },
  btnCancel:     { flex: 1, height: 48, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  btnCancelText: { fontSize: 15, fontWeight: "600", color: C.textSub },
  btnSubmit:     { flex: 2, height: 48, borderRadius: 10, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  btnSubmitText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  pickerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", zIndex: 999 },
  pickerSheet:   { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "65%", padding: 20 },
  pickerTitle:   { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 12 },
  pickerEmpty:   { fontSize: 14, color: C.textMuted, textAlign: "center", paddingVertical: 20 },
  pickerItem:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerItemText:{ fontSize: 15, color: C.textSub },
});