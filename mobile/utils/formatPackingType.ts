const PACKING_TYPE_LABELS: Record<string, string> = {
  standard_box: "Standard Box",
  poly_mailer: "Poly Mailer",
  pallet: "Pallet",
  crate: "Crate",
};

function toTitleCase(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatPackingType(value?: string | null): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "—";
  }

  const key = normalized.toLowerCase();
  return PACKING_TYPE_LABELS[key] || toTitleCase(normalized);
}
