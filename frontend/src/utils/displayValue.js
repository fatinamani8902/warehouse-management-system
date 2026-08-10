const EMPTY_DISPLAY_VALUE = "-";

const EMPTY_TEXT_VALUES = new Set([
  "",
  "null",
  "undefined",
  "nan",
  "\uFFFD",
  "\u2014",
  "\u2013",
  "\u00E2\u20AC\u201D",
  "\u00EF\u00BF\u00BD",
]);

function displayValue(value, fallback = EMPTY_DISPLAY_VALUE) {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "number") {
    return Number.isNaN(value) ? fallback : value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return EMPTY_TEXT_VALUES.has(trimmed.toLowerCase()) ? fallback : value;
  }

  return value;
}

export { EMPTY_DISPLAY_VALUE, displayValue };
