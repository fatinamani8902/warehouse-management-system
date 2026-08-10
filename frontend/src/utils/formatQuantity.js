function formatQuantity(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return fallback;

  const hasFraction = !Number.isInteger(quantity);
  return quantity.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

export { formatQuantity };
