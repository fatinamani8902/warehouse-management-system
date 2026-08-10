const RMA_STATUS_LABELS = {
  created: "Opened",
  open: "Opened",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
};

function normalizeRmaStatus(value) {
  return String(value || "").toLowerCase();
}

function rmaStatusLabel(value) {
  const normalized = normalizeRmaStatus(value);
  return RMA_STATUS_LABELS[normalized] || value || "-";
}

function stepperForRmaStatus(status) {
  const normalizedStatus = normalizeRmaStatus(status);
  const flow = [
    { key: "opened", label: "Opened" },
    { key: "processing", label: "Processing" },
    { key: "completed", label: "Completed" },
  ];
  if (normalizedStatus === "cancelled") {
    return flow.map((step, index) => ({ label: step.label, status: index === 0 ? "current" : "pending" }));
  }
  const effectiveStatus = ["created", "open"].includes(normalizedStatus) ? "opened" : normalizedStatus;
  const index = flow.findIndex((step) => step.key === effectiveStatus);
  if (index === -1) return flow.map((step, i) => ({ label: step.label, status: i === 0 ? "current" : "pending" }));
  return flow.map((step, i) => ({ label: step.label, status: i < index ? "completed" : i === index ? "current" : "pending" }));
}

export { normalizeRmaStatus, rmaStatusLabel, stepperForRmaStatus };
