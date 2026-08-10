import { useEffect, useMemo, useRef, useState } from "react";
import { GlossaryRegistry, GlossaryTerm } from "@/components/shared/GlossaryTooltip";
import { Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { TraceContextCard } from "@/components/trace/TraceContextCard";
import { TraceTimelineCard } from "@/components/trace/TraceTimelineCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTraceEvents } from "@/hooks/useTraceEvents";
import { toSessionContext } from "@/services/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT     = "#3b5bdb";
const T_PRIMARY  = "#111827";
const T_SECONDARY = "#374151";
const T_LABEL    = "#6b7280";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnPrimary = { ...btnBase, height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: ACCENT, color: "#fff" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };

const cardStyle = {
  background: "#fff", borderRadius: 12,
  border: "0.5px solid #e8ebf8", overflow: "hidden",
  boxShadow: "0 2px 10px rgba(59,91,219,.07)",
};

// ── Constants ─────────────────────────────────────────────────────────────────
const defaultPageSize = 20;
const pageSizeOptions = new Set([10, 20, 50]);
const allowedTypes    = new Set(["sku", "epc", "grn", "do", "rma", "put", "asn", "adj", "location", "reference"]);

const filterTypeLabels = {
  sku: "SKU", epc: "EPC", grn: "GRN", do: "DO", rma: "RMA",
  put: "PUT", asn: "ASN", adj: "ADJ", location: "Location", reference: "Reference",
};

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All Events" },
  { value: "received", label: "Received" },
  { value: "putaway",  label: "Putaway" },
  { value: "picked",   label: "Picked" },
  { value: "shipped",  label: "Shipped" },
  { value: "returned", label: "Returned" },
];

