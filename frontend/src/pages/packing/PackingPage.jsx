import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  confirmPacking,
  fetchPackingOptions,
  fetchPackingOrderById,
  fetchPackingOrders,
  toSessionContext,
} from "@/services/api";

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

const STATUS_CONFIG = {
  draft:              { bg: "#F1EFE8", color: "#5F5E5A", label: "Draft" },
  carton_generated:   { bg: "#DBEAFE", color: "#1E40AF", label: "Carton Generated" },
  packed:             { bg: "#D1FAE5", color: "#065F46", label: "Packed" },
  shipped:            { bg: "#D1FAE5", color: "#065F46", label: "Shipped" },
  // pick list statuses
  pending:            { bg: "#F1EFE8", color: "#5F5E5A", label: "Pending" },
  picking:            { bg: "#FEF3C7", color: "#92400E", label: "Picking" },
  completed:          { bg: "#D1FAE5", color: "#065F46", label: "Completed" },
  cancelled:          { bg: "#F3F4F6", color: "#6B7280", label: "Cancelled" },
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

function isPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

const PackingPage = () => {
  const auth = useAuth();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const roleId = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);
  const canView = useMemo(
    () => ["superadmin", "hqadmin", "storemanager", "storeoperator", "auditor", "readonly"].includes(roleId),
    [roleId],
  );
  const canManage = useMemo(
    () => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId),
    [roleId],
  );

  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [packagingTypes, setPackagingTypes] = useState([]);
  const [packagingType, setPackagingType] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [confirmPackOpen, setConfirmPackOpen] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const canConfirmPack = useMemo(
    () => isPositiveNumber(weightKg) && Boolean(packagingType),
    [weightKg, packagingType],
  );
  const isPickListCompleted = useMemo(
    () => String(selectedOrder?.pick_list_status || "").toLowerCase() === "completed",
    [selectedOrder?.pick_list_status],
  );
  const isAlreadyPacked = useMemo(
    () => ["packed", "shipped"].includes(String(selectedOrder?.status || "").toLowerCase()),
    [selectedOrder?.status],
  );

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
      const result = await fetchPackingOrders(session, { page, pageSize, ...filters });
      const items = Array.isArray(result?.data) ? result.data : [];
      setRows(items);
      setTotal(Number(result?.total || 0));
      setSelectedPackId((current) => {
        if (current && items.some((item) => item.pack_id === current)) return current;
        return items[0]?.pack_id || "";
      });
    } catch (loadError) {
      setRows([]);
      setTotal(0);
      setError(loadError.message || "Failed to load packing orders");
    } finally {
      setLoading(false);
    }
  }, [canView, filters, page, pageSize, session]);

  const loadDetail = useCallback(async (packId) => {
    if (!packId || !session.tenant_id || !canView) {
      setSelectedOrder(null);
      return;
    }
    try {
      const res = await fetchPackingOrderById(session, packId);
      setSelectedOrder(res?.data ?? res ?? null);
    } catch (detailError) {
      setSelectedOrder(null);
      setError(detailError.message || "Failed to load pack order details");
    }
  }, [canView, session]);

  const loadOptions = useCallback(async () => {
    if (!session.tenant_id || !canView) {
      setPackagingTypes([]);
      return;
    }
    try {
      const result = await fetchPackingOptions(session);
      setPackagingTypes(Array.isArray(result?.packaging_types) ? result.packaging_types : []);
    } catch {
      setPackagingTypes([]);
    }
  }, [canView, session]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadOptions(); }, [loadOptions]);
  useEffect(() => { loadDetail(selectedPackId); }, [selectedPackId, loadDetail]);

  useEffect(() => {
    if (!selectedOrder) {
      setPackagingType("");
      setWeightKg("");
      return;
    }
    setPackagingType(selectedOrder.packaging_type || "");
    setWeightKg(selectedOrder.weight_kg ? String(selectedOrder.weight_kg) : "");
  }, [selectedOrder]);

  const refreshData = async (packId = selectedPackId) => {
    await loadList();
    if (packId) await loadDetail(packId);
  };

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  const handleConfirmPacking = async () => {
    if (!selectedOrder || !canManage) return;
    if (!canConfirmPack) {
      setError("Packaging type and weight are required before confirming packing");
      return;
    }
    try {
      setBusyAction("confirm-pack");
      setError("");
      await confirmPacking(session, selectedOrder.pack_id, {
        weight_kg: Number(weightKg),
        packaging_type: packagingType,
      });
      toast({
        title: "Packing confirmed",
        description: `Pack order ${selectedOrder.pack_id} marked as packed`,
      });
      setConfirmPackOpen(false);
      await refreshData(selectedOrder.pack_id);
    } catch (actionError) {
      const message = actionError.message || "Unable to confirm packing";
      setError(message);
      toast({ title: "Confirm packing failed", description: message, variant: "destructive" });
    } finally {
      setBusyAction("");
    }
  };

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Packing" }]} />
      <h1 className="text-2xl font-bold mb-4">Packing</h1>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {/* Filter bar — same pattern as other pages */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-9 min-w-[220px] flex-1"
              placeholder="Search Pack ID, Pick List, Carton..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
            />
            <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="carton_generated">Carton Generated</SelectItem>
                <SelectItem value="packed">Packed</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
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
                  <th className="px-3 py-2 text-left">Pack ID</th>
                  <th className="px-3 py-2 text-left">Pick List</th>
                  <th className="px-3 py-2 text-left">Pick Status</th>
                  <th className="px-3 py-2 text-left">Carton</th>
                  <th className="px-3 py-2 text-left">Packaging</th>
                  <th className="px-3 py-2 text-left">Weight (kg)</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading packing orders...
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      No packing orders found.
                    </td>
                  </tr>
                )}
                {!loading && rows.map((row) => (
                  <tr
                    key={row.pack_id}
                    className={`border-t cursor-pointer hover:bg-accent/40 ${selectedPackId === row.pack_id ? "bg-accent/30" : ""}`}
                    onClick={() => setSelectedPackId(row.pack_id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.pack_id}</td>
                    <td className="px-3 py-2">{row.pick_list_id || "-"}</td>
                    <td className="px-3 py-2">
                      {row.pick_list_status ? <StatusBadge status={row.pick_list_status} /> : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="px-3 py-2">{row.carton_id || "-"}</td>
                    <td className="px-3 py-2">{row.packaging_type || "-"}</td>
                    <td className="px-3 py-2">{row.weight_kg ?? "-"}</td>
                    <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-2">{formatDateTime(row.created_at)}</td>
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
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
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
      {selectedOrder && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {selectedOrder.pack_id}
              <StatusBadge status={selectedOrder.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Info grid */}
            <div className="rounded-md border bg-muted/20 px-4 py-3">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Pick List</p>
                  <p className="font-medium">{selectedOrder.pick_list_id || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Pick List Status</p>
                  {selectedOrder.pick_list_status
                    ? <StatusBadge status={selectedOrder.pick_list_status} />
                    : <p className="text-muted-foreground">-</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Carton ID</p>
                  <p>{selectedOrder.carton_id || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Packed At</p>
                  <p>{formatDateTime(selectedOrder.packed_at)}</p>
                </div>
              </div>
            </div>

            {/* Pack station controls */}
            {!isAlreadyPacked && (
              <>
                {!isPickListCompleted && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Packing can start only when linked Pick List status is COMPLETED.
                  </div>
                )}

                <div className="rounded-md border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" style={{ fontSize: 11, letterSpacing: "0.07em" }}>
                    Pack Station Controls
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="packaging-type" className="text-xs text-muted-foreground">
                        Packaging Type <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={packagingType || "none"}
                        onValueChange={(v) => setPackagingType(v === "none" ? "" : v)}
                        disabled={!canManage || busyAction !== ""}
                      >
                        <SelectTrigger id="packaging-type">
                          <SelectValue placeholder="Select packaging type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select packaging type</SelectItem>
                          {packagingTypes.map((item) => (
                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="weight-kg" className="text-xs text-muted-foreground">
                        Weight (kg) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="weight-kg"
                        type="number"
                        step="0.01"
                        min="0"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        disabled={!canManage || busyAction !== ""}
                        placeholder="e.g. 2.5"
                      />
                    </div>
                  </div>
                  <div className="border-t pt-3">
                    <Button
                      size="sm"
                      onClick={() => setConfirmPackOpen(true)}
                      disabled={!canManage || !isPickListCompleted || busyAction !== "" || !canConfirmPack}
                    >
                      {busyAction === "confirm-pack" ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Confirming...
                        </span>
                      ) : "Confirm Packing"}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {isAlreadyPacked && (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                This pack order is <strong>{selectedOrder.status}</strong> — ready for shipping.
              </div>
            )}

            {/* Lines table */}
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Line</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrder.lines || []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-5 text-center text-muted-foreground">No line items.</td>
                    </tr>
                  )}
                  {(selectedOrder.lines || []).map((line) => (
                    <tr key={`${selectedOrder.pack_id}-${line.line_no}`} className="border-t">
                      <td className="px-3 py-2">{line.line_no}</td>
                      <td className="px-3 py-2">{line.sku_id}</td>
                      <td className="px-3 py-2">{line.qty_required ?? line.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmModal
        open={confirmPackOpen}
        onClose={() => setConfirmPackOpen(false)}
        onConfirm={handleConfirmPacking}
        title="Confirm Packing"
        description={selectedOrder
          ? `Confirm pack order ${selectedOrder.pack_id} as PACKED? This action cannot be undone.`
          : "Confirm packing"}
        confirmLabel={busyAction === "confirm-pack" ? "Confirming..." : "Confirm Pack"}
        cancelLabel="Back"
        variant="default"
      />
    </AppLayout>
  );
};

export default PackingPage;