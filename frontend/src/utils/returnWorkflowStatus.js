export const RETURN_WORKFLOW_STATUS_OPTIONS = [
  { value: "return_created", label: "Return Created" },
  { value: "rma_opened", label: "RMA Opened" },
  { value: "rma_processing", label: "RMA Processing" },
  { value: "rma_completed", label: "RMA Completed" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

function normalized(value) {
  return String(value || "").toLowerCase();
}

export function returnWorkflowStatus(returnRecord) {
  const returnStatus = normalized(returnRecord?.status);
  if (returnStatus === "closed" || returnStatus === "confirmed") {
    return { value: "closed", label: "Closed", badgeStatus: "closed" };
  }
  if (returnStatus === "cancelled") {
    return { value: "cancelled", label: "Cancelled", badgeStatus: "cancelled" };
  }

  const linkedRma = returnRecord?.linked_rma || null;
  const rmaStatus = normalized(
    linkedRma?.status ||
    returnRecord?.rma_status ||
    returnRecord?.active_rma_status
  );

  if (["created", "open"].includes(rmaStatus)) {
    return { value: "rma_opened", label: "RMA Opened", badgeStatus: "open" };
  }
  if (rmaStatus === "processing") {
    return { value: "rma_processing", label: "RMA Processing", badgeStatus: "processing" };
  }
  if (rmaStatus === "completed") {
    return { value: "rma_completed", label: "RMA Completed", badgeStatus: "completed" };
  }

  return { value: "return_created", label: "Return Created", badgeStatus: "created" };
}
