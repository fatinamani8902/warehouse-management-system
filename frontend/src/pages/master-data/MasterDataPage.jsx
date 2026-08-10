import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { CustomConfirmModal } from "@/components/shared/CustomConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { canEditMasterData, canDeleteMasterData, normalizeRole } from "@/services/rbac";
import { formatCapacityValue, formatDimensionValue, formatDimensions } from "@/utils/locationDimensions";
import {
  fetchSuppliers, createSupplier, updateSupplier, deleteSupplier,
  listSkus, createSku, updateSku, deleteSku,
  fetchWarehouses, createWarehouseApi, updateWarehouseApi, deleteWarehouseApi,
  fetchCustomers, createCustomerApi, updateCustomerApi, deleteCustomerApi,
  fetchTaxonomyZones, createTaxonomyZone, updateTaxonomyZone, deleteTaxonomyZone,
  fetchAisles, createAisle, updateAisle, deleteAisle,
  fetchBays, createBay, updateBay, deleteBay,
  fetchLevels, createLevel, updateLevel, deleteLevel,
  fetchBins, createBin, updateBin, deleteBin,
  fetchLocations, createLocationApi,
  calcShelfDimension,
  toSessionContext,
} from "@/services/api";

// -- Design tokens -------------------------------------------------------------
const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 12px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: "#e03131", color: "#fff" };
const btnOutline = { ...btnBase, height: 28, padding: "0 10px", borderRadius: 6, fontSize: 13, fontWeight: 500, lineHeight: "20px", border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnLevel   = (active) => ({ ...btnBase, height: 30, padding: "0 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: active ? ACCENT : "#f3f4f6", color: active ? "#fff" : T_LABEL, border: "none" });

const cardStyle  = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };
const thStyle    = { padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap", background: "#fafbff" };
const tdStyle    = { padding: "12px 14px", borderBottom: "0.5px solid #f0f0f0", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY };

const ZONE_TYPES = ["storage", "dock", "quarantine", "staging", "returns"];
const PAGE_SIZE  = 10;
const EMPTY_SKU_FORM = {
  sku_id: "",
  sku_code: "",
  description: "",
  uom: "EA",
  category: "",
  hazardous: false,
  weight: "",
  dimensions: "",
  reorder_point: "0",
  reorder_qty: "0",
  status: "active",
  qr_payload: "",
  rfid_epc: "",
};

const normalizeBusinessCode = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

// -- StatusPill ----------------------------------------------------------------
const STATUS_CFG = {
  active:   { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e", label: "Active" },
  inactive: { bg: "#f3f4f6", color: "#374151", border: "#d1d5db", dot: "#9ca3af", label: "Inactive" },
};
function StatusPill({ status }) {
  const c = STATUS_CFG[String(status || "").toLowerCase() === "true" || status === true ? "active" : String(status || "").toLowerCase()] || STATUS_CFG.inactive;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, lineHeight: "16px", padding: "3px 10px", borderRadius: 20, background: c.bg, color: c.color, border: `0.5px solid ${c.border}`, whiteSpace: "nowrap" }}>
      {c.label}
    </span>
  );
}

// -- MonoCode ------------------------------------------------------------------
function MonoCode({ children }) {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: T_SECONDARY }}>{children}</span>;
}

