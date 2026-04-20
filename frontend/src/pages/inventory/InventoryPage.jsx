import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

const STATUS_CONFIG = {
  draft:       { bg: "#F1EFE8", color: "#5F5E5A", label: "Draft" },
  in_progress: { bg: "#FEF3C7", color: "#92400E", label: "In Progress" },
  submitted:   { bg: "#DBEAFE", color: "#1E40AF", label: "Submitted" },
  approved:    { bg: "#D1FAE5", color: "#065F46", label: "Approved" },
  rejected:    { bg: "#FEE2E2", color: "#991B1B", label: "Rejected" },
  cancelled:   { bg: "#F3F4F6", color: "#6B7280", label: "Cancelled" },
  pending:     { bg: "#F1EFE8", color: "#5F5E5A", label: "Pending" },
  counted:     { bg: "#D1FAE5", color: "#065F46", label: "Counted" },
  variance:    { bg: "#FEF3C7", color: "#92400E", label: "Variance" },
  open:        { bg: "#DBEAFE", color: "#1E40AF", label: "Open" },
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
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { CancellationConfirmModal } from "@/components/modals/CancellationConfirmModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  addCountPlanEntry,
  approveAdjustmentRequest as approveAdjustment,
  approveCountPlan,
  cancelAdjustmentRequest as cancelAdjustment,
  cancelCountPlan,
  createAdjustmentRequest,
  createCountPlan,
  fetchAdjustmentRequests,
  fetchCountPlanById,
  fetchCountPlans,
  fetchInventoryOptions,
  fetchInventorySummary,
  rejectAdjustmentRequest as rejectAdjustment,
  rejectCountPlan,
  submitAdjustmentRequest,
  submitCountPlan,
  toSessionContext,
} from "@/services/api";

const roleAliases = {
  superadmin: "superadmin",
  hqadmin: "hqadmin",
  storemanager: "storemanager",
  storeoperator: "storeoperator",
  warehousemanager: "storemanager",
  storekeeper: "storeoperator",
  warehouseclerk: "storeoperator",
  auditor: "auditor",
  readonly: "readonly",
};

