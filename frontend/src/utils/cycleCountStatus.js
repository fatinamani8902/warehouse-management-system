const cycleCountProcessStatuses = [
  { value: "draft", label: "Draft" },
  { value: "assigned", label: "Assigned" },
  { value: "counting", label: "Counting" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const cycleCountStatusLabels = new Map(
  cycleCountProcessStatuses.map((status) => [status.value, status.label])
);

function normalizeCycleCountProcessStatus(value) {
  const key = String(value || "").toLowerCase().replace(/ /g, "_");
  if (key === "planned") return "draft";
  if (key === "in_progress") return "counting";
  return key;
}

function getCycleCountProcessStatusLabel(value) {
  const key = normalizeCycleCountProcessStatus(value);
  return cycleCountStatusLabels.get(key) || value || "-";
}

export {
  cycleCountProcessStatuses,
  getCycleCountProcessStatusLabel,
  normalizeCycleCountProcessStatus,
};
