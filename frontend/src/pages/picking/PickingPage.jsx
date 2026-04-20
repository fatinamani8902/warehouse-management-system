import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { canUpdatePickingStatus } from "@/services/rbac";
import { fetchPickListById, fetchPickLists, toSessionContext } from "@/services/api";

const initialFilters = { search: "", status: "" };

const roleAliases = {
  superadmin: "superadmin",
  hqadmin: "hqadmin",
  storemanager: "storemanager",
  warehouseadmin: "storemanager",
  warehousemanager: "storemanager",
  storeoperator: "storeoperator",
  storekeeper: "storeoperator",
  warehouseclerk: "storeoperator",
  auditor: "auditor",
  readonly: "readonly",
};

const pickStatusFilters = new Set([
  "open", "draft", "picking", "picked", "completed", "packed", "shipped", "cancelled",
]);

const STATUS_CONFIG = {
  draft:      { bg: "#F1EFE8", color: "#5F5E5A", label: "Draft" },
  open:       { bg: "#DBEAFE", color: "#1E40AF", label: "Open" },
  picking:    { bg: "#FEF3C7", color: "#92400E", label: "Picking" },
  picked:     { bg: "#DBEAFE", color: "#1E40AF", label: "Picked" },
  completed:  { bg: "#D1FAE5", color: "#065F46", label: "Completed" },
  packed:     { bg: "#D1FAE5", color: "#065F46", label: "Packed" },
  shipped:    { bg: "#D1FAE5", color: "#065F46", label: "Shipped" },
  cancelled:  { bg: "#F3F4F6", color: "#6B7280", label: "Cancelled" },
  pending:    { bg: "#F1EFE8", color: "#5F5E5A", label: "Pending" },
};

function StatusBadge({ status }) {
  const key = String(status || "").toLowerCase().replace(/ /g, "_");
  const cfg = STATUS_CONFIG[key] || { bg: "#F1EFE8", color: "#5F5E5A", label: status || "-" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function parsePickingStatusFilter(search) {
  const params = new URLSearchParams(search || "");
  const status = String(params.get("status") || "").toLowerCase();
  return pickStatusFilters.has(status) ? status : "";
}

const PickingPage = () => {
  const location = useLocation();
  const auth = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const userRole = auth.currentUser?.role || "";
  const roleId = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);
  const canView = useMemo(
    () => ["superadmin", "hqadmin", "storemanager", "storeoperator", "auditor", "readonly"].includes(roleId),
    [roleId],
  );

  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedPickListId, setSelectedPickListId] = useState("");
  const [selectedPickList, setSelectedPickList] = useState(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    const statusFilter = parsePickingStatusFilter(location.search);
    setFilters((current) => ({ ...current, status: statusFilter }));
    setPage(1);
  }, [location.search]);

  const loadList = useCallback(async () => {
    if (!session.tenant_id || !canView) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const result = await fetchPickLists(session, { page, pageSize, ...filters });
      const items = Array.isArray(result?.data) ? result.data : [];
      setRows(items);
      setTotal(Number(result?.total || 0));
      setSelectedPickListId((current) => {
        if (current && items.some((item) => item.pick_list_id === current)) return current;
        return items[0]?.pick_list_id || "";
      });
    } catch (loadError) {
      setRows([]);
      setTotal(0);
      setError(loadError.message || "Failed to load pick lists");
    } finally {
      setLoading(false);
    }
  }, [canView, filters, page, pageSize, session]);

  const loadDetail = useCallback(async (pickListId) => {
    if (!pickListId || !session.tenant_id || !canView) {
      setSelectedPickList(null);
      return;
    }
    try {
      const res = await fetchPickListById(session, pickListId);
      setSelectedPickList(res?.data ?? res ?? null);
    } catch (detailError) {
      setSelectedPickList(null);
      setError(detailError.message || "Failed to load pick list details");
    }
  }, [canView, session]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadDetail(selectedPickListId); }, [selectedPickListId, loadDetail]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Picking" }]} />
      <h1 className="text-2xl font-bold mb-4">Picking</h1>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-9 min-w-[220px] flex-1"
              placeholder="Search Pick List, Wave, Assigned User..."
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
            <Select value={filters.status || "all"} onValueChange={(value) => updateFilter("status", value === "all" ? "" : value)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="picking">Picking</SelectItem>
                <SelectItem value="picked">Picked</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="packed">Packed</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-9" onClick={clearFilters}>Clear</Button>
            <Button variant="outline" className="h-9" onClick={loadList} disabled={loading}>Refresh</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-left">Pick List ID</th>
                  <th className="px-3 py-2 text-left">Wave Ref</th>
                  <th className="px-3 py-2 text-left">Assigned User</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Started</th>
                  <th className="px-3 py-2 text-left">Completed</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading pick lists...
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      No pick lists found.
                    </td>
                  </tr>
                )}
                {!loading && rows.map((row) => (
                  <tr
                    key={row.pick_list_id}
                    className={`border-t cursor-pointer hover:bg-accent/40 ${selectedPickListId === row.pick_list_id ? "bg-accent/30" : ""}`}
                    onClick={() => setSelectedPickListId(row.pick_list_id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.pick_list_id}</td>
                    <td className="px-3 py-2">{row.wave_id || "-"}</td>
                    <td className="px-3 py-2">{row.assigned_to_user_name || "Unassigned"}</td>
                    <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-2">{formatDateTime(row.created_at)}</td>
                    <td className="px-3 py-2">{formatDateTime(row.started_at)}</td>
                    <td className="px-3 py-2">{formatDateTime(row.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <div className="text-muted-foreground">
              {total} result{total === 1 ? "" : "s"} · Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[92px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail panel */}
      {selectedPickList && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {selectedPickList.pick_list_id}
              <StatusBadge status={selectedPickList.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Execution ownership notice */}
            <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium mb-0.5">Execution Ownership</p>
              <p className="text-muted-foreground text-xs">
                Pick execution and item verification are controlled by mobile API only. Web portal is view-only.
              </p>
            </div>

            {/* Info grid */}
            <div className="rounded-md border bg-muted/20 px-4 py-3">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Wave Ref</p>
                  <p className="font-medium">{selectedPickList.wave_id || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Assigned User</p>
                  <p>{selectedPickList.assigned_to_user_name || "Unassigned"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Started At</p>
                  <p>{formatDateTime(selectedPickList.started_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Completed At</p>
                  <p>{formatDateTime(selectedPickList.completed_at)}</p>
                </div>
              </div>
            </div>

            {/* Lines table */}
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Line</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Location</th>
                    <th className="px-3 py-2 text-right">Required</th>
                    <th className="px-3 py-2 text-right">Picked</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedPickList.lines || []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-5 text-center text-muted-foreground">No line items.</td>
                    </tr>
                  )}
                  {(selectedPickList.lines || []).map((line) => (
                    <tr key={`${selectedPickList.pick_list_id}-${line.line_no}`} className="border-t">
                      <td className="px-3 py-2">{line.line_no}</td>
                      <td className="px-3 py-2">{line.sku_id}</td>
                      <td className="px-3 py-2">{line.location_id}</td>
                      <td className="px-3 py-2 text-right">{line.qty_required}</td>
                      <td className="px-3 py-2 text-right">{line.qty_picked}</td>
                      <td className="px-3 py-2"><StatusBadge status={line.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
};

export default PickingPage;