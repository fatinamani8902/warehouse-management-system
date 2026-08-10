import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/authStore";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { apiClient } from "@/services/api";
import { normalizeRole } from "@/services/rbac";
import { buildSessionHeaders } from "@/utils/sessionHeaders";
import { formatKg } from "@/utils/formatKg";

const C = {
  bg:         "#f4f6fb",
  card:       "#ffffff",
  border:     "#e8eaf0",
  borderLight:"#eef0fc",
  accent:     "#3b5bdb",
  accentSoft: "#eef2ff",
  accentLight:"#eef2ff",
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
};

interface PackOrder {
  pack_id: string;
  pick_list_id: string;
  pick_list_status: string;
  status: string;
  packaging_type?: string;
  weight_kg?: number;
  carton_id?: string;
  created_at: string;
  packed_at?: string;
}

function usePackingApi() {
  const token       = useAuthStore((s: any) => s.token);
  const tenantId    = useAuthStore((s: any) => s.user?.tenant_id ?? "");
  const warehouseId = useAuthStore((s: any) => s.user?.warehouse_id ?? s.user?.warehouse_ids?.[0] ?? "");
  const userId      = useAuthStore((s: any) => s.user?.user_id ?? "");
  const roleId      = useAuthStore((s: any) => s.user?.role_id ?? "");

  const requestHeaders = useMemo(() => buildSessionHeaders({
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    user_id: userId,
    role_id: roleId,
  }), [tenantId, warehouseId, userId, roleId]);

  const get = useCallback(async (path: string, params?: Record<string, string | number | undefined>): Promise<any> => {
    const res = await apiClient.get(path, {
      params,
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        ...requestHeaders,
      },
    });
    return res.data;
  }, [requestHeaders, token]);

  return { get };
}

const STATUS_CFG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  draft:            { bg: "#f3f4f6", color: "#111827", dot: "#6b7280", label: "Draft" },
  pending:          { bg: "#f3f4f6", color: "#111827", dot: "#6b7280", label: "Draft" },
  in_progress:      { bg: "#fef3c7", color: "#92400e", dot: "#eab308", label: "In Progress" },
  carton_generated: { bg: "#fef3c7", color: "#92400e", dot: "#eab308", label: "In Progress" },
  packed:           { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Packed" },
  completed:        { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Packed" },
  shipped:          { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Packed" },
  cancelled:        { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af", label: "Cancelled" },
};

function StatusBadge({ status }: { status: string }) {
  const key = String(status ?? "").toLowerCase().replace(/ /g, "_");
  const c = STATUS_CFG[key] ?? { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: status ?? "—" };
  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: c.bg,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: c.color }}>{c.label}</Text>
    </View>
  );
}

function formatCardDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-GB");
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

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
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(toCellDate(first.getFullYear(), first.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatCalendarTitle(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function PackCard({ item, onPress }: { item: PackOrder; onPress: () => void }) {
  const statusKey = String(item.status || "").toLowerCase();
  const isDraft = statusKey === "draft" || statusKey === "pending";
  const isPacked = ["packed", "shipped"].includes(statusKey);
  const message = isPacked ? "Packed - ready for shipping" : isDraft ? "Draft packing task" : "Waiting for packing";
  const messageColor = isPacked ? C.success : isDraft ? C.t3 : C.warning;
  const timestampLabel = item.packed_at ? "Packed" : "Created";
  const timestamp = formatCardDate(item.packed_at || item.created_at) || "Pending";

  const InfoColumn = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flex: 1, minWidth: 0, flexShrink: 1 }}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 11, color: C.t3, marginBottom: 3 }}>
        {label}
      </Text>
      <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 13, fontWeight: "600", color: C.t2, flexShrink: 1 }}>
        {value || "—"}
      </Text>
    </View>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
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
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: C.t1,
            flex: 1,
            flexShrink: 1,
            fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
          }}
        >
          {item.pack_id}
        </Text>
        <StatusBadge status={item.status} />
      </View>

      <View style={{ flexDirection: "row", columnGap: 14, marginBottom: 12 }}>
        <InfoColumn label="Pick List" value={item.pick_list_id ?? "—"} />
        <InfoColumn label="Carton" value={item.carton_id ?? "—"} />
        <InfoColumn label="Weight" value={formatKg(item.weight_kg)} />
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
        </View>
        <Text style={{ fontSize: 14, color: C.t4, paddingLeft: 8 }}>{">"}</Text>
      </View>
    </TouchableOpacity>
  );
}

