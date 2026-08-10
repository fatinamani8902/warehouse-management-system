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
import {
  fetchAdjustments,
  fetchCountPlans,
  fetchInventorySummary,
} from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { formatDate } from "@/utils/dateTimeFormatter";

const C = {
  accent: "#3b5bdb", accentLight: "#eef2ff",
  bg: "#f8fafc", surface: "#ffffff",
  border: "#e8ebf8", borderLight: "#f1f5f9",
  text: "#111827", textSub: "#374151",
  textLabel: "#6b7280", textMuted: "#9ca3af",
  danger: "#e03131", success: "#16a34a",
  warning: "#d97706",
};

// ── RBAC ──────────────────────────────────────────────────────────
const ROLE_ALIASES: Record<string, string> = {
  superadmin: "warehousemanager", hqadmin: "warehousemanager",
  storemanager: "warehousemanager", warehouseclerk: "storekeeper",
  warehousemanager: "warehousemanager", storekeeper: "storekeeper",
  auditor: "auditor", readonly: "readonly",
};
function normalizeRole(r: string) {
  return ROLE_ALIASES[String(r || "readonly").toLowerCase()] || "readonly";
}
function canCreateAdjustment(roleId: string) { return ["warehousemanager", "storekeeper"].includes(normalizeRole(roleId)); }

