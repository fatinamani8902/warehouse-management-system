// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, RefreshControl,
  Text, TextInput, TouchableOpacity, View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetchShipments } from "@/services/api";
import { useRouter } from "expo-router";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { formatDate, formatDateTime } from "@/utils/dateTimeFormatter";

const C = {
  accent:      "#3b5bdb",
  accentLight: "#eef2ff",
  bg:          "#f4f6fb",
  card:        "#ffffff",
  border:      "#e8eaf0",
  borderLight: "#f1f5f9",
  t1:          "#111827",
  t2:          "#374151",
  t3:          "#6b7280",
  t4:          "#9ca3af",
  white:       "#ffffff",
  success:     "#16a34a",
  successBg:   "#dcfce7",
  successBdr:  "#86efac",
  warning:     "#d97706",
  warningBg:   "#fef3c7",
  warningBdr:  "#fde68a",
  danger:      "#dc2626",
  dangerBg:    "#fee2e2",
  dangerBdr:   "#fca5a5",
};

const STATUS_CFG = {
  pending:          { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: "Pending" },
  packed:           { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Ready to Dispatch" },
  carton_generated: { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6", label: "Ready to Dispatch" },
  dispatched:       { bg: "#fef9c3", color: "#713f12", dot: "#eab308", label: "Dispatched" },
  closed:           { bg: "#dcfce7", color: "#065f46", dot: "#22c55e", label: "Closed" },
  cancelled:        { bg: "#fee2e2", color: "#991b1b", dot: "#ef4444", label: "Cancelled" },
};

const STATUS_FILTERS = [
  { value: "",           label: "All Statuses" },
  { value: "pending",    label: "Pending"    },
  { value: "packed",     label: "Ready to Dispatch" },
  { value: "dispatched", label: "Dispatched" },
  { value: "closed",     label: "Closed"     },
  { value: "cancelled",  label: "Cancelled"  },
];

const PAGE_SIZE = 10;
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

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

function buildMonthGrid(anchor: Date) {
  const first = startOfMonth(anchor);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatCalendarTitle(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function requiredShipByValue(item) {
  return item?.required_ship_by || item?.ship_by || item?.dispatch_due_at || "";
}

function parseLocalDate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isShipmentOverdue(item) {
  const status = String(item?.status || "").toLowerCase();
  if (status === "closed" || status === "cancelled") return false;
  const dueDate = parseLocalDate(requiredShipByValue(item));
  if (!dueDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dueDate < today;
}

function StatusBadge({ status }) {
  const key = (status || "").toLowerCase();
  const c   = STATUS_CFG[key] || { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: status };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: c.color }}>{c.label}</Text>
    </View>
  );
}

function SummaryCard({ label, value, status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <View style={{
      flex: 1,
      minWidth: 94,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      padding: 10,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
        <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: "700", color: C.t3, textTransform: "uppercase" }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 20, fontWeight: "800", color: c.color }}>{Number(value || 0)}</Text>
    </View>
  );
}

function ShipmentCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const isDispatched = item.status === "dispatched";
  const isClosed     = item.status === "closed";
  const isPending    = item.status === "pending";
  const requiredShipBy = requiredShipByValue(item);
  const overdue = isShipmentOverdue(item);

  return (
    <TouchableOpacity
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.85}
      style={{
        backgroundColor: C.card, borderRadius: 12, padding: 14,
        marginBottom: 10, borderWidth: 1,
        borderColor: expanded ? C.accent : C.border,
      }}
    >
      {/* Top row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between",
        alignItems: "center", marginBottom: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.t1, fontFamily: "monospace" }}>
          {item.shipment_id}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {overdue && (
            <View style={{ backgroundColor: C.dangerBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: C.danger }}>Overdue</Text>
            </View>
          )}
          <StatusBadge status={item.status} />
        </View>
      </View>

      {/* Customer */}
      <Text style={{ fontSize: 14, fontWeight: "600", color: C.t2, marginBottom: 10 }}>
        {item.customer_name || "Pending Assignment"}
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontSize: 12, color: C.t3 }}>Required Ship By</Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: overdue ? C.danger : C.t1 }}>
          {formatDate(requiredShipBy)}
        </Text>
      </View>

      {/* Pack IDs */}
      {Array.isArray(item.pack_ids) && item.pack_ids.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
          marginBottom: 8, flexWrap: "wrap" }}>
          <Text style={{ fontSize: 11, color: C.t3, fontWeight: "600",
            textTransform: "uppercase", letterSpacing: 0.5 }}>Packs:</Text>
          {item.pack_ids.map((pid) => (
            <View key={pid} style={{ backgroundColor: C.accentLight, borderRadius: 6,
              paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.accent,
                fontFamily: "monospace" }}>{pid}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Items list — fixed: was orphaned outside ShipmentCard */}
      {Array.isArray(item.items) && item.items.length > 0 && (
        <View style={{ backgroundColor: "#f8fafc", borderRadius: 10,
          borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 10 }}>
          <Text style={{ fontSize: 11, color: C.t3, fontWeight: "600",
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Items ({item.items.length})
          </Text>
          {item.items.map((itm, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between",
              alignItems: "center", marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.t1,
                fontFamily: "monospace" }}>
                {itm.sku_id}
              </Text>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: C.t3 }}>{itm.location_id}</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.accent }}>
                  Qty: {itm.qty}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Dispatched — show tracking prominently */}
      {isDispatched && item.tracking_no && (
        <View style={{ backgroundColor: C.warningBg, borderRadius: 10,
          borderWidth: 1, borderColor: C.warningBdr, padding: 10, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, color: C.warning, fontWeight: "600",
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Tracking Number
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "800", color: C.warning,
            fontFamily: "monospace" }}>
            {item.tracking_no}
          </Text>
          {item.carrier && (
            <Text style={{ fontSize: 12, color: C.warning, marginTop: 2 }}>
              via {item.carrier}
            </Text>
          )}
        </View>
      )}

      {/* Closed */}
      {isClosed && (
        <View style={{ backgroundColor: C.successBg, borderRadius: 10,
          borderWidth: 1, borderColor: C.successBdr, padding: 10, marginBottom: 8,
          flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="checkmark-circle" size={18} color={C.success} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.success }}>
            Shipment Closed
          </Text>
        </View>
      )}

      {/* Pending */}
      {isPending && (
        <View style={{ backgroundColor: "#f8fafc", borderRadius: 10,
          borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8,
          flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="time-outline" size={16} color={C.t3} />
          <Text style={{ fontSize: 12, color: C.t3, flex: 1 }}>
            Awaiting carrier assignment from portal
          </Text>
        </View>
      )}

      {/* Expand indicator */}
      <View style={{ flexDirection: "row", justifyContent: "space-between",
        alignItems: "center", marginTop: 4 }}>
        <Text style={{ fontSize: 11, color: C.t4 }}>
          {expanded ? "Tap to collapse" : "Tap for details"}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={C.t4} />
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={{ marginTop: 12, paddingTop: 12,
          borderTopWidth: 1, borderTopColor: C.borderLight }}>

          {item.carrier && !isDispatched && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: C.t3 }}>Carrier</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.t1 }}>{item.carrier}</Text>
            </View>
          )}

          {item.tracking_no && !isDispatched && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: C.t3 }}>Tracking</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.t1,
                fontFamily: "monospace" }}>{item.tracking_no}</Text>
            </View>
          )}

          {item.dispatched_at && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: C.t3 }}>Dispatched At</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.t1 }}>
                {formatDateTime(item.dispatched_at)}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: C.t3 }}>Created</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.t1 }}>
              {formatDateTime(item.created_at)}
            </Text>
          </View>

          {item.cancellation_reason && (
            <View style={{ backgroundColor: C.dangerBg, borderRadius: 8,
              padding: 10, marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: C.danger, fontWeight: "600",
                marginBottom: 3 }}>Cancellation Reason</Text>
              <Text style={{ fontSize: 13, color: C.danger }}>{item.cancellation_reason}</Text>
            </View>
          )}

          {/* View only notice */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
            backgroundColor: C.accentLight, borderRadius: 8, padding: 10,
            marginTop: 10, borderWidth: 1, borderColor: "#c7d2fe" }}>
            <Ionicons name="eye-outline" size={13} color={C.accent} />
            <Text style={{ fontSize: 12, color: C.accent, flex: 1 }}>
              Shipping actions are managed from the web portal.
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ShippingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const fromDateBoxRef = useRef<View | null>(null);
  const toDateBoxRef = useRef<View | null>(null);

  const [items,        setItems]        = useState([]);
  const [summary,      setSummary]      = useState({ pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 });
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedStatusLabel = STATUS_FILTERS.find((item) => item.value === statusFilter)?.label || "All Statuses";
  const dateRangeError = dateFrom && dateTo && dateTo < dateFrom
    ? "To Date cannot be earlier than From Date."
    : "";
  const calendarCells = buildMonthGrid(calendarMonth);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      if (dateRangeError) {
        setItems([]);
        setTotal(0);
        setSummary({ pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 });
        setError(dateRangeError);
        return;
      }
      const res = await fetchShipments({
        page,
        pageSize: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });
      const raw = res?.data;
      setItems(raw?.data ?? raw?.items ?? []);
      setTotal(raw?.total ?? 0);
      setSummary(raw?.summary ?? { pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load shipments");
      setItems([]);
      setSummary({ pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateRangeError, dateTo, page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load());

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
        setPopupRect({ top, left, width: sheetWidth });
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
          top: popupRect.top,
          left: popupRect.left,
          width: popupRect.width,
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
            if (!cell) return <View key={`empty-${index}`} style={{ width: `${100 / 7}%`, height: 32 }} />;
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

      {/* Header */}
      <View style={{ backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.push("/(app)")} style={{ marginRight: 10 }}>
            <Ionicons name="arrow-back" size={22} color={C.accent} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: C.t1 }}>Shipping</Text>
            <Text style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>View outbound shipments</Text>
          </View>
        </View>
      </View>

      {/* Search + filters */}
      <View style={{ backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: C.borderLight, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.bg,
          borderRadius: 8, borderWidth: 1, borderColor: C.border,
          paddingHorizontal: 10, height: 38 }}>
          <Ionicons name="search-outline" size={15} color={C.t4} style={{ marginRight: 6 }} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: C.t1, padding: 0 }}
            placeholder="Search shipment, order, customer, carrier, tracking..."
            placeholderTextColor={C.t4}
            value={search}
            onChangeText={(v) => { setSearch(v); setPage(1); }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!search && (
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
              {STATUS_FILTERS.map((opt, index) => {
                const active = statusFilter === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value || "all"}
                    onPress={() => { setStatusFilter(opt.value); setStatusOpen(false); setPage(1); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: active ? C.accentLight : C.card, borderBottomWidth: index === STATUS_FILTERS.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
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
            onPress={() => load(true)}
            style={{ flex: 1, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.accent }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.white }}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {popupTouchTarget}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingTop: 10 }}>
        <SummaryCard label="Pending" value={summary.pending} status="pending" />
        <SummaryCard label="Ready" value={summary.packed} status="packed" />
        <SummaryCard label="Dispatched" value={summary.dispatched} status="dispatched" />
        <SummaryCard label="Closed" value={summary.closed} status="closed" />
        <SummaryCard label="Cancelled" value={summary.cancelled} status="cancelled" />
      </View>

      {/* Error */}
      {!!error && (
        <View style={{ margin: 12, backgroundColor: C.dangerBg, borderRadius: 10, padding: 12 }}>
          <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ fontSize: 14, color: C.t3 }}>Loading shipments…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.shipment_id}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={C.accent}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <Ionicons name="boat-outline" size={40} color={C.t4} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: C.t2 }}>No shipments found</Text>
              <Text style={{ fontSize: 13, color: C.t3 }}>Try adjusting your filters</Text>
            </View>
          }
          renderItem={({ item }) => <ShipmentCard item={item} />}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={{ flexDirection: "row", alignItems: "center",
                justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 12 }}>
                <Text style={{ fontSize: 12, color: C.t3 }}>
                  {total} result{total !== 1 ? "s" : ""} · Page {page} of {totalPages}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    disabled={page <= 1}
                    onPress={() => setPage(p => p - 1)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 2,
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7,
                      borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
                      opacity: page <= 1 ? 0.4 : 1 }}
                  >
                    <Ionicons name="chevron-back" size={14} color={C.t1} />
                    <Text style={{ fontSize: 13, color: C.t1 }}>Prev</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={page >= totalPages}
                    onPress={() => setPage(p => p + 1)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 2,
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7,
                      borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
                      opacity: page >= totalPages ? 0.4 : 1 }}
                  >
                    <Text style={{ fontSize: 13, color: C.t1 }}>Next</Text>
                    <Ionicons name="chevron-forward" size={14} color={C.t1} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
