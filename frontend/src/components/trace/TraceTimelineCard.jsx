import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TraceEventRow } from "@/components/trace/TraceEventRow";

const pageSizeOptions = [10, 20, 50];

export const TraceTimelineCard = ({
  mode,
  events,
  loading,
  error,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onClearFilter,
  onSkuClick,
  onReferenceClick,
  eventTypeFilter,
}) => {
  const isFiltered = mode === "filtered";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-[13px]">
            Trace Timeline
            {isFiltered && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">— Filtered view</span>
            )}
            {eventTypeFilter && !isFiltered && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">— {eventTypeFilter}</span>
            )}
          </CardTitle>
          {/* Mode indicator — only show when filtered */}
          {isFiltered && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20,
              background: "#DBEAFE", color: "#1E40AF", letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              Filtered
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && <p className="text-[13px] text-destructive">{error}</p>}

        {loading && (
          <div className="rounded-md border px-4 py-8 text-[13px] text-center text-muted-foreground">
            Loading trace timeline...
          </div>
        )}

        {!loading && events.length === 0 && isFiltered && (
          <div className="rounded-md border bg-muted/20 px-4 py-8 text-[13px] text-center text-muted-foreground space-y-3">
            <p>No trace events found for this filter.</p>
            <Button size="sm" variant="outline" onClick={onClearFilter}>Clear Filter</Button>
          </div>
        )}

        {!loading && events.length === 0 && !isFiltered && (
          <div className="rounded-md border bg-muted/20 px-4 py-8 text-[13px] text-center text-muted-foreground">
            No trace events found for this tenant and warehouse scope.
          </div>
        )}

        {!loading && events.length > 0 && (
          <div className="space-y-2">
            {events.map((event, index) => (
              <TraceEventRow
                key={event.id || `${event.refNo || "trace"}-${index}`}
                event={event}
                isLatest={index === 0}
                onSkuClick={onSkuClick}
                onReferenceClick={onReferenceClick}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between gap-2 text-[13px] pt-1">
          <div className="text-xs text-muted-foreground">
            {total} event{total === 1 ? "" : "s"} · Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange?.(Number(v))} disabled={loading}>
              <SelectTrigger className="h-8 w-[92px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>{opt} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => onPageChange?.(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => onPageChange?.(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};