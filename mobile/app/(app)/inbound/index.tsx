import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchAsns, fetchGrns } from "@/services/api";
import { formatDate } from "@/utils/dateTimeFormatter";

// ── colours ───────────────────────────────────────────────────────
const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", borderLight: "#f1f5f9",
  text: "#111827", textSub: "#374151",
  textLabel: "#6b7280", textMuted: "#9ca3af",
  danger: "#e03131", dangerBg: "#fee2e2",
};

// ── status config ─────────────────────────────────────────────────
const STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  draft:      { bg: "#f3f4f6", color: "#111827", dot: "#6b7280", label: "Draft" },
  pending:    { bg: "#fef9c3", color: "#713f12", dot: "#eab308", label: "Pending" },
  in_transit: { bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "In Transit" },
  arrived:    { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Arrived" },
  closed:     { bg: "#e0e7ff", color: "#3730a3", dot: "#6366f1", label: "Closed" },
  cancelled:  { bg: "#fee2e2", color: "#7f1d1d", dot: "#ef4444", label: "Cancelled" },
  receiving:  { bg: "#ffedd5", color: "#7c2d12", dot: "#f97316", label: "Receiving" },
  completed:  { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Completed" },
  posted:     { bg: "#e0e7ff", color: "#3730a3", dot: "#6366f1", label: "Posted" },
};

const ASN_STATUS_OPTIONS = ["open", "draft", "pending", "in_transit", "arrived", "closed", "cancelled"];
const GRN_STATUS_OPTIONS = ["open", "draft", "receiving", "completed", "posted", "cancelled"];
const PAGE_SIZE = 10;

function formatDt(v: string) {
  return formatDate(v);
}

// ── StatusPill ────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const key = String(status || "").toLowerCase();
  const cfg = STATUS_CFG[key] || { bg: "#f3f4f6", color: "#111827", dot: "#6b7280", label: status };
  return (
    <View style={[s.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[s.pillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── FilterModal ───────────────────────────────────────────────────
function FilterModal({ visible, options, selected, onSelect, onClose }: {
  visible: boolean; options: string[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.filterSheet} onPress={() => {}}>
          <Text style={s.filterTitle}>Filter by Status</Text>
          <TouchableOpacity
            style={[s.filterOption, !selected && s.filterOptionActive]}
            onPress={() => { onSelect(""); onClose(); }}
          >
            <Text style={[s.filterOptionText, !selected && s.filterOptionTextActive]}>All Statuses</Text>
            {!selected && <Ionicons name="checkmark" size={16} color={C.accent} />}
          </TouchableOpacity>
          {options.map((o) => (
            <TouchableOpacity
              key={o}
              style={[s.filterOption, selected === o && s.filterOptionActive]}
              onPress={() => { onSelect(o); onClose(); }}
            >
              <Text style={[s.filterOptionText, selected === o && s.filterOptionTextActive]}>
                {o.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </Text>
              {selected === o && <Ionicons name="checkmark" size={16} color={C.accent} />}
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Toolbar (no create button) ────────────────────────────────────
function Toolbar({ search, onSearch, status, onShowFilter, onClear }: any) {
  return (
    <View style={s.toolbar}>
      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={15} color={C.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search ID, supplier…"
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={onSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {!!search && (
          <TouchableOpacity onPress={() => onSearch("")}>
            <Ionicons name="close-circle" size={16} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={[s.filterBtn, !!status && s.filterBtnActive]} onPress={onShowFilter}>
        <Ionicons name="filter-outline" size={16} color={status ? C.accent : C.textLabel} />
        {!!status && <View style={s.filterDot} />}
      </TouchableOpacity>
      {!!status && (
        <TouchableOpacity style={s.clearBtn} onPress={onClear}>
          <Text style={s.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── PaginationBar ─────────────────────────────────────────────────
function PaginationBar({ page, total, pages, onPrev, onNext }: any) {
  return (
    <View style={s.paginationBar}>
      <Text style={s.paginationInfo}>
        {total} result{total !== 1 ? "s" : ""} · Page {page} of {pages}
      </Text>
      <View style={s.paginationBtns}>
        <TouchableOpacity style={[s.pageBtn, page <= 1 && s.pageBtnDisabled]} onPress={onPrev} disabled={page <= 1}>
          <Ionicons name="chevron-back" size={16} color={page <= 1 ? C.textMuted : C.text} />
          <Text style={[s.pageBtnText, page <= 1 && { color: C.textMuted }]}>Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.pageBtn, page >= pages && s.pageBtnDisabled]} onPress={onNext} disabled={page >= pages}>
          <Text style={[s.pageBtnText, page >= pages && { color: C.textMuted }]}>Next</Text>
          <Ionicons name="chevron-forward" size={16} color={page >= pages ? C.textMuted : C.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── ASN card (view only) ──────────────────────────────────────────
function AsnCard({ item, onPress }: { item: any; onPress: (r: any) => void }) {
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.85}>
      <View style={s.cardHeader}>
        <Text style={s.cardId}>{item.asn_id}</Text>
        <StatusPill status={item.status} />
      </View>
      <View style={s.cardRow}>
        <Ionicons name="business-outline" size={13} color={C.textLabel} />
        <Text style={s.cardRowText}>{item.supplier_name || "—"}</Text>
      </View>
      <View style={s.cardMeta}>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>Created</Text>
          <Text style={s.cardMetaVal}>{formatDt(item.created_at)}</Text>
        </View>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>ETA</Text>
          <Text style={s.cardMetaVal}>{formatDate(item.eta)}</Text>
        </View>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>Lines</Text>
          <Text style={s.cardMetaVal}>{item.lines_count ?? "—"}</Text>
        </View>
      </View>
      {!!item.cancellation_reason && (
        <View style={s.cancelReasonBanner}>
          <Ionicons name="alert-circle-outline" size={13} color="#991b1b" />
          <Text style={s.cancelReasonText} numberOfLines={1}>{item.cancellation_reason}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── GRN card (view only) ──────────────────────────────────────────
function GrnCard({ item, onPress }: { item: any; onPress: (r: any) => void }) {
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.85}>
      <View style={s.cardHeader}>
        <Text style={s.cardId}>{item.grn_id}</Text>
        <StatusPill status={item.status} />
      </View>
      <View style={s.cardRow}>
        <Ionicons name="business-outline" size={13} color={C.textLabel} />
        <Text style={s.cardRowText}>{item.supplier_name || "—"}</Text>
      </View>
      <View style={s.cardMeta}>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>ASN</Text>
          <Text style={s.cardMetaVal}>{item.asn_id || "Direct"}</Text>
        </View>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>Created</Text>
          <Text style={s.cardMetaVal}>{formatDt(item.created_at)}</Text>
        </View>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>Received</Text>
          <Text style={s.cardMetaVal}>{formatDate(item.received_date)}</Text>
        </View>
      </View>
      {!!item.cancellation_reason && (
        <View style={s.cancelReasonBanner}>
          <Ionicons name="alert-circle-outline" size={13} color="#991b1b" />
          <Text style={s.cancelReasonText} numberOfLines={1}>{item.cancellation_reason}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── MAIN SCREEN ───────────────────────────────────────────────────
export default function InboundScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab]         = useState<"asn" | "grn">("asn");
  const [asns, setAsns]       = useState<any[]>([]);
  const [grns, setGrns]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]     = useState("");

  const [asnSearch, setAsnSearch] = useState("");
  const [asnStatus, setAsnStatus] = useState("");
  const [grnSearch, setGrnSearch] = useState("");
  const [grnStatus, setGrnStatus] = useState("");
  const [showAsnFilter, setShowAsnFilter] = useState(false);
  const [showGrnFilter, setShowGrnFilter] = useState(false);
  const [asnPage, setAsnPage] = useState(1);
  const [grnPage, setGrnPage] = useState(1);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const [aRes, gRes] = await Promise.all([
        fetchAsns({ page: 1, pageSize: 200 }),
        fetchGrns({ page: 1, pageSize: 200 }),
      ]);
      const aItems = aRes?.data?.items ?? aRes?.data?.data ?? aRes?.data ?? [];
      const gItems = gRes?.data?.items ?? gRes?.data?.data ?? gRes?.data ?? [];
      setAsns(Array.isArray(aItems) ? aItems : []);
      setGrns(Array.isArray(gItems) ? gItems : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load inbound data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(true); };

  const filteredAsns = useMemo(() => {
    const q = asnSearch.toLowerCase();
    return asns.filter((r) =>
      (!q || (r.asn_id || "").toLowerCase().includes(q) || (r.supplier_name || "").toLowerCase().includes(q)) &&
      (!asnStatus || r.status === asnStatus),
    );
  }, [asns, asnSearch, asnStatus]);

  const filteredGrns = useMemo(() => {
    const q = grnSearch.toLowerCase();
    return grns.filter((r) =>
      (!q || (r.grn_id || "").toLowerCase().includes(q) ||
        (r.supplier_name || "").toLowerCase().includes(q) ||
        (r.asn_id || "").toLowerCase().includes(q)) &&
      (!grnStatus || r.status === grnStatus),
    );
  }, [grns, grnSearch, grnStatus]);

  const asnPages  = Math.max(1, Math.ceil(filteredAsns.length / PAGE_SIZE));
  const grnPages  = Math.max(1, Math.ceil(filteredGrns.length / PAGE_SIZE));
  const pagedAsns = filteredAsns.slice((asnPage - 1) * PAGE_SIZE, asnPage * PAGE_SIZE);
  const pagedGrns = filteredGrns.slice((grnPage - 1) * PAGE_SIZE, grnPage * PAGE_SIZE);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
      <TouchableOpacity onPress={() => router.push("/(app)")} style={{ marginRight: 10 }}>
        <Ionicons name="arrow-back" size={22} color={C.accent} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>Inbound</Text>
        <Text style={s.headerSub}>View ASN and goods receipts</Text>
      </View>
        <TouchableOpacity style={s.refreshBtn} onPress={onRefresh} disabled={refreshing}>
          <Ionicons name="refresh-outline" size={20} color={C.accent} />
        </TouchableOpacity>
      </View>

      {!!error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle-outline" size={14} color="#991b1b" />
          <Text style={s.errorText} numberOfLines={2}>{error}</Text>
          <TouchableOpacity onPress={() => setError("")}>
            <Ionicons name="close" size={14} color="#991b1b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Tabs */}
      <View style={s.tabRow}>
        {(["asn", "grn"] as const).map((t) => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
              {t === "asn" ? "ASN" : "Goods Receipt"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ASN tab */}
      {tab === "asn" && (
        <>
          <Toolbar
            search={asnSearch}
            onSearch={(v: string) => { setAsnSearch(v); setAsnPage(1); }}
            status={asnStatus}
            onShowFilter={() => setShowAsnFilter(true)}
            onClear={() => { setAsnSearch(""); setAsnStatus(""); setAsnPage(1); }}
          />
          {loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={s.loadingText}>Loading ASNs…</Text>
            </View>
          ) : (
            <FlatList
              data={pagedAsns}
              keyExtractor={(item) => item.asn_id}
              contentContainerStyle={s.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
              ListEmptyComponent={
                <View style={s.emptyBox}>
                  <Ionicons name="document-outline" size={40} color={C.textMuted} />
                  <Text style={s.emptyText}>No ASNs found</Text>
                </View>
              }
              ListFooterComponent={
                <PaginationBar
                  page={asnPage} total={filteredAsns.length} pages={asnPages}
                  onPrev={() => setAsnPage((p) => p - 1)}
                  onNext={() => setAsnPage((p) => p + 1)}
                />
              }
              renderItem={({ item }) => (
                <AsnCard item={item} onPress={(r) => router.push(`/(app)/inbound/asn/${r.asn_id}`)} />
              )}
            />
          )}
          <FilterModal
            visible={showAsnFilter} options={ASN_STATUS_OPTIONS} selected={asnStatus}
            onSelect={(v) => { setAsnStatus(v); setAsnPage(1); }}
            onClose={() => setShowAsnFilter(false)}
          />
        </>
      )}

      {/* GRN tab */}
      {tab === "grn" && (
        <>
          <Toolbar
            search={grnSearch}
            onSearch={(v: string) => { setGrnSearch(v); setGrnPage(1); }}
            status={grnStatus}
            onShowFilter={() => setShowGrnFilter(true)}
            onClear={() => { setGrnSearch(""); setGrnStatus(""); setGrnPage(1); }}
          />
          {loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={s.loadingText}>Loading GRNs…</Text>
            </View>
          ) : (
            <FlatList
              data={pagedGrns}
              keyExtractor={(item) => item.grn_id}
              contentContainerStyle={s.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
              ListEmptyComponent={
                <View style={s.emptyBox}>
                  <Ionicons name="document-outline" size={40} color={C.textMuted} />
                  <Text style={s.emptyText}>No GRNs found</Text>
                </View>
              }
              ListFooterComponent={
                <PaginationBar
                  page={grnPage} total={filteredGrns.length} pages={grnPages}
                  onPrev={() => setGrnPage((p) => p - 1)}
                  onNext={() => setGrnPage((p) => p + 1)}
                />
              }
              renderItem={({ item }) => (
                <GrnCard item={item} onPress={(r) => router.push(`/(app)/inbound/grn/${r.grn_id}`)} />
              )}
            />
          )}
          <FilterModal
            visible={showGrnFilter} options={GRN_STATUS_OPTIONS} selected={grnStatus}
            onSelect={(v) => { setGrnStatus(v); setGrnPage(1); }}
            onClose={() => setShowGrnFilter(false)}
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: C.bg },
  header:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:     { fontSize: 20, fontWeight: "700", color: C.text },
  headerSub:       { fontSize: 12, color: C.textLabel, marginTop: 2 },
  refreshBtn:      { width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentLight, alignItems: "center", justifyContent: "center" },
  errorBanner:     { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, padding: 10, backgroundColor: "#fee2e2", borderRadius: 8, borderWidth: 1, borderColor: "#fca5a5" },
  errorText:       { flex: 1, fontSize: 13, color: "#991b1b" },
  tabRow:          { flexDirection: "row", backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:          { paddingVertical: 8, paddingHorizontal: 16, marginRight: 4, borderRadius: 8 },
  tabBtnActive:    { backgroundColor: C.accentLight },
  tabBtnText:      { fontSize: 14, fontWeight: "500", color: C.textLabel },
  tabBtnTextActive:{ color: C.accent, fontWeight: "700" },
  toolbar:         { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  searchBox:       { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 38 },
  searchInput:     { flex: 1, fontSize: 14, color: C.text, padding: 0 },
  filterBtn:       { width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  filterBtnActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  filterDot:       { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  clearBtn:        { paddingHorizontal: 10, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  clearBtnText:    { fontSize: 13, color: C.textSub },
  listContent:     { padding: 12, gap: 10, paddingBottom: 24 },
  loadingBox:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  loadingText:     { fontSize: 14, color: C.textLabel },
  emptyBox:        { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText:       { fontSize: 14, color: C.textMuted },
  card:            { backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardId:          { fontSize: 15, fontWeight: "700", color: C.text },
  cardRow:         { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10 },
  cardRowText:     { fontSize: 13, color: C.textSub, fontWeight: "500" },
  cardMeta:        { flexDirection: "row", gap: 16, marginBottom: 8 },
  cardMetaItem:    { flex: 1 },
  cardMetaLabel:   { fontSize: 11, color: C.textMuted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  cardMetaVal:     { fontSize: 13, color: C.text, fontWeight: "500" },
  cancelReasonBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff5f5", borderRadius: 6, padding: 8, borderWidth: 1, borderColor: "#fecaca" },
  cancelReasonText:{ flex: 1, fontSize: 12, color: "#991b1b" },
  pill:            { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillText:        { fontSize: 12, fontWeight: "600" },
  paginationBar:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 12, marginTop: 4 },
  paginationInfo:  { fontSize: 12, color: C.textLabel },
  paginationBtns:  { flexDirection: "row", gap: 8 },
  pageBtn:         { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText:     { fontSize: 13, color: C.text },
  modalOverlay:    { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  filterSheet:     { backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  filterTitle:     { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 12 },
  filterOption:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  filterOptionActive: {},
  filterOptionText: { fontSize: 14, color: C.textSub },
  filterOptionTextActive: { color: C.accent, fontWeight: "600" },
});
