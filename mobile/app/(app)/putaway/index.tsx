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
import { fetchPutawayTasks } from "@/services/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", borderLight: "#f1f5f9",
  text: "#111827", textSub: "#374151",
  textLabel: "#6b7280", textMuted: "#9ca3af",
  danger: "#e03131", dangerBg: "#fee2e2",
  success: "#16a34a", successBg: "#dcfce7",
  warning: "#d97706", warningBg: "#fef3c7",
};

const STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  pending:    { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Pending" },
  assigned:   { bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "Assigned" },
  in_progress:{ bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "In Progress" },
  completed:  { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Completed" },
  exception:  { bg: "#fee2e2", color: "#7f1d1d", dot: "#ef4444", label: "Exception" },
};

const PRIORITY_CFG: Record<string, { bg: string; color: string; label: string }> = {
  high:   { bg: "#fee2e2", color: "#991b1b", label: "High" },
  medium: { bg: "#fef3c7", color: "#92400e", label: "Medium" },
  low:    { bg: "#f1f5f9", color: "#374151", label: "Low" },
};

const STATUS_OPTIONS  = ["pending", "assigned", "in_progress", "completed", "exception"];
const PRIORITY_OPTIONS = ["high", "medium", "low"];
const PAGE_SIZE = 10;

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] || { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: status };
  return (
    <View style={[s.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[s.pillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CFG[priority] || { bg: "#f1f5f9", color: "#374151", label: priority };
  return (
    <View style={[s.priorityBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[s.priorityText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function FilterModal({ visible, title, options, selected, onSelect, onClose }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.filterSheet} onPress={() => {}}>
          <Text style={s.filterTitle}>{title}</Text>
          <TouchableOpacity
            style={[s.filterOption, !selected && s.filterOptionActive]}
            onPress={() => { onSelect(""); onClose(); }}
          >
            <Text style={[s.filterOptionText, !selected && s.filterOptionTextActive]}>All</Text>
            {!selected && <Ionicons name="checkmark" size={16} color={C.accent} />}
          </TouchableOpacity>
          {options.map((o: string) => (
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

// ── Task card ─────────────────────────────────────────────────────
function TaskCard({ item, onPress }: { item: any; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      <View style={s.cardHeader}>
        <Text style={s.cardId}>{item.task_id}</Text>
        <StatusPill status={item.status} />
      </View>

      <View style={s.cardRow}>
        <Ionicons name="cube-outline" size={13} color={C.textLabel} />
        <Text style={s.cardRowText}>{item.sku_id}</Text>
        <Text style={s.cardRowDot}>·</Text>
        <Text style={s.cardRowSub}>Qty: {item.qty}</Text>
      </View>

      <View style={s.cardMeta}>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>GRN</Text>
          <Text style={s.cardMetaVal}>{item.grn_id || "—"}</Text>
        </View>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>Suggested Bin</Text>
          <Text style={s.cardMetaVal}>{item.suggested_bin || "—"}</Text>
        </View>
        <View style={s.cardMetaItem}>
          <Text style={s.cardMetaLabel}>Priority</Text>
          <PriorityBadge priority={item.priority} />
        </View>
      </View>

      {item.assigned_to_user_name && (
        <View style={s.cardRow}>
          <Ionicons name="person-outline" size={13} color={C.textLabel} />
          <Text style={s.cardRowText}>{item.assigned_to_user_name}</Text>
        </View>
      )}

      {item.status === "exception" && item.exception_reason && (
        <View style={s.exceptionBanner}>
          <Ionicons name="warning-outline" size={13} color="#991b1b" />
          <Text style={s.exceptionText} numberOfLines={1}>{item.exception_reason}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Toolbar (top-level) ───────────────────────────────────────────
function Toolbar({ search, onSearch, statusFilter, priorityFilter, onShowStatus, onShowPriority, onClear }: any) {
  const hasFilter = !!statusFilter || !!priorityFilter;
  return (
    <View style={s.toolbar}>
      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={15} color={C.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search task, SKU, GRN…"
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
      <TouchableOpacity style={[s.filterBtn, !!statusFilter && s.filterBtnActive]} onPress={onShowStatus}>
        <Ionicons name="flag-outline" size={15} color={statusFilter ? C.accent : C.textLabel} />
        {!!statusFilter && <View style={s.filterDot} />}
      </TouchableOpacity>
      <TouchableOpacity style={[s.filterBtn, !!priorityFilter && s.filterBtnActive]} onPress={onShowPriority}>
        <Ionicons name="arrow-up-outline" size={15} color={priorityFilter ? C.accent : C.textLabel} />
        {!!priorityFilter && <View style={s.filterDot} />}
      </TouchableOpacity>
      {hasFilter && (
        <TouchableOpacity style={s.clearBtn} onPress={onClear}>
          <Text style={s.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── PaginationBar (top-level) ─────────────────────────────────────
function PaginationBar({ page, total, pages, onPrev, onNext }: any) {
  return (
    <View style={s.paginationBar}>
      <Text style={s.paginationInfo}>{total} task{total !== 1 ? "s" : ""} · Page {page} of {pages}</Text>
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

// ── Main screen ───────────────────────────────────────────────────
export default function PutawayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tasks, setTasks]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");

  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showStatusFilter, setShowStatusFilter]     = useState(false);
  const [showPriorityFilter, setShowPriorityFilter] = useState(false);
  const [page, setPage]                   = useState(1);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const res   = await fetchPutawayTasks({ page: 1, pageSize: 200 });
      const items = res?.data?.items ?? res?.data ?? [];
      setTasks(Array.isArray(items) ? items : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load putaway tasks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useAutoRefresh(() => loadData());

  const onRefresh = () => { setRefreshing(true); loadData(true); };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return tasks.filter((t) =>
      (!q || (t.task_id || "").toLowerCase().includes(q) ||
        (t.sku_id || "").toLowerCase().includes(q) ||
        (t.grn_id || "").toLowerCase().includes(q) ||
        (t.suggested_bin || "").toLowerCase().includes(q)) &&
      (!statusFilter   || t.status   === statusFilter) &&
      (!priorityFilter || t.priority === priorityFilter),
    );
  }, [tasks, search, statusFilter, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.push("/(app)")} style={{ marginRight: 10 }}>
          <Ionicons name="arrow-back" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Putaway</Text>
          <Text style={s.headerSub}>Assign and complete putaway tasks</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={onRefresh} disabled={refreshing}>
          <Ionicons name="refresh-outline" size={20} color={C.accent} />
        </TouchableOpacity>
      </View>

      {/* Error */}
      {!!error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle-outline" size={14} color="#991b1b" />
          <Text style={s.errorText} numberOfLines={2}>{error}</Text>
          <TouchableOpacity onPress={() => setError("")}>
            <Ionicons name="close" size={14} color="#991b1b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Toolbar */}
      <Toolbar
        search={search}
        onSearch={(v: string) => { setSearch(v); setPage(1); }}
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        onShowStatus={() => setShowStatusFilter(true)}
        onShowPriority={() => setShowPriorityFilter(true)}
        onClear={() => { setSearch(""); setStatusFilter(""); setPriorityFilter(""); setPage(1); }}
      />

      {/* Summary chips */}
      <View style={s.summaryRow}>
        {[
          { label: "Pending",     key: "pending",     color: "#94a3b8" },
          { label: "In Progress", key: "in_progress", color: "#3b82f6" },
          { label: "Exception",   key: "exception",   color: "#ef4444" },
        ].map((chip) => {
          const count = tasks.filter((t) => t.status === chip.key).length;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[s.summaryChip, statusFilter === chip.key && s.summaryChipActive]}
              onPress={() => { setStatusFilter(statusFilter === chip.key ? "" : chip.key); setPage(1); }}
            >
              <View style={[s.summaryDot, { backgroundColor: chip.color }]} />
              <Text style={s.summaryLabel}>{chip.label}</Text>
              <Text style={[s.summaryCount, { color: chip.color }]}>{count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={s.loadingText}>Loading tasks…</Text>
        </View>
      ) : (
        <FlatList
          data={paged}
          keyExtractor={(item) => item.task_id}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="cube-outline" size={40} color={C.textMuted} />
              <Text style={s.emptyText}>No putaway tasks found</Text>
            </View>
          }
          ListFooterComponent={
            <PaginationBar
              page={page} total={filtered.length} pages={totalPages}
              onPrev={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
            />
          }
          renderItem={({ item }) => (
            <TaskCard
              item={item}
              onPress={() => router.push(`/(app)/putaway/task/${item.task_id}`)}
            />
          )}
        />
      )}

      {/* Filter modals */}
      <FilterModal
        visible={showStatusFilter} title="Filter by Status"
        options={STATUS_OPTIONS} selected={statusFilter}
        onSelect={(v: string) => { setStatusFilter(v); setPage(1); }}
        onClose={() => setShowStatusFilter(false)}
      />
      <FilterModal
        visible={showPriorityFilter} title="Filter by Priority"
        options={PRIORITY_OPTIONS} selected={priorityFilter}
        onSelect={(v: string) => { setPriorityFilter(v); setPage(1); }}
        onClose={() => setShowPriorityFilter(false)}
      />
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
  toolbar:         { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  searchBox:       { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 38 },
  searchInput:     { flex: 1, fontSize: 14, color: C.text, padding: 0 },
  filterBtn:       { width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  filterBtnActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  filterDot:       { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  clearBtn:        { paddingHorizontal: 10, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  clearBtnText:    { fontSize: 13, color: C.textSub },
  summaryRow:      { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  summaryChip:     { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
  summaryChipActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  summaryDot:      { width: 7, height: 7, borderRadius: 4 },
  summaryLabel:    { flex: 1, fontSize: 11, color: C.textLabel, fontWeight: "500" },
  summaryCount:    { fontSize: 13, fontWeight: "700" },
  listContent:     { padding: 12, gap: 10, paddingBottom: 24 },
  loadingBox:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  loadingText:     { fontSize: 14, color: C.textLabel },
  emptyBox:        { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText:       { fontSize: 14, color: C.textMuted },
  card:            { backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardId:          { fontSize: 15, fontWeight: "700", color: C.text },
  cardRow:         { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  cardRowText:     { fontSize: 13, color: C.textSub, fontWeight: "500" },
  cardRowDot:      { fontSize: 13, color: C.textMuted },
  cardRowSub:      { fontSize: 13, color: C.textMuted },
  cardMeta:        { flexDirection: "row", gap: 12, marginBottom: 8 },
  cardMetaItem:    { flex: 1 },
  cardMetaLabel:   { fontSize: 11, color: C.textMuted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  cardMetaVal:     { fontSize: 13, color: C.text, fontWeight: "500" },
  exceptionBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff5f5", borderRadius: 6, padding: 8, marginTop: 4, borderWidth: 1, borderColor: "#fecaca" },
  exceptionText:   { flex: 1, fontSize: 12, color: "#991b1b" },
  pill:            { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillText:        { fontSize: 12, fontWeight: "600" },
  priorityBadge:   { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  priorityText:    { fontSize: 11, fontWeight: "600" },
  paginationBar:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 12 },
  paginationInfo:  { fontSize: 12, color: C.textLabel },
  paginationBtns:  { flexDirection: "row", gap: 8 },
  pageBtn:         { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText:     { fontSize: 13, color: C.text },
  modalOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  filterSheet:     { backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  filterTitle:     { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 12 },
  filterOption:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  filterOptionActive: {},
  filterOptionText: { fontSize: 14, color: C.textSub },
  filterOptionTextActive: { color: C.accent, fontWeight: "600" },
});