// -- FormField -----------------------------------------------------------------
function FormField({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL }}>
        {label}{required && <span style={{ color: "#e03131", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// -- FormCard ------------------------------------------------------------------
function FormCard({ title, children }) {
  return (
    <div style={cardStyle}>
      <div style={{ padding: "11px 16px", background: "#fafbff", borderBottom: "0.5px solid #eef0fc" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T_PRIMARY }}>{title}</span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

// -- TableCard -----------------------------------------------------------------
function TableCard({ children }) { return <div style={cardStyle}>{children}</div>; }

// -- Toolbar -------------------------------------------------------------------
function Toolbar({ search, onSearch, onClear, onRefresh, loading, placeholder, extra }) {
  return (
    <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
        <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }} placeholder={placeholder || "Search…"} value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      {extra}
      <div style={{ flex: 1 }} />
      <button style={btnNeutral} onClick={onClear}>Clear</button>
      <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={onRefresh} disabled={loading}>Refresh</button>
    </div>
  );
}

// -- Pagination ----------------------------------------------------------------
function Pagination({ page, totalPages, pageSize, onPage, onPageSize, total }) {
  return (
    <div style={{ padding: "8px 14px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <span style={{ fontSize: 12, color: T_MUTED }}>{total} record{total !== 1 ? "s" : ""} · Page {page} of {totalPages}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger style={{ height: 30, width: 110, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 5, color: T_PRIMARY }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>
        {[{ label: "Prev", disabled: page <= 1, fn: () => onPage(page - 1) }, { label: "Next", disabled: page >= totalPages, fn: () => onPage(page + 1) }].map((b) => (
          <button key={b.label} disabled={b.disabled} onClick={b.fn} style={{ ...btnOutline, opacity: b.disabled ? 0.4 : 1, cursor: b.disabled ? "not-allowed" : "pointer" }}>{b.label}</button>
        ))}
      </div>
    </div>
  );
}

// -- DataTable -----------------------------------------------------------------
function DataTable({ loading, rows, cols, emptyText, page, pageSize, onPage, onPageSize, serverPagination = false, total: serverTotal, totalPages: serverTotalPages }) {
  const total      = serverPagination ? serverTotal : rows.length;
  const totalPages = serverPagination ? serverTotalPages : Math.max(1, Math.ceil(total / pageSize));
  const paged      = serverPagination ? rows : rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
          <thead><tr>{cols.map((c) => <th key={c.key} style={{ ...thStyle, textAlign: c.right ? "right" : "left" }}>{c.label}</th>)}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan={cols.length} style={{ ...tdStyle, textAlign: "center", color: T_MUTED }}>Loading…</td></tr>}
            {!loading && !paged.length && <tr><td colSpan={cols.length} style={{ ...tdStyle, textAlign: "center", color: T_MUTED }}>{emptyText || "No records found."}</td></tr>}
            {!loading && paged.map((row, i) => (
              <tr key={i} style={{ transition: "background 0.1s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#fafbff"} onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                {cols.map((c) => <td key={c.key} style={{ ...tdStyle, textAlign: c.right ? "right" : "left" }}>{c.render ? c.render(row) : row[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} pageSize={pageSize} total={total} onPage={onPage} onPageSize={onPageSize} />
    </>
  );
}

// -- RowActions ----------------------------------------------------------------
function RowActions({ onEdit, onDelete, canEdit, canDelete, extraActions }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {extraActions}
      {canEdit  && <button style={btnOutline} onClick={onEdit}>Edit</button>}
      {canDelete && <button style={{ ...btnOutline, color: "#e03131", borderColor: "#fca5a5" }} onClick={onDelete}>Delete</button>}
    </div>
  );
}

// -- DeleteModal ---------------------------------------------------------------
function DeleteModal({ open, onClose, onConfirm, title, description, confirming }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p style={{ fontSize: 13, color: T_SECONDARY }}>{description}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
            <button style={btnNeutral} onClick={onClose} disabled={confirming}>Back</button>
            <button style={{ ...btnDanger, opacity: confirming ? 0.6 : 1 }} onClick={onConfirm} disabled={confirming}>{confirming ? "Deleting…" : "Confirm Delete"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -- UtilBar -------------------------------------------------------------------
function UtilBar({ pct, color, label }) {
  const safeColor = color || (pct > 90 ? "#e03131" : pct > 70 ? "#f59e0b" : "#22c55e");
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12, color: T_LABEL }}><span>{label}</span><span style={{ fontWeight: 600, color: safeColor }}>{pct}%</span></div>
      <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: safeColor, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// -- Page ----------------------------------------------------------------------
const MasterDataPage = () => {
  const auth      = useAuth();
  const { toast } = useToast();
  const session   = useMemo(() => toSessionContext(auth), [auth]);
  const roleId    = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);
  const canEdit   = useMemo(() => canEditMasterData(roleId), [roleId]);
  const canDel    = useMemo(() => canDeleteMasterData(roleId), [roleId]);

  // -- Suppliers ------------------------------------------------------------
  const [supplierRows, setSupplierRows]               = useState([]);
  const [supplierLoading, setSupplierLoading]         = useState(true);
  const [supplierError, setSupplierError]             = useState("");
  const [savingSupplier, setSavingSupplier]           = useState(false);
  const [supplierDeleteTarget, setSupplierDeleteTarget] = useState(null);
  const [supplierForm, setSupplierForm]               = useState({ supplier_id: "", supplier_code: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true });
  const [supplierFormError, setSupplierFormError]     = useState("");
  const [supplierSearch, setSupplierSearch]           = useState("");
  const [supplierPage, setSupplierPage]               = useState(1);
  const [supplierPageSize, setSupplierPageSize]       = useState(PAGE_SIZE);
  const [selectedSupplierId, setSelectedSupplierId]   = useState("");
  const isEditingSupplier = Boolean(supplierForm.supplier_id);
  const selectedSupplier  = useMemo(() => supplierRows.find((r) => r.supplier_id === selectedSupplierId) || null, [supplierRows, selectedSupplierId]);

  // -- SKU -------------------------------------------------------------------
  const [skuRows, setSkuRows]                   = useState([]);
  const [skuLoading, setSkuLoading]             = useState(true);
  const [skuError, setSkuError]                 = useState("");
  const [savingSku, setSavingSku]               = useState(false);
  const [deletingSku, setDeletingSku]           = useState(false);
  const [skuDeleteTarget, setSkuDeleteTarget]   = useState(null);
  const [skuForm, setSkuForm]                   = useState(EMPTY_SKU_FORM);
  const [skuFormError, setSkuFormError]         = useState("");
  const [skuSearch, setSkuSearch]               = useState("");
  const [skuStatus, setSkuStatus]               = useState("all");
  const [skuPage, setSkuPage]                   = useState(1);
  const [skuPageSize, setSkuPageSize]           = useState(PAGE_SIZE);
  const [skuTotal, setSkuTotal]                 = useState(0);
  const [skuTotalPages, setSkuTotalPages]       = useState(1);
  const isEditingSku = Boolean(skuForm.sku_id);

  // -- Warehouses ------------------------------------------------------------
  const [warehouseRows, setWarehouseRows]                 = useState([]);
  const [warehouseLoading, setWarehouseLoading]           = useState(true);
  const [savingWarehouse, setSavingWarehouse]             = useState(false);
  const [warehouseForm, setWarehouseForm]                 = useState({ warehouse_id: "", warehouse_name: "", city: "", country: "" });
  const [warehouseSearch, setWarehouseSearch]             = useState("");
  const [warehousePage, setWarehousePage]                 = useState(1);
  const [warehousePageSize, setWarehousePageSize]         = useState(PAGE_SIZE);
  const [isEditingWarehouse, setIsEditingWarehouse]       = useState(false);
  const [warehouseDeleteTarget, setWarehouseDeleteTarget] = useState(null);
  const [warehouseFormError, setWarehouseFormError]       = useState("");

  // -- Customers -------------------------------------------------------------
  const [customerRows, setCustomerRows]                 = useState([]);
  const [customerLoading, setCustomerLoading]           = useState(true);
  const [customerError, setCustomerError]               = useState("");
  const [savingCustomer, setSavingCustomer]             = useState(false);
  const [customerDeleteTarget, setCustomerDeleteTarget] = useState(null);
  const [customerForm, setCustomerForm]                 = useState({ customer_id: "", customer_name: "", contact: "", phone: "" });
  const [customerFormError, setCustomerFormError]       = useState("");
  const [customerSearch, setCustomerSearch]             = useState("");
  const [customerPage, setCustomerPage]                 = useState(1);
  const [customerPageSize, setCustomerPageSize]         = useState(PAGE_SIZE);
  const isEditingCustomer = Boolean(customerForm.customer_id);

  // -- Location Taxonomy -----------------------------------------------------
  const [taxLevel, setTaxLevel]       = useState("zones");
  const [taxDelTarget, setTaxDelTarget] = useState(null);
  const [taxDeleting, setTaxDeleting] = useState(false);

  // Zones
  const [zoneRows, setZoneRows]             = useState([]);
  const [zoneLoading, setZoneLoading]       = useState(false);
  const [zoneForm, setZoneForm]             = useState({ zone_id: "", zone_code: "", zone_name: "", zone_type: "storage", warehouse_id: "", status: "active" });
  const [zoneFormErr, setZoneFormErr]       = useState("");
  const [savingZone, setSavingZone]         = useState(false);
  const [zoneSearch, setZoneSearch]         = useState("");
  const [zonePage, setZonePage]             = useState(1);
  const [zonePageSize, setZonePageSize]     = useState(PAGE_SIZE);
  const isEditingZone = Boolean(zoneForm.zone_id);

  // Aisles
  const [aisleRows, setAisleRows]           = useState([]);
  const [aisleLoading, setAisleLoading]     = useState(false);
  const [aisleFilterZone, setAisleFilterZone] = useState("");
  const [aisleForm, setAisleForm]           = useState({ aisle_id: "", zone_id: "", aisle_code: "", aisle_name: "", status: "active" });
  const [aisleFormErr, setAisleFormErr]     = useState("");
  const [savingAisle, setSavingAisle]       = useState(false);
  const [aisleSearch, setAisleSearch]       = useState("");
  const [aislePage, setAislePage]           = useState(1);
  const [aislePageSize, setAislePageSize]   = useState(PAGE_SIZE);
  const isEditingAisle = Boolean(aisleForm.aisle_id);

  // Bays
  const [bayRows, setBayRows]               = useState([]);
  const [bayLoading, setBayLoading]         = useState(false);
  const [bayFilterZone, setBayFilterZone]   = useState("");
  const [bayFilterAisle, setBayFilterAisle] = useState("");
  const [bayAisleOptions, setBayAisleOptions] = useState([]);
  const [bayForm, setBayForm]               = useState({ bay_id: "", aisle_id: "", bay_code: "", bay_name: "", width_cm: "200", depth_cm: "50", level_height_cm: "50", level_count: "4", max_weight_kg: "500", status: "active" });
  const [bayFormErr, setBayFormErr]         = useState("");
  const [savingBay, setSavingBay]           = useState(false);
  const [baySearch, setBaySearch]           = useState("");
  const [bayPage, setBayPage]               = useState(1);
  const [bayPageSize, setBayPageSize]       = useState(PAGE_SIZE);
  const isEditingBay = Boolean(bayForm.bay_id);

  // Levels
  const [levelRows, setLevelRows]           = useState([]);
  const [levelLoading, setLevelLoading]     = useState(false);
  const [levelFilterBay, setLevelFilterBay] = useState("");
  const [levelForm, setLevelForm]           = useState({ level_id: "", bay_id: "", level_code: "", status: "active" });
  const [levelFormErr, setLevelFormErr]     = useState("");
  const [savingLevel, setSavingLevel]       = useState(false);
  const [levelSearch, setLevelSearch]       = useState("");
  const [levelPage, setLevelPage]           = useState(1);
  const [levelPageSize, setLevelPageSize]   = useState(PAGE_SIZE);
  const isEditingLevel = Boolean(levelForm.level_id);

  // Bins
  const [binRows, setBinRows]               = useState([]);
  const [binLoading, setBinLoading]         = useState(false);
  const [binFilterLevel, setBinFilterLevel] = useState("");
  const [binForm, setBinForm]               = useState({ bin_id: "", level_id: "", bin_code: "", max_weight: "", max_volume: "", status: "active" });
  const [binFormErr, setBinFormErr]         = useState("");
  const [savingBin, setSavingBin]           = useState(false);
  const [binSearch, setBinSearch]           = useState("");
  const [binPage, setBinPage]               = useState(1);
  const [binPageSize, setBinPageSize]       = useState(PAGE_SIZE);
  const isEditingBin = Boolean(binForm.bin_id);
  const [storageLocationTarget, setStorageLocationTarget] = useState(null);
  const [storageLocationError, setStorageLocationError] = useState("");
  const [creatingStorageLocation, setCreatingStorageLocation] = useState(false);

  // -- Shelf Dimension Calculator --------------------------------------------
  const [calcWarehouse, setCalcWarehouse]   = useState("");
  const [calcZone, setCalcZone]             = useState("");
  const [calcAisle, setCalcAisle]           = useState("");
  const [calcBay, setCalcBay]               = useState("");
  const [calcSkuW, setCalcSkuW]             = useState("");
  const [calcSkuD, setCalcSkuD]             = useState("");
  const [calcSkuH, setCalcSkuH]             = useState("");
  const [calcSkuWt, setCalcSkuWt]           = useState("");
  const [calcRotate, setCalcRotate]         = useState(false);
  const [calcResult, setCalcResult]         = useState(null);
  const [calcError, setCalcError]           = useState("");
  const [calculating, setCalculating]       = useState(false);

  // Derived: filtered aisles & bays for cascading selects
  const aislesForZone  = bayAisleOptions;
  const calcZoneAisles = useMemo(() => aisleRows.filter((a) => a.zone_id === calcZone), [aisleRows, calcZone]);
  const calcAisleBays  = useMemo(() => bayRows.filter((b) => b.aisle_id === calcAisle), [bayRows, calcAisle]);
  const selectedCalcBay = useMemo(() => bayRows.find((b) => b.bay_id === calcBay), [bayRows, calcBay]);

  // -- Load functions --------------------------------------------------------
  const loadSuppliers  = useCallback(async () => { if (!session?.tenant_id) return; try { setSupplierLoading(true); setSupplierError(""); const d = await fetchSuppliers(session); setSupplierRows(Array.isArray(d) ? d : []); } catch (e) { setSupplierError(e.message); } finally { setSupplierLoading(false); } }, [session]);
  const loadSkus       = useCallback(async () => {
    if (!session?.tenant_id) return;
    try {
      setSkuLoading(true);
      setSkuError("");
      const response = await listSkus(session, {
        page: skuPage,
        pageSize: skuPageSize,
        search: skuSearch.trim(),
        status: skuStatus === "all" ? undefined : skuStatus,
      });
      setSkuRows(Array.isArray(response?.data) ? response.data : []);
      setSkuTotal(Number(response?.total) || 0);
      setSkuTotalPages(Math.max(1, Number(response?.totalPages) || 1));
    } catch (error) {
      setSkuError(error.message);
      setSkuRows([]);
      setSkuTotal(0);
      setSkuTotalPages(1);
    } finally {
      setSkuLoading(false);
    }
  }, [session, skuPage, skuPageSize, skuSearch, skuStatus]);
  const loadWarehouses = useCallback(async () => { if (!session?.tenant_id) return; try { setWarehouseLoading(true); const r = await fetchWarehouses(session, {}); setWarehouseRows(Array.isArray(r?.data) ? r.data : []); } catch { } finally { setWarehouseLoading(false); } }, [session]);
  const loadCustomers  = useCallback(async () => { if (!session?.tenant_id) return; try { setCustomerLoading(true); setCustomerError(""); const r = await fetchCustomers(session, {}); setCustomerRows(Array.isArray(r?.data) ? r.data : []); } catch (e) { setCustomerError(e.message); } finally { setCustomerLoading(false); } }, [session]);

  const loadZones  = useCallback(async () => { if (!session?.tenant_id) return; try { setZoneLoading(true); const r = await fetchTaxonomyZones(session, {}); setZoneRows(Array.isArray(r?.data) ? r.data : []); } catch { } finally { setZoneLoading(false); } }, [session]);
  const loadAisles = useCallback(async (filters = {}) => { if (!session?.tenant_id) return; try { setAisleLoading(true); const r = await fetchAisles(session, filters); setAisleRows(Array.isArray(r?.data) ? r.data : []); } catch { } finally { setAisleLoading(false); } }, [session]);
  const loadBays   = useCallback(async (filters = {}) => { if (!session?.tenant_id) return; try { setBayLoading(true); const r = await fetchBays(session, filters); setBayRows(Array.isArray(r?.data) ? r.data : []); } catch { } finally { setBayLoading(false); } }, [session]);
  const loadLevels = useCallback(async (filters = {}) => { if (!session?.tenant_id) return; try { setLevelLoading(true); const r = await fetchLevels(session, { page: 1, pageSize: 100, ...filters }); setLevelRows(Array.isArray(r?.data) ? r.data : []); } catch { } finally { setLevelLoading(false); } }, [session]);
  const loadBins   = useCallback(async (filters = {}) => { if (!session?.tenant_id) return; try { setBinLoading(true); const r = await fetchBins(session, { page: 1, pageSize: 100, ...filters }); setBinRows(Array.isArray(r?.data) ? r.data : []); } catch { } finally { setBinLoading(false); } }, [session]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  useEffect(() => { loadSkus(); },       [loadSkus]);
  useEffect(() => { loadWarehouses(); }, [loadWarehouses]);
  useEffect(() => { loadCustomers(); },  [loadCustomers]);
  // Load all taxonomy on mount so cascading selects work
  useEffect(() => { loadZones(); loadAisles(); loadBays(); loadLevels(); loadBins(); }, [loadZones, loadAisles, loadBays, loadLevels, loadBins]);
  useEffect(() => {
    let active = true;
    if (!bayFilterZone) {
      setBayAisleOptions([]);
      return undefined;
    }
    fetchAisles(session, { zone_id: bayFilterZone, status: "active", page: 1, pageSize: 100 })
      .then((response) => {
        if (active) setBayAisleOptions(Array.isArray(response?.data) ? response.data : []);
      })
      .catch((error) => {
        if (active) {
          setBayAisleOptions([]);
          setBayFormErr(error.message || "Unable to load aisles for the selected zone");
        }
      });
    return () => { active = false; };
  }, [bayFilterZone, session]);

  // -- Filtered taxonomy rows ------------------------------------------------
  const filteredZones  = useMemo(() => { const q = zoneSearch.toLowerCase(); return zoneRows.filter((r) => !q || r.zone_code?.toLowerCase().includes(q) || r.zone_name?.toLowerCase().includes(q)); }, [zoneRows, zoneSearch]);
  const filteredAisles = useMemo(() => { const q = aisleSearch.toLowerCase(); return aisleRows.filter((r) => (!aisleFilterZone || r.zone_id === aisleFilterZone) && (!q || r.aisle_code?.toLowerCase().includes(q) || r.aisle_name?.toLowerCase().includes(q) || r.location_code?.toLowerCase().includes(q))); }, [aisleRows, aisleSearch, aisleFilterZone]);
  const filteredBays   = useMemo(() => { const q = baySearch.toLowerCase(); return bayRows.filter((r) => (!bayFilterZone || r.zone_id === bayFilterZone) && (!bayFilterAisle || r.aisle_id === bayFilterAisle) && (!q || r.bay_code?.toLowerCase().includes(q) || r.bay_name?.toLowerCase().includes(q) || r.location_code?.toLowerCase().includes(q))); }, [bayRows, baySearch, bayFilterZone, bayFilterAisle]);
  const filteredLevels = useMemo(() => { const q = levelSearch.toLowerCase(); return levelRows.filter((r) => (!levelFilterBay || r.bay_id === levelFilterBay) && (!q || r.level_code?.toLowerCase().includes(q) || r.location_code?.toLowerCase().includes(q))); }, [levelRows, levelSearch, levelFilterBay]);
  const filteredBins   = useMemo(() => { const q = binSearch.toLowerCase(); return binRows.filter((r) => (!binFilterLevel || r.level_id === binFilterLevel) && (!q || r.bin_code?.toLowerCase().includes(q) || r.location_code?.toLowerCase().includes(q))); }, [binRows, binSearch, binFilterLevel]);

  // -- Supplier handlers -----------------------------------------------------
  const handleSaveSupplier = async () => {
    if (!supplierForm.supplier_name.trim()) { setSupplierFormError("Supplier name is required"); return; }
    if (!supplierForm.email.trim()) { setSupplierFormError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierForm.email.trim())) { setSupplierFormError("Enter a valid email"); return; }
    try {
      setSavingSupplier(true); setSupplierFormError("");
      const supplierName = supplierForm.supplier_name.trim();
      const supplierCode = normalizeBusinessCode(supplierForm.supplier_code || supplierName);
      const payload = { supplier_code: supplierCode || null, supplier_name: supplierName, contact_person: supplierForm.contact_person.trim() || null, email: supplierForm.email.trim(), phone: supplierForm.phone.trim() || null, address: supplierForm.address.trim() || null, is_active: supplierForm.is_active };
      if (isEditingSupplier) { await updateSupplier(session, supplierForm.supplier_id, payload); setSupplierRows((c) => c.map((r) => r.supplier_id === supplierForm.supplier_id ? { ...r, ...payload } : r)); toast({ title: "Supplier updated" }); }
      else { const d = await createSupplier(session, payload); setSupplierRows((c) => [{ ...(d?.data ?? d), ...payload }, ...c]); toast({ title: "Supplier created" }); }
      setSupplierForm({ supplier_id: "", supplier_code: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true });
    } catch (e) { setSupplierFormError(e.message || "Save failed"); }
    finally { setSavingSupplier(false); }
  };
  const handleDeleteSupplier = async () => {
    if (!supplierDeleteTarget) return;
    try { await deleteSupplier(session, supplierDeleteTarget.supplier_id); setSupplierRows((c) => c.filter((r) => r.supplier_id !== supplierDeleteTarget.supplier_id)); toast({ title: "Supplier deleted" }); }
    catch (e) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    finally { setSupplierDeleteTarget(null); }
  };

  // -- SKU handlers ----------------------------------------------------------
  const handleSaveSku = async () => {
    if (!skuForm.sku_code.trim()) { setSkuFormError("SKU Code is required"); return; }
    if (!skuForm.description.trim()) { setSkuFormError("Description is required"); return; }
    if (!skuForm.uom.trim()) { setSkuFormError("UOM is required"); return; }
    if (!skuForm.status.trim()) { setSkuFormError("Status is required"); return; }
    if (!["active", "inactive"].includes(skuForm.status.trim().toLowerCase())) { setSkuFormError("Status must be active or inactive"); return; }
    const numericFields = [
      ["weight", skuForm.weight],
      ["reorder_point", skuForm.reorder_point],
      ["reorder_qty", skuForm.reorder_qty],
    ];
    const invalidNumeric = numericFields.find(([, value]) => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0));
    if (invalidNumeric) { setSkuFormError(`${invalidNumeric[0]} must be a non-negative number`); return; }
    try {
      setSavingSku(true); setSkuFormError("");
      const payload = {
        sku_code: skuForm.sku_code.trim(),
        description: skuForm.description.trim(),
        uom: skuForm.uom.trim(),
        category: skuForm.category.trim() || null,
        hazardous: skuForm.hazardous,
        weight: skuForm.weight === "" ? null : Number(skuForm.weight),
        dimensions: skuForm.dimensions.trim() || null,
        reorder_point: Number(skuForm.reorder_point || 0),
        reorder_qty: Number(skuForm.reorder_qty || 0),
        status: skuForm.status.trim().toLowerCase(),
        qr_payload: skuForm.qr_payload.trim() || null,
        rfid_epc: skuForm.rfid_epc.trim() || null,
      };
      if (isEditingSku) {
        await updateSku(session, skuForm.sku_id, payload);
        toast({ title: "SKU updated" });
      } else {
        await createSku(session, payload);
        toast({ title: "SKU created" });
      }
      setSkuForm(EMPTY_SKU_FORM);
      await loadSkus();
    } catch (e) { setSkuFormError(e.message || "Save failed"); }
    finally { setSavingSku(false); }
  };
  const handleDeleteSku = async () => {
    if (!skuDeleteTarget) return;
    try {
      setDeletingSku(true);
      const response = await deleteSku(session, skuDeleteTarget.sku_id);
      const softDeleted = response?.deletionMode === "soft";
      toast({
        title: softDeleted ? "SKU set to inactive" : "SKU deleted",
        description: response?.message || (softDeleted
          ? "SKU is referenced by transactions and has been set to inactive."
          : "SKU deleted successfully."),
      });
      await loadSkus();
    }
    catch (e) { toast({ title: "Delete failed", description: e.message || "Unable to delete SKU.", variant: "destructive" }); }
    finally { setDeletingSku(false); setSkuDeleteTarget(null); }
  };

  // -- Warehouse handlers ----------------------------------------------------
  const handleSaveWarehouse = async () => {
    if (!warehouseForm.warehouse_name.trim()) { setWarehouseFormError("Warehouse name is required"); return; }
    try {
      setSavingWarehouse(true); setWarehouseFormError("");
      const payload = { warehouse_name: warehouseForm.warehouse_name.trim(), city: warehouseForm.city.trim(), country: warehouseForm.country.trim() };
      if (isEditingWarehouse) { const r = await updateWarehouseApi(session, warehouseForm.warehouse_id, payload); setWarehouseRows((c) => c.map((w) => w.warehouse_id === warehouseForm.warehouse_id ? { ...w, ...(r?.data ?? r), ...payload } : w)); toast({ title: "Warehouse updated" }); }
      else { const r = await createWarehouseApi(session, payload); setWarehouseRows((c) => [...c, r?.data ?? r]); toast({ title: "Warehouse created" }); }
      setWarehouseForm({ warehouse_id: "", warehouse_name: "", city: "", country: "" }); setIsEditingWarehouse(false);
    } catch (e) { setWarehouseFormError(e.message || "Save failed"); }
    finally { setSavingWarehouse(false); }
  };
  const handleDeleteWarehouse = async () => {
    if (!warehouseDeleteTarget) return;
    try { await deleteWarehouseApi(session, warehouseDeleteTarget.warehouse_id); setWarehouseRows((c) => c.filter((w) => w.warehouse_id !== warehouseDeleteTarget.warehouse_id)); toast({ title: "Warehouse deleted" }); }
    catch (e) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    finally { setWarehouseDeleteTarget(null); }
  };

  // -- Customer handlers -----------------------------------------------------
  const handleSaveCustomer = async () => {
    if (!customerForm.customer_name.trim()) { setCustomerFormError("Customer name is required"); return; }
    if (!customerForm.contact.trim()) { setCustomerFormError("Email is required"); return; }
    try {
      setSavingCustomer(true); setCustomerFormError("");
      const payload = { customer_name: customerForm.customer_name.trim(), contact: customerForm.contact.trim(), phone: customerForm.phone.trim() };
      if (isEditingCustomer) { await updateCustomerApi(session, customerForm.customer_id, payload); setCustomerRows((c) => c.map((r) => r.customer_id === customerForm.customer_id ? { ...r, ...payload } : r)); toast({ title: "Customer updated" }); }
      else { const r = await createCustomerApi(session, payload); setCustomerRows((c) => [r?.data ?? r, ...c]); toast({ title: "Customer created" }); }
      setCustomerForm({ customer_id: "", customer_name: "", contact: "", phone: "" });
    } catch (e) { setCustomerFormError(e.message || "Save failed"); }
    finally { setSavingCustomer(false); }
  };
  const handleDeleteCustomer = async () => {
    if (!customerDeleteTarget) return;
    try { await deleteCustomerApi(session, customerDeleteTarget.customer_id); setCustomerRows((c) => c.filter((r) => r.customer_id !== customerDeleteTarget.customer_id)); toast({ title: "Customer deleted" }); }
    catch (e) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    finally { setCustomerDeleteTarget(null); }
  };

  // -- Taxonomy handlers -----------------------------------------------------
  const handleSaveZone = async () => {
    if (!zoneForm.zone_code.trim() || !zoneForm.zone_name.trim()) { setZoneFormErr("Zone code and name are required"); return; }
    if (!zoneForm.warehouse_id) { setZoneFormErr("Warehouse is required"); return; }
    if (!zoneForm.status) { setZoneFormErr("Status is required"); return; }
    const payload = { zone_code: zoneForm.zone_code.toUpperCase(), zone_name: zoneForm.zone_name, zone_type: zoneForm.zone_type, warehouse_id: zoneForm.warehouse_id, status: zoneForm.status };
    try {
      setSavingZone(true); setZoneFormErr("");
      if (isEditingZone) {
        const r = await updateTaxonomyZone(session, zoneForm.zone_id, payload);
        setZoneRows((c) => c.map((z) => z.zone_id === zoneForm.zone_id ? { ...z, ...(r?.data ?? r) } : z));
        toast({ title: "Zone updated" });
      } else {
        const r = await createTaxonomyZone(session, payload);
        setZoneRows((c) => [...c, r?.data ?? r]);
        toast({ title: "Zone created" });
      }
      setZoneForm({ zone_id: "", zone_code: "", zone_name: "", zone_type: "storage", warehouse_id: "", status: "active" });
    } catch (e) { setZoneFormErr(e.message || "Save failed"); }
    finally { setSavingZone(false); }
  };

  const handleSaveAisle = async () => {
    if (!aisleForm.zone_id || !aisleForm.aisle_name.trim()) { setAisleFormErr("Zone and aisle name are required"); return; }
    if (!aisleForm.status) { setAisleFormErr("Status is required"); return; }
    const payload = {
      zone_id: aisleForm.zone_id,
      aisle_code: isEditingAisle ? aisleForm.aisle_code : undefined,
      aisle_name: aisleForm.aisle_name.trim(),
      status: aisleForm.status,
    };
    try {
      setSavingAisle(true); setAisleFormErr("");
      if (isEditingAisle) {
        const r = await updateAisle(session, aisleForm.aisle_id, payload);
        setAisleRows((c) => c.map((a) => a.aisle_id === aisleForm.aisle_id ? { ...a, ...(r?.data ?? r) } : a));
        toast({ title: "Aisle updated" });
      } else {
        const r = await createAisle(session, payload);
        setAisleRows((c) => [...c, r?.data ?? r]);
        toast({ title: "Aisle created — code auto-assigned" });
      }
      setAisleForm({ aisle_id: "", zone_id: "", aisle_code: "", aisle_name: "", status: "active" });
    } catch (e) { setAisleFormErr(e.message || "Save failed"); }
    finally { setSavingAisle(false); }
  };

  const handleSaveBay = async () => {
    if (!bayForm.aisle_id) { setBayFormErr("Select an aisle before adding a bay"); return; }
    if (!bayForm.bay_name.trim()) { setBayFormErr("Bay name is required"); return; }
    if (!bayForm.status) { setBayFormErr("Status is required"); return; }
    try {
      setSavingBay(true); setBayFormErr("");
      const payload = {
        zone_id: bayFilterZone,
        aisle_id: bayForm.aisle_id,
        bay_code: isEditingBay ? bayForm.bay_code : undefined,
        bay_name: bayForm.bay_name.trim(),
        width_cm: Number(bayForm.width_cm),
        depth_cm: Number(bayForm.depth_cm),
        level_height_cm: Number(bayForm.level_height_cm),
        level_count: Number(bayForm.level_count),
        max_weight_kg: Number(bayForm.max_weight_kg),
        status: bayForm.status,
      };
      if (isEditingBay) {
        const r = await updateBay(session, bayForm.bay_id, payload);
        setBayRows((c) => c.map((b) => b.bay_id === bayForm.bay_id ? { ...b, ...(r?.data ?? r) } : b));
        toast({ title: "Bay updated" });
      } else {
        const r = await createBay(session, payload);
        setBayRows((c) => [...c, r?.data ?? r]);
        toast({ title: "Bay created — code auto-assigned" });
      }
      setBayForm({ bay_id: "", aisle_id: "", bay_code: "", bay_name: "", width_cm: "200", depth_cm: "50", level_height_cm: "50", level_count: "4", max_weight_kg: "500", status: "active" });
      await loadBays();
    } catch (e) { setBayFormErr(e.message || "Save failed"); }
    finally { setSavingBay(false); }
  };

  const handleSaveLevel = async () => {
    if (!levelForm.bay_id) { setLevelFormErr("Bay is required"); return; }
    if (!levelForm.status) { setLevelFormErr("Status is required"); return; }
    const payload = {
      bay_id: levelForm.bay_id,
      status: levelForm.status,
    };
    try {
      setSavingLevel(true); setLevelFormErr("");
      if (isEditingLevel) {
        await updateLevel(session, levelForm.level_id, payload);
        toast({ title: "Level updated" });
      } else {
        await createLevel(session, payload);
        toast({ title: "Level created" });
      }
      setLevelForm({ level_id: "", bay_id: "", level_code: "", status: "active" });
      await loadLevels();
    } catch (e) { setLevelFormErr(e.message || "Save failed"); }
    finally { setSavingLevel(false); }
  };

  const handleSaveBin = async () => {
    if (!binForm.level_id) { setBinFormErr("Level is required"); return; }
    if (!binForm.status) { setBinFormErr("Status is required"); return; }
    try {
      setSavingBin(true); setBinFormErr("");
      const payload = {
        level_id: binForm.level_id,
        max_weight: binForm.max_weight === "" ? null : Number(binForm.max_weight),
        max_volume: binForm.max_volume === "" ? null : Number(binForm.max_volume),
        status: binForm.status,
      };
      if (isEditingBin) {
        await updateBin(session, binForm.bin_id, payload);
        toast({ title: "Bin updated" });
      } else {
        await createBin(session, payload);
        toast({ title: "Bin created" });
      }
      setBinForm({ bin_id: "", level_id: "", bin_code: "", max_weight: "", max_volume: "", status: "active" });
      await loadBins();
    } catch (e) { setBinFormErr(e.message || "Save failed"); }
    finally { setSavingBin(false); }
  };

  const openCreateStorageLocation = async (bin) => {
    setStorageLocationError("");
    try {
      const response = await fetchLocations(session, {
        warehouse_id: bin.warehouse_id || session.warehouse_id,
      });
      const existing = Array.isArray(response?.data)
        ? response.data.find((location) => location.bin_id === bin.bin_id)
        : null;
      setStorageLocationTarget({ bin, existing: existing || null });
      if (existing) {
        setStorageLocationError("A storage location already exists for this bin.");
      }
    } catch (error) {
      setStorageLocationTarget({ bin, existing: null });
      setStorageLocationError(error.message || "Unable to check existing storage locations.");
    }
  };

  const confirmCreateStorageLocation = async () => {
    const bin = storageLocationTarget?.bin;
    const locationCode = bin?.location_code;
    const warehouseId = bin?.warehouse_id || session.warehouse_id;
    if (!bin?.bin_id || !locationCode || !warehouseId) {
      setStorageLocationError("Bin, location code, and warehouse context are required.");
      return;
    }
    if (storageLocationTarget?.existing) {
      setStorageLocationError("A storage location already exists for this bin.");
      return;
    }
    try {
      setCreatingStorageLocation(true);
      setStorageLocationError("");
      await createLocationApi(session, {
        warehouse_id: warehouseId,
        location_code: locationCode,
        label: locationCode,
        location_type: "storage",
        zone_id: bin.zone_id,
        aisle: bin.aisle_code || "",
        rack: bin.bay_code || "",
        bin: bin.bin_code || "",
        bin_id: bin.bin_id,
        is_active: true,
        is_default_receiving: false,
      });
      toast({ title: "Storage location created", description: locationCode });
      setStorageLocationTarget(null);
      await loadBins();
      await fetchLocations(session, { warehouse_id: warehouseId });
    } catch (error) {
      const message = error.message || "Unable to create storage location.";
      setStorageLocationError(
        /already exists|duplicate/i.test(message)
          ? "A storage location already exists for this bin."
          : message
      );
    } finally {
      setCreatingStorageLocation(false);
    }
  };

  const confirmTaxDelete = async () => {
    if (!taxDelTarget) return;
    try {
      setTaxDeleting(true);
      const { type, id } = taxDelTarget;
      if (type === "zone")   await deleteTaxonomyZone(session, id);
      if (type === "aisle")  await deleteAisle(session, id);
      if (type === "bay")    await deleteBay(session, id);
      if (type === "level")  await deleteLevel(session, id);
      if (type === "bin")    await deleteBin(session, id);

      const removers = { zone: () => setZoneRows((c) => c.filter((r) => r.zone_id !== id)), aisle: () => setAisleRows((c) => c.filter((r) => r.aisle_id !== id)), bay: () => setBayRows((c) => c.filter((r) => r.bay_id !== id)), level: () => setLevelRows((c) => c.filter((r) => r.level_id !== id)), bin: () => setBinRows((c) => c.filter((r) => r.bin_id !== id)) };
      removers[type]?.();
      toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} deleted` });
    } catch (e) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
    finally { setTaxDeleting(false); setTaxDelTarget(null); }
  };

  // -- Shelf calc ------------------------------------------------------------
  const handleCalc = async () => {
    if (!calcBay) { setCalcError("Select a bay first"); return; }
    if (!calcSkuW || !calcSkuD || !calcSkuH) { setCalcError("Enter item dimensions (W × D × H)"); return; }
    try {
      setCalculating(true); setCalcError(""); setCalcResult(null);
      const r = await calcShelfDimension(session, { bay_id: calcBay, sku_width_cm: Number(calcSkuW), sku_depth_cm: Number(calcSkuD), sku_height_cm: Number(calcSkuH), sku_weight_kg: calcSkuWt ? Number(calcSkuWt) : undefined, allow_rotate: calcRotate });
      setCalcResult(r?.data ?? r);
    } catch (e) { setCalcError(e.message || "Calculation failed"); }
    finally { setCalculating(false); }
  };

  // -- Shared form footer ----------------------------------------------------
  const FormFooter = ({ isEditing, onCancelEdit, onClear, onSave, saving, saveLabel, editLabel }) => (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 12, borderTop: "0.5px solid #eef0fc", marginTop: 4 }}>
      {isEditing && <button style={btnNeutral} onClick={onCancelEdit} disabled={saving}>Cancel Edit</button>}
      <button style={btnNeutral} onClick={onClear} disabled={saving}>Clear</button>
      <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={onSave} disabled={saving}>{saving ? "Saving…" : isEditing ? editLabel : saveLabel}</button>
    </div>
  );

  // -- Render ----------------------------------------------------------------
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Master Data" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Master Data</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Manage SKUs, location taxonomy, warehouses, suppliers and customers</p>
      </div>

      <Tabs defaultValue="sku">
        <TabsList>
          <TabsTrigger value="sku">SKU</TabsTrigger>
          <TabsTrigger value="location_taxonomy">Location Taxonomy</TabsTrigger>
          <TabsTrigger value="shelf_dimension">Shelf Dimension</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        {/* -- SKU -- */}
        <TabsContent value="sku" className="mt-4 space-y-4">
          {canEdit && (
            <FormCard title={isEditingSku ? `Edit SKU — ${skuForm.sku_id}` : "New SKU"}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {isEditingSku && (
                  <FormField label="SKU ID">
                    <Input value={skuForm.sku_id} disabled />
                  </FormField>
                )}
                <FormField label="SKU Code" required>
                  <Input value={skuForm.sku_code} onChange={(e) => setSkuForm((c) => ({ ...c, sku_code: e.target.value }))} placeholder="e.g. BRG-6205" disabled={savingSku} />
                </FormField>
                <FormField label="Description" required>
                  <Input value={skuForm.description} onChange={(e) => setSkuForm((c) => ({ ...c, description: e.target.value }))} placeholder="e.g. Industrial Bearing 6205" disabled={savingSku} />
                </FormField>
                <FormField label="UOM" required>
                  <Select value={skuForm.uom} onValueChange={(v) => setSkuForm((c) => ({ ...c, uom: v }))} disabled={savingSku}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["EA", "BOX", "PAIR", "KG", "LTR"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Category">
                  <Input value={skuForm.category} onChange={(e) => setSkuForm((c) => ({ ...c, category: e.target.value }))} placeholder="e.g. Bearings" disabled={savingSku} />
                </FormField>
                <FormField label="Weight">
                  <Input type="number" min="0" step="any" value={skuForm.weight} onChange={(e) => setSkuForm((c) => ({ ...c, weight: e.target.value }))} placeholder="e.g. 0.25" disabled={savingSku} />
                </FormField>
                <FormField label="Dimensions">
                  <Input value={skuForm.dimensions} onChange={(e) => setSkuForm((c) => ({ ...c, dimensions: e.target.value }))} placeholder="e.g. 10x8x4 cm" disabled={savingSku} />
                </FormField>
                <FormField label="Reorder Point">
                  <Input type="number" min="0" step="any" value={skuForm.reorder_point} onChange={(e) => setSkuForm((c) => ({ ...c, reorder_point: e.target.value }))} disabled={savingSku} />
                </FormField>
                <FormField label="Reorder Quantity">
                  <Input type="number" min="0" step="any" value={skuForm.reorder_qty} onChange={(e) => setSkuForm((c) => ({ ...c, reorder_qty: e.target.value }))} disabled={savingSku} />
                </FormField>
                <FormField label="Status" required>
                  <Select value={skuForm.status} onValueChange={(v) => setSkuForm((c) => ({ ...c, status: v }))} disabled={savingSku}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="QR Payload">
                  <Input value={skuForm.qr_payload} onChange={(e) => setSkuForm((c) => ({ ...c, qr_payload: e.target.value }))} disabled={savingSku} />
                </FormField>
                <FormField label="RFID EPC">
                  <Input value={skuForm.rfid_epc} onChange={(e) => setSkuForm((c) => ({ ...c, rfid_epc: e.target.value }))} placeholder="EPC:300833..." disabled={savingSku} />
                </FormField>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: T_SECONDARY }}>
                <input type="checkbox" checked={skuForm.hazardous} onChange={(e) => setSkuForm((c) => ({ ...c, hazardous: e.target.checked }))} disabled={savingSku} />
                Hazardous material
              </label>
              {(skuFormError || skuError) && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{skuFormError || skuError}</p>}
              <FormFooter isEditing={isEditingSku} saving={savingSku} onCancelEdit={() => { setSkuForm(EMPTY_SKU_FORM); setSkuFormError(""); }} onClear={() => setSkuForm(EMPTY_SKU_FORM)} onSave={handleSaveSku} saveLabel="Add SKU" editLabel="Update SKU" />
            </FormCard>
          )}
          <TableCard>
            <Toolbar
              search={skuSearch}
              onSearch={(v) => { setSkuSearch(v); setSkuPage(1); }}
              onClear={() => { setSkuSearch(""); setSkuStatus("all"); setSkuPage(1); }}
              onRefresh={loadSkus}
              loading={skuLoading}
              placeholder="Search SKU code or description..."
              extra={(
                <Select value={skuStatus} onValueChange={(v) => { setSkuStatus(v); setSkuPage(1); }}>
                  <SelectTrigger style={{ width: 130, height: 40 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {skuError && <div style={{ padding: "10px 14px", color: "#991b1b", fontSize: 12 }}>{skuError}</div>}
            <DataTable loading={skuLoading} rows={skuRows} page={skuPage} pageSize={skuPageSize} onPage={setSkuPage} onPageSize={(v) => { setSkuPageSize(v); setSkuPage(1); }} emptyText="No SKUs found." serverPagination total={skuTotal} totalPages={skuTotalPages}
              cols={[
                { key: "sku_id",      label: "SKU ID",      render: (r) => <MonoCode>{r.sku_id}</MonoCode> },
                { key: "sku_code",    label: "Code",        render: (r) => r.sku_code ? <MonoCode>{r.sku_code}</MonoCode> : <span style={{ color: T_MUTED }}>-</span> },
                { key: "description", label: "Description" },
                { key: "uom",         label: "UOM" },
                { key: "category",    label: "Category",    render: (r) => r.category || <span style={{ color: T_MUTED }}>-</span> },
                { key: "reorder_point", label: "Reorder Point" },
                { key: "status",      label: "Status",      render: (r) => <StatusPill status={r.status} /> },
                { key: "actions",     label: "Actions",     render: (r) => <RowActions canEdit={canEdit} canDelete={canDel} onEdit={() => { setSkuForm({ ...EMPTY_SKU_FORM, ...r, weight: r.weight ?? "", reorder_point: r.reorder_point ?? "0", reorder_qty: r.reorder_qty ?? "0", qr_payload: r.qr_payload || "", rfid_epc: r.rfid_epc || "", sku_code: r.sku_code || "", category: r.category || "", dimensions: r.dimensions || "" }); setSkuFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onDelete={() => setSkuDeleteTarget(r)} /> },
              ]}
            />
          </TableCard>
        </TabsContent>

        {/* -- LOCATION TAXONOMY -- */}
        <TabsContent value="location_taxonomy" className="mt-4">
          {/* Level selector */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[["zones", "Zones"], ["aisles", "Aisles"], ["bays", "Bays"], ["levels", "Levels"], ["bins", "Bins"]].map(([key, label]) => (
              <button key={key} style={btnLevel(taxLevel === key)} onClick={() => setTaxLevel(key)}>{label}</button>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 12, color: T_MUTED, alignSelf: "center" }}>Location codes are auto-generated from hierarchy</div>
          </div>

          {/* -- ZONES -- */}
          {taxLevel === "zones" && (
            <div className="space-y-4">
              {canEdit && (
                <FormCard title={isEditingZone ? `Edit Zone — ${zoneForm.zone_id}` : "New Zone"}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                    <FormField label="Zone Code" required>
                      <Input value={zoneForm.zone_code} onChange={(e) => setZoneForm((c) => ({ ...c, zone_code: e.target.value }))} placeholder="e.g. A" disabled={savingZone || isEditingZone} maxLength={5} />
                    </FormField>
                    <FormField label="Zone Name" required>
                      <Input value={zoneForm.zone_name} onChange={(e) => setZoneForm((c) => ({ ...c, zone_name: e.target.value }))} placeholder="e.g. Zone A - Bulk Storage" disabled={savingZone} />
                    </FormField>
                    <FormField label="Zone Type">
                      <Select value={zoneForm.zone_type} onValueChange={(v) => setZoneForm((c) => ({ ...c, zone_type: v }))} disabled={savingZone}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ZONE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Warehouse" required>
                      <Select value={zoneForm.warehouse_id || "none"} onValueChange={(v) => setZoneForm((c) => ({ ...c, warehouse_id: v === "none" ? "" : v }))} disabled={savingZone || isEditingZone}>
                        <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select warehouse</SelectItem>
                          {warehouseRows.map((w) => <SelectItem key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Status" required>
                      <Select value={zoneForm.status} onValueChange={(v) => setZoneForm((c) => ({ ...c, status: v }))} disabled={savingZone}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                      </Select>
                    </FormField>
                  </div>
                  {zoneFormErr && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{zoneFormErr}</p>}
                  <FormFooter isEditing={isEditingZone} saving={savingZone} onCancelEdit={() => { setZoneForm({ zone_id: "", zone_code: "", zone_name: "", zone_type: "storage", warehouse_id: "", status: "active" }); setZoneFormErr(""); }} onClear={() => setZoneForm({ zone_id: "", zone_code: "", zone_name: "", zone_type: "storage", warehouse_id: "", status: "active" })} onSave={handleSaveZone} saveLabel="Add Zone" editLabel="Update Zone" />
                </FormCard>
              )}
              <TableCard>
                <Toolbar search={zoneSearch} onSearch={(v) => { setZoneSearch(v); setZonePage(1); }} onClear={() => { setZoneSearch(""); setZonePage(1); }} onRefresh={loadZones} loading={zoneLoading} placeholder="Search zone code, name…" />
                <DataTable loading={zoneLoading} rows={filteredZones} page={zonePage} pageSize={zonePageSize} onPage={setZonePage} onPageSize={(v) => { setZonePageSize(v); setZonePage(1); }} emptyText="No zones found."
                  cols={[
                    { key: "zone_id",   label: "Zone ID",    render: (r) => <MonoCode>{r.zone_id}</MonoCode> },
                    { key: "zone_code", label: "Code",       render: (r) => <span style={{ fontWeight: 700, color: ACCENT }}>{r.zone_code}</span> },
                    { key: "zone_name", label: "Name" },
                    { key: "zone_type", label: "Type",       render: (r) => <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 10, background: "#f3f4f6", color: T_SECONDARY }}>{r.zone_type}</span> },
                    { key: "warehouse", label: "Warehouse",  render: (r) => warehouseRows.find((w) => w.warehouse_id === r.warehouse_id)?.warehouse_name || r.warehouse_id },
                    { key: "status",    label: "Status",    render: (r) => <StatusPill status={r.status} /> },
                    { key: "actions",   label: "Actions",   render: (r) => <RowActions canEdit={canEdit} canDelete={canDel} onEdit={() => { setZoneForm({ zone_id: r.zone_id, zone_code: r.zone_code, zone_name: r.zone_name, zone_type: r.zone_type || "storage", warehouse_id: r.warehouse_id, status: r.status || "active" }); setZoneFormErr(""); }} onDelete={() => setTaxDelTarget({ type: "zone", id: r.zone_id, label: `${r.zone_code} — ${r.zone_name}` })} /> },
                  ]}
                />
              </TableCard>
            </div>
          )}

          {/* -- AISLES -- */}
          {taxLevel === "aisles" && (
            <div className="space-y-4">
              {canEdit && (
                <FormCard title={isEditingAisle ? `Edit Aisle — ${aisleForm.aisle_id}` : "New Aisle"}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <FormField label="Zone" required>
                      <Select value={aisleForm.zone_id || "none"} onValueChange={(v) => setAisleForm((c) => ({ ...c, zone_id: v === "none" ? "" : v }))} disabled={savingAisle || isEditingAisle}>
                        <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Select zone</SelectItem>{zoneRows.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_code} — {z.zone_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Aisle Name" required>
                      <Input value={aisleForm.aisle_name} onChange={(e) => setAisleForm((c) => ({ ...c, aisle_name: e.target.value }))} placeholder="e.g. Aisle 01" disabled={savingAisle} />
                    </FormField>
                    <FormField label="Status" required>
                      <Select value={aisleForm.status} onValueChange={(v) => setAisleForm((c) => ({ ...c, status: v }))} disabled={savingAisle}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                      </Select>
                    </FormField>
                  </div>
                  {!isEditingAisle && <p style={{ fontSize: 12, color: T_MUTED, marginTop: 6 }}>Aisle code will be auto-assigned (01, 02, 03…) within the selected zone.</p>}
                  {aisleFormErr && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{aisleFormErr}</p>}
                  <FormFooter isEditing={isEditingAisle} saving={savingAisle} onCancelEdit={() => { setAisleForm({ aisle_id: "", zone_id: "", aisle_code: "", aisle_name: "", status: "active" }); setAisleFormErr(""); }} onClear={() => setAisleForm({ aisle_id: "", zone_id: "", aisle_code: "", aisle_name: "", status: "active" })} onSave={handleSaveAisle} saveLabel="Add Aisle" editLabel="Update Aisle" />
                </FormCard>
              )}
              <TableCard>
                <Toolbar search={aisleSearch} onSearch={(v) => { setAisleSearch(v); setAislePage(1); }} onClear={() => { setAisleSearch(""); setAisleFilterZone(""); setAislePage(1); }} onRefresh={loadAisles} loading={aisleLoading} placeholder="Search aisle code, name…"
                  extra={
                    <Select value={aisleFilterZone || "all"} onValueChange={(v) => { setAisleFilterZone(v === "all" ? "" : v); setAislePage(1); }}>
                      <SelectTrigger style={{ height: 40, minWidth: 160, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, color: T_PRIMARY }}><SelectValue placeholder="All zones" /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All zones</SelectItem>{zoneRows.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_code} — {z.zone_name}</SelectItem>)}</SelectContent>
                    </Select>
                  }
                />
                <DataTable loading={aisleLoading} rows={filteredAisles} page={aislePage} pageSize={aislePageSize} onPage={setAislePage} onPageSize={(v) => { setAislePageSize(v); setAislePage(1); }} emptyText="No aisles found."
                  cols={[
                    { key: "aisle_id",       label: "Aisle ID",      render: (r) => <MonoCode>{r.aisle_id}</MonoCode> },
                    { key: "aisle_code",     label: "Code",          render: (r) => <span style={{ fontWeight: 700, color: ACCENT }}>{r.aisle_code}</span> },
                    { key: "aisle_name",     label: "Name" },
                    { key: "zone",           label: "Zone",          render: (r) => r.zone_name || zoneRows.find((z) => z.zone_id === r.zone_id)?.zone_name || r.zone_id },
                    { key: "location_code",  label: "Location Code", render: (r) => <MonoCode>{r.location_code}</MonoCode> },
                    { key: "status",         label: "Status",        render: (r) => <StatusPill status={r.status} /> },
                    { key: "actions",        label: "Actions",       render: (r) => <RowActions canEdit={canEdit} canDelete={canDel} onEdit={() => { setAisleForm({ aisle_id: r.aisle_id, zone_id: r.zone_id, aisle_code: r.aisle_code, aisle_name: r.aisle_name, status: r.status || "active" }); setAisleFormErr(""); }} onDelete={() => setTaxDelTarget({ type: "aisle", id: r.aisle_id, label: `Aisle ${r.aisle_code}` })} /> },
                  ]}
                />
              </TableCard>
            </div>
          )}

          {/* -- BAYS -- */}
          {taxLevel === "bays" && (
            <div className="space-y-4">
              {canEdit && (
                <FormCard title={isEditingBay ? `Edit Bay — ${bayForm.bay_id}` : "New Bay"}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <FormField label="Zone">
                      <Select value={bayFilterZone || "all"} onValueChange={(v) => { setBayFilterZone(v === "all" ? "" : v); setBayForm((c) => ({ ...c, aisle_id: "" })); setBayFormErr(""); }} disabled={isEditingBay}>
                        <SelectTrigger><SelectValue placeholder="Select zone first" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All zones</SelectItem>{zoneRows.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_code} — {z.zone_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Aisle" required>
                      <Select value={bayForm.aisle_id || "none"} onValueChange={(v) => setBayForm((c) => ({ ...c, aisle_id: v === "none" ? "" : v }))} disabled={savingBay || isEditingBay}>
                        <SelectTrigger><SelectValue placeholder="Select aisle" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Select aisle</SelectItem>{aislesForZone.map((a) => <SelectItem key={a.aisle_id} value={a.aisle_id}>{a.aisle_code} - {a.aisle_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Bay Name" required>
                      <Input value={bayForm.bay_name} onChange={(e) => setBayForm((c) => ({ ...c, bay_name: e.target.value }))} placeholder="e.g. Bay 001" disabled={savingBay} />
                    </FormField>
                    <FormField label="Status" required>
                      <Select value={bayForm.status} onValueChange={(v) => setBayForm((c) => ({ ...c, status: v }))} disabled={savingBay}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                      </Select>
                    </FormField>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: T_LABEL, marginBottom: 8 }}>Shelf Dimensions (cm)</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12 }}>
                      <FormField label="Width (cm)"><Input type="number" value={bayForm.width_cm} onChange={(e) => setBayForm((c) => ({ ...c, width_cm: e.target.value }))} placeholder="200" disabled={savingBay} /></FormField>
                      <FormField label="Depth (cm)"><Input type="number" value={bayForm.depth_cm} onChange={(e) => setBayForm((c) => ({ ...c, depth_cm: e.target.value }))} placeholder="50" disabled={savingBay} /></FormField>
                      <FormField label="Level Height (cm)"><Input type="number" value={bayForm.level_height_cm} onChange={(e) => setBayForm((c) => ({ ...c, level_height_cm: e.target.value }))} placeholder="50" disabled={savingBay} /></FormField>
                      <FormField label="No. of Levels"><Input type="number" value={bayForm.level_count} onChange={(e) => setBayForm((c) => ({ ...c, level_count: e.target.value }))} placeholder="4" min={1} max={20} disabled={savingBay} /></FormField>
                      <FormField label="Max Weight (kg)"><Input type="number" value={bayForm.max_weight_kg} onChange={(e) => setBayForm((c) => ({ ...c, max_weight_kg: e.target.value }))} placeholder="500" disabled={savingBay} /></FormField>
                    </div>
                  </div>
                  {!isEditingBay && <p style={{ fontSize: 12, color: T_MUTED, marginTop: 6 }}>Bay code will be auto-assigned (001, 002…) within the selected aisle.</p>}
                  {bayFormErr && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{bayFormErr}</p>}
                  <FormFooter isEditing={isEditingBay} saving={savingBay} onCancelEdit={() => { setBayForm({ bay_id: "", aisle_id: "", bay_code: "", bay_name: "", width_cm: "200", depth_cm: "50", level_height_cm: "50", level_count: "4", max_weight_kg: "500", status: "active" }); setBayFormErr(""); }} onClear={() => setBayForm({ bay_id: "", aisle_id: "", bay_code: "", bay_name: "", width_cm: "200", depth_cm: "50", level_height_cm: "50", level_count: "4", max_weight_kg: "500", status: "active" })} onSave={handleSaveBay} saveLabel="Add Bay" editLabel="Update Bay" />
                </FormCard>
              )}
              <TableCard>
                <Toolbar search={baySearch} onSearch={(v) => { setBaySearch(v); setBayPage(1); }} onClear={() => { setBaySearch(""); setBayFilterZone(""); setBayFilterAisle(""); setBayPage(1); }} onRefresh={loadBays} loading={bayLoading} placeholder="Search bay code, name…"
                  extra={
                    <div style={{ display: "flex", gap: 6 }}>
                      <Select value={bayFilterZone || "all"} onValueChange={(v) => { setBayFilterZone(v === "all" ? "" : v); setBayFilterAisle(""); setBayPage(1); }}>
                        <SelectTrigger style={{ height: 40, minWidth: 140, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7 }}><SelectValue placeholder="All zones" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All zones</SelectItem>{zoneRows.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_code} — {z.zone_name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={bayFilterAisle || "all"} onValueChange={(v) => { setBayFilterAisle(v === "all" ? "" : v); setBayPage(1); }}>
                        <SelectTrigger style={{ height: 40, minWidth: 140, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7 }}><SelectValue placeholder="All aisles" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All aisles</SelectItem>{(bayFilterZone ? aisleRows.filter((a) => a.zone_id === bayFilterZone) : aisleRows).map((a) => <SelectItem key={a.aisle_id} value={a.aisle_id}>Aisle {a.aisle_code}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  }
                />
                <DataTable loading={bayLoading} rows={filteredBays} page={bayPage} pageSize={bayPageSize} onPage={setBayPage} onPageSize={(v) => { setBayPageSize(v); setBayPage(1); }} emptyText="No bays found."
                  cols={[
                    { key: "bay_id",        label: "Bay ID",        render: (r) => <MonoCode>{r.bay_id}</MonoCode> },
                    { key: "bay_code",      label: "Code",          render: (r) => <span style={{ fontWeight: 700, color: ACCENT }}>{r.bay_code}</span> },
                    { key: "bay_name",      label: "Name" },
                    { key: "aisle",         label: "Aisle",         render: (r) => r.aisle_name || aisleRows.find((a) => a.aisle_id === r.aisle_id)?.aisle_name || r.aisle_id },
                    { key: "location_code", label: "Location Code", render: (r) => <MonoCode>{r.location_code}</MonoCode> },
                    { key: "dims",          label: "W×D×H (cm)",    render: (r) => <span style={{ fontSize: 12, color: T_SECONDARY }}>{formatDimensions(r.width_cm, r.depth_cm, r.level_height_cm)}</span> },
                    { key: "level_count",   label: "Levels",        render: (r) => r.level_count, right: true },
                    { key: "max_wt",        label: "Max kg",        render: (r) => formatCapacityValue(r.max_weight_kg), right: true },
                    { key: "status",        label: "Status",        render: (r) => <StatusPill status={r.status} /> },
                    { key: "actions",       label: "Actions",       render: (r) => <RowActions canEdit={canEdit} canDelete={canDel} onEdit={() => { setBayFilterZone(r.zone_id); setBayForm({ bay_id: r.bay_id, aisle_id: r.aisle_id, bay_code: r.bay_code, bay_name: r.bay_name, width_cm: String(r.width_cm || "200"), depth_cm: String(r.depth_cm || "50"), level_height_cm: String(r.level_height_cm || "50"), level_count: String(r.level_count || "4"), max_weight_kg: String(r.max_weight_kg || "500"), status: r.status || "active" }); setBayFormErr(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onDelete={() => setTaxDelTarget({ type: "bay", id: r.bay_id, label: `Bay ${r.bay_code} (${r.location_code})` })} /> },
                  ]}
                />
              </TableCard>
            </div>
          )}

          {/* -- LEVELS -- */}
          {taxLevel === "levels" && (
            <div className="space-y-4">
              {canEdit && (
                <FormCard title={isEditingLevel ? `Edit Level — ${levelForm.level_id}` : "New Level"}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <FormField label="Bay" required>
                      <Select value={levelForm.bay_id || "none"} onValueChange={(v) => setLevelForm((c) => ({ ...c, bay_id: v === "none" ? "" : v }))} disabled={savingLevel}>
                        <SelectTrigger><SelectValue placeholder="Select bay" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Select bay</SelectItem>{bayRows.map((b) => <SelectItem key={b.bay_id} value={b.bay_id}>{b.bay_name} — {b.location_code}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Status" required>
                      <Select value={levelForm.status} onValueChange={(v) => setLevelForm((c) => ({ ...c, status: v }))} disabled={savingLevel}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                      </Select>
                    </FormField>
                  </div>
                  {!isEditingLevel && <p style={{ fontSize: 12, color: T_MUTED, marginTop: 6 }}>Level code will be auto-assigned (L01, L02...).</p>}
                  {levelFormErr && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{levelFormErr}</p>}
                  <FormFooter isEditing={isEditingLevel} saving={savingLevel} onCancelEdit={() => { setLevelForm({ level_id: "", bay_id: "", level_code: "", status: "active" }); setLevelFormErr(""); }} onClear={() => setLevelForm({ level_id: "", bay_id: "", level_code: "", status: "active" })} onSave={handleSaveLevel} saveLabel="Add Level" editLabel="Update Level" />
                </FormCard>
              )}
              <TableCard>
                <Toolbar search={levelSearch} onSearch={(v) => { setLevelSearch(v); setLevelPage(1); }} onClear={() => { setLevelSearch(""); setLevelFilterBay(""); setLevelPage(1); }} onRefresh={loadLevels} loading={levelLoading} placeholder="Search level code, location code…"
                  extra={
                    <Select value={levelFilterBay || "all"} onValueChange={(v) => { setLevelFilterBay(v === "all" ? "" : v); setLevelPage(1); }}>
                      <SelectTrigger style={{ height: 40, minWidth: 180, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7 }}><SelectValue placeholder="All bays" /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All bays</SelectItem>{bayRows.map((b) => <SelectItem key={b.bay_id} value={b.bay_id}>{b.bay_name}</SelectItem>)}</SelectContent>
                    </Select>
                  }
                />
                <DataTable loading={levelLoading} rows={filteredLevels} page={levelPage} pageSize={levelPageSize} onPage={setLevelPage} onPageSize={(v) => { setLevelPageSize(v); setLevelPage(1); }} emptyText="No levels found."
                  cols={[
                    { key: "level_id",      label: "Level ID",      render: (r) => <MonoCode>{r.level_id}</MonoCode> },
                    { key: "level_code",    label: "Code",          render: (r) => <span style={{ fontWeight: 700, color: ACCENT }}>{r.level_code}</span> },
                    { key: "bay",           label: "Bay",           render: (r) => r.bay_name || r.bay_id },
                    { key: "location_code", label: "Location Code", render: (r) => <MonoCode>{r.location_code}</MonoCode> },
                    { key: "status",        label: "Status",        render: (r) => <StatusPill status={r.status} /> },
                    { key: "actions",       label: "Actions",       render: (r) => <RowActions canEdit={canEdit} canDelete={canDel} onEdit={() => { setLevelForm({ level_id: r.level_id, bay_id: r.bay_id, level_code: r.level_code, status: r.status || "active" }); setLevelFormErr(""); }} onDelete={() => setTaxDelTarget({ type: "level", id: r.level_id, label: `Level ${r.level_code} (${r.location_code})` })} /> },
                  ]}
                />
              </TableCard>
            </div>
          )}

          {/* -- BINS -- */}
          {taxLevel === "bins" && (
            <div className="space-y-4">
              {canEdit && (
                <FormCard title={isEditingBin ? `Edit Bin — ${binForm.bin_id}` : "New Bin"}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <FormField label="Level" required>
                      <Select value={binForm.level_id || "none"} onValueChange={(v) => setBinForm((c) => ({ ...c, level_id: v === "none" ? "" : v }))} disabled={savingBin}>
                        <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Select level</SelectItem>{levelRows.filter((l) => l.status === "active" || l.level_id === binForm.level_id).map((l) => <SelectItem key={l.level_id} value={l.level_id}>{l.level_code} — {l.location_code}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Maximum Weight">
                      <Input type="number" min="0" value={binForm.max_weight} onChange={(e) => setBinForm((c) => ({ ...c, max_weight: e.target.value }))} disabled={savingBin} />
                    </FormField>
                    <FormField label="Maximum Volume">
                      <Input type="number" min="0" value={binForm.max_volume} onChange={(e) => setBinForm((c) => ({ ...c, max_volume: e.target.value }))} disabled={savingBin} />
                    </FormField>
                    <FormField label="Status" required>
                      <Select value={binForm.status} onValueChange={(v) => setBinForm((c) => ({ ...c, status: v }))} disabled={savingBin}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                      </Select>
                    </FormField>
                  </div>
                  {!isEditingBin && <p style={{ fontSize: 12, color: T_MUTED, marginTop: 6 }}>Bin code will be auto-assigned (B001, B002...).</p>}
                  {binFormErr && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{binFormErr}</p>}
                  <FormFooter isEditing={isEditingBin} saving={savingBin} onCancelEdit={() => { setBinForm({ bin_id: "", level_id: "", bin_code: "", max_weight: "", max_volume: "", status: "active" }); setBinFormErr(""); }} onClear={() => setBinForm({ bin_id: "", level_id: "", bin_code: "", max_weight: "", max_volume: "", status: "active" })} onSave={handleSaveBin} saveLabel="Add Bin" editLabel="Update Bin" />
                </FormCard>
              )}
              <TableCard>
                <Toolbar search={binSearch} onSearch={(v) => { setBinSearch(v); setBinPage(1); }} onClear={() => { setBinSearch(""); setBinFilterLevel(""); setBinPage(1); }} onRefresh={loadBins} loading={binLoading} placeholder="Search bin code, location code…"
                  extra={
                    <Select value={binFilterLevel || "all"} onValueChange={(v) => { setBinFilterLevel(v === "all" ? "" : v); setBinPage(1); }}>
                      <SelectTrigger style={{ height: 40, minWidth: 180, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7 }}><SelectValue placeholder="All levels" /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All levels</SelectItem>{levelRows.map((l) => <SelectItem key={l.level_id} value={l.level_id}>{l.level_code} — {l.bay_name}</SelectItem>)}</SelectContent>
                    </Select>
                  }
                />
                <DataTable loading={binLoading} rows={filteredBins} page={binPage} pageSize={binPageSize} onPage={setBinPage} onPageSize={(v) => { setBinPageSize(v); setBinPage(1); }} emptyText="No bins found."
                  cols={[
                    { key: "bin_id",        label: "Bin ID",        render: (r) => <MonoCode>{r.bin_id}</MonoCode> },
                    { key: "bin_code",      label: "Code",          render: (r) => <span style={{ fontWeight: 700, color: ACCENT }}>{r.bin_code}</span> },
                    { key: "level",         label: "Level",         render: (r) => r.level_code || r.level_id },
                    { key: "location_code", label: "Location Code", render: (r) => <MonoCode>{r.location_code}</MonoCode> },
                    { key: "max_weight",    label: "Max Weight",    render: (r) => formatCapacityValue(r.max_weight) },
                    { key: "max_volume",    label: "Max Volume",    render: (r) => formatCapacityValue(r.max_volume) },
                    { key: "status",        label: "Status",        render: (r) => <StatusPill status={r.status} /> },
                    { key: "actions",       label: "Actions",       render: (r) => (
                      <RowActions
                        canEdit={canEdit}
                        canDelete={canDel}
                        extraActions={canEdit ? (
                          <button
                            style={{ ...btnOutline, color: ACCENT, borderColor: "#c7d2fe" }}
                            onClick={() => openCreateStorageLocation(r)}
                          >
                            Create Storage Location
                          </button>
                        ) : null}
                        onEdit={() => { setBinForm({ bin_id: r.bin_id, level_id: r.level_id, bin_code: r.bin_code, max_weight: r.max_weight ?? "", max_volume: r.max_volume ?? "", status: r.status || "active" }); setBinFormErr(""); }}
                        onDelete={() => setTaxDelTarget({ type: "bin", id: r.bin_id, label: `Bin ${r.bin_code} (${r.location_code})` })}
                      />
                    ) },
                  ]}
                />
              </TableCard>
            </div>
          )}
        </TabsContent>

        {/* -- SHELF DIMENSION -- */}
        <TabsContent value="shelf_dimension" className="mt-4">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

            {/* Input panel */}
            <div className="space-y-4">
              <FormCard title="Select Bay">
                <div className="space-y-3">
                  <FormField label="Warehouse">
                    <Select value={calcWarehouse || "none"} onValueChange={(v) => { setCalcWarehouse(v === "none" ? "" : v); setCalcZone(""); setCalcAisle(""); setCalcBay(""); setCalcResult(null); }}>
                      <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Select warehouse</SelectItem>{warehouseRows.map((w) => <SelectItem key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Zone">
                    <Select value={calcZone || "none"} onValueChange={(v) => { setCalcZone(v === "none" ? "" : v); setCalcAisle(""); setCalcBay(""); setCalcResult(null); }} disabled={!calcWarehouse}>
                      <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Select zone</SelectItem>{zoneRows.filter((z) => !calcWarehouse || z.warehouse_id === calcWarehouse).map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_code} — {z.zone_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Aisle">
                    <Select value={calcAisle || "none"} onValueChange={(v) => { setCalcAisle(v === "none" ? "" : v); setCalcBay(""); setCalcResult(null); }} disabled={!calcZone}>
                      <SelectTrigger><SelectValue placeholder="Select aisle" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Select aisle</SelectItem>{calcZoneAisles.map((a) => <SelectItem key={a.aisle_id} value={a.aisle_id}>Aisle {a.aisle_code} — {a.aisle_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Bay">
                    <Select value={calcBay || "none"} onValueChange={(v) => { setCalcBay(v === "none" ? "" : v); setCalcResult(null); }} disabled={!calcAisle}>
                      <SelectTrigger><SelectValue placeholder="Select bay" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Select bay</SelectItem>{calcAisleBays.map((b) => <SelectItem key={b.bay_id} value={b.bay_id}>{b.bay_name} — {b.location_code}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormField>
                  {selectedCalcBay && (
                    <div style={{ padding: "10px 12px", background: ACCENT_LIGHT, borderRadius: 8, fontSize: 12, color: T_SECONDARY, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      <div><span style={{ color: T_LABEL }}>Width</span><br /><b>{formatDimensionValue(selectedCalcBay.width_cm)} cm</b></div>
                      <div><span style={{ color: T_LABEL }}>Depth</span><br /><b>{formatDimensionValue(selectedCalcBay.depth_cm)} cm</b></div>
                      <div><span style={{ color: T_LABEL }}>Level H</span><br /><b>{formatDimensionValue(selectedCalcBay.level_height_cm)} cm</b></div>
                      <div><span style={{ color: T_LABEL }}>Levels</span><br /><b>{selectedCalcBay.level_count}</b></div>
                      <div><span style={{ color: T_LABEL }}>Max weight</span><br /><b>{formatCapacityValue(selectedCalcBay.max_weight_kg)} kg</b></div>
                    </div>
                  )}
                </div>
              </FormCard>

              <FormCard title="Item Dimensions">
                <div className="space-y-3">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <FormField label="Width (cm)" required><Input type="number" value={calcSkuW} onChange={(e) => { setCalcSkuW(e.target.value); setCalcResult(null); }} placeholder="e.g. 20" /></FormField>
                    <FormField label="Depth (cm)" required><Input type="number" value={calcSkuD} onChange={(e) => { setCalcSkuD(e.target.value); setCalcResult(null); }} placeholder="e.g. 15" /></FormField>
                    <FormField label="Height (cm)" required><Input type="number" value={calcSkuH} onChange={(e) => { setCalcSkuH(e.target.value); setCalcResult(null); }} placeholder="e.g. 10" /></FormField>
                  </div>
                  <FormField label="Weight per unit (kg) — optional">
                    <Input type="number" value={calcSkuWt} onChange={(e) => { setCalcSkuWt(e.target.value); setCalcResult(null); }} placeholder="e.g. 2.5" />
                  </FormField>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: T_SECONDARY }}>
                    <input type="checkbox" checked={calcRotate} onChange={(e) => { setCalcRotate(e.target.checked); setCalcResult(null); }} />
                    Allow item rotation (try best orientation)
                  </label>
                </div>
                {calcError && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{calcError}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, borderTop: "0.5px solid #eef0fc", marginTop: 4 }}>
                  <button style={{ ...btnPrimary, opacity: calculating ? 0.6 : 1, minWidth: 120 }} onClick={handleCalc} disabled={calculating}>{calculating ? "Calculating…" : "Calculate"}</button>
                </div>
              </FormCard>
            </div>

            {/* Results panel */}
            <div>
              {!calcResult && (
                <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: T_MUTED }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>??</div>
                  <p style={{ fontSize: 13 }}>Select a bay and enter item dimensions to calculate capacity.</p>
                </div>
              )}
              {calcResult && (
                <div style={cardStyle}>
                  <div style={{ padding: "11px 16px", background: "#fafbff", borderBottom: "0.5px solid #eef0fc" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T_PRIMARY }}>Calculation Result — {calcResult.location_code}</span>
                  </div>
                  <div style={{ padding: 16 }}>
                    {/* Big number */}
                    <div style={{ textAlign: "center", padding: "20px 0", borderBottom: "0.5px solid #eef0fc", marginBottom: 16 }}>
                      <div style={{ fontSize: 52, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>{calcResult.units_per_bay.toLocaleString()}</div>
                      <div style={{ fontSize: 13, color: T_SECONDARY, marginTop: 6 }}>units fit in this bay</div>
                      {calcResult.orientation_used !== "default" && <div style={{ fontSize: 12, color: T_MUTED, marginTop: 4 }}>Best orientation: {calcResult.orientation_used}</div>}
                    </div>

                    {/* Breakdown grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                      {[
                        { label: "Units per row", value: calcResult.units_per_row },
                        { label: "Rows per level", value: calcResult.rows_per_level },
                        { label: "Units per level", value: calcResult.units_per_level },
                      ].map((item) => (
                        <div key={item.label} style={{ background: "#f9fafb", borderRadius: 8, padding: "12px", textAlign: "center" }}>
                          <div style={{ fontSize: 24, fontWeight: 600, color: T_PRIMARY }}>{item.value}</div>
                          <div style={{ fontSize: 11, color: T_MUTED, marginTop: 2 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Utilisation bars */}
                    <UtilBar pct={calcResult.space_util_pct} label="Space utilisation" />
                    {calcResult.weight_util_pct != null && (
                      <div style={{ marginTop: 12 }}>
                        <UtilBar pct={calcResult.weight_util_pct} label={`Weight utilisation (${formatCapacityValue(calcResult.total_weight_kg)} kg / ${formatCapacityValue(calcResult.max_weight_kg)} kg max)`} />
                      </div>
                    )}

                    {/* Weight warning */}
                    {calcResult.weight_exceeded && (
                      <div style={{ marginTop: 12, padding: "10px 14px", background: "#fee2e2", borderRadius: 8, border: "0.5px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
                        ? Total weight ({formatCapacityValue(calcResult.total_weight_kg)} kg) exceeds bay maximum ({formatCapacityValue(calcResult.max_weight_kg)} kg). Reduce quantity per bay.
                      </div>
                    )}

                    {/* Dimensions used */}
                    <div style={{ marginTop: 16, padding: "10px 12px", background: "#f9fafb", borderRadius: 8, fontSize: 12, color: T_SECONDARY }}>
                      Item dimensions used: {formatDimensions(
                        calcResult.item_dimensions_used.width_cm,
                        calcResult.item_dimensions_used.depth_cm,
                        calcResult.item_dimensions_used.height_cm
                      )} cm
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* -- WAREHOUSES -- */}
        <TabsContent value="warehouses" className="mt-4 space-y-4">
          {canEdit && (
            <FormCard title={isEditingWarehouse ? `Edit Warehouse — ${warehouseForm.warehouse_id}` : "New Warehouse"}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <FormField label="Warehouse Name" required><Input value={warehouseForm.warehouse_name} onChange={(e) => setWarehouseForm((c) => ({ ...c, warehouse_name: e.target.value }))} placeholder="e.g. Main Distribution Center" disabled={savingWarehouse} /></FormField>
                <FormField label="City"><Input value={warehouseForm.city} onChange={(e) => setWarehouseForm((c) => ({ ...c, city: e.target.value }))} placeholder="e.g. Kuala Lumpur" disabled={savingWarehouse} /></FormField>
                <FormField label="Country"><Input value={warehouseForm.country} onChange={(e) => setWarehouseForm((c) => ({ ...c, country: e.target.value }))} placeholder="e.g. MY" maxLength={3} disabled={savingWarehouse} /></FormField>
              </div>
              {warehouseFormError && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{warehouseFormError}</p>}
              <FormFooter isEditing={isEditingWarehouse} saving={savingWarehouse} onCancelEdit={() => { setWarehouseForm({ warehouse_id: "", warehouse_name: "", city: "", country: "" }); setIsEditingWarehouse(false); setWarehouseFormError(""); }} onClear={() => setWarehouseForm({ warehouse_id: "", warehouse_name: "", city: "", country: "" })} onSave={handleSaveWarehouse} saveLabel="Add Warehouse" editLabel="Update Warehouse" />
            </FormCard>
          )}
          <TableCard>
            <Toolbar search={warehouseSearch} onSearch={(v) => { setWarehouseSearch(v); setWarehousePage(1); }} onClear={() => { setWarehouseSearch(""); setWarehousePage(1); }} onRefresh={loadWarehouses} loading={warehouseLoading} placeholder="Search warehouse name, city…" />
            <DataTable loading={warehouseLoading} rows={useMemo(() => { const q = warehouseSearch.toLowerCase(); return warehouseRows.filter((r) => !q || r.warehouse_name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q)); }, [warehouseRows, warehouseSearch])} page={warehousePage} pageSize={warehousePageSize} onPage={setWarehousePage} onPageSize={(v) => { setWarehousePageSize(v); setWarehousePage(1); }} emptyText="No warehouses found."
              cols={[
                { key: "warehouse_id",   label: "Warehouse ID",   render: (r) => <MonoCode>{r.warehouse_id}</MonoCode> },
                { key: "warehouse_name", label: "Name" },
                { key: "city",           label: "City",           render: (r) => r.city || <span style={{ color: T_MUTED }}>-</span> },
                { key: "country",        label: "Country",        render: (r) => r.country || <span style={{ color: T_MUTED }}>-</span> },
                { key: "is_active",      label: "Status",         render: (r) => <StatusPill status={r.is_active ?? true} /> },
                { key: "actions",        label: "Actions",        render: (r) => <RowActions canEdit={canEdit} canDelete={canDel} onEdit={() => { setWarehouseForm({ warehouse_id: r.warehouse_id, warehouse_name: r.warehouse_name, city: r.city || "", country: r.country || "" }); setIsEditingWarehouse(true); setWarehouseFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onDelete={() => setWarehouseDeleteTarget(r)} /> },
              ]}
            />
          </TableCard>
        </TabsContent>

        {/* -- SUPPLIERS -- */}
        <TabsContent value="suppliers" className="mt-4 space-y-4">
          {canEdit && (
            <FormCard title={isEditingSupplier ? `Edit Supplier — ${supplierForm.supplier_id}` : "New Supplier"}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <FormField label="Supplier Code"><Input value={supplierForm.supplier_code} onChange={(e) => setSupplierForm((c) => ({ ...c, supplier_code: e.target.value }))} placeholder="e.g. DHL Express Malaysia" disabled={savingSupplier} /></FormField>
                <FormField label="Supplier Name" required><Input value={supplierForm.supplier_name} onChange={(e) => setSupplierForm((c) => ({ ...c, supplier_name: e.target.value }))} placeholder="e.g. Acme Corp" disabled={savingSupplier} /></FormField>
                <FormField label="Contact Person"><Input value={supplierForm.contact_person} onChange={(e) => setSupplierForm((c) => ({ ...c, contact_person: e.target.value }))} placeholder="e.g. John Doe" disabled={savingSupplier} /></FormField>
                <FormField label="Email" required><Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm((c) => ({ ...c, email: e.target.value }))} placeholder="e.g. orders@acme.com" disabled={savingSupplier} /></FormField>
                <FormField label="Phone"><Input value={supplierForm.phone} onChange={(e) => setSupplierForm((c) => ({ ...c, phone: e.target.value }))} placeholder="e.g. +60123456789" disabled={savingSupplier} /></FormField>
                <FormField label="Address"><Input value={supplierForm.address} onChange={(e) => setSupplierForm((c) => ({ ...c, address: e.target.value }))} placeholder="e.g. 123 Main St" disabled={savingSupplier} /></FormField>
              </div>
              {(supplierFormError || supplierError) && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{supplierFormError || supplierError}</p>}
              <FormFooter isEditing={isEditingSupplier} saving={savingSupplier} onCancelEdit={() => { setSupplierForm({ supplier_id: "", supplier_code: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true }); setSupplierFormError(""); }} onClear={() => setSupplierForm({ supplier_id: "", supplier_code: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true })} onSave={handleSaveSupplier} saveLabel="Add Supplier" editLabel="Update Supplier" />
            </FormCard>
          )}
          <TableCard>
            <Toolbar search={supplierSearch} onSearch={(v) => { setSupplierSearch(v); setSupplierPage(1); }} onClear={() => { setSupplierSearch(""); setSupplierPage(1); }} onRefresh={loadSuppliers} loading={supplierLoading} placeholder="Search supplier name, email…" />
            <DataTable loading={supplierLoading} rows={useMemo(() => { const q = supplierSearch.toLowerCase(); return supplierRows.filter((r) => !q || r.supplier_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)); }, [supplierRows, supplierSearch])} page={supplierPage} pageSize={supplierPageSize} onPage={setSupplierPage} onPageSize={(v) => { setSupplierPageSize(v); setSupplierPage(1); }} emptyText="No suppliers found."
              cols={[
                { key: "supplier_id",   label: "Supplier ID",   render: (r) => <MonoCode>{r.supplier_id}</MonoCode> },
                { key: "supplier_code", label: "Code",          render: (r) => r.supplier_code ? <MonoCode>{r.supplier_code}</MonoCode> : <span style={{ color: T_MUTED }}>-</span> },
                { key: "supplier_name", label: "Name",          render: (r) => <span style={{ fontWeight: 500 }}>{r.supplier_name}</span> },
                { key: "contact_person", label: "Contact",      render: (r) => r.contact_person || <span style={{ color: T_MUTED }}>-</span> },
                { key: "email",         label: "Email",         render: (r) => r.email || <span style={{ color: T_MUTED }}>-</span> },
                { key: "phone",         label: "Phone",         render: (r) => r.phone || <span style={{ color: T_MUTED }}>-</span> },
                { key: "address",       label: "Address",       render: (r) => r.address || <span style={{ color: T_MUTED }}>-</span> },
                { key: "is_active",     label: "Status",        render: (r) => <StatusPill status={r.is_active ?? true} /> },
                { key: "actions",       label: "Actions",       render: (r) => <RowActions canEdit={canEdit} canDelete={canDel} onEdit={() => { setSupplierForm({ supplier_id: r.supplier_id, supplier_code: r.supplier_code || "", supplier_name: r.supplier_name, contact_person: r.contact_person || "", email: r.email || "", phone: r.phone || "", address: r.address || "", is_active: r.is_active }); setSupplierFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onDelete={() => setSupplierDeleteTarget(r)} /> },
              ]}
            />
          </TableCard>
        </TabsContent>

        {/* -- CUSTOMERS -- */}
        <TabsContent value="customers" className="mt-4 space-y-4">
          {canEdit && (
            <FormCard title={isEditingCustomer ? `Edit Customer — ${customerForm.customer_id}` : "New Customer"}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <FormField label="Customer Name" required><Input value={customerForm.customer_name} onChange={(e) => setCustomerForm((c) => ({ ...c, customer_name: e.target.value }))} placeholder="e.g. RetailMax" disabled={savingCustomer} /></FormField>
                <FormField label="Email" required><Input type="email" value={customerForm.contact} onChange={(e) => setCustomerForm((c) => ({ ...c, contact: e.target.value }))} placeholder="e.g. orders@retailmax.com" disabled={savingCustomer} /></FormField>
                <FormField label="Phone"><Input value={customerForm.phone} onChange={(e) => setCustomerForm((c) => ({ ...c, phone: e.target.value }))} placeholder="e.g. +60123456789" disabled={savingCustomer} /></FormField>
              </div>
              {(customerFormError || customerError) && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{customerFormError || customerError}</p>}
              <FormFooter isEditing={isEditingCustomer} saving={savingCustomer} onCancelEdit={() => { setCustomerForm({ customer_id: "", customer_name: "", contact: "", phone: "" }); setCustomerFormError(""); }} onClear={() => setCustomerForm({ customer_id: "", customer_name: "", contact: "", phone: "" })} onSave={handleSaveCustomer} saveLabel="Add Customer" editLabel="Update Customer" />
            </FormCard>
          )}
          <TableCard>
            <Toolbar search={customerSearch} onSearch={(v) => { setCustomerSearch(v); setCustomerPage(1); }} onClear={() => { setCustomerSearch(""); setCustomerPage(1); }} onRefresh={loadCustomers} loading={customerLoading} placeholder="Search customer name, email…" />
            <DataTable loading={customerLoading} rows={useMemo(() => { const q = customerSearch.toLowerCase(); return customerRows.filter((r) => !q || r.customer_name?.toLowerCase().includes(q) || r.contact?.toLowerCase().includes(q)); }, [customerRows, customerSearch])} page={customerPage} pageSize={customerPageSize} onPage={setCustomerPage} onPageSize={(v) => { setCustomerPageSize(v); setCustomerPage(1); }} emptyText="No customers found."
              cols={[
                { key: "customer_id",   label: "Customer ID",   render: (r) => <MonoCode>{r.customer_id}</MonoCode> },
                { key: "customer_name", label: "Name",          render: (r) => <span style={{ fontWeight: 500 }}>{r.customer_name}</span> },
                { key: "contact",       label: "Email",         render: (r) => r.contact || <span style={{ color: T_MUTED }}>-</span> },
                { key: "phone",         label: "Phone",         render: (r) => r.phone || <span style={{ color: T_MUTED }}>-</span> },
                { key: "actions",       label: "Actions",       render: (r) => <RowActions canEdit={canEdit} canDelete={canDel} onEdit={() => { setCustomerForm({ customer_id: r.customer_id, customer_name: r.customer_name, contact: r.contact || "", phone: r.phone || "" }); setCustomerFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} onDelete={() => setCustomerDeleteTarget(r)} /> },
              ]}
            />
          </TableCard>
        </TabsContent>
      </Tabs>

      {/* -- Delete modals -- */}
      <DeleteModal open={Boolean(supplierDeleteTarget)} onClose={() => setSupplierDeleteTarget(null)} onConfirm={handleDeleteSupplier} title={`Delete ${supplierDeleteTarget?.supplier_id || ""}`} description={`Delete supplier "${supplierDeleteTarget?.supplier_name}"? This cannot be undone.`} />
      <CustomConfirmModal open={Boolean(skuDeleteTarget)} onClose={() => { if (!deletingSku) setSkuDeleteTarget(null); }} onConfirm={handleDeleteSku} title={`Delete ${skuDeleteTarget?.sku_id || ""}`} description={`Delete SKU "${skuDeleteTarget?.description}"? Referenced SKUs will be set to inactive.`} confirmLabel={deletingSku ? "Deleting..." : "Confirm Delete"} />
      <DeleteModal open={Boolean(warehouseDeleteTarget)} onClose={() => setWarehouseDeleteTarget(null)} onConfirm={handleDeleteWarehouse} title={`Delete ${warehouseDeleteTarget?.warehouse_id || ""}`} description={`Delete warehouse "${warehouseDeleteTarget?.warehouse_name}"? This cannot be undone.`} />
      <DeleteModal open={Boolean(customerDeleteTarget)} onClose={() => setCustomerDeleteTarget(null)} onConfirm={handleDeleteCustomer} title={`Delete ${customerDeleteTarget?.customer_id || ""}`} description={`Delete customer "${customerDeleteTarget?.customer_name}"? This cannot be undone.`} />

      {/* Taxonomy delete — single modal with cascade warning */}
      <DeleteModal
        open={Boolean(taxDelTarget)}
        onClose={() => setTaxDelTarget(null)}
        onConfirm={confirmTaxDelete}
        confirming={taxDeleting}
        title={`Delete ${taxDelTarget?.type || ""}`}
        description={`Delete "${taxDelTarget?.label}"? ${
          taxDelTarget?.type === "zone"  ? "Referenced aisles, bays, levels, and bins will prevent hard deletion." :
          taxDelTarget?.type === "aisle" ? "Referenced bays, levels, and bins will prevent hard deletion." :
          taxDelTarget?.type === "bay"   ? "Referenced levels and bins will prevent hard deletion." :
          taxDelTarget?.type === "level" ? "Referenced bins will prevent hard deletion." :
          "This action cannot be undone."
        }`}
      />

      <Dialog open={Boolean(storageLocationTarget)} onOpenChange={(open) => !open && setStorageLocationTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Storage Location</DialogTitle></DialogHeader>
          {storageLocationTarget?.bin && (
            <div className="space-y-4">
              <div style={{ padding: 12, border: "0.5px solid #e5e7eb", borderRadius: 8, background: "#fafbff" }}>
                <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL }}>Generated Location Code</p>
                <p style={{ marginTop: 4 }}><MonoCode>{storageLocationTarget.bin.location_code || "Unavailable"}</MonoCode></p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL }}>Bin</p>
                  <p><MonoCode>{storageLocationTarget.bin.bin_id}</MonoCode></p>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL }}>Warehouse</p>
                  <p><MonoCode>{storageLocationTarget.bin.warehouse_id || session.warehouse_id || "-"}</MonoCode></p>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL }}>Zone</p>
                  <p>{storageLocationTarget.bin.zone_name || storageLocationTarget.bin.zone_id || "-"}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL }}>Location Type</p>
                  <p>storage</p>
                </div>
              </div>
              {storageLocationTarget.existing && (
                <div style={{ padding: 10, borderRadius: 8, background: "#fffbeb", color: "#92400e", fontSize: 13 }}>
                  Existing location: {storageLocationTarget.existing.display_name || storageLocationTarget.existing.location_code || storageLocationTarget.existing.location_id}
                </div>
              )}
              {storageLocationError && (
                <div style={{ padding: 10, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
                  {storageLocationError}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
                <button style={btnNeutral} onClick={() => setStorageLocationTarget(null)} disabled={creatingStorageLocation}>Cancel</button>
                <button
                  style={{ ...btnPrimary, opacity: creatingStorageLocation || storageLocationTarget.existing ? 0.6 : 1 }}
                  onClick={confirmCreateStorageLocation}
                  disabled={creatingStorageLocation || Boolean(storageLocationTarget.existing)}
                >
                  {creatingStorageLocation ? "Creating..." : "Create Storage Location"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default MasterDataPage;