const STAT_CFG = [
  { key: "received", label: "Received", bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
  { key: "putaway",  label: "Putaway",  bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
  { key: "picked",   label: "Picked",   bg: "#fef9c3", color: "#713f12", border: "#fde68a" },
  { key: "shipped",  label: "Shipped",  bg: "#dcfce7", color: "#065f46", border: "#86efac" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizePage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function sanitizePageSize(value) {
  const parsed = Number(value);
  if (!pageSizeOptions.has(parsed)) return defaultPageSize;
  return parsed;
}

function parseQueryState(searchParams) {
  const mode     = String(searchParams.get("mode") || "global").toLowerCase() === "filtered" ? "filtered" : "global";
  const type     = String(searchParams.get("type") || "").toLowerCase();
  const value    = String(searchParams.get("value") || "").trim();
  const page     = sanitizePage(searchParams.get("page") || 1);
  const pageSize = sanitizePageSize(searchParams.get("pageSize") || defaultPageSize);
  if (mode === "filtered" && allowedTypes.has(type) && value) {
    return { mode: "filtered", filter: { type, value }, page, pageSize };
  }
  return { mode: "global", filter: null, page, pageSize };
}

function buildQueryString({ mode, filter, page, pageSize }) {
  const params = new URLSearchParams();
  if (mode === "filtered" && filter?.type && filter?.value) {
    params.set("mode", "filtered");
    params.set("type", filter.type);
    params.set("value", filter.value);
  }
  if (page > 1) params.set("page", String(page));
  if (pageSize !== defaultPageSize) params.set("pageSize", String(pageSize));
  return params.toString();
}

function inferFilterFromInput(rawInput) {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper.startsWith("SKU")) return { type: "sku",      value: trimmed };
  if (upper.startsWith("EPC")) return { type: "epc",      value: trimmed };
  if (upper.startsWith("GRN")) return { type: "grn",      value: trimmed };
  if (upper.startsWith("DO"))  return { type: "do",       value: trimmed };
  if (upper.startsWith("RMA")) return { type: "rma",      value: trimmed };
  if (upper.startsWith("PUT")) return { type: "put",      value: trimmed };
  if (upper.startsWith("ASN")) return { type: "asn",      value: trimmed };
  if (upper.startsWith("ADJ")) return { type: "adj",      value: trimmed };
  return { type: "location", value: trimmed };
}

function mapReferenceTypeToFilterType(referenceType) {
  const normalized = String(referenceType || "").trim().toLowerCase();
  if (["grn", "do", "rma", "put", "asn", "adj"].includes(normalized)) return normalized;
  return "reference";
}

function toFilterLabel(filterType) {
  return filterTypeLabels[filterType] || "Reference";
}

// ── Page ──────────────────────────────────────────────────────────────────────
const TracePage = () => {
  const auth    = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryState            = useMemo(() => parseQueryState(searchParams), [searchParams]);
  const initialQueryStateRef  = useRef(queryState);

  const trace = useTraceEvents({ session, initialQuery: initialQueryStateRef.current });
  const { setStateFromQuery } = trace;

  const [searchValue,     setSearchValue]     = useState(initialQueryStateRef.current.filter?.value || "");
  const [eventTypeFilter, setEventTypeFilter] = useState("");

  useEffect(() => { setStateFromQuery(queryState); }, [setStateFromQuery, queryState]);

  useEffect(() => {
    if (trace.isFiltered && trace.filter?.value) { setSearchValue(trace.filter.value); return; }
    if (!trace.isFiltered) setSearchValue("");
  }, [trace.isFiltered, trace.filter?.type, trace.filter?.value]);

  const nextQueryString = useMemo(() => buildQueryString({
    mode: trace.mode, filter: trace.filter, page: trace.page, pageSize: trace.pageSize,
  }), [trace.mode, trace.filter, trace.page, trace.pageSize]);

  useEffect(() => {
    const currentQueryString = searchParams.toString();
    if (nextQueryString === currentQueryString) return;
    setSearchParams(nextQueryString ? new URLSearchParams(nextQueryString) : new URLSearchParams(), { replace: true });
  }, [nextQueryString, searchParams, setSearchParams]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    const filter = inferFilterFromInput(searchValue);
    if (!filter) { trace.clearFilter(); return; }
    trace.applyFilter(filter);
  };

  const onSkuFilter       = (sku)            => { if (sku)   trace.applyFilter({ type: "sku", value: sku }); };
  const onReferenceFilter = ({ type, value }) => { if (value) trace.applyFilter({ type: mapReferenceTypeToFilterType(type), value }); };

  const handleClearFilter = () => {
    trace.clearFilter();
    setSearchValue("");
    setEventTypeFilter("");
  };

  const filteredEvents = useMemo(() => {
    if (!eventTypeFilter) return trace.events;
    return trace.events.filter((e) => String(e.eventType || "").toLowerCase() === eventTypeFilter);
  }, [trace.events, eventTypeFilter]);

  const eventStats = useMemo(() => {
    const counts = {};
    trace.events.forEach((e) => {
      const t = String(e.eventType || "other").toLowerCase();
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [trace.events]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <GlossaryRegistry>
    <AppLayout>
      <Breadcrumbs items={[{ label: "Trace (QR/RF)" }]} />

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>
          {trace.isFiltered ? `Tracking: ${trace.filter?.value || "Item"}` : "Trace & Visibility"}
        </h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>
          {trace.isFiltered
            ? `Showing full journey for ${toFilterLabel(trace.filter?.type)}: ${trace.filter?.value} — from receiving to shipping.`
            : "Track any item's movement within the warehouse. Search by SKU, GRN, location, or scan reference."}
        </p>
      </div>

      {/* No tenant */}
      {!session.tenant_id && (
        <div style={{ ...cardStyle, padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>
          Select a tenant before using the Trace module.
        </div>
      )}

      {session.tenant_id && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Search bar */}
          <div style={cardStyle}>
            <div style={{ padding: "12px 16px 14px" }}>
              <form onSubmit={onSearchSubmit}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>

                  {/* Search input */}
                  <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                    <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280", pointerEvents: "none" }} />
                    <input
                      style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 32px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff", boxSizing: "border-box" }}
                      placeholder="e.g. SKU000001, GRN000143, A-01-001, PUT000210…"
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                    />
                    {searchValue && (
                      <button
                        type="button"
                        style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T_LABEL, display: "flex", alignItems: "center" }}
                        onClick={() => setSearchValue("")}
                      >
                        <X style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </div>

                  {/* Event type filter — global mode only */}
                  {!trace.isFiltered && (
                    <Select value={eventTypeFilter || "all"} onValueChange={(v) => setEventTypeFilter(v === "all" ? "" : v)}>
                      <SelectTrigger style={{ height: 40, width: 160, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                        <SelectValue placeholder="All Events" />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value || "all"} value={opt.value || "all"}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <button type="submit" style={{ ...btnPrimary, opacity: trace.loading ? 0.6 : 1 }} disabled={trace.loading}>
                    <Search style={{ width: 13, height: 13 }} />
                    Search
                  </button>
                  {trace.isFiltered && (
                    <button type="button" style={btnNeutral} onClick={handleClearFilter} disabled={trace.loading}>
                      <X style={{ width: 13, height: 13 }} />
                      Clear
                    </button>
                  )}
                </div>

                <p style={{ fontSize: 12, color: T_LABEL, marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 4px" }}>
                  Tip: System auto-detects type — SKU, <GlossaryTerm term="GRN" />, PUT, <GlossaryTerm term="ASN" />, <GlossaryTerm term="RMA" />, ADJ, or location code.
                </p>
              </form>
            </div>
          </div>

          {/* Summary stat cards — global mode only */}
          {!trace.isFiltered && !trace.loading && trace.events.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              {STAT_CFG.map(({ key, label, bg, color, border }) => {
                const isActive = eventTypeFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEventTypeFilter(isActive ? "" : key)}
                    style={{
                      background: isActive ? bg : "#fff",
                      borderRadius: 10,
                      border: `0.5px solid ${isActive ? border : "#e8ebf8"}`,
                      boxShadow: isActive ? `0 0 0 2px ${border}` : "0 2px 8px rgba(59,91,219,.06)",
                      padding: "14px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      fontFamily: "inherit",
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</p>
                    <p style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{eventStats[key] || 0}</p>
                    <p style={{ fontSize: 12, color: T_LABEL }}>events</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Context card — filtered mode only (external component, untouched) */}
          {trace.isFiltered && (
            <TraceContextCard filter={trace.filter} context={trace.context} />
          )}

          {/* Timeline (external component, untouched) */}
          <TraceTimelineCard
            mode={trace.mode}
            events={filteredEvents}
            loading={trace.loading}
            error={trace.error}
            page={trace.pagination.page}
            pageSize={trace.pagination.pageSize}
            total={filteredEvents.length || trace.pagination.total}
            totalPages={trace.pagination.totalPages}
            onPageChange={trace.setPage}
            onPageSizeChange={trace.setPageSize}
            onClearFilter={handleClearFilter}
            onSkuClick={onSkuFilter}
            onReferenceClick={onReferenceFilter}
            eventTypeFilter={eventTypeFilter}
          />
        </div>
      )}
    </AppLayout>
    </GlossaryRegistry>
  );
};

export default TracePage;
