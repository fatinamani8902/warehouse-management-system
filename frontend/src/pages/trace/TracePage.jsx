import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { TraceContextCard } from "@/components/trace/TraceContextCard";
import { TraceTimelineCard } from "@/components/trace/TraceTimelineCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTraceEvents } from "@/hooks/useTraceEvents";
import { toSessionContext } from "@/services/api";

const defaultPageSize = 20;
const pageSizeOptions = new Set([10, 20, 50]);
const allowedTypes = new Set(["sku", "epc", "grn", "do", "rma", "put", "asn", "adj", "location", "reference"]);

const filterTypeLabels = {
  sku: "SKU", epc: "EPC", grn: "GRN", do: "DO", rma: "RMA",
  put: "PUT", asn: "ASN", adj: "ADJ", location: "Location", reference: "Reference",
};

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
  const mode = String(searchParams.get("mode") || "global").toLowerCase() === "filtered" ? "filtered" : "global";
  const type = String(searchParams.get("type") || "").toLowerCase();
  const value = String(searchParams.get("value") || "").trim();
  const page = sanitizePage(searchParams.get("page") || 1);
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
  if (upper.startsWith("SKU")) return { type: "sku", value: trimmed };
  if (upper.startsWith("EPC")) return { type: "epc", value: trimmed };
  if (upper.startsWith("GRN")) return { type: "grn", value: trimmed };
  if (upper.startsWith("DO"))  return { type: "do",  value: trimmed };
  if (upper.startsWith("RMA")) return { type: "rma", value: trimmed };
  if (upper.startsWith("PUT")) return { type: "put", value: trimmed };
  if (upper.startsWith("ASN")) return { type: "asn", value: trimmed };
  if (upper.startsWith("ADJ")) return { type: "adj", value: trimmed };
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

// Event type filter options for global mode
const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All Events" },
  { value: "received", label: "Received" },
  { value: "putaway", label: "Putaway" },
  { value: "picked", label: "Picked" },
  { value: "shipped", label: "Shipped" },
  { value: "returned", label: "Returned" },
];

const TracePage = () => {
  const auth = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryState = useMemo(() => parseQueryState(searchParams), [searchParams]);
  const initialQueryStateRef = useRef(queryState);

  const trace = useTraceEvents({ session, initialQuery: initialQueryStateRef.current });
  const { setStateFromQuery } = trace;

  const [searchValue, setSearchValue] = useState(initialQueryStateRef.current.filter?.value || "");
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

  const onSearchSubmit = (event) => {
    event.preventDefault();
    const filter = inferFilterFromInput(searchValue);
    if (!filter) { trace.clearFilter(); return; }
    trace.applyFilter(filter);
  };

  const onSkuFilter = (sku) => { if (sku) trace.applyFilter({ type: "sku", value: sku }); };
  const onReferenceFilter = ({ type, value }) => { if (value) trace.applyFilter({ type: mapReferenceTypeToFilterType(type), value }); };

  const handleClearFilter = () => {
    trace.clearFilter();
    setSearchValue("");
    setEventTypeFilter("");
  };

  // Filter events by event type (client-side) for global mode
  const filteredEvents = useMemo(() => {
    if (!eventTypeFilter) return trace.events;
    return trace.events.filter((e) => String(e.eventType || "").toLowerCase() === eventTypeFilter);
  }, [trace.events, eventTypeFilter]);

  // Summary stats from events
  const eventStats = useMemo(() => {
    const counts = {};
    trace.events.forEach((e) => {
      const t = String(e.eventType || "other").toLowerCase();
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [trace.events]);

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Trace (QR/RF)" }]} />

      <div className="mb-4">
        <h1 className="text-2xl font-bold">
          {trace.isFiltered ? `Tracking: ${trace.filter?.value || "Item"}` : "Trace & Visibility"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {trace.isFiltered
            ? `Showing full journey for ${toFilterLabel(trace.filter?.type)}: ${trace.filter?.value} — from receiving to shipping.`
            : "Track any item's movement within the warehouse. Search by SKU, GRN, location, or scan reference."}
        </p>
      </div>

      {!session.tenant_id && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Select a tenant before using the Trace module.
          </CardContent>
        </Card>
      )}

      {session.tenant_id && (
        <div className="space-y-4">
          {/* Search bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <form onSubmit={onSearchSubmit}>
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      className="h-9 pl-9 pr-9"
                      placeholder="e.g. SKU000001, GRN000143, A-01-001, PUT000210..."
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                    />
                    {searchValue && (
                      <button
                        type="button"
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setSearchValue("")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {/* Event type filter — only in global mode */}
                  {!trace.isFiltered && (
                    <Select value={eventTypeFilter || "all"} onValueChange={(v) => setEventTypeFilter(v === "all" ? "" : v)}>
                      <SelectTrigger className="h-9 w-[150px]">
                        <SelectValue placeholder="All Events" />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value || "all"} value={opt.value || "all"}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button type="submit" className="h-9" disabled={trace.loading}>
                    <Search className="h-4 w-4 mr-1" />
                    Search
                  </Button>
                  {trace.isFiltered && (
                    <Button type="button" variant="outline" className="h-9" onClick={handleClearFilter} disabled={trace.loading}>
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  Tip: System auto-detects type — SKU, GRN, PUT, ASN, RMA, ADJ, or location code.
                </p>
              </form>
            </CardContent>
          </Card>

          {/* Summary stats — global mode only */}
          {!trace.isFiltered && !trace.loading && trace.events.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { key: "received", label: "Received", bg: "#DBEAFE", color: "#1E40AF" },
                { key: "putaway",  label: "Putaway",  bg: "#DBEAFE", color: "#1E40AF" },
                { key: "picked",   label: "Picked",   bg: "#FEF3C7", color: "#92400E" },
                { key: "shipped",  label: "Shipped",  bg: "#D1FAE5", color: "#065F46" },
              ].map(({ key, label, bg, color }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEventTypeFilter(eventTypeFilter === key ? "" : key)}
                  className={`rounded-lg border px-4 py-3 text-left transition-all hover:shadow-sm ${eventTypeFilter === key ? "ring-2 ring-offset-1" : ""}`}
                  style={{ borderColor: eventTypeFilter === key ? color : undefined, ringColor: color }}
                >
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <p className="text-2xl font-bold" style={{ color }}>{eventStats[key] || 0}</p>
                  <p className="text-xs text-muted-foreground">events</p>
                </button>
              ))}
            </div>
          )}

          {/* Context card — filtered mode only */}
          {trace.isFiltered && (
            <TraceContextCard filter={trace.filter} context={trace.context} />
          )}

          {/* Timeline */}
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
  );
};

export default TracePage;