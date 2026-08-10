import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { apiClient, fetchPickLists } from "@/services/api";
import { normalizeRole } from "@/services/rbac";
import { useAuthStore } from "@/stores/authStore";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { MOBILE_DEBUG_ENABLED, mobileDebug } from "@/utils/debug";
import { getAssignedUserDisplay } from "@/utils/pickingDisplay";

const PICKING_DIAGNOSTIC_BUILD = "PICKING-MOBILE-20260624-01";
const PICK_LIST_ENDPOINT = "/picking/pick-lists";

type PickingDiagnostics = {
  apiBaseUrl: string;
  endpoint: string;
  fullUrl: string;
  requestHeaders: Record<string, string>;
  requestParams: Record<string, unknown>;
  responseStatus: number | null;
  responseCount: number | null;
  firstItem: unknown;
  currentUser: unknown;
  storedUser: unknown;
  storedAuthVersion: string | null;
  storedTokenPresent: boolean;
  error: string;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:          "#f4f6fb",
  card:        "#ffffff",
  border:      "#e8eaf0",
  borderLight: "#f1f5f9",
  accent:      "#3b5bdb",
  accentLight: "#eef2ff",
  success:     "#16a34a",
  danger:      "#dc2626",
  dangerBg:    "#fee2e2",
  t1:          "#111827",
  t2:          "#374151",
  t3:          "#6b7280",
  t4:          "#9ca3af",
  white:       "#ffffff",
};

const STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  pending:     { bg: "#f3f4f6", color: "#374151", dot: "#6b7280", label: "Pending" },
  in_progress: { bg: "#fef9c3", color: "#713f12", dot: "#eab308", label: "In Progress" },
  completed:   { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Picked" },
  done:        { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Picked" },
  cancelled:   { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af", label: "Cancelled" },
  picked:      { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Picked" },
  open:        { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Open" },
  assigned:    { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Assigned" },
  released:    { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Released" },
  draft:       { bg: "#f3f4f6", color: "#374151", dot: "#6b7280", label: "Draft" },
};

function StatusBadge({ status }: { status: string }) {
  const key = String(status || "").toLowerCase();
  const c   = STATUS_CFG[key] || { bg: "#f3f4f6", color: "#374151", dot: "#6b7280", label: status || "—" };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: c.color }}>{c.label}</Text>
    </View>
  );
}

const STATUS_OPTIONS = [
  { value: "",            label: "All Statuses" },
  { value: "open",        label: "Open" },
  { value: "assigned",    label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "picked",      label: "Picked" },
];

function formatDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateParam(value: string): Date {
  return value ? new Date(`${value}T00:00:00`) : new Date();
}

function formatDisplayDate(value: string): string {
  if (!value) return "dd/mm/yyyy";
  const date = parseDateParam(value);
  if (Number.isNaN(date.getTime())) return "dd/mm/yyyy";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function toCellDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day);
}

function buildMonthGrid(anchor: Date) {
  const first = startOfMonth(anchor);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(toCellDate(first.getFullYear(), first.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatCalendarTitle(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const PAGE_SIZE = 20;

function formatCardDateTime(value?: string | null): string {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";
  const day = date.toLocaleDateString("en-GB");
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function PickListItem({ item, onPress }: { item: any; onPress: (item: any) => void }) {
  const pickedCount = (item.lines || []).filter((l: any) => l.status === "picked").length;
  const totalCount = (item.lines || []).length;
  const firstLine = item.lines?.[0];
  const listId = item.wave_id || item.pick_list_id;
  const assignedUserDisplay = getAssignedUserDisplay(item);
  const statusKey = String(item.status || "").toLowerCase();
  const isPicked = ["picked", "completed", "done"].includes(statusKey);
  const isDraft = statusKey === "draft";
  const message = isPicked
    ? "Picked — ready for packing"
    : isDraft
      ? "Draft pick list"
      : statusKey === "in_progress" || statusKey === "picking"
        ? "Picking in progress"
        : "Ready for picking";
  const messageColor = isPicked ? C.success : isDraft ? C.t3 : C.warning;
  const timestampLabel = item.completed_at ? "Picked" : "Created";
  const timestamp = formatCardDateTime(item.completed_at || item.created_at);

  const InfoColumn = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flex: 1, minWidth: 0, flexShrink: 1 }}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 11, color: C.t3, marginBottom: 3 }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ fontSize: 13, fontWeight: "600", color: C.t2, flexShrink: 1 }}
      >
        {value || "—"}
      </Text>
    </View>
  );

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.75}
      style={{
        backgroundColor: C.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ fontSize: 15, fontWeight: "700", color: C.t1, flex: 1, flexShrink: 1, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}
        >
          {listId}
        </Text>
        <StatusBadge status={item.status} />
      </View>

      <View style={{ flexDirection: "row", columnGap: 14, marginBottom: 12 }}>
        <InfoColumn label="Wave" value={item.wave_id || "—"} />
        <InfoColumn label="Assigned" value={assignedUserDisplay} />
        <InfoColumn label="Lines" value={`${pickedCount}/${totalCount}`} />
      </View>

      <View style={{ height: 1, backgroundColor: C.border, marginBottom: 10 }} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 13, fontWeight: "600", color: messageColor, flexShrink: 1 }}>
            {message}
          </Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12, color: C.t3, marginTop: 4, flexShrink: 1 }}>
            {timestampLabel} {timestamp}
          </Text>
          {firstLine ? (
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12, color: C.t3, marginTop: 3, flexShrink: 1 }}>
              {firstLine.location_code || firstLine.location_id || "—"} · Required {firstLine.qty_required ?? firstLine.qty ?? 0} · Picked {firstLine.qty_picked ?? firstLine.picked_qty ?? 0}
            </Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 14, color: C.t4, paddingLeft: 8 }}>{">"}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PickingIndexScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const user    = useAuthStore((s) => s.user);
  const fromDateBoxRef = useRef<View | null>(null);
  const toDateBoxRef = useRef<View | null>(null);

  const [pickLists,    setPickLists]    = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState("");
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [statusOpen,   setStatusOpen]   = useState(false);
  const [dateSheet,    setDateSheet]    = useState<"from" | "to" | null>(null);
  const [draftDate,    setDraftDate]    = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(startOfMonth(new Date()));
  const [popupRect,    setPopupRect]    = useState({ top: 0, left: 12, width: 300 });
  const [page,         setPage]         = useState(1);
  const [total,        setTotal]        = useState(0);
  const [diagnostics,  setDiagnostics]  = useState<PickingDiagnostics>({
    apiBaseUrl: String(apiClient.defaults.baseURL || ""),
    endpoint: PICK_LIST_ENDPOINT,
    fullUrl: "",
    requestHeaders: {},
    requestParams: {},
    responseStatus: null,
    responseCount: null,
    firstItem: null,
    currentUser: null,
    storedUser: null,
    storedAuthVersion: null,
    storedTokenPresent: false,
    error: "",
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dateRangeError = dateFrom && dateTo && dateTo < dateFrom
    ? "To Date cannot be earlier than From Date."
    : "";

  const loadList = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      if (dateRangeError) {
        setPickLists([]);
        setTotal(0);
        setError(dateRangeError);
        return;
      }
      const roleId = normalizeRole(user?.role_id || "readonly");
      const isOperator = roleId === "storeoperator";
      const params = {
        page,
        pageSize: PAGE_SIZE,
        search,
        status: statusFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        assigned_user: isOperator ? user?.user_id : undefined,
      };
      const storedUserJson = MOBILE_DEBUG_ENABLED ? await SecureStore.getItemAsync("wms_user") : null;
      const storedAuthVersion = MOBILE_DEBUG_ENABLED ? await SecureStore.getItemAsync("wms_auth_version") : null;
      const storedToken = MOBILE_DEBUG_ENABLED ? await SecureStore.getItemAsync("wms_token") : null;
      let storedUser = null;
      try {
        storedUser = storedUserJson ? JSON.parse(storedUserJson) : null;
      } catch {
        storedUser = { invalidStoredSession: true };
      }
      const configuredHeaders = apiClient.defaults.headers.common || {};
      const requestHeaders = {
        "x-user-id": String(apiClient.defaults.headers["x-user-id"] || ""),
        "x-tenant-id": String(apiClient.defaults.headers["x-tenant-id"] || ""),
        "x-warehouse-id": String(apiClient.defaults.headers["x-warehouse-id"] || ""),
        "x-roles": String(apiClient.defaults.headers["x-roles"] || ""),
        "x-client-source": String(apiClient.defaults.headers["x-client-source"] || configuredHeaders["x-client-source"] || "MOBILE"),
      };
      const fullUrl = apiClient.getUri({ url: PICK_LIST_ENDPOINT, params });

      mobileDebug("[Picking diagnostics] request", {
        build: PICKING_DIAGNOSTIC_BUILD,
        apiBaseUrl: apiClient.defaults.baseURL,
        endpoint: PICK_LIST_ENDPOINT,
        fullUrl,
        headers: requestHeaders,
        params,
        currentUser: user,
        storedUser,
        storedAuthVersion,
        storedTokenPresent: Boolean(storedToken),
      });

      if (MOBILE_DEBUG_ENABLED) {
        setDiagnostics((current) => ({
          ...current,
          apiBaseUrl: String(apiClient.defaults.baseURL || ""),
          endpoint: PICK_LIST_ENDPOINT,
          fullUrl,
          requestHeaders,
          requestParams: params,
          currentUser: user,
          storedUser,
          storedAuthVersion,
          storedTokenPresent: Boolean(storedToken),
          error: "",
        }));
      }

      const res = await fetchPickLists(params);
      const data = res?.data;
      const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      mobileDebug("[Picking diagnostics] response", {
        build: PICKING_DIAGNOSTIC_BUILD,
        status: res?.status,
        count: items.length,
        firstItem: items[0] || null,
      });
      if (MOBILE_DEBUG_ENABLED) {
        setDiagnostics((current) => ({
          ...current,
          responseStatus: Number(res?.status || 0),
          responseCount: items.length,
          firstItem: items[0] || null,
          error: "",
        }));
      }
      setPickLists(items);
      setTotal(Number(data?.total || 0));
    } catch (e: any) {
      const message = e?.response?.data?.message || e.message || "Failed to load pick lists";
      mobileDebug("[Picking diagnostics] error", {
        build: PICKING_DIAGNOSTIC_BUILD,
        message,
        status: e?.response?.status || null,
        response: e?.response?.data || null,
      });
      if (MOBILE_DEBUG_ENABLED) {
        setDiagnostics((current) => ({
          ...current,
          responseStatus: e?.response?.status || null,
          responseCount: null,
          firstItem: e?.response?.data || null,
          error: message,
        }));
      }
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateRangeError, dateTo, page, search, statusFilter, user]);

  useEffect(() => { loadList(); }, [loadList]);
  useAutoRefresh(() => loadList());

  const handlePress = (item: any) => {
    const pickListId = item.wave_id || item.pick_list_id;
    if (pickListId) router.push(`/(app)/picking/${pickListId}`);
  };

  const selectedStatusLabel = STATUS_OPTIONS.find((opt) => opt.value === statusFilter)?.label || "All Statuses";
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setStatusOpen(false);
    setDateSheet(null);
    setDraftDate(null);
    setCalendarMonth(startOfMonth(new Date()));
    setPage(1);
  };
  const openDateSheet = (field: "from" | "to") => {
    const source = field === "from" ? dateFrom : dateTo;
    const selected = source ? parseDateParam(source) : null;
    setDraftDate(selected);
    setCalendarMonth(startOfMonth(selected || new Date()));
    setDateSheet(field);
    requestAnimationFrame(() => {
      const node = field === "from" ? fromDateBoxRef.current : toDateBoxRef.current;
      node?.measureInWindow((x, y, width, height) => {
        const sheetWidth = Math.min(320, screenWidth - 24);
        const sheetHeight = 336;
        const left = Math.max(12, Math.min(x, screenWidth - sheetWidth - 12));
        const belowTop = y + height + 8;
        const aboveTop = y - sheetHeight - 8;
        const top = belowTop + sheetHeight > screenHeight - insets.bottom - 8 && aboveTop > insets.top + 8
          ? aboveTop
          : belowTop;
        setPopupRect({
          top,
          left,
          width: sheetWidth,
        });
      });
    });
  };
  const cancelDateSheet = () => {
    setDateSheet(null);
    setDraftDate(null);
    setCalendarMonth(startOfMonth(new Date()));
  };
  const applyDateSheet = () => {
    if (!dateSheet) {
      cancelDateSheet();
      return;
    }
    if (draftDate) {
      const value = formatDateParam(draftDate);
      if (dateSheet === "from") setDateFrom(value);
      else setDateTo(value);
    } else {
      if (dateSheet === "from") setDateFrom("");
      else setDateTo("");
    }
    setDateSheet(null);
    setDraftDate(null);
    setCalendarMonth(startOfMonth(new Date()));
    setPage(1);
  };
  const clearSingleDate = (field: "from" | "to") => {
    if (field === "from") setDateFrom("");
    else setDateTo("");
    if (dateSheet === field) setDraftDate(null);
    setPage(1);
  };
  const invalidDateRange = dateFrom && dateTo && dateTo < dateFrom ? "To Date cannot be earlier than From Date." : "";
  const visibleMonth = calendarMonth;
  const calendarCells = buildMonthGrid(visibleMonth);
  const popupStyle = { top: popupRect.top, left: popupRect.left, width: popupRect.width };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>

      {/* Header */}
      <View style={{ backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: "row", alignItems: "center" }}>
        <TouchableOpacity onPress={() => router.push("/(app)")} style={{ marginRight: 10 }}>
          <Ionicons name="arrow-back" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: C.t1 }}>Picking</Text>
          <Text style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>Pick list operations</Text>
        </View>
      </View>

      {MOBILE_DEBUG_ENABLED ? <View style={{ margin: 12, marginBottom: 0, padding: 10, borderRadius: 8, backgroundColor: "#111827" }}>
        <Text selectable style={{ color: "#93c5fd", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>
          Picking Diagnostics · {PICKING_DIAGNOSTIC_BUILD}
        </Text>
        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
          <Text selectable style={{ color: "#e5e7eb", fontSize: 10, lineHeight: 15 }}>
            {JSON.stringify({
              apiBaseUrl: diagnostics.apiBaseUrl,
              endpoint: diagnostics.endpoint,
              fullUrl: diagnostics.fullUrl,
              requestHeaders: diagnostics.requestHeaders,
              requestParams: diagnostics.requestParams,
              responseStatus: diagnostics.responseStatus,
              responseCount: diagnostics.responseCount,
              firstItem: diagnostics.firstItem,
              currentUser: diagnostics.currentUser,
              storedUser: diagnostics.storedUser,
              storedAuthVersion: diagnostics.storedAuthVersion,
              storedTokenPresent: diagnostics.storedTokenPresent,
              error: diagnostics.error,
            }, null, 2)}
          </Text>
        </ScrollView>
      </View> : null}

      {/* Filters */}
      <View style={{ backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 38 }}>
          <Ionicons name="search-outline" size={15} color={C.t4} style={{ marginRight: 6 }} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: C.t1, padding: 0 }}
            placeholder="Search pick list or wave…"
            placeholderTextColor={C.t4}
            value={search}
            onChangeText={(v) => { setSearch(v); setPage(1); }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
              <Ionicons name="close-circle" size={16} color={C.t4} />
            </TouchableOpacity>
          )}
        </View>

        <View>
          <Text style={{ fontSize: 11, color: C.t3, fontWeight: "700", marginBottom: 4 }}>Status</Text>
          <TouchableOpacity
            onPress={() => setStatusOpen((current) => !current)}
            style={{ height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: 14, color: C.t1 }}>{selectedStatusLabel}</Text>
            <Ionicons name={statusOpen ? "chevron-up" : "chevron-down"} size={16} color={C.t3} />
          </TouchableOpacity>
          {statusOpen ? (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.card, overflow: "hidden" }}>
              {STATUS_OPTIONS.map((opt) => {
                const active = statusFilter === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => { setStatusFilter(opt.value); setStatusOpen(false); setPage(1); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: active ? C.accentLight : C.card, borderBottomWidth: opt.value === "picked" ? 0 : 1, borderBottomColor: C.borderLight }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: active ? "700" : "500", color: active ? C.accent : C.t2 }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.t3, fontWeight: "700", marginBottom: 4 }}>From Date</Text>
            <View ref={fromDateBoxRef} collapsable={false}>
              <TouchableOpacity
                onPress={() => openDateSheet("from")}
                style={{ height: 48, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <Text numberOfLines={1} style={{ fontSize: 14, color: dateFrom ? C.t1 : C.t4 }}>{formatDisplayDate(dateFrom)}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {dateFrom ? (
                    <TouchableOpacity onPress={() => clearSingleDate("from")} hitSlop={8}>
                      <Ionicons name="close" size={15} color={C.t4} />
                    </TouchableOpacity>
                  ) : null}
                  <Ionicons name="calendar-outline" size={16} color={C.t4} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.t3, fontWeight: "700", marginBottom: 4 }}>To Date</Text>
            <View ref={toDateBoxRef} collapsable={false}>
              <TouchableOpacity
                onPress={() => openDateSheet("to")}
                style={{ height: 48, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <Text numberOfLines={1} style={{ fontSize: 14, color: dateTo ? C.t1 : C.t4 }}>{formatDisplayDate(dateTo)}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {dateTo ? (
                    <TouchableOpacity onPress={() => clearSingleDate("to")} hitSlop={8}>
                      <Ionicons name="close" size={15} color={C.t4} />
                    </TouchableOpacity>
                  ) : null}
                  <Ionicons name="calendar-outline" size={16} color={C.t4} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {dateRangeError ? (
          <Text style={{ fontSize: 12, color: C.danger, fontWeight: "600" }}>{dateRangeError}</Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={clearFilters}
            style={{ flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.card }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.t2 }}>Clear Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => loadList()}
            style={{ flex: 1, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.accent }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.white }}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {dateSheet ? (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, elevation: 50 }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={cancelDateSheet}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(17,24,39,0.14)" }}
          />
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={{
              position: "absolute",
              top: popupStyle.top,
              left: popupStyle.left,
              width: popupStyle.width,
              backgroundColor: C.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: C.border,
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 12,
              paddingHorizontal: 10,
              paddingTop: 10,
              paddingBottom: 10,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 8 }}>
              <View style={{ width: 34, height: 4, borderRadius: 2, backgroundColor: C.border }} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.t1, marginBottom: 8 }}>
              {dateSheet === "from" ? "Select From Date" : "Select To Date"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => setCalendarMonth((current) => addMonths(current, -1))}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.card }}
              >
                <Ionicons name="chevron-back" size={15} color={C.t2} />
              </TouchableOpacity>
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.t1 }}>{formatCalendarTitle(visibleMonth)}</Text>
              <TouchableOpacity
                onPress={() => setCalendarMonth((current) => addMonths(current, 1))}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.card }}
              >
                <Ionicons name="chevron-forward" size={15} color={C.t2} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 4 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <View key={`${day}-${index}`} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.t3 }}>{day}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`empty-${index}`} style={{ width: `${100 / 7}%`, height: 32 }} />;
                }
                const selected = isSameDate(draftDate, cell);
                const otherMonth = !isSameMonth(cell, visibleMonth);
                const today = isSameDate(cell, new Date());
                return (
                  <TouchableOpacity
                    key={cell.toISOString()}
                    onPress={() => {
                      setDraftDate(new Date(cell));
                      if (dateSheet === "from") setDateFrom(formatDateParam(cell));
                      else setDateTo(formatDateParam(cell));
                      setPage(1);
                      setDateSheet(null);
                    }}
                    style={{ width: `${100 / 7}%`, height: 32, padding: 1 }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 7,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: selected ? C.accent : "transparent",
                        borderWidth: today && !selected ? 1 : 0,
                        borderColor: today && !selected ? C.accent : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? C.white : (otherMonth ? C.t4 : C.t1) }}>
                        {cell.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setDraftDate(null);
                  if (dateSheet === "from") setDateFrom("");
                  else setDateTo("");
                  setPage(1);
                  setDateSheet(null);
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.accent }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const today = new Date();
                  setDraftDate(today);
                  const value = formatDateParam(today);
                  if (dateSheet === "from") setDateFrom(value);
                  else setDateTo(value);
                  setCalendarMonth(startOfMonth(today));
                  setPage(1);
                  setDateSheet(null);
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.accent }}>Today</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Error */}
      {error ? (
        <View style={{ margin: 12, backgroundColor: C.dangerBg, borderRadius: 10, padding: 12 }}>
          <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {/* List */}
      <FlatList
        data={pickLists}
        keyExtractor={(item) => item.wave_id || item.pick_list_id}
        renderItem={({ item }) => <PickListItem item={item} onPress={handlePress} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadList(true); }}
            tintColor={C.accent}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={{ fontSize: 14, color: C.t3 }}>Loading pick lists…</Text>
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <Ionicons name="clipboard-outline" size={40} color={C.t4} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: C.t2 }}>No pick lists found</Text>
              <Text style={{ fontSize: 13, color: C.t3 }}>Try adjusting your filters</Text>
            </View>
          )
        }
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border }}>
          <Text style={{ fontSize: 12, color: C.t3 }}>{total} result{total !== 1 ? "s" : ""} · Page {page} of {totalPages}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              disabled={page <= 1}
              onPress={() => setPage((p) => p - 1)}
              style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, opacity: page <= 1 ? 0.4 : 1 }}
            >
              <Ionicons name="chevron-back" size={14} color={C.t1} />
              <Text style={{ fontSize: 13, color: C.t1 }}>Prev</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={page >= totalPages}
              onPress={() => setPage((p) => p + 1)}
              style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, opacity: page >= totalPages ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 13, color: C.t1 }}>Next</Text>
              <Ionicons name="chevron-forward" size={14} color={C.t1} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
