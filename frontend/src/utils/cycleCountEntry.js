import { formatQuantity } from "./formatQuantity";

function cycleCountLineLabel(line = {}) {
  const sku = line.sku_code || line.sku_id || "Unknown SKU";
  const skuId = line.sku_id && line.sku_id !== sku ? ` / ${line.sku_id}` : "";
  const product = line.sku_description || line.description || "Unnamed product";
  const location = line.display_name || line.location_code || line.location_id || "Unknown location";
  return `${line.line_id || "Line"} | ${sku}${skuId} | ${product} | ${location} | System Qty ${formatQuantity(line.system_qty)}`;
}

function validateCycleCountEntry(form = {}) {
  const quantityText = String(form.qty_counted ?? "").trim();
  if (!quantityText) return "Qty Counted is required";

  const quantity = Number(quantityText);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return "Qty Counted must be zero or positive";
  }
  if (!String(form.line_id || "").trim() && !String(form.scanned_value || "").trim()) {
    return "Scan / Type SKU, Barcode, EPC, or Location is required when using Auto Resolve By Scan";
  }
  return "";
}

function getCycleCountVariance(line = {}) {
  if (line.counted_qty === null || line.counted_qty === undefined || line.counted_qty === "") {
    return null;
  }
  return Number(line.counted_qty) - Number(line.system_qty || 0);
}

function cycleCountHasVariance(lines = []) {
  return lines.some((line) => {
    const variance = getCycleCountVariance(line);
    return variance !== null && variance !== 0;
  });
}

function isCycleCountMakerCheckerBlocked(record = {}, userId = "") {
  const currentUserId = String(userId || "").trim();
  if (!currentUserId) return false;

  const createdBy = String(record.created_by_user_id || record.created_by || "").trim();
  const submittedBy = String(record.submitted_by_user_id || record.submitted_by || "").trim();

  return currentUserId === createdBy || currentUserId === submittedBy;
}

function canReviewCycleCount(record = {}, { roleAllowed = false, userId = "" } = {}) {
  return Boolean(roleAllowed) && !isCycleCountMakerCheckerBlocked(record, userId);
}

export {
  canReviewCycleCount,
  cycleCountHasVariance,
  cycleCountLineLabel,
  getCycleCountVariance,
  isCycleCountMakerCheckerBlocked,
  validateCycleCountEntry,
};
