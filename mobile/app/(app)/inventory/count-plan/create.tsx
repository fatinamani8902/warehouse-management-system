// @ts-nocheck
import { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createCountPlan, fetchInventoryOptions } from "@/services/api";

const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", text: "#111827",
  textSub: "#374151", textLabel: "#6b7280", textMuted: "#9ca3af",
  danger: "#e03131",
};

// ── Custom calendar picker ────────────────────────────────────────
function buildCalendar(year, month) {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells       = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DatePickerModal({ visible, value, onSelect, onClose }) {
  const today    = new Date();
  const initDate = value ? new Date(value) : today;
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  useEffect(() => {
    if (visible) {
      const d = value ? new Date(value) : new Date();
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible]);

  const cells        = buildCalendar(viewYear, viewMonth);
  const selectedDate = value ? new Date(value) : null;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDay = (day) => {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onSelect(`${viewYear}-${mm}-${dd}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={dp.overlay} onPress={onClose}>
        <Pressable style={dp.card} onPress={() => {}}>
          <View style={dp.header}>
            <TouchableOpacity style={dp.navBtn} onPress={prevMonth}>
              <Ionicons name="chevron-back" size={18} color={C.text} />
            </TouchableOpacity>
            <Text style={dp.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
            <TouchableOpacity style={dp.navBtn} onPress={nextMonth}>
              <Ionicons name="chevron-forward" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
          <View style={dp.row}>
            {DAYS.map(d => <Text key={d} style={dp.dayLabel}>{d}</Text>)}
          </View>
          <View style={dp.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={`e-${i}`} style={dp.cell} />;
              const isSelected = selectedDate
                && selectedDate.getFullYear() === viewYear
                && selectedDate.getMonth()    === viewMonth
                && selectedDate.getDate()     === day;
              const isToday = today.getFullYear() === viewYear
                && today.getMonth() === viewMonth
                && today.getDate()  === day;
              return (
                <TouchableOpacity
                  key={day}
                  style={[dp.cell, isSelected && dp.cellSelected, isToday && !isSelected && dp.cellToday]}
                  onPress={() => handleDay(day)}
                >
                  <Text style={[dp.cellText, isSelected && dp.cellTextSelected, isToday && !isSelected && dp.cellTextToday]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={dp.cancelBtn} onPress={onClose}>
            <Text style={dp.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, required, error, hint, children }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>
        {label}
        {required && <Text style={{ color: C.danger }}> *</Text>}
      </Text>
      {children}
      {!!hint && !error && <Text style={s.hintText}>{hint}</Text>}
      {!!error && <Text style={s.errText}>{error}</Text>}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────
export default function CreateCountPlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Options from API
  const [zones, setZones]         = useState([]);
  const [locations, setLocations] = useState([]);
  const [skus, setSkus]           = useState([]);
  const [loading, setLoading]     = useState(true);

  // Form state
  const [zoneId, setZoneId]           = useState("");
  const [zoneName, setZoneName]       = useState("");
  const [plannedDate, setPlannedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scopeType, setScopeType]     = useState("FULL_ZONE");

  // BY_LOCATION
  const [locationId, setLocationId]     = useState("");
  const [locationCode, setLocationCode] = useState("");

  // BY_SKU — multi-select
  const [selectedSkuIds, setSelectedSkuIds] = useState([]);

  const [errors, setErrors]         = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Pickers visibility
  const [showZonePicker,     setShowZonePicker]     = useState(false);
  const [showScopePicker,    setShowScopePicker]     = useState(false);
  const [showDatePicker,     setShowDatePicker]      = useState(false);
  const [showLocationPicker, setShowLocationPicker]  = useState(false);
  const [showSkuPicker,      setShowSkuPicker]       = useState(false);

  const SCOPE_OPTIONS = ["FULL_ZONE", "BY_LOCATION", "BY_SKU"];

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetchInventoryOptions();
        const opts = res?.data;
        setZones(Array.isArray(opts?.zones) ? opts.zones : []);
        setLocations(Array.isArray(opts?.locations) ? opts.locations : []);
        setSkus(Array.isArray(opts?.skus) ? opts.skus : []);
      } catch {
        setZones([]); setLocations([]); setSkus([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filter locations by selected zone
  const filteredLocations = zoneId
    ? locations.filter(l => l.zone_id === zoneId)
    : locations;

  // Reset scope-specific fields when scope or zone changes
  const handleScopeChange = (newScope) => {
    setScopeType(newScope);
    setLocationId("");
    setLocationCode("");
    setSelectedSkuIds([]);
    setErrors(p => { const { scope_location_id, scope_sku_ids, ...r } = p; return r; });
  };

  const handleZoneChange = (id, name) => {
    setZoneId(id);
    setZoneName(name);
    // Reset location if it no longer belongs to new zone
    setLocationId("");
    setLocationCode("");
    setErrors(p => { const { zone_id, scope_location_id, ...r } = p; return r; });
  };

  const toggleSku = (skuId) => {
    setSelectedSkuIds(prev =>
      prev.includes(skuId) ? prev.filter(s => s !== skuId) : [...prev, skuId]
    );
    setErrors(p => { const { scope_sku_ids, ...r } = p; return r; });
  };

  const validate = () => {
    const e = {};
    if (!zoneId)      e.zone_id      = "Zone is required";
    if (!plannedDate) e.planned_date = "Planned date is required";
    if (scopeType === "BY_LOCATION" && !locationId) {
      e.scope_location_id = "Location is required for BY_LOCATION scope";
    }
    if (scopeType === "BY_SKU" && selectedSkuIds.length === 0) {
      e.scope_sku_ids = "Select at least one SKU for BY_SKU scope";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSubmitting(true);
      await createCountPlan({
        zone_id: zoneId,
        planned_date: plannedDate,
        scope_type: scopeType,
        scope_location_id: scopeType === "BY_LOCATION" ? locationId : undefined,
        scope_sku_ids: scopeType === "BY_SKU" ? selectedSkuIds : undefined,
      });
      router.back();
    } catch (e) {
      setErrors(prev => ({
        ...prev,
        form: e?.response?.data?.message || e?.message || "Failed to create count plan",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const displayDate = plannedDate
    ? new Date(plannedDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "Select date";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.navbar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={s.navTitle}>Create Count Plan</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Zone */}
          <Field label="Zone" required error={errors.zone_id}>
            <TouchableOpacity
              style={[s.selectBox, !!errors.zone_id && s.inputErr]}
              onPress={() => setShowZonePicker(true)}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={C.accent} />
                : <>
                    <Text style={zoneId ? s.selectVal : s.selectPlaceholder}>
                      {zoneId ? (zoneName || zoneId) : "Select zone…"}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                  </>
              }
            </TouchableOpacity>
          </Field>

          {/* Planned Date */}
          <Field label="Planned Date" required error={errors.planned_date}>
            <TouchableOpacity
              style={[s.selectBox, !!errors.planned_date && s.inputErr]}
              onPress={() => setShowDatePicker(true)}
            >
              <View style={s.dateLeft}>
                <Ionicons name="calendar-outline" size={16} color={plannedDate ? C.text : C.textMuted} style={{ marginRight: 8 }} />
                <Text style={plannedDate ? s.selectVal : s.selectPlaceholder}>{displayDate}</Text>
              </View>
              <Ionicons name="chevron-down" size={16} color={C.textMuted} />
            </TouchableOpacity>
          </Field>

          {/* Scope Type */}
          <Field label="Scope Type" required>
            <TouchableOpacity style={s.selectBox} onPress={() => setShowScopePicker(true)}>
              <Text style={s.selectVal}>{scopeType.replace(/_/g, " ")}</Text>
              <Ionicons name="chevron-down" size={16} color={C.textMuted} />
            </TouchableOpacity>
          </Field>

          {/* BY_LOCATION — location picker */}
          {scopeType === "BY_LOCATION" && (
            <Field
              label="Location"
              required
              error={errors.scope_location_id}
              hint={!zoneId ? "Select a zone first to filter locations" : undefined}
            >
              <TouchableOpacity
                style={[s.selectBox, !!errors.scope_location_id && s.inputErr, !zoneId && s.selectBoxDisabled]}
                onPress={() => zoneId && setShowLocationPicker(true)}
              >
                <Text style={locationId ? s.selectVal : s.selectPlaceholder}>
                  {locationId ? (locationCode || locationId) : "Select location…"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={C.textMuted} />
              </TouchableOpacity>
            </Field>
          )}

          {/* BY_SKU — SKU multi-select */}
          {scopeType === "BY_SKU" && (
            <Field
              label="SKUs"
              required
              error={errors.scope_sku_ids}
            >
              <TouchableOpacity
                style={[s.selectBox, !!errors.scope_sku_ids && s.inputErr]}
                onPress={() => setShowSkuPicker(true)}
              >
                <Text style={selectedSkuIds.length > 0 ? s.selectVal : s.selectPlaceholder}>
                  {selectedSkuIds.length > 0
                    ? `${selectedSkuIds.length} SKU${selectedSkuIds.length > 1 ? "s" : ""} selected`
                    : "Select SKUs…"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={C.textMuted} />
              </TouchableOpacity>

              {/* Selected SKU chips */}
              {selectedSkuIds.length > 0 && (
                <View style={s.chipRow}>
                  {selectedSkuIds.map(skuId => (
                    <TouchableOpacity
                      key={skuId}
                      style={s.chip}
                      onPress={() => toggleSku(skuId)}
                    >
                      <Text style={s.chipText}>{skuId}</Text>
                      <Ionicons name="close" size={12} color={C.accent} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </Field>
          )}

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
            <TouchableOpacity
              style={[s.btnSubmit, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.btnSubmitText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Date picker */}
        <DatePickerModal
          visible={showDatePicker}
          value={plannedDate}
          onSelect={(v) => {
            setPlannedDate(v);
            setErrors(p => { const { planned_date, ...r } = p; return r; });
          }}
          onClose={() => setShowDatePicker(false)}
        />

        {/* Zone picker */}
        {showZonePicker && (
          <View style={s.pickerOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowZonePicker(false)} />
            <View style={s.pickerSheet}>
              <Text style={s.pickerTitle}>Select Zone</Text>
              <ScrollView>
                {zones.length === 0 && <Text style={s.pickerEmpty}>No zones available</Text>}
                {zones.map((z) => (
                  <TouchableOpacity
                    key={z.zone_id}
                    style={s.pickerItem}
                    onPress={() => {
                      handleZoneChange(z.zone_id, z.zone_name || z.zone_id);
                      setShowZonePicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.pickerItemText, z.zone_id === zoneId && s.pickerItemTextActive]}>
                        {z.zone_name || z.zone_id}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{z.zone_id}</Text>
                    </View>
                    {z.zone_id === zoneId && <Ionicons name="checkmark" size={16} color={C.accent} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Scope picker */}
        {showScopePicker && (
          <View style={s.pickerOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowScopePicker(false)} />
            <View style={s.pickerSheet}>
              <Text style={s.pickerTitle}>Select Scope Type</Text>
              {SCOPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={s.pickerItem}
                  onPress={() => { handleScopeChange(opt); setShowScopePicker(false); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pickerItemText, opt === scopeType && s.pickerItemTextActive]}>
                      {opt.replace(/_/g, " ")}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                      {opt === "FULL_ZONE" && "Count all items in selected zone"}
                      {opt === "BY_LOCATION" && "Count items in one specific location"}
                      {opt === "BY_SKU" && "Count specific SKUs only"}
                    </Text>
                  </View>
                  {opt === scopeType && <Ionicons name="checkmark" size={16} color={C.accent} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Location picker — filtered by zone */}
        {showLocationPicker && (
          <View style={s.pickerOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowLocationPicker(false)} />
            <View style={s.pickerSheet}>
              <Text style={s.pickerTitle}>Select Location</Text>
              <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
                Showing locations in {zoneName || zoneId}
              </Text>
              <ScrollView>
                {filteredLocations.length === 0 && (
                  <Text style={s.pickerEmpty}>No locations in this zone</Text>
                )}
                {filteredLocations.map((loc) => (
                  <TouchableOpacity
                    key={loc.location_id}
                    style={s.pickerItem}
                    onPress={() => {
                      setLocationId(loc.location_id);
                      setLocationCode(loc.location_code || loc.location_id);
                      setErrors(p => { const { scope_location_id, ...r } = p; return r; });
                      setShowLocationPicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.pickerItemText, loc.location_id === locationId && s.pickerItemTextActive]}>
                        {loc.location_code || loc.location_id}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{loc.location_id}</Text>
                    </View>
                    {loc.location_id === locationId && <Ionicons name="checkmark" size={16} color={C.accent} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* SKU picker — multi-select */}
        {showSkuPicker && (
          <View style={s.pickerOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowSkuPicker(false)} />
            <View style={s.pickerSheet}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={s.pickerTitle}>Select SKUs</Text>
                <TouchableOpacity onPress={() => setShowSkuPicker(false)}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.accent }}>
                    Done ({selectedSkuIds.length})
                  </Text>
                </TouchableOpacity>
              </View>
              <ScrollView>
                {skus.length === 0 && <Text style={s.pickerEmpty}>No SKUs available</Text>}
                {skus.map((sku) => {
                  const isSelected = selectedSkuIds.includes(sku.sku_id);
                  return (
                    <TouchableOpacity
                      key={sku.sku_id}
                      style={[s.pickerItem, isSelected && { backgroundColor: C.accentLight }]}
                      onPress={() => toggleSku(sku.sku_id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.pickerItemText, isSelected && s.pickerItemTextActive]}>
                          {sku.sku_id}
                        </Text>
                        {sku.description && (
                          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{sku.description}</Text>
                        )}
                      </View>
                      <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
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
  root:              { flex: 1, backgroundColor: C.bg },
  navbar:            { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:           { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginRight: 10 },
  navTitle:          { flex: 1, fontSize: 16, fontWeight: "700", color: C.text },
  scrollContent:     { padding: 16, paddingBottom: 40 },
  field:             { marginBottom: 16 },
  label:             { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 6 },
  inputErr:          { borderColor: C.danger },
  errText:           { fontSize: 12, color: C.danger, marginTop: 4 },
  hintText:          { fontSize: 11, color: C.textMuted, marginTop: 4 },
  selectBox:         { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, backgroundColor: C.surface },
  selectBoxDisabled: { opacity: 0.5 },
  dateLeft:          { flexDirection: "row", alignItems: "center", flex: 1 },
  selectVal:         { fontSize: 15, color: C.text },
  selectPlaceholder: { fontSize: 15, color: C.textMuted },
  chipRow:           { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip:              { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.accentLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText:          { fontSize: 12, color: C.accent, fontWeight: "600" },
  checkbox:          { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  checkboxSelected:  { backgroundColor: C.accent, borderColor: C.accent },
  formErr:           { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fee2e2", borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#fca5a5" },
  formErrText:       { flex: 1, fontSize: 13, color: "#991b1b" },
  btnRow:            { flexDirection: "row", gap: 10, marginTop: 8 },
  btnCancel:         { flex: 1, height: 48, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  btnCancelText:     { fontSize: 15, fontWeight: "600", color: C.textSub },
  btnSubmit:         { flex: 2, height: 48, borderRadius: 10, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  btnSubmitText:     { fontSize: 15, fontWeight: "700", color: "#fff" },
  pickerOverlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", zIndex: 999 },
  pickerSheet:       { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "65%", padding: 20 },
  pickerTitle:       { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 12 },
  pickerEmpty:       { fontSize: 14, color: C.textMuted, textAlign: "center", paddingVertical: 20 },
  pickerItem:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerItemText:    { fontSize: 15, color: C.textSub },
  pickerItemTextActive: { color: C.accent, fontWeight: "600" },
});

const dp = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 20 },
  card:             { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 340 },
  header:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  navBtn:           { width: 36, height: 36, borderRadius: 10, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  monthLabel:       { fontSize: 16, fontWeight: "700", color: "#111827" },
  row:              { flexDirection: "row", marginBottom: 8 },
  dayLabel:         { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: "#9ca3af" },
  grid:             { flexDirection: "row", flexWrap: "wrap" },
  cell:             { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  cellSelected:     { backgroundColor: "#3b5bdb" },
  cellToday:        { borderWidth: 1.5, borderColor: "#3b5bdb" },
  cellText:         { fontSize: 14, color: "#374151" },
  cellTextSelected: { color: "#fff", fontWeight: "700" },
  cellTextToday:    { color: "#3b5bdb", fontWeight: "700" },
  cancelBtn:        { marginTop: 16, alignItems: "center", paddingVertical: 10 },
  cancelText:       { fontSize: 14, color: "#6b7280", fontWeight: "600" },
});