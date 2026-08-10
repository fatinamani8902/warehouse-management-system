export function formatKg(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "-";
  }

  return `${parsed.toFixed(2)} kg`;
}
