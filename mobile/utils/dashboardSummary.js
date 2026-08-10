const zero = (value) => Number(value || 0);

function formatNumber(value) {
  return String(zero(value));
}

function buildDashboardView(summary = {}) {
  const kpis = summary.kpis || {};
  const statusSummary = summary.status_summary || {};
  const inboundSummary = statusSummary.inbound || {};

  const pendingAsn = zero(inboundSummary.pending_asn);
  const inTransitAsn = zero(inboundSummary.in_transit_asn);
  const arrivedAsn = zero(inboundSummary.arrived_asn);
  const receivingGrn = zero(inboundSummary.receiving_grn);
  const activePutaway = zero(statusSummary.warehouse?.active_putaway || kpis.pending_putaway?.total);
  const activePicking = zero(kpis.picking?.active);
  const activePacking = zero(statusSummary.warehouse?.active_packing);
  const readyToDispatch = zero(kpis.shipping?.ready_to_dispatch);
  const dispatched = zero(kpis.shipping?.dispatched);
  const returnsAwaitingRma = zero(kpis.returns?.return_created);
  const openReturns = zero(kpis.returns?.open_returns);
  const activeRmaFollowUp = Math.max(openReturns - returnsAwaitingRma, 0);
  const returnsAwaitingClosure = zero(kpis.returns?.returns_awaiting_closure);

  const operations = [
    {
      key: "inbound",
      label: "Inbound",
      icon: "arrow-down-circle-outline",
      total: pendingAsn + inTransitAsn + arrivedAsn + receivingGrn,
      breakdown: `Pending ${formatNumber(pendingAsn)} · In Transit ${formatNumber(inTransitAsn)} · Awaiting ${formatNumber(arrivedAsn)} · Receiving ${formatNumber(receivingGrn)}`,
      accessibilityLabel: "Inbound operations",
      route: "/(app)/inbound",
    },
    {
      key: "storage",
      label: "Storage",
      icon: "business-outline",
      total: activePutaway,
      breakdown: `Active Putaway ${formatNumber(activePutaway)}`,
      accessibilityLabel: "Storage operations",
      route: "/(app)/putaway",
    },
    {
      key: "fulfilment",
      label: "Fulfilment",
      icon: "cube-outline",
      total: activePicking + activePacking,
      breakdown: `Picking ${formatNumber(activePicking)} · Packing ${formatNumber(activePacking)}`,
      accessibilityLabel: "Fulfilment operations",
      route: null,
    },
    {
      key: "outbound",
      label: "Outbound",
      icon: "boat-outline",
      total: readyToDispatch + dispatched,
      breakdown: `Ready ${formatNumber(readyToDispatch)} · Dispatched ${formatNumber(dispatched)}`,
      accessibilityLabel: "Outbound operations",
      route: "/(app)/shipping",
    },
    {
      key: "returns",
      label: "Returns",
      icon: "return-down-back-outline",
      total: openReturns,
      breakdown: `Awaiting RMA ${formatNumber(returnsAwaitingRma)} · RMA Follow-up ${formatNumber(activeRmaFollowUp)}`,
      accessibilityLabel: "Returns operations. Manage Returns and RMA in the Portal.",
      route: null,
      portalOnly: true,
    },
  ];

  const attention = [
    {
      key: "overdueShipments",
      label: "Overdue Shipments",
      count: zero(kpis.shipping?.overdue),
      description: "Past required ship date",
      route: "/(app)/shipping",
    },
    {
      key: "putawayExceptions",
      label: "Putaway Exceptions",
      count: zero(kpis.pending_putaway?.exception),
      description: "Exception tasks need review",
      route: "/(app)/putaway",
    },
    {
      key: "cycleCountsAwaitingReview",
      label: "Cycle Counts Awaiting Review",
      count: zero(kpis.approvals?.cycle_counts_submitted),
      description: "Review in Inventory",
      route: "/(app)/inventory",
    },
    {
      key: "adjustmentsAwaitingApproval",
      label: "Adjustments Awaiting Approval",
      count: zero(kpis.approvals?.adjustments_submitted),
      description: "Approve in Portal if required",
      route: "/(app)/inventory",
    },
    {
      key: "returnsAwaitingClosure",
      label: "Returns Awaiting Closure",
      count: returnsAwaitingClosure,
      description: "Close linked Returns in Portal",
      route: null,
      portalOnly: true,
    },
  ].filter((item) => item.count > 0);

  return {
    generatedAt: summary.generated_at,
    operations,
    attention,
  };
}

function rmaStatusLabel(status) {
  const key = String(status || "").toLowerCase();
  if (key === "created" || key === "open") return "Opened";
  if (key === "processing") return "Processing";
  if (key === "completed") return "Completed";
  if (key === "cancelled") return "Cancelled";
  return status || "-";
}

export { buildDashboardView, rmaStatusLabel };
