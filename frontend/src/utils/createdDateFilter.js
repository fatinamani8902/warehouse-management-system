function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function nextDay(date) {
  const value = new Date(date);
  value.setDate(value.getDate() + 1);
  return value;
}

function isInvalidCreatedDateRange(dateFrom, dateTo) {
  const from = parseIsoDate(dateFrom);
  const to = parseIsoDate(dateTo);
  return Boolean(from && to && from > to);
}

function isWithinCreatedDateRange(createdAt, dateFrom, dateTo) {
  if (isInvalidCreatedDateRange(dateFrom, dateTo)) return true;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const from = parseIsoDate(dateFrom);
  const to = parseIsoDate(dateTo);
  if (from && created < from) return false;
  if (to && created >= nextDay(to)) return false;
  return true;
}

function filterByCreatedDate(rows, dateFrom, dateTo) {
  if (isInvalidCreatedDateRange(dateFrom, dateTo)) return rows;
  if (!dateFrom && !dateTo) return rows;
  return (rows || []).filter((row) => isWithinCreatedDateRange(row?.created_at, dateFrom, dateTo));
}

export { filterByCreatedDate, isInvalidCreatedDateRange, isWithinCreatedDateRange };