const pageSizes = [10, 20, 50];
const countStatuses = ["DRAFT", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"];
const adjustmentStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"];
const scanModes = ["MANUAL", "QR", "RFID"];

// Simplified: stock only needs search + zone
const stockInitialFilters = { search: "", zone: "" };
// Count keeps search + status + zone (already compact)
const countInitialFilters = { search: "", status: "", zone: "", dateFrom: "", dateTo: "" };
// Simplified: adjustments only needs search + status
const adjustmentInitialFilters = { search: "", status: "" };

const inventoryQueryViews = new Set(["stock", "cycle", "adjustments", "exceptions"]);
const adjustmentStatusQueryValues = new Set(["open", "draft", "submitted", "approved", "rejected", "cancelled"]);

const createCountInitial = {
  zone_id: "",
  planned_date: "",
  scope_type: "FULL_ZONE",
  scope_location_id: "",
  scope_sku_ids: "",
};

const execInitial = {
  line_id: "",
  scan_mode: "MANUAL",
  scanned_value: "",
  qty_counted: "",
};

const createAdjustmentInitial = {
  sku_id: "",
  location_id: "",
  qty_delta: "",
  reason_code: "",
};

function normalizeRole(roleId) {
  const normalized = String(roleId || "readonly").toLowerCase();
  return roleAliases[normalized] || "readonly";
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function fmtDate(value) {
  if (!value) return "-";
  // For date-only strings (yyyy-mm-dd), parse as local date to avoid timezone shift
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-GB");
}

function fmtDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtQty(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtStatusLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseScopeSkus(text) {
  const rows = String(text || "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(rows)];
  const invalid = unique.find((row) => !/^SKU\d{6}$/.test(row));
  return { values: unique, invalid };
}

function parseInventoryQuery(search) {
  const params = new URLSearchParams(search || "");
  const rawView = String(params.get("view") || "").toLowerCase();
  const view = inventoryQueryViews.has(rawView) ? rawView : "";

  const rawStatus = String(params.get("status") || "").toLowerCase();
  const status = adjustmentStatusQueryValues.has(rawStatus) ? rawStatus : "";

  return { view, status };
}

function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, disabled }) {
  const totalPages = Math.max(1, Math.ceil(Math.max(1, total) / pageSize));

  return (
    <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <span>
        {total} result{total === 1 ? "" : "s"} - page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))} disabled={disabled}>
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1}>
          Prev
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reason,
  setReason,
  touched,
  setTouched,
  submitting,
  confirmLabel,
  onConfirm,
}) {
  const value = reason.trim();
  const isValid = value.length >= 5;

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason-input">Reason</Label>
          <Textarea
            id="reason-input"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Enter reason"
            disabled={submitting}
          />
          {touched && !isValid && <p className="text-xs text-destructive">Reason must be at least 5 characters.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Back
          </Button>
          <Button
            variant="destructive"
            disabled={!isValid || submitting}
            onClick={() => {
              setTouched(true);
              if (isValid) onConfirm(value);
            }}
          >
            {submitting ? "Saving..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const InventoryPage = () => {
  const location = useLocation();
  const auth = useAuth();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const roleId = useMemo(() => normalizeRole(session.role_id), [session.role_id]);

  const canCreateCount = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canExecuteCount = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canSubmitCount = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canApproveCount = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canCancelCountByRole = canApproveCount;

  const canCreateAdj = useMemo(() => ["superadmin", "hqadmin", "storemanager", "storeoperator"].includes(roleId), [roleId]);
  const canSubmitAdj = canCreateAdj;
  const canApproveAdj = useMemo(() => ["superadmin", "hqadmin", "storemanager"].includes(roleId), [roleId]);
  const canCancelAdjByRole = canApproveAdj;

  const [activeTab, setActiveTab] = useState("stock");
  const [busyKey, setBusyKey] = useState("");

  const [zones, setZones] = useState([]);
  const [locations, setLocations] = useState([]);
  const [reasonCodes, setReasonCodes] = useState([]);
  const [skus, setSkus] = useState([]);
  const [countConfig, setCountConfig] = useState(null);

  // Stock tab — simplified filters
  const [stockFilters, setStockFilters] = useState(stockInitialFilters);
  const [allStockRows, setAllStockRows] = useState([]);
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");

  // Cycle count tab
  const [countFilters, setCountFilters] = useState(countInitialFilters);
  const [allCountRows, setAllCountRows] = useState([]);
  const [countPage, setCountPage] = useState(1);
  const [countPageSize, setCountPageSize] = useState(10);
  const [countLoading, setCountLoading] = useState(false);
  const [countError, setCountError] = useState("");

  const [selectedCountId, setSelectedCountId] = useState("");
  const [selectedCount, setSelectedCount] = useState(null);
  const [countDetailLoading, setCountDetailLoading] = useState(false);

  const [createCountOpen, setCreateCountOpen] = useState(false);
  const [createCountForm, setCreateCountForm] = useState(createCountInitial);
  const [createCountErrors, setCreateCountErrors] = useState({});

  const [execForm, setExecForm] = useState(execInitial);
  const [execError, setExecError] = useState("");

  const [approveForm, setApproveForm] = useState({ reason_code: "", approval_note: "" });
  const [approveError, setApproveError] = useState("");

  const [rejectCountOpen, setRejectCountOpen] = useState(false);
  const [rejectCountReason, setRejectCountReason] = useState("");
  const [rejectCountTouched, setRejectCountTouched] = useState(false);
  const [cancelCountTarget, setCancelCountTarget] = useState(null);

  // Adjustments tab — simplified filters
  const [adjustmentFilters, setAdjustmentFilters] = useState(adjustmentInitialFilters);
  const [allAdjRows, setAllAdjRows] = useState([]);
  const [adjustmentPage, setAdjustmentPage] = useState(1);
  const [adjustmentPageSize, setAdjustmentPageSize] = useState(10);
  const [adjustmentLoading, setAdjustmentLoading] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState("");
  const [selectedAdjustmentId, setSelectedAdjustmentId] = useState("");

  const [createAdjOpen, setCreateAdjOpen] = useState(false);
  const [createAdjConfirmOpen, setCreateAdjConfirmOpen] = useState(false);
  const [createAdjForm, setCreateAdjForm] = useState(createAdjustmentInitial);
  const [createAdjErrors, setCreateAdjErrors] = useState({});

  const [rejectAdjOpen, setRejectAdjOpen] = useState(false);
  const [rejectAdjReason, setRejectAdjReason] = useState("");
  const [rejectAdjTouched, setRejectAdjTouched] = useState(false);
  const [rejectAdjTarget, setRejectAdjTarget] = useState(null);

  const [approveAdjOpen, setApproveAdjOpen] = useState(false);
  const [approveAdjNote, setApproveAdjNote] = useState("");
  const [approveAdjTarget, setApproveAdjTarget] = useState(null);

  const [cancelAdjTarget, setCancelAdjTarget] = useState(null);

  const reasonMap = useMemo(() => new Map(reasonCodes.map((item) => [item.reason_code, item])), [reasonCodes]);
  const locationMap = useMemo(() => new Map(locations.map((item) => [item.location_id, item])), [locations]);

  // Client-side filter + paginate for Cycle Count
  const filteredCountRows = useMemo(() => {
    let rows = allCountRows;
    const q = countFilters.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) =>
        (row.count_id || "").toLowerCase().includes(q) ||
        (row.zone_id || "").toLowerCase().includes(q)
      );
    }
    if (countFilters.status) {
      rows = rows.filter((row) => (row.status || "").toUpperCase() === countFilters.status);
    }
    if (countFilters.zone) {
      rows = rows.filter((row) => (row.zone_id || "") === countFilters.zone);
    }
    if (countFilters.dateFrom) {
      // Compare ISO date strings lexicographically (yyyy-mm-dd) — timezone safe
      const fromStr = countFilters.dateFrom; // already yyyy-mm-dd from input[type=date]
      rows = rows.filter((row) => {
        if (!row.planned_date) return false;
        const rowDate = String(row.planned_date).slice(0, 10);
        return rowDate >= fromStr;
      });
    }
    if (countFilters.dateTo) {
      const toStr = countFilters.dateTo;
      rows = rows.filter((row) => {
        if (!row.planned_date) return false;
        const rowDate = String(row.planned_date).slice(0, 10);
        return rowDate <= toStr;
      });
    }
    return rows;
  }, [allCountRows, countFilters]);

  const countTotal = filteredCountRows.length;
  const countRows = useMemo(() => {
    const offset = (countPage - 1) * countPageSize;
    return filteredCountRows.slice(offset, offset + countPageSize);
  }, [filteredCountRows, countPage, countPageSize]);

  // Client-side filter + paginate for Stock
  const filteredStockRows = useMemo(() => {
    let rows = allStockRows;
    const q = stockFilters.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) =>
        (row.sku_id || "").toLowerCase().includes(q) ||
        (row.sku_description || "").toLowerCase().includes(q) ||
        (row.location_code || row.location_id || "").toLowerCase().includes(q) ||
        (row.zone_id || "").toLowerCase().includes(q)
      );
    }
    if (stockFilters.zone) {
      rows = rows.filter((row) => (row.zone_id || "") === stockFilters.zone);
    }
    return rows;
  }, [allStockRows, stockFilters]);

  const stockTotal = filteredStockRows.length;
  const stockRows = useMemo(() => {
    const offset = (stockPage - 1) * stockPageSize;
    return filteredStockRows.slice(offset, offset + stockPageSize);
  }, [filteredStockRows, stockPage, stockPageSize]);

  // Client-side filter + paginate for Adjustments
  const filteredAdjRows = useMemo(() => {
    let rows = [...allAdjRows].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
    const q = adjustmentFilters.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) =>
        (row.adj_id || "").toLowerCase().includes(q) ||
        (row.sku_id || "").toLowerCase().includes(q) ||
        (locationMap.get(row.location_id)?.location_code || row.location_id || "").toLowerCase().includes(q) ||
        (row.reason_code || "").toLowerCase().includes(q)
      );
    }
    if (adjustmentFilters.status && adjustmentFilters.status !== "OPEN") {
      rows = rows.filter((row) => (row.status || "").toUpperCase() === adjustmentFilters.status);
    } else if (adjustmentFilters.status === "OPEN") {
      rows = rows.filter((row) => !["APPROVED", "REJECTED", "CANCELLED"].includes((row.status || "").toUpperCase()));
    }
    return rows;
  }, [allAdjRows, adjustmentFilters, locationMap]);

  const adjustmentTotal = filteredAdjRows.length;
  const adjustmentRows = useMemo(() => {
    const offset = (adjustmentPage - 1) * adjustmentPageSize;
    return filteredAdjRows.slice(offset, offset + adjustmentPageSize);
  }, [filteredAdjRows, adjustmentPage, adjustmentPageSize]);

  const selectedAdjustment = useMemo(
    () => filteredAdjRows.find((row) => row.adj_id === selectedAdjustmentId) || null,
    [filteredAdjRows, selectedAdjustmentId],
  );

  const loadOptions = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      const data = await fetchInventoryOptions(session);
      // eslint-disable-next-line no-console
      console.debug("[loadOptions] response keys:", data ? Object.keys(data) : null, "skus count:", data?.skus?.length);
      setZones(Array.isArray(data?.zones) ? data.zones : []);
      setLocations(Array.isArray(data?.locations) ? data.locations : []);
      setReasonCodes(Array.isArray(data?.reason_codes) ? data.reason_codes : []);
      setSkus(Array.isArray(data?.skus) ? data.skus : []);
      setCountConfig(data?.count_config || null);
    } catch (error) {
      toast({ title: "Options failed", description: error.message || "Unable to load options", variant: "destructive" });
    }
  }, [session, toast]);

  const loadStock = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setStockLoading(true);
      setStockError("");
      // Load all rows — filtering/pagination done client-side
      const data = await fetchInventorySummary(session, {
        page: 1,
        pageSize: 9999,
      });
      setAllStockRows(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      setStockError(error.message || "Unable to load stock summary");
      setAllStockRows([]);
    } finally {
      setStockLoading(false);
    }
  }, [session]);

  const loadCountPlans = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setCountLoading(true);
      setCountError("");
      // Load all — filter client-side
      const data = await fetchCountPlans(session, { page: 1, pageSize: 9999 });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setAllCountRows(rows);
    } catch (error) {
      setCountError(error.message || "Unable to load count plans");
      setAllCountRows([]);
    } finally {
      setCountLoading(false);
    }
  }, [session]);

  const loadCountDetail = useCallback(async (countId) => {
    if (!session.tenant_id || !countId) {
      setSelectedCount(null);
      return;
    }
    try {
      setCountDetailLoading(true);
      const data = await fetchCountPlanById(session, countId);
      // eslint-disable-next-line no-console
      console.debug("[fetchCountPlanById] all fields:", data ? Object.keys(data) : null, data);
      setSelectedCount(data || null);
    } catch (error) {
      setCountError(error.message || "Unable to load count plan detail");
      setSelectedCount(null);
    } finally {
      setCountDetailLoading(false);
    }
  }, [session]);

  const loadAdjustments = useCallback(async () => {
    if (!session.tenant_id) return;
    try {
      setAdjustmentLoading(true);
      setAdjustmentError("");
      // Load all rows — filtering/pagination done client-side
      const data = await fetchAdjustmentRequests(session, {
        page: 1,
        pageSize: 9999,
      });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setAllAdjRows(rows);
    } catch (error) {
      setAdjustmentError(error.message || "Unable to load adjustments");
      setAllAdjRows([]);
    } finally {
      setAdjustmentLoading(false);
    }
  }, [session]);

  useEffect(() => { loadOptions(); }, [loadOptions]);
  useEffect(() => { if (activeTab === "stock") loadStock(); }, [activeTab, loadStock]);
  useEffect(() => { if (activeTab === "cycle") loadCountPlans(); }, [activeTab, loadCountPlans]);
  useEffect(() => { if (activeTab === "cycle") loadCountDetail(selectedCountId); }, [activeTab, selectedCountId, loadCountDetail]);
  useEffect(() => { if (activeTab === "adjustments") loadAdjustments(); }, [activeTab, loadAdjustments]);

  // Auto-select first count row when filtered results change
  useEffect(() => {
    setSelectedCountId((current) => {
      if (current && filteredCountRows.some((row) => row.count_id === current)) return current;
      return filteredCountRows[0]?.count_id || "";
    });
  }, [filteredCountRows]);

  // Auto-select first adjustment row when filtered results change
  useEffect(() => {
    setSelectedAdjustmentId((current) => {
      if (current && filteredAdjRows.some((row) => row.adj_id === current)) return current;
      return filteredAdjRows[0]?.adj_id || "";
    });
  }, [filteredAdjRows]);

  useEffect(() => {
    const parsed = parseInventoryQuery(location.search);
    if (!parsed.view) return;

    if (parsed.view === "exceptions") {
      setActiveTab("adjustments");
      const exceptionStatus = parsed.status === "open" ? "OPEN" : "";
      setAdjustmentFilters((current) => ({ ...current, status: exceptionStatus }));
      setAdjustmentPage(1);
      return;
    }

    if (["stock", "cycle", "adjustments"].includes(parsed.view)) {
      setActiveTab(parsed.view);
      if (parsed.view === "adjustments" && parsed.status) {
        setAdjustmentFilters((current) => ({ ...current, status: parsed.status.toUpperCase() }));
        setAdjustmentPage(1);
      }
    }
  }, [location.search]);

  const updateStockFilter = (key, value) => {
    setStockFilters((current) => ({ ...current, [key]: value }));
    setStockPage(1);
  };

  const updateCountFilter = (key, value) => {
    setCountFilters((current) => ({ ...current, [key]: value }));
    setCountPage(1);
    setSelectedCountId("");
  };

  const updateAdjustmentFilter = (key, value) => {
    setAdjustmentFilters((current) => ({ ...current, [key]: value }));
    setAdjustmentPage(1);
    setSelectedAdjustmentId("");
  };

  const handleCreateCount = async () => {
    const errors = {};
    if (!createCountForm.zone_id) errors.zone_id = "Zone is required";
    if (createCountForm.scope_type === "BY_LOCATION" && !createCountForm.scope_location_id) {
      errors.scope_location_id = "Location is required";
    }

    let scopeSkus = [];
    if (createCountForm.scope_type === "BY_SKU") {
      const parsed = parseScopeSkus(createCountForm.scope_sku_ids);
      if (parsed.values.length === 0) {
        errors.scope_sku_ids = "SKU list is required";
      } else if (parsed.invalid) {
        errors.scope_sku_ids = `Invalid SKU: ${parsed.invalid}`;
      } else {
        scopeSkus = parsed.values;
      }
    }

    setCreateCountErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setBusyKey("create-count");
      const data = await createCountPlan(session, {
        zone_id: createCountForm.zone_id,
        planned_date: createCountForm.planned_date || undefined,
        scope_type: createCountForm.scope_type,
        scope_location_id: createCountForm.scope_type === "BY_LOCATION" ? createCountForm.scope_location_id : undefined,
        scope_sku_ids: createCountForm.scope_type === "BY_SKU" ? scopeSkus : undefined,
      });

      setCreateCountOpen(false);
      setCreateCountForm(createCountInitial);
      setCreateCountErrors({});
      setSelectedCountId(data.count_id);
      setSelectedCount(data);
      toast({ title: "Count plan created", description: `${data.count_id} created` });
      await loadCountPlans();
    } catch (error) {
      setCountError(error.message || "Unable to create count plan");
      toast({ title: "Create failed", description: error.message || "Unable to create count plan", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleAddEntry = async () => {
    if (!selectedCount) return;

    const qty = Number(execForm.qty_counted);
    if (!Number.isFinite(qty) || qty < 0) {
      setExecError("Counted quantity must be 0 or greater");
      return;
    }
    if (!execForm.line_id && !execForm.scanned_value.trim()) {
      setExecError("Line or scanned value is required");
      return;
    }

    try {
      setBusyKey("add-entry");
      setExecError("");
      const data = await addCountPlanEntry(session, selectedCount.count_id, {
        line_id: execForm.line_id || undefined,
        scan_mode: execForm.scan_mode,
        scanned_value: execForm.scanned_value || undefined,
        qty_counted: qty,
      });

      setSelectedCount(data?.plan || null);
      setExecForm((current) => ({ ...current, line_id: "", scanned_value: "", qty_counted: "" }));
      toast({ title: "Entry posted", description: `Entry saved for ${selectedCount.count_id}` });
      await loadCountPlans();
    } catch (error) {
      setExecError(error.message || "Unable to add count entry");
      toast({ title: "Entry failed", description: error.message || "Unable to add count entry", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleSubmitCount = async () => {
    if (!selectedCount) return;
    try {
      setBusyKey("submit-count");
      const data = await submitCountPlan(session, selectedCount.count_id);
      setSelectedCount(data || null);
      toast({ title: "Count plan submitted", description: `${selectedCount.count_id} submitted` });
      await loadCountPlans();
    } catch (error) {
      setCountError(error.message || "Unable to submit count plan");
      toast({ title: "Submit failed", description: error.message || "Unable to submit count plan", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleApproveCount = async () => {
    if (!selectedCount) return;
    if (!approveForm.reason_code) {
      setApproveError("Reason code is required");
      return;
    }
    try {
      setBusyKey("approve-count");
      setApproveError("");
      const data = await approveCountPlan(session, selectedCount.count_id, {
        reason_code: approveForm.reason_code,
        approval_note: approveForm.approval_note.trim() || undefined,
      });
      setSelectedCount(data || null);
      toast({ title: "Count plan approved", description: `${selectedCount.count_id} approved` });
      await loadCountPlans();
      await loadStock();
    } catch (error) {
      setApproveError(error.message || "Unable to approve count plan");
      toast({ title: "Approve failed", description: error.message || "Unable to approve count plan", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleRejectCount = async (reason) => {
    if (!selectedCount) return;
    try {
      setBusyKey("reject-count");
      const data = await rejectCountPlan(session, selectedCount.count_id, { reason });
      // eslint-disable-next-line no-console
      console.debug("[rejectCountPlan] response fields:", data ? Object.keys(data) : null, data);
      setSelectedCount(data || null);
      setRejectCountOpen(false);
      setRejectCountReason("");
      setRejectCountTouched(false);
      toast({ title: "Count plan rejected", description: `${selectedCount.count_id} rejected` });
      await loadCountPlans();
    } catch (error) {
      setCountError(error.message || "Unable to reject count plan");
      toast({ title: "Reject failed", description: error.message || "Unable to reject count plan", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleCancelCount = async (reason) => {
    if (!cancelCountTarget) return;
    try {
      setBusyKey(`cancel-count-${cancelCountTarget.count_id}`);
      const data = await cancelCountPlan(session, cancelCountTarget.count_id, { reason });
      setCancelCountTarget(null);
      if (data?.count_id === selectedCountId) setSelectedCount(data);
      toast({ title: "Count plan cancelled", description: `${data?.count_id || cancelCountTarget.count_id} cancelled` });
      await loadCountPlans();
    } catch (error) {
      setCountError(error.message || "Unable to cancel count plan");
      toast({ title: "Cancel failed", description: error.message || "Unable to cancel count plan", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const validateCreateAdjustment = () => {
    const errors = {};
    const sku = String(createAdjForm.sku_id || "").trim();
    if (!sku) errors.sku_id = "SKU is required";
    if (!createAdjForm.location_id) errors.location_id = "Location is required";
    const qty = Number(createAdjForm.qty_delta);
    if (!Number.isFinite(qty) || qty === 0) errors.qty_delta = "Quantity delta must be non-zero";
    if (!createAdjForm.reason_code) errors.reason_code = "Reason code is required";
    setCreateAdjErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateAdjustment = async () => {
    if (!validateCreateAdjustment()) {
      setCreateAdjConfirmOpen(false);
      return;
    }
    try {
      setBusyKey("create-adjustment");
      const created = await createAdjustmentRequest(session, {
        sku_id: createAdjForm.sku_id.trim().toUpperCase(),
        location_id: createAdjForm.location_id,
        qty_delta: Number(createAdjForm.qty_delta),
        reason_code: createAdjForm.reason_code,
      });
      setCreateAdjOpen(false);
      setCreateAdjConfirmOpen(false);
      setCreateAdjForm(createAdjustmentInitial);
      setCreateAdjErrors({});
      toast({ title: "Adjustment created", description: `${created.adj_id} created as Draft` });
      await loadAdjustments();
      setSelectedAdjustmentId(created.adj_id);
    } catch (error) {
      setAdjustmentError(error.message || "Unable to submit adjustment");
      toast({ title: "Submit failed", description: error.message || "Unable to submit adjustment", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleSubmitDraftAdjustment = async (adjId) => {
    try {
      setBusyKey(`submit-adj-${adjId}`);
      await submitAdjustmentRequest(session, adjId);
      toast({ title: "Adjustment submitted", description: `${adjId} submitted` });
      await loadAdjustments();
    } catch (error) {
      setAdjustmentError(error.message || "Unable to submit adjustment");
      toast({ title: "Submit failed", description: error.message || "Unable to submit adjustment", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleApproveAdjustment = async () => {
    if (!approveAdjTarget) return;
    const adjId = approveAdjTarget.adj_id;
    try {
      setBusyKey(`approve-adj-${adjId}`);
      await approveAdjustment(session, adjId, { approval_note: approveAdjNote.trim() || undefined });
      setApproveAdjOpen(false);
      setApproveAdjNote("");
      setApproveAdjTarget(null);
      toast({ title: "Adjustment approved", description: `${adjId} approved` });
      await loadAdjustments();
      await loadStock();
    } catch (error) {
      setAdjustmentError(error.message || "Unable to approve adjustment");
      toast({ title: "Approve failed", description: error.message || "Unable to approve adjustment", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleRejectAdjustment = async (reason) => {
    if (!rejectAdjTarget) return;
    try {
      setBusyKey(`reject-adj-${rejectAdjTarget.adj_id}`);
      await rejectAdjustment(session, rejectAdjTarget.adj_id, { reason });
      setRejectAdjOpen(false);
      setRejectAdjReason("");
      setRejectAdjTouched(false);
      setRejectAdjTarget(null);
      toast({ title: "Adjustment rejected", description: "Adjustment rejected" });
      await loadAdjustments();
    } catch (error) {
      setAdjustmentError(error.message || "Unable to reject adjustment");
      toast({ title: "Reject failed", description: error.message || "Unable to reject adjustment", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  const handleCancelAdjustment = async (reason) => {
    if (!cancelAdjTarget) return;
    try {
      setBusyKey(`cancel-adj-${cancelAdjTarget.adj_id}`);
      await cancelAdjustment(session, cancelAdjTarget.adj_id, { reason });
      setCancelAdjTarget(null);
      toast({ title: "Adjustment cancelled", description: "Adjustment cancelled" });
      await loadAdjustments();
    } catch (error) {
      setAdjustmentError(error.message || "Unable to cancel adjustment");
      toast({ title: "Cancel failed", description: error.message || "Unable to cancel adjustment", variant: "destructive" });
    } finally {
      setBusyKey("");
    }
  };

  if (!session.tenant_id) {
    return (
      <AppLayout>
        <Breadcrumbs items={[{ label: "Inventory" }]} />
        <h1 className="mb-4 text-2xl font-bold">Inventory</h1>
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Select a tenant before accessing inventory data.
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Inventory" }]} />
      <h1 className="mb-4 text-2xl font-bold">Inventory</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stock">Stock on Hand</TabsTrigger>
          <TabsTrigger value="cycle">Cycle Count</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
        </TabsList>

        {/* ── STOCK ON HAND ── */}
        <TabsContent value="stock" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Stock Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Simplified: search + zone + actions */}
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-9 min-w-[220px] flex-1"
                  placeholder="Search SKU, description, location..."
                  value={stockFilters.search}
                  onChange={(event) => updateStockFilter("search", event.target.value)}
                />
                <Select value={stockFilters.zone || "all"} onValueChange={(value) => updateStockFilter("zone", value === "all" ? "" : value)}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="All Zones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Zones</SelectItem>
                    {zones.map((zone) => (
                      <SelectItem key={zone.zone_id} value={zone.zone_id}>
                        {zone.zone_id} — {zone.zone_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="h-9" onClick={() => { setStockFilters(stockInitialFilters); setStockPage(1); }}>
                  Clear
                </Button>
                <Button className="h-9" onClick={loadStock} disabled={stockLoading}>
                  Refresh
                </Button>
              </div>

              {stockError && <p className="text-sm text-destructive">{stockError}</p>}

              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-left">Location</th>
                      <th className="px-3 py-2 text-left">Zone</th>
                      <th className="px-3 py-2 text-right">On Hand</th>
                      <th className="px-3 py-2 text-right">Reserved</th>
                      <th className="px-3 py-2 text-right">Available</th>
                      <th className="px-3 py-2 text-right">Quarantine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockLoading && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                          <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading stock...</span>
                        </td>
                      </tr>
                    )}
                    {!stockLoading && stockRows.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No stock rows found.</td></tr>
                    )}
                    {!stockLoading && stockRows.map((row) => (
                      <tr key={`${row.sku_id}-${row.location_id}`} className="border-t">
                        <td className="px-3 py-2 font-medium">{row.sku_id}</td>
                        <td className="px-3 py-2">{row.sku_description || "-"}</td>
                        <td className="px-3 py-2">{row.location_code || row.location_id}</td>
                        <td className="px-3 py-2">{row.zone_id || "-"}</td>
                        <td className="px-3 py-2 text-right">{fmtQty(row.on_hand_qty)}</td>
                        <td className="px-3 py-2 text-right">{fmtQty(row.reserved_qty)}</td>
                        <td className="px-3 py-2 text-right">{fmtQty(row.available_qty)}</td>
                        <td className={cn("px-3 py-2 text-right", Number(row.quarantine_qty) > 0 ? "font-medium text-destructive" : "")}>
                          {fmtQty(row.quarantine_qty)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={stockPage}
                pageSize={stockPageSize}
                total={stockTotal}
                onPageChange={setStockPage}
                onPageSizeChange={(size) => { setStockPageSize(size); setStockPage(1); }}
                disabled={stockLoading}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CYCLE COUNT ── */}
        <TabsContent value="cycle" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Count Plans</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Row 1: search + status + zone */}
                <Input
                  className="h-9 min-w-[200px] flex-1"
                  placeholder="Search count ID or zone..."
                  value={countFilters.search}
                  onChange={(event) => updateCountFilter("search", event.target.value)}
                />
                <Select value={countFilters.status || "all"} onValueChange={(value) => updateCountFilter("status", value === "all" ? "" : value)}>
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {countStatuses.map((status) => <SelectItem key={status} value={status}>{fmtStatusLabel(status)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={countFilters.zone || "all"} onValueChange={(value) => updateCountFilter("zone", value === "all" ? "" : value)}>
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue placeholder="All Zones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Zones</SelectItem>
                    {zones.map((zone) => (
                      <SelectItem key={zone.zone_id} value={zone.zone_id}>
                        {zone.zone_id} — {zone.zone_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Row 2: date range + actions */}
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Planned date</Label>
                  <Input
                    type="date"
                    className="h-9 w-[150px]"
                    value={countFilters.dateFrom}
                    onChange={(event) => updateCountFilter("dateFrom", event.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="date"
                    className="h-9 w-[150px]"
                    value={countFilters.dateTo}
                    onChange={(event) => updateCountFilter("dateTo", event.target.value)}
                  />
                </div>
                <Button variant="outline" className="h-9" onClick={() => { setCountFilters(countInitialFilters); setCountPage(1); setSelectedCountId(""); }}>
                  Clear
                </Button>
                <Button variant="outline" className="h-9" onClick={loadCountPlans}>Refresh</Button>
                {canCreateCount && (
                  <Button className="h-9" onClick={() => setCreateCountOpen(true)} disabled={Boolean(busyKey)}>New Count Plan</Button>
                )}
              </div>

              {countError && <p className="text-sm text-destructive">{countError}</p>}

              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Count ID</th>
                      <th className="px-3 py-2 text-left">Zone</th>
                      <th className="px-3 py-2 text-left">Planned Date</th>
                      <th className="px-3 py-2 text-right">Lines</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countLoading && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading count plans...</span></td></tr>
                    )}
                    {!countLoading && countRows.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No count plans found.</td></tr>
                    )}
                    {!countLoading && countRows.map((row) => (
                      <tr
                        key={row.count_id}
                        onClick={() => setSelectedCountId(row.count_id)}
                        className={cn("border-t cursor-pointer hover:bg-muted/40", selectedCountId === row.count_id ? "bg-muted/30" : "")}
                      >
                        <td className="px-3 py-2 font-medium">{row.count_id}</td>
                        <td className="px-3 py-2">{row.zone_id}</td>
                        <td className="px-3 py-2">{fmtDate(row.planned_date)}</td>
                        <td className="px-3 py-2 text-right">{fmtQty(row.lines_count)}</td>
                        <td className="px-3 py-2"><StatusBadge status={normalizeStatus(row.status)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={countPage}
                pageSize={countPageSize}
                total={countTotal}
                onPageChange={setCountPage}
                onPageSizeChange={(size) => { setCountPageSize(size); setCountPage(1); }}
                disabled={countLoading}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Count Execution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedCountId && <p className="text-sm text-muted-foreground">Select a count plan above to view details.</p>}
              {selectedCountId && countDetailLoading && (
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading detail...
                </p>
              )}

              {selectedCount && (
                <>
                  <div className="rounded-md border bg-muted/20 px-4 py-3">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Count ID</p>
                        <p className="font-medium">{selectedCount.count_id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                        <StatusBadge status={normalizeStatus(selectedCount.status)} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                        <p>{fmtDateTime(selectedCount.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Zone</p>
                        <p>{selectedCount.zone_id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Threshold</p>
                        <p>{countConfig?.variance_threshold_mode === "absolute" ? `${countConfig?.variance_threshold_abs || 0} units` : `${countConfig?.variance_threshold_percent || 0}%`}</p>
                      </div>
                      {["APPROVED", "REJECTED", "CANCELLED"].includes(String(selectedCount.status || "").toUpperCase()) && (() => {
                        const st = String(selectedCount.status || "").toUpperCase();
                        const isRejected  = st === "REJECTED";
                        const isCancelled = st === "CANCELLED";

                        if (isCancelled) {
                          return (
                            <div className="col-span-2 md:col-span-3 pt-1">
                              <p className="text-xs text-muted-foreground mb-0.5">Cancellation Reason</p>
                              {selectedCount.cancellation_reason
                                ? <p className="text-sm font-medium text-destructive">{selectedCount.cancellation_reason}</p>
                                : <p className="text-sm italic text-muted-foreground">—</p>}
                            </div>
                          );
                        }

                        // APPROVED or REJECTED — show reason code label + optional note
                        const reasonCode = isRejected
                          ? null
                          : selectedCount.approval_reason_code;
                        const reasonLabel = reasonCode
                          ? (reasonMap.get(reasonCode)?.reason_name || reasonCode)
                          : null;
                        const note = isRejected
                          ? selectedCount.approval_note
                          : selectedCount.approval_note;

                        return (
                          <>
                            {reasonLabel && (
                              <div className="col-span-2 md:col-span-3 pt-1">
                                <p className="text-xs text-muted-foreground mb-0.5">Reason</p>
                                <p className="text-sm font-medium">{reasonLabel}</p>
                              </div>
                            )}
                            <div className="col-span-2 md:col-span-3 pt-1">
                              <p className="text-xs text-muted-foreground mb-0.5">{isRejected ? "Rejection Reason" : "Note"}</p>
                              {note
                                ? <p className={`text-sm font-medium ${isRejected ? "text-destructive" : ""}`}>{note}</p>
                                : <p className="text-sm italic text-muted-foreground">—</p>}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {(canSubmitCount || canApproveCount || canCancelCountByRole) && (
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      {canSubmitCount && ["DRAFT", "IN_PROGRESS"].includes(selectedCount.status) && (
                        <Button size="sm" variant="outline" onClick={handleSubmitCount} disabled={Boolean(busyKey)}>
                          {busyKey === "submit-count" ? "Submitting..." : "Submit For Approval"}
                        </Button>
                      )}
                      {canApproveCount && selectedCount.status === "SUBMITTED" && (
                        <Button size="sm" onClick={handleApproveCount} disabled={Boolean(busyKey)}>
                          {busyKey === "approve-count" ? "Approving..." : "Approve"}
                        </Button>
                      )}
                      {canApproveCount && selectedCount.status === "SUBMITTED" && (
                        <Button size="sm" variant="outline" onClick={() => { setRejectCountOpen(true); setRejectCountReason(""); setRejectCountTouched(false); }} disabled={Boolean(busyKey)}>
                          Reject
                        </Button>
                      )}
                      {canCancelCountByRole && ["DRAFT", "IN_PROGRESS", "SUBMITTED"].includes(selectedCount.status) && (
                        <Button size="sm" variant="destructive" onClick={() => setCancelCountTarget(selectedCount)} disabled={Boolean(busyKey)}>
                          {busyKey === `cancel-count-${selectedCount.count_id}` ? "Cancelling..." : "Cancel Count"}
                        </Button>
                      )}
                    </div>
                  )}

                  {canApproveCount && selectedCount.status === "SUBMITTED" && (
                    <div className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Reason Code</Label>
                        <Select value={approveForm.reason_code || "none"} onValueChange={(value) => { setApproveError(""); setApproveForm((current) => ({ ...current, reason_code: value === "none" ? "" : value })); }}>
                          <SelectTrigger><SelectValue placeholder="Select Reason" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select Reason</SelectItem>
                            {reasonCodes.map((reason) => <SelectItem key={reason.reason_code} value={reason.reason_code}>{reason.reason_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Approval Note</Label>
                        <Input value={approveForm.approval_note} onChange={(event) => { setApproveError(""); setApproveForm((current) => ({ ...current, approval_note: event.target.value })); }} placeholder="Optional note..." />
                      </div>
                      {approveError && <p className="text-xs text-destructive md:col-span-2">{approveError}</p>}
                    </div>
                  )}

                  {canExecuteCount && ["DRAFT", "IN_PROGRESS"].includes(selectedCount.status) && (
                    <div className="rounded-md border p-4 space-y-3">
                      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide" style={{fontSize: 11, letterSpacing: "0.07em"}}>Add Count Entry</p>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Line</Label>
                          <Select value={execForm.line_id || "none"} onValueChange={(value) => { setExecError(""); setExecForm((current) => ({ ...current, line_id: value === "none" ? "" : value })); }}>
                            <SelectTrigger><SelectValue placeholder="Select Line" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Auto Resolve By Scan</SelectItem>
                              {(selectedCount.lines || []).map((line) => <SelectItem key={line.line_id} value={line.line_id}>{line.line_id} — {line.sku_id}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Scan Mode</Label>
                          <Select value={execForm.scan_mode} onValueChange={(value) => setExecForm((current) => ({ ...current, scan_mode: value }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{scanModes.map((mode) => <SelectItem key={mode} value={mode}>{fmtStatusLabel(mode)}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Scanned / Typed Value</Label>
                          <Input value={execForm.scanned_value} onChange={(event) => { setExecError(""); setExecForm((current) => ({ ...current, scanned_value: event.target.value })); }} placeholder="e.g. SKU000004" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Qty Counted</Label>
                          <Input type="number" min="0" step="0.01" value={execForm.qty_counted} onChange={(event) => { setExecError(""); setExecForm((current) => ({ ...current, qty_counted: event.target.value })); }} placeholder="0" />
                        </div>
                      </div>
                      {execError && <p className="text-xs text-destructive">{execError}</p>}
                      <Button size="sm" onClick={handleAddEntry} disabled={Boolean(busyKey)}>
                        {busyKey === "add-entry" ? "Posting..." : "Add Entry"}
                      </Button>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="px-3 py-2 text-left">Line</th>
                          <th className="px-3 py-2 text-left">SKU</th>
                          <th className="px-3 py-2 text-left">Location</th>
                          <th className="px-3 py-2 text-right">System Qty</th>
                          <th className="px-3 py-2 text-right">Counted Qty</th>
                          <th className="px-3 py-2 text-right">Variance</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedCount.lines || []).length === 0 && (
                          <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No lines found.</td></tr>
                        )}
                        {(selectedCount.lines || []).map((line) => (
                          <tr key={line.line_id} className="border-t">
                            <td className="px-3 py-2">{line.line_id}</td>
                            <td className="px-3 py-2">{line.sku_id}</td>
                            <td className="px-3 py-2">{locationMap.get(line.location_id)?.location_code || line.location_id}</td>
                            <td className="px-3 py-2 text-right">{fmtQty(line.system_qty)}</td>
                            <td className="px-3 py-2 text-right">{line.counted_qty === null ? "-" : fmtQty(line.counted_qty)}</td>
                            <td className="px-3 py-2 text-right">{line.variance_qty === null ? "-" : fmtQty(line.variance_qty)}</td>
                            <td className="px-3 py-2"><StatusBadge status={normalizeStatus(line.status)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ADJUSTMENTS ── */}
        <TabsContent value="adjustments" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Adjustment Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Simplified: search + status + actions */}
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-9 min-w-[220px] flex-1"
                  placeholder="Search ADJ ID, SKU, location..."
                  value={adjustmentFilters.search}
                  onChange={(event) => updateAdjustmentFilter("search", event.target.value)}
                />
                <Select value={adjustmentFilters.status || "all"} onValueChange={(value) => updateAdjustmentFilter("status", value === "all" ? "" : value)}>
                  <SelectTrigger className="h-9 w-[160px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="OPEN">Open</SelectItem>
                    {adjustmentStatuses.map((status) => <SelectItem key={status} value={status}>{fmtStatusLabel(status)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="h-9" onClick={() => { setAdjustmentFilters(adjustmentInitialFilters); setAdjustmentPage(1); setSelectedAdjustmentId(""); }}>Clear</Button>
                <Button variant="outline" className="h-9" onClick={loadAdjustments}>Refresh</Button>
                <Button className="h-9" onClick={() => setCreateAdjOpen(true)} disabled={!canCreateAdj || Boolean(busyKey)}>
                  New Adjustment
                </Button>
              </div>

              {adjustmentError && <p className="text-sm text-destructive">{adjustmentError}</p>}

              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left">ADJ ID</th>
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">Location</th>
                      <th className="px-3 py-2 text-right">Qty Delta</th>
                      <th className="px-3 py-2 text-left">Reason</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Requested At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustmentLoading && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading adjustments...</span></td></tr>
                    )}
                    {!adjustmentLoading && adjustmentRows.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No adjustments found.</td></tr>
                    )}
                    {!adjustmentLoading && adjustmentRows.map((row) => (
                      <tr
                        key={row.adj_id}
                        className={cn("border-t cursor-pointer hover:bg-muted/40", selectedAdjustmentId === row.adj_id ? "bg-muted/30" : "")}
                        onClick={() => setSelectedAdjustmentId(row.adj_id)}
                      >
                        <td className="px-3 py-2 font-medium">{row.adj_id}</td>
                        <td className="px-3 py-2">{row.sku_id}</td>
                        <td className="px-3 py-2">{locationMap.get(row.location_id)?.location_code || row.location_id}</td>
                        <td className="px-3 py-2 text-right">{fmtQty(row.qty_delta)}</td>
                        <td className="px-3 py-2">{reasonMap.get(row.reason_code)?.reason_name || row.reason_code}</td>
                        <td className="px-3 py-2"><StatusBadge status={normalizeStatus(row.status)} /></td>
                        <td className="px-3 py-2">{fmtDateTime(row.requested_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={adjustmentPage}
                pageSize={adjustmentPageSize}
                total={adjustmentTotal}
                onPageChange={setAdjustmentPage}
                onPageSizeChange={(size) => { setAdjustmentPageSize(size); setAdjustmentPage(1); }}
                disabled={adjustmentLoading}
              />
            </CardContent>
          </Card>

          {selectedAdjustment && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {selectedAdjustment.adj_id}
                  <StatusBadge status={normalizeStatus(selectedAdjustment.status)} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Info grid */}
                <div className="rounded-md border bg-muted/20 px-4 py-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">SKU</p>
                      <p className="font-medium">{selectedAdjustment.sku_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Location</p>
                      <p>{locationMap.get(selectedAdjustment.location_id)?.location_code || selectedAdjustment.location_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Qty Delta</p>
                      <p className={`font-medium ${Number(selectedAdjustment.qty_delta) < 0 ? "text-destructive" : "text-green-700"}`}>
                        {Number(selectedAdjustment.qty_delta) > 0 ? "+" : ""}{fmtQty(selectedAdjustment.qty_delta)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Reason</p>
                      <p>{reasonMap.get(selectedAdjustment.reason_code)?.reason_name || selectedAdjustment.reason_code || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Requested By</p>
                      <p>{selectedAdjustment.requested_by || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Requested At</p>
                      <p>{fmtDateTime(selectedAdjustment.requested_at)}</p>
                    </div>
                    {selectedAdjustment.approved_by && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          {String(selectedAdjustment.status).toUpperCase() === "REJECTED" ? "Rejected By" : "Approved By"}
                        </p>
                        <p>{selectedAdjustment.approved_by}</p>
                      </div>
                    )}
                    {selectedAdjustment.approved_at && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          {String(selectedAdjustment.status).toUpperCase() === "REJECTED" ? "Rejected At" : "Approved At"}
                        </p>
                        <p>{fmtDateTime(selectedAdjustment.approved_at)}</p>
                      </div>
                    )}
                    {/* Terminal status reasons */}
                    {String(selectedAdjustment.status).toUpperCase() === "CANCELLED" && (
                      <div className="col-span-2 md:col-span-4">
                        <p className="text-xs text-muted-foreground mb-0.5">Cancellation Reason</p>
                        <p className="font-medium text-destructive">{selectedAdjustment.cancellation_reason || "—"}</p>
                      </div>
                    )}
                    {String(selectedAdjustment.status).toUpperCase() === "REJECTED" && (
                      <div className="col-span-2 md:col-span-4">
                        <p className="text-xs text-muted-foreground mb-0.5">Rejection Reason</p>
                        <p className="font-medium text-destructive">{selectedAdjustment.rejection_reason || selectedAdjustment.approval_note || "—"}</p>
                      </div>
                    )}
                    {String(selectedAdjustment.status).toUpperCase() === "APPROVED" && selectedAdjustment.approval_note && (
                      <div className="col-span-2 md:col-span-4">
                        <p className="text-xs text-muted-foreground mb-0.5">Approval Note</p>
                        <p className="font-medium">{selectedAdjustment.approval_note}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons — same pattern as Cycle Count */}
                {(canSubmitAdj || canApproveAdj || canCancelAdjByRole) && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    {canSubmitAdj && selectedAdjustment.status === "DRAFT" && (
                      <Button size="sm" variant="outline" disabled={Boolean(busyKey)} onClick={() => handleSubmitDraftAdjustment(selectedAdjustment.adj_id)}>
                        {busyKey === `submit-adj-${selectedAdjustment.adj_id}` ? "Submitting..." : "Submit For Approval"}
                      </Button>
                    )}
                    {canApproveAdj && selectedAdjustment.status === "SUBMITTED" && (
                      <Button size="sm" disabled={Boolean(busyKey)} onClick={() => { setApproveAdjTarget(selectedAdjustment); setApproveAdjNote(""); setApproveAdjOpen(true); }}>
                        Approve
                      </Button>
                    )}
                    {canApproveAdj && selectedAdjustment.status === "SUBMITTED" && (
                      <Button size="sm" variant="outline" disabled={Boolean(busyKey)} onClick={() => { setRejectAdjTarget(selectedAdjustment); setRejectAdjReason(""); setRejectAdjTouched(false); setRejectAdjOpen(true); }}>
                        Reject
                      </Button>
                    )}
                    {canCancelAdjByRole && ["DRAFT", "SUBMITTED"].includes(selectedAdjustment.status) && (
                      <Button size="sm" variant="destructive" disabled={Boolean(busyKey)} onClick={() => setCancelAdjTarget(selectedAdjustment)}>
                        {busyKey === `cancel-adj-${selectedAdjustment.adj_id}` ? "Cancelling..." : "Cancel Adjustment"}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── DIALOGS ── */}
      <Dialog open={createCountOpen} onOpenChange={(open) => { setCreateCountOpen(open); if (!open) { setCreateCountForm(createCountInitial); setCreateCountErrors({}); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Count Plan</DialogTitle>
            <DialogDescription>Create cycle count plan by zone and scope.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Zone</Label>
              <Select value={createCountForm.zone_id || "none"} onValueChange={(value) => { setCreateCountErrors((current) => ({ ...current, zone_id: "" })); setCreateCountForm((current) => ({ ...current, zone_id: value === "none" ? "" : value })); }}>
                <SelectTrigger><SelectValue placeholder="Select Zone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select Zone</SelectItem>
                  {zones.map((zone) => <SelectItem key={zone.zone_id} value={zone.zone_id}>{zone.zone_id} — {zone.zone_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {createCountErrors.zone_id && <p className="text-xs text-destructive">{createCountErrors.zone_id}</p>}
            </div>
            <div className="space-y-1">
              <Label>Planned Date</Label>
              <Input type="date" value={createCountForm.planned_date} onChange={(event) => setCreateCountForm((current) => ({ ...current, planned_date: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Scope Type</Label>
              <Select value={createCountForm.scope_type} onValueChange={(value) => setCreateCountForm((current) => ({ ...current, scope_type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_ZONE">Full Zone</SelectItem>
                  <SelectItem value="BY_LOCATION">By Location</SelectItem>
                  <SelectItem value="BY_SKU">By SKU</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createCountForm.scope_type === "BY_LOCATION" && (
              <div className="space-y-1">
                <Label>Location</Label>
                <Select value={createCountForm.scope_location_id || "none"} onValueChange={(value) => { setCreateCountErrors((current) => ({ ...current, scope_location_id: "" })); setCreateCountForm((current) => ({ ...current, scope_location_id: value === "none" ? "" : value })); }}>
                  <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select Location</SelectItem>
                    {locations.map((location) => <SelectItem key={location.location_id} value={location.location_id}>{location.location_code} ({location.location_id})</SelectItem>)}
                  </SelectContent>
                </Select>
                {createCountErrors.scope_location_id && <p className="text-xs text-destructive">{createCountErrors.scope_location_id}</p>}
              </div>
            )}
            {createCountForm.scope_type === "BY_SKU" && (
              <div className="space-y-1">
                <Label>SKU IDs (comma separated)</Label>
                <Input value={createCountForm.scope_sku_ids} onChange={(event) => { setCreateCountErrors((current) => ({ ...current, scope_sku_ids: "" })); setCreateCountForm((current) => ({ ...current, scope_sku_ids: event.target.value })); }} placeholder="SKU000001, SKU000002" />
                {createCountErrors.scope_sku_ids && <p className="text-xs text-destructive">{createCountErrors.scope_sku_ids}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCountOpen(false)} disabled={Boolean(busyKey)}>Back</Button>
            <Button onClick={handleCreateCount} disabled={Boolean(busyKey)}>{busyKey === "create-count" ? "Creating..." : "Create Plan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createAdjOpen} onOpenChange={(open) => { setCreateAdjOpen(open); if (!open) { setCreateAdjConfirmOpen(false); setCreateAdjForm(createAdjustmentInitial); setCreateAdjErrors({}); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Adjustment</DialogTitle>
            <DialogDescription>Create a new adjustment request. You can review and submit for approval after.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>SKU</Label>
              <Select value={createAdjForm.sku_id || "none"} onValueChange={(value) => { setCreateAdjErrors((current) => ({ ...current, sku_id: "" })); setCreateAdjForm((current) => ({ ...current, sku_id: value === "none" ? "" : value })); }}>
                <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select SKU</SelectItem>
                  {skus.map((sku) => (
                    <SelectItem key={sku.sku_id} value={sku.sku_id}>
                      {sku.sku_id} — {sku.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createAdjErrors.sku_id && <p className="text-xs text-destructive">{createAdjErrors.sku_id}</p>}
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Select value={createAdjForm.location_id || "none"} onValueChange={(value) => { setCreateAdjErrors((current) => ({ ...current, location_id: "" })); setCreateAdjForm((current) => ({ ...current, location_id: value === "none" ? "" : value })); }}>
                <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select Location</SelectItem>
                  {locations.map((location) => <SelectItem key={location.location_id} value={location.location_id}>{location.location_code} ({location.location_id})</SelectItem>)}
                </SelectContent>
              </Select>
              {createAdjErrors.location_id && <p className="text-xs text-destructive">{createAdjErrors.location_id}</p>}
            </div>
            <div className="space-y-1">
              <Label>Qty Delta</Label>
              <Input type="number" step="0.01" value={createAdjForm.qty_delta} onChange={(event) => { setCreateAdjErrors((current) => ({ ...current, qty_delta: "" })); setCreateAdjForm((current) => ({ ...current, qty_delta: event.target.value })); }} placeholder="Positive / negative quantity" />
              {createAdjErrors.qty_delta && <p className="text-xs text-destructive">{createAdjErrors.qty_delta}</p>}
            </div>
            <div className="space-y-1">
              <Label>Reason Code</Label>
              <Select value={createAdjForm.reason_code || "none"} onValueChange={(value) => { setCreateAdjErrors((current) => ({ ...current, reason_code: "" })); setCreateAdjForm((current) => ({ ...current, reason_code: value === "none" ? "" : value })); }}>
                <SelectTrigger><SelectValue placeholder="Select Reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select Reason</SelectItem>
                  {reasonCodes.map((reason) => <SelectItem key={reason.reason_code} value={reason.reason_code}>{reason.reason_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {createAdjErrors.reason_code && <p className="text-xs text-destructive">{createAdjErrors.reason_code}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateAdjOpen(false)} disabled={Boolean(busyKey)}>Back</Button>
            <Button onClick={() => { if (validateCreateAdjustment()) setCreateAdjConfirmOpen(true); }} disabled={Boolean(busyKey)}>Review & Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={createAdjConfirmOpen}
        onClose={() => setCreateAdjConfirmOpen(false)}
        onConfirm={handleCreateAdjustment}
        title="Confirm New Adjustment"
        description="Create this adjustment request as Draft?"
        confirmLabel={busyKey === "create-adjustment" ? "Creating..." : "Confirm Create"}
      />

      <ReasonDialog
        open={rejectCountOpen}
        onOpenChange={setRejectCountOpen}
        title="Reject Count Plan"
        description={`Provide rejection reason for ${selectedCount?.count_id || "count plan"}.`}
        reason={rejectCountReason}
        setReason={setRejectCountReason}
        touched={rejectCountTouched}
        setTouched={setRejectCountTouched}
        submitting={busyKey === "reject-count"}
        confirmLabel="Confirm Reject"
        onConfirm={handleRejectCount}
      />

      {/* Approve Adjustment Dialog */}
      <Dialog open={approveAdjOpen} onOpenChange={(open) => { if (!Boolean(busyKey)) { setApproveAdjOpen(open); if (!open) { setApproveAdjNote(""); setApproveAdjTarget(null); } } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Adjustment</DialogTitle>
            <DialogDescription>
              Approve {approveAdjTarget?.adj_id || "adjustment"}? Stock will be updated immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {approveAdjTarget && (
              <div className="rounded-md border bg-muted/20 px-4 py-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">SKU</p>
                  <p className="font-medium">{approveAdjTarget.sku_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Qty Delta</p>
                  <p className={`font-medium ${Number(approveAdjTarget.qty_delta) < 0 ? "text-destructive" : "text-green-700"}`}>
                    {Number(approveAdjTarget.qty_delta) > 0 ? "+" : ""}{fmtQty(approveAdjTarget.qty_delta)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Reason</p>
                  <p>{reasonMap.get(approveAdjTarget.reason_code)?.reason_name || approveAdjTarget.reason_code}</p>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="adj-approval-note">Approval Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="adj-approval-note"
                value={approveAdjNote}
                onChange={(e) => setApproveAdjNote(e.target.value)}
                placeholder="e.g. Verified physically, approved."
                disabled={Boolean(busyKey)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveAdjOpen(false)} disabled={Boolean(busyKey)}>Back</Button>
            <Button onClick={handleApproveAdjustment} disabled={Boolean(busyKey)}>
              {busyKey ? "Approving..." : "Confirm Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={rejectAdjOpen}
        onOpenChange={setRejectAdjOpen}
        title="Reject Adjustment"
        description={`Provide rejection reason for ${rejectAdjTarget?.adj_id || "adjustment"}.`}
        reason={rejectAdjReason}
        setReason={setRejectAdjReason}
        touched={rejectAdjTouched}
        setTouched={setRejectAdjTouched}
        submitting={Boolean(rejectAdjTarget && busyKey === `reject-adj-${rejectAdjTarget.adj_id}`)}
        confirmLabel="Confirm Reject"
        onConfirm={handleRejectAdjustment}
      />

      <CancellationConfirmModal
        open={Boolean(cancelCountTarget)}
        documentType="count plan"
        documentId={cancelCountTarget?.count_id || ""}
        onClose={() => setCancelCountTarget(null)}
        onConfirm={handleCancelCount}
        submitting={Boolean(cancelCountTarget && busyKey === `cancel-count-${cancelCountTarget.count_id}`)}
      />

      <CancellationConfirmModal
        open={Boolean(cancelAdjTarget)}
        documentType="adjustment"
        documentId={cancelAdjTarget?.adj_id || ""}
        onClose={() => setCancelAdjTarget(null)}
        onConfirm={handleCancelAdjustment}
        submitting={Boolean(cancelAdjTarget && busyKey === `cancel-adj-${cancelAdjTarget.adj_id}`)}
      />
    </AppLayout>
  );
};

export default InventoryPage;