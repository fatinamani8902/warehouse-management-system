function formatDimensionValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}

function formatDimensions(width, depth, height) {
  return [
    formatDimensionValue(width),
    formatDimensionValue(depth),
    formatDimensionValue(height),
  ].join(" × ");
}

function formatCapacityValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : String(value);
}

export { formatCapacityValue, formatDimensionValue, formatDimensions };
