const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMPTY_DISPLAY_VALUE = "-";

function validDateParts(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") return EMPTY_DISPLAY_VALUE;

  const text = String(value).trim();
  const dateOnly = text.match(DATE_ONLY_PATTERN);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    if (!validDateParts(Number(year), Number(month), Number(day))) return EMPTY_DISPLAY_VALUE;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_DISPLAY_VALUE;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (value === null || value === undefined || value === "") return EMPTY_DISPLAY_VALUE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_DISPLAY_VALUE;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date).replace(",", "");
}

export { formatDate, formatDateTime };