const STATUS_FILTERS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "packed", label: "Packed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function PackingIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { get } = usePackingApi();
  const user = useAuthStore((s) => s.user);
  const roleId = user?.role_id || "readonly";
  const normalizedRole = normalizeRole(roleId);
  const isOperator = normalizedRole === "storeoperator";
  const fromDateBoxRef = useRef<View | null>(null);
  const toDateBoxRef = useRef<View | null>(null);

  const [orders, setOrders] = useState<PackOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [dateSheet, setDateSheet] = useState<"from" | "to" | null>(null);
  const [draftDate, setDraftDate] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(startOfMonth(new Date()));
  const [popupRect, setPopupRect] = useState({ top: 0, left: 12, width: 300 });

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dateRangeError = dateFrom && dateTo && dateTo < dateFrom
    ? "To Date cannot be earlier than From Date."
    : "";
  const selectedStatusLabel = STATUS_FILTERS.find((item) => item.value === status)?.label || "All Statuses";
  const calendarCells = buildMonthGrid(calendarMonth);
  const popupStyle = { top: popupRect.top, left: popupRect.left, width: popupRect.width };

  const load = useCallback(async (p = 1, refresh = false) => {
    try {
      if (refresh) setRefreshing(true); else setLoading(true);
      setError("");
      if (dateRangeError) {
        setOrders([]);
        setTotal(0);
        setError(dateRangeError);
        return;
      }
      const params = {
        page: String(p),
        pageSize: String(PAGE_SIZE),
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        ...(isOperator ? { assigned_user: user?.user_id ?? "" } : {}),
      };
      const res = await get("/packing/orders", params);
      const items: PackOrder[] = res?.data ?? [];
      if (p === 1) setOrders(items);
      else setOrders((prev) => [...prev, ...items]);
      setTotal(res?.total ?? 0);
      setPage(p);
    } catch (e: any) {
      setError(e.message ?? "Failed to load packing orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [PAGE_SIZE, dateFrom, dateRangeError, dateTo, get, isOperator, search, status, user?.user_id]);

  useEffect(() => { load(1); }, [load]);
  useAutoRefresh(() => load(page));

  const loadMore = () => {
    if (page < totalPages && !loading) load(page + 1);
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("");
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

  const clearSingleDate = (field: "from" | "to") => {
    if (field === "from") setDateFrom("");
    else setDateTo("");
    if (dateSheet === field) setDraftDate(null);
    setPage(1);
  };

  const popupVisible = Boolean(dateSheet);
  const popupTouchTarget = popupVisible ? (
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
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.t1 }}>{formatCalendarTitle(calendarMonth)}</Text>
          <TouchableOpacity
            onPress={() => setCalendarMonth((current) => addMonths(current, 1))}
            style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.card }}
          >
            <Ionicons name="chevron-forward" size={15} color={C.t2} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", marginBottom: 4 }}>
          {WEEKDAYS.map((day, index) => (
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
            const otherMonth = !isSameMonth(cell, calendarMonth);
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
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={{ backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <TouchableOpacity onPress={() => router.push("/(app)")} style={{ marginRight: 10 }}>
            <Ionicons name="arrow-back" size={22} color={C.accent} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: C.t1 }}>Packing</Text>
            <Text style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>View and manage packing orders</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 38, marginBottom: 10 }}>
          <Ionicons name="search-outline" size={16} color={C.t3} style={{ marginRight: 6 }} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: C.t1, padding: 0 }}
            placeholder="Search pack ID, wave, carton, order, customer..."
            placeholderTextColor={C.t4}
            value={search}
            onChangeText={(v) => { setSearch(v); setPage(1); }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={() => load(1)}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
              <Ionicons name="close-circle" size={16} color={C.t3} />
            </TouchableOpacity>
          ) : null}
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
              {STATUS_FILTERS.map((opt) => {
                const active = status === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value || "all"}
                    onPress={() => { setStatus(opt.value); setStatusOpen(false); setPage(1); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: active ? C.accentLight : C.card, borderBottomWidth: opt.value === "cancelled" ? 0 : 1, borderBottomColor: C.borderLight }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: active ? "700" : "500", color: active ? C.accent : C.t2 }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
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
          <Text style={{ fontSize: 12, color: C.danger, fontWeight: "600", marginTop: 8 }}>{dateRangeError}</Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <TouchableOpacity
            onPress={clearFilters}
            style={{ flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.card }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.t2 }}>Clear Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => load(page, true)}
            style={{ flex: 1, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.accent }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.white }}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {popupTouchTarget}

      {error ? (
        <View style={{ margin: 12, backgroundColor: C.dangerBg, borderRadius: 10, borderWidth: 1, borderColor: C.dangerBdr, padding: 12 }}>
          <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading && page === 1 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ fontSize: 14, color: C.t3 }}>Loading packing orders...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.pack_id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
          renderItem={({ item }) => <PackCard item={item} onPress={() => router.push(`/packing/${item.pack_id}`)} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 48 }}>
              <Ionicons name="cube-outline" size={40} color={C.t4} style={{ marginBottom: 12 }} />
              <Text style={{ fontSize: 14, color: C.t3 }}>No packing orders found.</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(page, true)}
              tintColor={C.accent}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loading && page > 1
              ? <ActivityIndicator color={C.accent} style={{ marginVertical: 16 }} />
              : null
          }
        />
      )}
    </View>
  );
}
