import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

const FILTER_TYPE_LABELS = {
  sku: "SKU", epc: "EPC Tag", grn: "GRN", do: "Delivery Order",
  rma: "RMA", put: "Putaway Task", asn: "ASN", adj: "Adjustment",
  location: "Location", reference: "Reference",
};

const STATUS_CONFIG = {
  received:  { bg: "#DBEAFE", color: "#1E40AF", label: "Received" },
  putaway:   { bg: "#DBEAFE", color: "#1E40AF", label: "Putaway" },
  picked:    { bg: "#FEF3C7", color: "#92400E", label: "Picked" },
  packed:    { bg: "#FEF3C7", color: "#92400E", label: "Packed" },
  shipped:   { bg: "#D1FAE5", color: "#065F46", label: "Shipped" },
  cancelled: { bg: "#F3F4F6", color: "#6B7280", label: "Cancelled" },
  returned:  { bg: "#FEE2E2", color: "#991B1B", label: "Returned" },
};

function StatusBadge({ status }) {
  const key = String(status || "").toLowerCase();
  const cfg = STATUS_CONFIG[key] || { bg: "#F1EFE8", color: "#5F5E5A", label: status || "-" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

const JOURNEY_STEPS = ["received", "putaway", "picked", "shipped"];

export const TraceContextCard = ({ filter, context }) => {
  const safeContext = context || {};
  const currentStepIndex = JOURNEY_STEPS.indexOf(String(safeContext.lastStatus || "").toLowerCase());

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Item Summary
          <span className="text-xs font-normal text-muted-foreground">
            — {FILTER_TYPE_LABELS[filter?.type] || "Reference"}: <span className="font-mono">{filter?.value || "-"}</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info grid */}
        <div className="rounded-md border bg-muted/20 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Current Status</p>
              {safeContext.lastStatus
                ? <StatusBadge status={safeContext.lastStatus} />
                : <p className="text-muted-foreground text-sm">-</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Last Known Location</p>
              <p className="font-medium font-mono text-xs" title={safeContext.lastLocation || "-"}>
                {safeContext.lastLocation
                  ? safeContext.lastLocation.split("/").map(p => p.trim()).filter(Boolean).slice(-2).join(" / ")
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Last Activity</p>
              <p className="text-sm">{formatDateTime(safeContext.lastEventAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Warehouse</p>
              <p className="text-sm">{safeContext.warehouseName || "-"}</p>
            </div>
          </div>
        </div>

        {/* Journey stepper */}
        <div>
          <p className="text-xs text-muted-foreground mb-3">Warehouse Journey</p>
          {String(safeContext.lastStatus || "").toLowerCase() === "returned" ? (
            <div className="flex items-center gap-2 text-sm">
              <span style={{
                fontSize: 12, fontWeight: 500, padding: "3px 12px", borderRadius: 20,
                background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA",
              }}>Returned</span>
              <span className="text-xs text-muted-foreground">— Item returned to warehouse after shipping</span>
            </div>
          ) : (
            <div className="flex items-center gap-0">
              {JOURNEY_STEPS.map((step, index) => {
                const isCurrent = index === currentStepIndex;
                const isPast = currentStepIndex > index;
                return (
                  <div key={step} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", display: "flex",
                        alignItems: "center", justifyContent: "center", flexShrink: 0,
                        background: isCurrent ? "#1E40AF" : isPast ? "#BFDBFE" : "#F1F5F9",
                        border: `2px solid ${isCurrent ? "#1E40AF" : isPast ? "#93C5FD" : "#E2E8F0"}`,
                        color: isCurrent ? "#fff" : isPast ? "#1E40AF" : "#94A3B8",
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {isPast ? "✓" : index + 1}
                      </div>
                      <p style={{
                        fontSize: 11, marginTop: 6, fontWeight: isCurrent ? 600 : 400,
                        color: isCurrent ? "#1E40AF" : isPast ? "#3B82F6" : "#94A3B8",
                        textAlign: "center",
                      }}>
                        {step.charAt(0).toUpperCase() + step.slice(1)}
                      </p>
                    </div>
                    {index < JOURNEY_STEPS.length - 1 && (
                      <div style={{
                        height: 2, flex: 1, marginBottom: 20, maxWidth: 48,
                        background: isPast ? "#93C5FD" : "#E2E8F0",
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};