// ── Status configs ────────────────────────────────────────────────
const COUNT_STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  draft:      { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Draft" },
  submitted:  { bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "Submitted" },
  approved:   { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Approved" },
  rejected:   { bg: "#fee2e2", color: "#7f1d1d", dot: "#ef4444", label: "Rejected" },
  cancelled:  { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Cancelled" },
  in_progress:{ bg: "#ffedd5", color: "#7c2d12", dot: "#f97316", label: "In Progress" },
};

const ADJ_STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  DRAFT:      { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Draft" },
  SUBMITTED:  { bg: "#dbeafe", color: "#1e3a8a", dot: "#3b82f6", label: "Submitted" },
  APPROVED:   { bg: "#dcfce7", color: "#14532d", dot: "#22c55e", label: "Approved" },
  REJECTED:   { bg: "#fee2e2", color: "#7f1d1d", dot: "#ef4444", label: "Rejected" },
  CANCELLED:  { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: "Cancelled" },
};

const PAGE_SIZE = 10;

function StatusPill({ status, cfg }: { status: string; cfg: Record<string, any> }) {
  const c = cfg[status] || cfg[status?.toUpperCase()] || { bg: "#f1f5f9", color: "#374151", dot: "#94a3b8", label: status };
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function FilterModal({ visible, options, selected, onSelect, onClose }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.filterSheet} onPress={() => {}}>
          <Text style={s.filterTitle}>Filter by Status</Text>
          <TouchableOpacity style={s.filterOption} onPress={() => { onSelect(""); onClose(); }}>
            <Text style={[s.filterOptionText, !selected && { color: C.accent, fontWeight: "600" }]}>All</Text>
            {!selected && <Ionicons name="checkmark" size={16} color={C.accent} />}
          </TouchableOpacity>
          {options.map((o: string) => (
            <TouchableOpacity key={o} style={s.filterOption} onPress={() => { onSelect(o); onClose(); }}>
              <Text style={[s.filterOptionText, selected === o && { color: C.accent, fontWeight: "600" }]}>
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

// ── Toolbar top-level ─────────────────────────────────────────────
function Toolbar({ search, onSearch, status, onShowFilter, onClear, onAdd, addLabel }: any) {
  return (
    <View style={s.toolbar}>
      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={15} color={C.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search…"
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
      {onAdd && (
        <TouchableOpacity style={s.addBtn} onPress={onAdd}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>{addLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function PaginationBar({ page, total, pages, onPrev, onNext }: any) {
  return (
    <View style={s.paginationBar}>
      <Text style={s.paginationInfo}>{total} result{total !== 1 ? "s" : ""} · Page {page} of {pages}</Text>
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

// ── Summary Tab ───────────────────────────────────────────────────
function SummaryTab() {
  const [items, setItems]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetchInventorySummary({ page, pageSize: PAGE_SIZE, search });
      const data = res?.data;
      setItems(data?.items ?? []);
      setTotal(data?.total ?? 0);
    } catch { setItems([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load());

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <View style={{ flex: 1 }}>
      <View style={s.toolbar}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color={C.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Search SKU, location…"
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={(v) => { setSearch(v); setPage(1); }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!search && (
            <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
              <Ionicons name="close-circle" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={s.loadingText}>Loading inventory…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => `${item.sku_id}-${item.location_id}-${i}`}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="cube-outline" size={40} color={C.textMuted} />
              <Text style={s.emptyText}>No inventory found</Text>
            </View>
          }
          ListFooterComponent={
            <PaginationBar page={page} total={total} pages={pages}
              onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.cardId}>{item.sku_id}</Text>
                <View style={[s.qtyBadge, item.qty_on_hand === 0 && s.qtyBadgeZero]}>
                  <Text style={[s.qtyText, item.qty_on_hand === 0 && s.qtyTextZero]}>
                    {item.qty_on_hand ?? 0}
                  </Text>
                </View>
              </View>
              {item.sku_name && <Text style={s.cardSubtitle}>{item.sku_name}</Text>}
              <View style={s.cardMeta}>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>Location</Text>
                  <Text style={s.cardMetaVal}>{item.location_code || item.location_name || item.location_id || "-"}</Text>
                </View>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>Zone</Text>
                  <Text style={s.cardMetaVal}>{item.zone_id || "-"}</Text>
                </View>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>Reserved</Text>
                  <Text style={s.cardMetaVal}>{item.qty_reserved ?? 0}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ── Count Plans Tab ───────────────────────────────────────────────
function CountPlansTab({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [items, setItems]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage]           = useState(1);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res   = await fetchCountPlans({ page: 1, pageSize: 200 });
      const data  = res?.data;
      setItems(data?.items ?? data ?? []);
    } catch { setItems([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((r) =>
      (!q || (r.count_id || "").toLowerCase().includes(q) || (r.zone_id || "").toLowerCase().includes(q)) &&
      (!statusFilter || r.status === statusFilter)
    );
  }, [items, search, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <View style={{ flex: 1 }}>
      <Toolbar
        search={search} onSearch={(v: string) => { setSearch(v); setPage(1); }}
        status={statusFilter} onShowFilter={() => setShowFilter(true)}
        onClear={() => { setSearch(""); setStatus(""); setPage(1); }}
        onAdd={null}
        addLabel="Count Plan"
      />
      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={s.loadingText}>Loading count plans…</Text>
        </View>
      ) : (
        <FlatList
          data={paged}
          keyExtractor={(item) => item.count_id}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="clipboard-outline" size={40} color={C.textMuted} />
              <Text style={s.emptyText}>No count plans found</Text>
            </View>
          }
          ListFooterComponent={
            <PaginationBar page={page} total={filtered.length} pages={pages}
              onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/(app)/inventory/count-plan/${item.count_id}`)} activeOpacity={0.85}>
              <View style={s.cardHeader}>
                <Text style={s.cardId}>{item.count_id}</Text>
                <StatusPill status={item.status} cfg={COUNT_STATUS_CFG} />
              </View>
              <View style={s.cardMeta}>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>Zone</Text>
                  <Text style={s.cardMetaVal}>{item.zone_id || "-"}</Text>
                </View>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>Planned Date</Text>
                  <Text style={s.cardMetaVal}>{formatDate(item.planned_date)}</Text>
                </View>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>Scope</Text>
                  <Text style={s.cardMetaVal}>{(item.scope_type || "—").replace(/_/g, " ")}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      <FilterModal
        visible={showFilter}
        options={["draft", "in_progress", "submitted", "approved", "rejected", "cancelled"]}
        selected={statusFilter}
        onSelect={(v: string) => { setStatus(v); setPage(1); }}
        onClose={() => setShowFilter(false)}
      />
    </View>
  );
}

// ── Adjustments Tab ───────────────────────────────────────────────
function AdjustmentsTab({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [items, setItems]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const res  = await fetchAdjustments({
        page,
        pageSize: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const data = res?.data;
      const rows = data?.items ?? data?.data ?? data?.rows ?? data ?? [];
      setItems(Array.isArray(rows) ? rows : []);
      setTotal(Number(data?.total ?? (Array.isArray(rows) ? rows.length : 0)));
    } catch (e: any) {
      setItems([]);
      setTotal(0);
      setError(e?.response?.data?.message || e?.message || "Unable to load adjustments");
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <View style={{ flex: 1 }}>
      <Toolbar
        search={search} onSearch={(v: string) => { setSearch(v); setPage(1); }}
        status={statusFilter} onShowFilter={() => setShowFilter(true)}
        onClear={() => { setSearch(""); setStatus(""); setPage(1); }}
        onAdd={canCreateAdjustment(roleId) ? () => router.push("/(app)/inventory/adjustment/create") : null}
        addLabel="Adjustment"
      />
      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={s.loadingText}>Loading adjustments…</Text>
        </View>
      ) : error ? (
        <View style={s.emptyBox}>
          <Ionicons name="alert-circle-outline" size={40} color={C.danger} />
          <Text style={[s.emptyText, { color: C.danger }]}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.adj_id}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="swap-vertical-outline" size={40} color={C.textMuted} />
              <Text style={s.emptyText}>No adjustments found</Text>
            </View>
          }
          ListFooterComponent={
            <PaginationBar page={page} total={total} pages={pages}
              onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/(app)/inventory/adjustment/${item.adj_id}`)} activeOpacity={0.85}>
              <View style={s.cardHeader}>
                <Text style={s.cardId}>{item.adj_id}</Text>
                <StatusPill status={item.status} cfg={ADJ_STATUS_CFG} />
              </View>
              <View style={s.cardMeta}>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>SKU</Text>
                  <Text style={s.cardMetaVal}>{item.sku_id || "-"}</Text>
                </View>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>Location</Text>
                  <Text style={s.cardMetaVal}>{item.location_code || item.location_name || item.location_id || "-"}</Text>
                </View>
                <View style={s.cardMetaItem}>
                  <Text style={s.cardMetaLabel}>Qty Delta</Text>
                  <Text style={[s.cardMetaVal, { color: Number(item.qty_delta) > 0 ? C.success : C.danger, fontWeight: "700" }]}>
                    {Number(item.qty_delta) > 0 ? "+" : ""}{item.qty_delta}
                  </Text>
                </View>
              </View>
              <View style={s.cardRow}>
                <Text style={s.cardMetaLabel}>Reason: </Text>
                <Text style={s.cardRowText}>{item.reason_code || "-"}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      <FilterModal
        visible={showFilter}
        options={["draft", "submitted", "approved", "rejected", "cancelled"]}
        selected={statusFilter}
        onSelect={(v: string) => { setStatus(v); setPage(1); }}
        onClose={() => setShowFilter(false)}
      />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────
export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const user   = useAuthStore((s) => s.user);
  const roleId = user?.role_id || "readonly";
  const router = useRouter();
  const [tab, setTab] = useState<"summary" | "count" | "adjustment">("summary");

  const tabs = [
    { key: "summary",    label: "Stock" },
    { key: "count",      label: "Count Plans" },
    { key: "adjustment", label: "Adjustments" },
  ] as const;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[s.header, { flexDirection: "row", alignItems: "center" }]}>
      <TouchableOpacity onPress={() => router.push("/(app)")} style={{ marginRight: 10 }}>
        <Ionicons name="arrow-back" size={22} color={C.accent} />
      </TouchableOpacity>
      <View>
        <Text style={s.headerTitle}>Inventory</Text>
        <Text style={s.headerSub}>Stock, count plans & adjustments</Text>
      </View>
    </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabBtnText, tab === t.key && s.tabBtnTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {tab === "summary"    && <SummaryTab />}
      {tab === "count"      && <CountPlansTab roleId={roleId} />}
      {tab === "adjustment" && <AdjustmentsTab roleId={roleId} />}
    </View>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: C.bg },
  header:          { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:     { fontSize: 20, fontWeight: "700", color: C.text },
  headerSub:       { fontSize: 12, color: C.textLabel, marginTop: 2 },
  tabRow:          { flexDirection: "row", backgroundColor: C.surface, paddingHorizontal: 12, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:          { paddingVertical: 8, paddingHorizontal: 12, marginRight: 4, borderRadius: 8 },
  tabBtnActive:    { backgroundColor: C.accentLight },
  tabBtnText:      { fontSize: 13, fontWeight: "500", color: C.textLabel },
  tabBtnTextActive:{ color: C.accent, fontWeight: "700" },
  toolbar:         { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  searchBox:       { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 38 },
  searchInput:     { flex: 1, fontSize: 14, color: C.text, padding: 0 },
  filterBtn:       { width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  filterBtnActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  filterDot:       { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  clearBtn:        { paddingHorizontal: 10, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  clearBtnText:    { fontSize: 13, color: C.textSub },
  addBtn:          { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 38, borderRadius: 8, backgroundColor: C.accent },
  addBtnText:      { fontSize: 13, fontWeight: "600", color: "#fff" },
  listContent:     { padding: 12, gap: 10, paddingBottom: 24 },
  loadingBox:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  loadingText:     { fontSize: 14, color: C.textLabel },
  emptyBox:        { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText:       { fontSize: 14, color: C.textMuted },
  retryBtn:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  retryText:       { fontSize: 13, color: C.accent, fontWeight: "700" },
  card:            { backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardId:          { fontSize: 15, fontWeight: "700", color: C.text },
  cardSubtitle:    { fontSize: 13, color: C.textSub, marginBottom: 8 },
  cardMeta:        { flexDirection: "row", gap: 12, marginBottom: 6 },
  cardMetaItem:    { flex: 1 },
  cardMetaLabel:   { fontSize: 11, color: C.textMuted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  cardMetaVal:     { fontSize: 13, color: C.text, fontWeight: "500" },
  cardRow:         { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  cardRowText:     { fontSize: 13, color: C.textSub },
  qtyBadge:        { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: C.accentLight },
  qtyBadgeZero:    { backgroundColor: "#fee2e2" },
  qtyText:         { fontSize: 15, fontWeight: "700", color: C.accent },
  qtyTextZero:     { color: C.danger },
  pill:            { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillText:        { fontSize: 12, fontWeight: "600" },
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
  filterOptionText:{ fontSize: 14, color: C.textSub },
});
