import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export function DataTable({
  columns,
  data,
  pageSize = 10,
  searchable = true,
  searchPlaceholder = "Search...",
  onRowClick,
  actions,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const filtered = data.filter(
    (row) =>
      !search ||
      Object.values(row).some((v) =>
        String(v ?? "").toLowerCase().includes(search.toLowerCase())
      )
  );

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleClear = () => {
    setSearch("");
    setPage(0);
  };

  return (
    <div className="space-y-0">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      {(searchable || actions) && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-t-xl border border-b-0"
          style={{ background: "var(--color-background-secondary)" }}
        >
          {searchable && (
            <div className="relative w-64 shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-8 h-8 text-sm bg-background"
              />
            </div>
          )}

          <div className="flex-1" />

          {searchable && search && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="h-8 text-xs shrink-0"
            >
              Clear
            </Button>
          )}

          {actions}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div
        className={`border overflow-hidden ${(searchable || actions) ? "rounded-b-xl" : "rounded-xl"}`}
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.03)" }}
      >
        <Table>
          <TableHeader>
            <TableRow style={{ background: "var(--color-background-secondary)" }}>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-xs font-semibold tracking-wide uppercase ${col.sortable ? "cursor-pointer select-none" : ""}`}
                  style={{ color: "var(--color-text-tertiary)", fontSize: "10px", letterSpacing: "0.06em" }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <span style={{ opacity: sortKey === col.key ? 1 : 0.3, fontSize: "10px" }}>
                        {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center py-12 text-sm text-muted-foreground"
                >
                  No data found
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row, i) => (
                <TableRow
                  key={i}
                  className={onRowClick ? "cursor-pointer transition-colors duration-100" : ""}
                  style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}
                  onMouseEnter={(e) => {
                    if (onRowClick) e.currentTarget.style.background = "#eef2ff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "";
                  }}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className="text-sm py-3">
                      {col.render ? col.render(row) : (row[col.key] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <span>
            {sorted.length} result{sorted.length !== 1 ? "s" : ""} · Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, idx) => (
              <Button
                key={idx}
                variant={page === idx ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(idx)}
                className="h-7 w-7 p-0 text-xs"
                style={page === idx ? { background: "#3b5bdb", borderColor: "#3b5bdb" } : {}}
              >
                {idx + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}