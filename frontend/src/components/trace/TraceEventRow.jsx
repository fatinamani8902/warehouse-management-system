import { Clock3, MapPin, User } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function toActorLabel(event) {
  const actorType = String(event?.actorType || "system").toLowerCase();
  if (actorType === "user") return event?.actorName || event?.actorId || "Unknown User";
  if (actorType === "device") return event?.deviceCode || event?.actorId || "Unknown Device";
  return event?.systemCode || event?.actorId || "System";
}

function toEventLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Unknown";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const STATUS_CONFIG = {
  received:      { bg: "#DBEAFE", color: "#1E40AF", label: "Received" },
  putaway:       { bg: "#DBEAFE", color: "#1E40AF", label: "Putaway" },
  picked:        { bg: "#FEF3C7", color: "#92400E", label: "Picked" },
  packed:        { bg: "#FEF3C7", color: "#92400E", label: "Packed" },
  shipped:       { bg: "#D1FAE5", color: "#065F46", label: "Shipped" },
  returned:      { bg: "#FEE2E2", color: "#991B1B", label: "Returned" },
  status_change: { bg: "#F3F4F6", color: "#6B7280", label: "Status Change" },
};

function EventBadge({ type }) {
  const key = String(type || "").toLowerCase();
  const cfg = STATUS_CONFIG[key] || { bg: "#F1EFE8", color: "#5F5E5A", label: toEventLabel(type) };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 11, fontWeight: 500, padding: "2px 9px", borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

const EVENT_DESCRIPTIONS = {
  received:      "Item arrived at warehouse from supplier",
  putaway:       "Item moved to storage location",
  picked:        "Item retrieved from storage for outbound order",
  shipped:       "Item dispatched to carrier for delivery",
  returned:      "Item returned by customer",
  status_change: "Status updated",
};

// Shorten location path — show last 2 parts only
function shortenLocation(path) {
  if (!path) return "-";
  const parts = path.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join(" / ");
}

export const TraceEventRow = ({ event, isLatest, onSkuClick, onReferenceClick }) => {
  const referenceLabel = event.refNo ? `${event.refType || ""} ${event.refNo}`.trim() : "-";
  const eventDescription = EVENT_DESCRIPTIONS[String(event.eventType || "").toLowerCase()];
  const shortLocation = shortenLocation(event.locationPath || event.locationCode);
  const fullLocation = event.locationPath || event.locationCode || "-";

  return (
    <div className={cn(
      "flex gap-3 rounded-md border bg-background px-4 py-3 transition-colors",
      isLatest && "border-blue-200 bg-blue-50/40"
    )}>
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div className={cn(
          "h-2.5 w-2.5 rounded-full border-2 mt-0.5",
          isLatest ? "bg-blue-600 border-blue-600" : "bg-muted border-muted-foreground/30"
        )} />
        <div className="mt-1 h-full min-h-[24px] w-px bg-border" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Row 1 — badge + label + latest tag + time */}
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <EventBadge type={event.eventType} />
          <span className="text-xs font-medium">{toEventLabel(event.eventType)}</span>
          {isLatest && (
            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Latest</span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-auto">
            <Clock3 className="h-3 w-3" />
            {formatDateTime(event.eventAt)}
          </span>
        </div>

        {/* Description */}
        {eventDescription && (
          <p className="text-xs text-muted-foreground mb-1.5">{eventDescription}</p>
        )}

        {/* Location — shortened with full path on hover */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
          <MapPin className="h-3 w-3 shrink-0" />
          <span>
            <span className="font-medium text-foreground">{event.process || "Trace"}</span>
            <span className="mx-1">—</span>
            <span title={fullLocation}>{shortLocation}</span>
          </span>
        </div>

        {/* Actor */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
          <User className="h-3 w-3 shrink-0" />
          <span className="font-medium text-foreground">{toActorLabel(event)}</span>
          <span className="text-muted-foreground/60">
            ({event.actorType === "device" ? "Device" : event.actorType === "user" ? "User" : "System"})
          </span>
        </div>

        {/* SKU + Ref */}
        <div className="flex flex-wrap items-center gap-3 text-xs pt-1.5 border-t border-dashed">
          <span className="text-muted-foreground">
            SKU:{" "}
            <button type="button"
              className="font-medium text-blue-600 hover:underline disabled:text-muted-foreground disabled:no-underline"
              onClick={() => onSkuClick?.(event.sku)} disabled={!event.sku}>
              {event.sku || "-"}
            </button>
          </span>
          <span className="text-muted-foreground">
            Ref:{" "}
            <button type="button"
              className="font-medium text-blue-600 hover:underline disabled:text-muted-foreground disabled:no-underline"
              onClick={() => onReferenceClick?.({ type: event.refType, value: event.refNo })} disabled={!event.refNo}>
              {referenceLabel}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};