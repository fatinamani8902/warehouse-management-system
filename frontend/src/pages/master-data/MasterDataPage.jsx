import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  fetchSuppliers, createSupplier, updateSupplier, deleteSupplier,
  fetchSkus, createSkuApi, updateSkuApi, deleteSkuApi,
  fetchLocations, createLocationApi, updateLocationApi, deleteLocationApi,
  fetchWarehouses, createWarehouseApi,
  fetchCustomers, createCustomerApi, updateCustomerApi, deleteCustomerApi,
  toSessionContext,
} from "@/services/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT       = "#3b5bdb";
const ACCENT_LIGHT = "#eef2ff";
const T_PRIMARY    = "#111827";
const T_SECONDARY  = "#374151";
const T_LABEL      = "#6b7280";
const T_MUTED      = "#9ca3af";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 32, padding: "0 12px", borderRadius: 7, fontSize: 13, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };
const btnPrimary = { ...btnBase, height: 32, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, background: ACCENT, color: "#fff" };
const btnDanger  = { ...btnBase, height: 32, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, background: "#e03131", color: "#fff" };
const btnOutline = { ...btnBase, height: 28, padding: "0 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid #d1d5db", background: "#fff", color: T_PRIMARY };

const cardStyle  = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };
const thStyle    = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap", background: "#fafbff" };
const tdStyle    = { padding: "12px 14px", borderBottom: "0.5px solid #f0f0f0", fontSize: 13, color: T_PRIMARY };

// ── StatusPill ────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  active:   { bg: "#dcfce7", color: "#14532d", border: "#86efac", dot: "#22c55e", label: "Active" },
  inactive: { bg: "#f3f4f6", color: "#374151", border: "#d1d5db", dot: "#9ca3af", label: "Inactive" },
};

function StatusPill({ status }) {
  const key = String(status || "").toLowerCase();
  const c = STATUS_CFG[key] || STATUS_CFG.inactive;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20,
      background: c.bg, color: c.color, border: `0.5px solid ${c.border}`, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

// ── FormField ─────────────────────────────────────────────────────────────────
function FormField({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: T_LABEL }}>
        {label}{required && <span style={{ color: "#e03131", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ── FormCard — wraps the create/edit form ─────────────────────────────────────
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

// ── TableCard — wraps the list table ─────────────────────────────────────────
function TableCard({ children }) {
  return <div style={cardStyle}>{children}</div>;
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ search, onSearch, onClear, onRefresh, loading, placeholder }) {
  return (
    <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
        <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          style={{ width: "100%", height: 32, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
          placeholder={placeholder || "Search…"}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div style={{ flex: 1 }} />
      <button style={btnNeutral} onClick={onClear}>Clear</button>
      <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={onRefresh} disabled={loading}>Refresh</button>
    </div>
  );
}

// ── Row count footer ──────────────────────────────────────────────────────────
function TableFooter({ count, search }) {
  return (
    <div style={{ padding: "8px 14px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", fontSize: 12, color: T_MUTED }}>
      {count} record{count === 1 ? "" : "s"}{search ? ` matching "${search}"` : ""}
    </div>
  );
}

// ── Action chips (Edit / Delete) ──────────────────────────────────────────────
function RowActions({ onEdit, onDelete }) {
  return (
    <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
      <button style={{ ...btnOutline }} onClick={onEdit}>Edit</button>
      <button style={{ ...btnBase, height: 28, padding: "0 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#fee2e2", color: "#b91c1c", border: "0.5px solid #fca5a5" }} onClick={onDelete}>Delete</button>
    </div>
  );
}

// ── Generic table ─────────────────────────────────────────────────────────────
function DataTable({ cols, rows, loading, emptyText = "No data found.", search = "", selectedId, idKey, onSelect }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v || "").toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{cols.map((c) => <th key={c.key} style={{ ...thStyle, textAlign: c.right ? "right" : "left" }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={cols.length} style={{ padding: "28px 14px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>Loading…</td></tr>}
          {!loading && filtered.length === 0 && <tr><td colSpan={cols.length} style={{ padding: "28px 14px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>{search ? "No results match your search." : emptyText}</td></tr>}
          {!loading && filtered.map((row, i) => {
            const rowId = idKey ? row[idKey] : i;
            const isSel = selectedId !== undefined && selectedId === rowId;
            return (
              <tr key={rowId}
                style={{ cursor: onSelect ? "pointer" : "default", background: isSel ? ACCENT_LIGHT : "transparent" }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                onClick={() => onSelect && onSelect(isSel ? "" : rowId)}
              >
                {cols.map((c) => (
                  <td key={c.key} style={{ ...tdStyle, textAlign: c.right ? "right" : "left" }}>
                    {c.render ? c.render(row) : (row[c.key] ?? <span style={{ color: T_MUTED }}>—</span>)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!loading && filtered.length > 0 && <TableFooter count={filtered.length} search={search} />}
    </>
  );
}

// ── Detail panel (used by Supplier tab) ───────────────────────────────────────
function SupplierDetailPanel({ supplier, onEdit, onDelete }) {
  if (!supplier) return null;
  return (
    <div style={{ borderTop: "2px solid #3b5bdb", background: "#fff" }}>
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: T_PRIMARY }}>{supplier.supplier_id}</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{supplier.supplier_name}</span>
          <StatusPill status={supplier.is_active ? "active" : "inactive"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
          {[
            { label: "Contact Person", value: supplier.contact_person },
            { label: "Email",          value: supplier.email },
            { label: "Phone",          value: supplier.phone },
            { label: "Address",        value: supplier.address },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontSize: 11, fontWeight: 700, color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</p>
              <p style={{ fontSize: 13, color: value ? T_PRIMARY : T_MUTED, fontStyle: value ? "normal" : "italic" }}>{value || "Not provided"}</p>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnNeutral} onClick={() => onEdit(supplier)}>Edit Supplier</button>
          <button style={btnDanger} onClick={() => onDelete(supplier)}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteModal({ open, onClose, onConfirm, title, description }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p style={{ fontSize: 13, color: T_SECONDARY }}>{description}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
            <button style={btnNeutral} onClick={onClose}>Back</button>
            <button style={btnDanger} onClick={onConfirm}>Confirm Delete</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const MasterDataPage = () => {
  const auth      = useAuth();
  const { toast } = useToast();
  const session   = useMemo(() => toSessionContext(auth), [auth]);

  // ── Suppliers ────────────────────────────────────────────────────────────
  const [supplierRows, setSupplierRows]               = useState([]);
  const [supplierLoading, setSupplierLoading]         = useState(true);
  const [supplierError, setSupplierError]             = useState("");
  const [savingSupplier, setSavingSupplier]           = useState(false);
  const [supplierDeleteTarget, setSupplierDeleteTarget] = useState(null);
  const [supplierForm, setSupplierForm]               = useState({ supplier_id: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true });
  const [supplierFormError, setSupplierFormError]     = useState("");
  const [supplierSearch, setSupplierSearch]           = useState("");
  const [selectedSupplierId, setSelectedSupplierId]   = useState("");
  const isEditingSupplier = Boolean(supplierForm.supplier_id);

  // ── SKU ───────────────────────────────────────────────────────────────────
  const [skuRows, setSkuRows]                   = useState([]);
  const [skuLoading, setSkuLoading]             = useState(true);
  const [skuError, setSkuError]                 = useState("");
  const [savingSku, setSavingSku]               = useState(false);
  const [skuDeleteTarget, setSkuDeleteTarget]   = useState(null);
  const [skuForm, setSkuForm]                   = useState({ sku_id: "", description: "", uom_id: "EA", epc_value: "" });
  const [skuFormError, setSkuFormError]         = useState("");
  const [skuSearch, setSkuSearch]               = useState("");
  const isEditingSku = Boolean(skuForm.sku_id && skuRows.some((r) => r.sku_id === skuForm.sku_id));

  // ── Locations ─────────────────────────────────────────────────────────────
  const [locationRows, setLocationRows]                 = useState([]);
  const [locationLoading, setLocationLoading]           = useState(true);
  const [locationError, setLocationError]               = useState("");
  const [savingLocation, setSavingLocation]             = useState(false);
  const [locationDeleteTarget, setLocationDeleteTarget] = useState(null);
  const [locationForm, setLocationForm]                 = useState({ location_id: "", location_code: "", zone_id: "", capacity: "100" });
  const [locationFormError, setLocationFormError]       = useState("");
  const [locationSearch, setLocationSearch]             = useState("");
  const [zones, setZones]                               = useState([]);
  const isEditingLocation = Boolean(locationForm.location_id);

  // ── Warehouses ────────────────────────────────────────────────────────────
  const [warehouseRows, setWarehouseRows]                 = useState([]);
  const [warehouseLoading, setWarehouseLoading]           = useState(true);
  const [savingWarehouse, setSavingWarehouse]             = useState(false);
  const [warehouseForm, setWarehouseForm]                 = useState({ warehouse_id: "", warehouse_name: "", city: "", country: "" });
  const [warehouseSearch, setWarehouseSearch]             = useState("");
  const [isEditingWarehouse, setIsEditingWarehouse]       = useState(false);
  const [warehouseDeleteTarget, setWarehouseDeleteTarget] = useState(null);
  const [warehouseFormError, setWarehouseFormError]       = useState("");

  // ── Customers ─────────────────────────────────────────────────────────────
  const [customerRows, setCustomerRows]                 = useState([]);
  const [customerLoading, setCustomerLoading]           = useState(true);
  const [customerError, setCustomerError]               = useState("");
  const [savingCustomer, setSavingCustomer]             = useState(false);
  const [customerDeleteTarget, setCustomerDeleteTarget] = useState(null);
  const [customerForm, setCustomerForm]                 = useState({ customer_id: "", customer_name: "", contact: "", phone: "" });
  const [customerFormError, setCustomerFormError]       = useState("");
  const [customerSearch, setCustomerSearch]             = useState("");
  const isEditingCustomer = Boolean(customerForm.customer_id);

  // ── Selected supplier detail ──────────────────────────────────────────────
  const selectedSupplier = useMemo(() => supplierRows.find((r) => r.supplier_id === selectedSupplierId) || null, [supplierRows, selectedSupplierId]);

  // ── Load functions ────────────────────────────────────────────────────────
  const loadSuppliers = useCallback(async () => {
    if (!session?.tenant_id) return;
    try { setSupplierLoading(true); setSupplierError(""); const data = await fetchSuppliers(session); setSupplierRows(Array.isArray(data) ? data : []); }
    catch (err) { setSupplierError(err.message || "Failed to load suppliers"); }
    finally { setSupplierLoading(false); }
  }, [session]);

  const loadSkus = useCallback(async () => {
    if (!session?.tenant_id) return;
    try { setSkuLoading(true); setSkuError(""); const result = await fetchSkus(session, { page: 1, pageSize: 50 }); setSkuRows(Array.isArray(result?.data) ? result.data : []); }
    catch (err) { setSkuError(err.message || "Failed to load SKUs"); }
    finally { setSkuLoading(false); }
  }, [session]);

  const loadLocations = useCallback(async () => {
    if (!session?.tenant_id) return;
    try {
      setLocationLoading(true); setLocationError("");
      const [locResult, zoneResult] = await Promise.all([
        fetchLocations(session, {}),
        fetch(`${import.meta.env.VITE_API_URL}/api/v1/master/zones`, {
          headers: { "x-tenant-id": session.tenant_id, "x-warehouse-id": session.warehouse_id || "", "x-roles": session.role_id || "superadmin", "x-client-source": "PORTAL" },
        }).then((r) => r.json()),
      ]);
      setLocationRows(Array.isArray(locResult?.data) ? locResult.data : []);
      setZones(Array.isArray(zoneResult?.data) ? zoneResult.data : []);
    } catch (err) { setLocationError(err.message || "Failed to load locations"); }
    finally { setLocationLoading(false); }
  }, [session]);

  const loadWarehouses = useCallback(async () => {
    if (!session?.tenant_id) return;
    try { setWarehouseLoading(true); const result = await fetchWarehouses(session, {}); setWarehouseRows(Array.isArray(result?.data) ? result.data : []); }
    catch (err) { console.error("Failed to load warehouses", err); }
    finally { setWarehouseLoading(false); }
  }, [session]);

  const loadCustomers = useCallback(async () => {
    if (!session?.tenant_id) return;
    try { setCustomerLoading(true); setCustomerError(""); const result = await fetchCustomers(session, {}); setCustomerRows(Array.isArray(result?.data) ? result.data : []); }
    catch (err) { setCustomerError(err.message || "Failed to load customers"); }
    finally { setCustomerLoading(false); }
  }, [session]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  useEffect(() => { loadSkus(); },       [loadSkus]);
  useEffect(() => { loadLocations(); },  [loadLocations]);
  useEffect(() => { loadWarehouses(); }, [loadWarehouses]);
  useEffect(() => { loadCustomers(); },  [loadCustomers]);

  // ── Supplier handlers ─────────────────────────────────────────────────────
  const handleSaveSupplier = async () => {
    if (!supplierForm.supplier_name.trim()) { setSupplierFormError("Supplier name is required"); return; }
    if (!supplierForm.email.trim()) { setSupplierFormError("Email is required"); return; }
    if (!supplierForm.phone.trim()) { setSupplierFormError("Phone number is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierForm.email.trim())) { setSupplierFormError("Please enter a valid email address"); return; }
    const dupEmail = supplierRows.find((r) => r.email?.trim().toLowerCase() === supplierForm.email.trim().toLowerCase() && r.supplier_id !== supplierForm.supplier_id);
    if (dupEmail) { setSupplierFormError(`Email already used by ${dupEmail.supplier_id}`); return; }
    const payload = { supplier_name: supplierForm.supplier_name.trim(), contact_person: supplierForm.contact_person.trim() || null, email: supplierForm.email.trim(), phone: supplierForm.phone.trim(), address: supplierForm.address.trim() || null, is_active: supplierForm.is_active };
    try {
      setSavingSupplier(true); setSupplierFormError("");
      if (isEditingSupplier) {
        const updated = await updateSupplier(session, supplierForm.supplier_id, payload);
        const enriched = { ...updated, ...payload, supplier_id: supplierForm.supplier_id };
        setSupplierRows((c) => c.map((r) => r.supplier_id === enriched.supplier_id ? enriched : r));
        toast({ title: "Supplier updated" });
      } else {
        const created = await createSupplier(session, payload);
        setSupplierRows((c) => [{ ...(created?.data ?? created), ...payload }, ...c]);
        toast({ title: "Supplier created" });
      }
      setSupplierForm({ supplier_id: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true });
    } catch (err) { setSupplierFormError(err.message || "Failed to save supplier"); }
    finally { setSavingSupplier(false); }
  };

  const handleDeleteSupplier = async () => {
    if (!supplierDeleteTarget) return;
    try { await deleteSupplier(session, supplierDeleteTarget.supplier_id); setSupplierRows((c) => c.filter((r) => r.supplier_id !== supplierDeleteTarget.supplier_id)); toast({ title: "Supplier deleted" }); }
    catch (err) { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); }
    finally { setSupplierDeleteTarget(null); }
  };

  // ── SKU handlers ──────────────────────────────────────────────────────────
  const handleSaveSku = async () => {
    if (!skuForm.description.trim()) { setSkuFormError("Description is required"); return; }
    if (!isEditingSku && !skuForm.sku_id.trim()) { setSkuFormError("SKU ID is required"); return; }
    try {
      setSavingSku(true); setSkuFormError("");
      if (isEditingSku) {
        const result = await updateSkuApi(session, skuForm.sku_id, { description: skuForm.description.trim(), uom_id: skuForm.uom_id, epc_value: skuForm.epc_value || null });
        setSkuRows((c) => c.map((r) => r.sku_id === (result?.data ?? result).sku_id ? (result?.data ?? result) : r));
        toast({ title: "SKU updated" });
      } else {
        const result = await createSkuApi(session, { sku_id: skuForm.sku_id.trim().toUpperCase(), description: skuForm.description.trim(), uom_id: skuForm.uom_id, epc_value: skuForm.epc_value || null });
        setSkuRows((c) => [result?.data ?? result, ...c]);
        toast({ title: "SKU created" });
      }
      setSkuForm({ sku_id: "", description: "", uom_id: "EA", epc_value: "" });
    } catch (err) { setSkuFormError(err.message || "Failed to save SKU"); }
    finally { setSavingSku(false); }
  };

  const handleDeleteSku = async () => {
    if (!skuDeleteTarget) return;
    try { await deleteSkuApi(session, skuDeleteTarget.sku_id); setSkuRows((c) => c.filter((r) => r.sku_id !== skuDeleteTarget.sku_id)); toast({ title: "SKU deleted" }); }
    catch (err) { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); }
    finally { setSkuDeleteTarget(null); }
  };

  // ── Location handlers ─────────────────────────────────────────────────────
  const handleSaveLocation = async () => {
    if (!locationForm.location_code.trim()) { setLocationFormError("Location code is required"); return; }
    if (!locationForm.zone_id) { setLocationFormError("Zone is required"); return; }
    const dup = locationRows.find((r) => r.location_code.trim().toLowerCase() === locationForm.location_code.trim().toLowerCase() && r.zone_id === locationForm.zone_id && r.location_id !== locationForm.location_id);
    if (dup) { setLocationFormError(`Location code "${locationForm.location_code}" already exists in this zone (${dup.location_id})`); return; }
    try {
      setSavingLocation(true); setLocationFormError("");
      const payload = { location_code: locationForm.location_code.trim(), zone_id: locationForm.zone_id, capacity: Number(locationForm.capacity) || 100 };
      if (isEditingLocation) {
        const result = await updateLocationApi(session, locationForm.location_id, payload);
        const updated = result?.data ?? result;
        const zone = zones.find((z) => z.zone_id === updated.zone_id);
        setLocationRows((c) => c.map((r) => r.location_id === updated.location_id ? { ...updated, zone_name: zone?.zone_name || updated.zone_id } : r));
        toast({ title: "Location updated" });
      } else {
        const result = await createLocationApi(session, payload);
        const created = result?.data ?? result;
        const zone = zones.find((z) => z.zone_id === created.zone_id);
        setLocationRows((c) => [{ ...created, zone_name: zone?.zone_name || created.zone_id }, ...c]);
        toast({ title: "Location created" });
      }
      setLocationForm({ location_id: "", location_code: "", zone_id: "", capacity: "100" });
    } catch (err) { setLocationFormError(err.message || "Failed to save location"); }
    finally { setSavingLocation(false); }
  };

  const handleDeleteLocation = async () => {
    if (!locationDeleteTarget) return;
    try { await deleteLocationApi(session, locationDeleteTarget.location_id); setLocationRows((c) => c.filter((r) => r.location_id !== locationDeleteTarget.location_id)); toast({ title: "Location deleted" }); }
    catch (err) { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); }
    finally { setLocationDeleteTarget(null); }
  };

  // ── Warehouse handlers ────────────────────────────────────────────────────
  const handleSaveWarehouse = async () => {
    if (!warehouseForm.warehouse_name.trim()) { setWarehouseFormError("Warehouse name is required"); return; }
    if (!isEditingWarehouse && !warehouseForm.warehouse_id.trim()) { setWarehouseFormError("Warehouse ID is required"); return; }
    const dup = warehouseRows.find((r) => r.warehouse_id.trim().toUpperCase() === warehouseForm.warehouse_id.trim().toUpperCase() && !isEditingWarehouse);
    if (dup) { setWarehouseFormError(`Warehouse ID "${warehouseForm.warehouse_id}" already exists`); return; }
    try {
      setSavingWarehouse(true); setWarehouseFormError("");
      if (isEditingWarehouse) {
        setWarehouseRows((c) => c.map((r) => r.warehouse_id === warehouseForm.warehouse_id ? { ...r, warehouse_name: warehouseForm.warehouse_name.trim(), city: warehouseForm.city.trim(), country: warehouseForm.country.trim() } : r));
        toast({ title: "Warehouse updated" });
      } else {
        const result = await createWarehouseApi(session, { warehouse_id: warehouseForm.warehouse_id.trim().toUpperCase(), warehouse_name: warehouseForm.warehouse_name.trim(), city: warehouseForm.city.trim(), country: warehouseForm.country.trim() });
        setWarehouseRows((c) => [...c, result?.data ?? result]);
        toast({ title: "Warehouse created" });
      }
      setWarehouseForm({ warehouse_id: "", warehouse_name: "", city: "", country: "" });
      setIsEditingWarehouse(false);
    } catch (err) { setWarehouseFormError(err.message || "Failed to save warehouse"); }
    finally { setSavingWarehouse(false); }
  };

  const handleDeleteWarehouse = async () => {
    if (!warehouseDeleteTarget) return;
    setWarehouseRows((c) => c.filter((r) => r.warehouse_id !== warehouseDeleteTarget.warehouse_id));
    toast({ title: "Warehouse removed" });
    setWarehouseDeleteTarget(null);
  };

  // ── Customer handlers ─────────────────────────────────────────────────────
  const handleSaveCustomer = async () => {
    if (!customerForm.customer_name.trim()) { setCustomerFormError("Customer name is required"); return; }
    if (!customerForm.contact.trim()) { setCustomerFormError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.contact.trim())) { setCustomerFormError("Please enter a valid email address"); return; }
    if (!customerForm.phone.trim()) { setCustomerFormError("Phone number is required"); return; }
    const dupEmail = customerRows.find((r) => r.contact?.trim().toLowerCase() === customerForm.contact.trim().toLowerCase() && r.customer_id !== customerForm.customer_id);
    if (dupEmail) { setCustomerFormError(`Email already used by ${dupEmail.customer_id}`); return; }
    try {
      setSavingCustomer(true); setCustomerFormError("");
      const payload = { customer_name: customerForm.customer_name.trim(), contact: customerForm.contact.trim(), phone: customerForm.phone.trim() };
      if (isEditingCustomer) {
        const result = await updateCustomerApi(session, customerForm.customer_id, payload);
        setCustomerRows((c) => c.map((r) => r.customer_id === customerForm.customer_id ? { ...(result?.data ?? result), ...payload, customer_id: customerForm.customer_id } : r));
        toast({ title: "Customer updated" });
      } else {
        const result = await createCustomerApi(session, payload);
        setCustomerRows((c) => [{ ...(result?.data ?? result), ...payload }, ...c]);
        toast({ title: "Customer created" });
      }
      setCustomerForm({ customer_id: "", customer_name: "", contact: "", phone: "" });
    } catch (err) { setCustomerFormError(err.message || "Failed to save customer"); }
    finally { setSavingCustomer(false); }
  };

  const handleDeleteCustomer = async () => {
    if (!customerDeleteTarget) return;
    try { await deleteCustomerApi(session, customerDeleteTarget.customer_id); setCustomerRows((c) => c.filter((r) => r.customer_id !== customerDeleteTarget.customer_id)); toast({ title: "Customer deleted" }); }
    catch (err) { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); }
    finally { setCustomerDeleteTarget(null); }
  };

  // ── Shared form footer ────────────────────────────────────────────────────
  const FormFooter = ({ isEditing, onCancelEdit, onClear, onSave, saving, saveLabel, editLabel }) => (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 12, borderTop: "0.5px solid #eef0fc", marginTop: 4 }}>
      {isEditing && <button style={btnNeutral} onClick={onCancelEdit} disabled={saving}>Cancel Edit</button>}
      <button style={btnNeutral} onClick={onClear} disabled={saving}>Clear</button>
      <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : isEditing ? editLabel : saveLabel}
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Master Data" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Master Data</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>Manage SKUs, locations, warehouses, suppliers and customers</p>
      </div>

      <Tabs defaultValue="sku">
        <TabsList>
          <TabsTrigger value="sku">SKU</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        {/* ── SKU ── */}
        <TabsContent value="sku" className="mt-4 space-y-4">
          <FormCard title={isEditingSku ? `Edit SKU — ${skuForm.sku_id}` : "New SKU"}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="SKU ID" required>
                <Input value={skuForm.sku_id} onChange={(e) => setSkuForm((c) => ({ ...c, sku_id: e.target.value }))} placeholder="e.g. SKU000006" disabled={isEditingSku || savingSku} />
              </FormField>
              <FormField label="Description" required>
                <Input value={skuForm.description} onChange={(e) => setSkuForm((c) => ({ ...c, description: e.target.value }))} placeholder="e.g. Industrial Bearing 6205" disabled={savingSku} />
              </FormField>
              <FormField label="UOM">
                <Select value={skuForm.uom_id} onValueChange={(v) => setSkuForm((c) => ({ ...c, uom_id: v }))} disabled={savingSku}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EA">EA — Each</SelectItem>
                    <SelectItem value="BOX">BOX — Box</SelectItem>
                    <SelectItem value="PAIR">PAIR — Pair</SelectItem>
                    <SelectItem value="KG">KG — Kilogram</SelectItem>
                    <SelectItem value="LTR">LTR — Litre</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="EPC Value (RFID)">
                <Input value={skuForm.epc_value} onChange={(e) => setSkuForm((c) => ({ ...c, epc_value: e.target.value }))} placeholder="e.g. EPC:300833B2DDD901…" disabled={savingSku} />
              </FormField>
            </div>
            {(skuFormError || skuError) && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{skuFormError || skuError}</p>}
            <FormFooter isEditing={isEditingSku} saving={savingSku}
              onCancelEdit={() => { setSkuForm({ sku_id: "", description: "", uom_id: "EA", epc_value: "" }); setSkuFormError(""); }}
              onClear={() => setSkuForm({ sku_id: "", description: "", uom_id: "EA", epc_value: "" })}
              onSave={handleSaveSku} saveLabel="Add SKU" editLabel="Update SKU" />
          </FormCard>

          <TableCard>
            <Toolbar search={skuSearch} onSearch={setSkuSearch} onClear={() => setSkuSearch("")} onRefresh={loadSkus} loading={skuLoading} placeholder="Search SKU ID, description…" />
            <DataTable loading={skuLoading} rows={skuRows} search={skuSearch} emptyText="No SKUs found."
              cols={[
                { key: "sku_id",      label: "SKU ID",      render: (r) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: T_SECONDARY }}>{r.sku_id}</span> },
                { key: "description", label: "Description" },
                { key: "uom_id",      label: "UOM" },
                { key: "epc_value",   label: "EPC Value",   render: (r) => r.epc_value ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: T_SECONDARY }}>{r.epc_value}</span> : <span style={{ color: T_MUTED }}>—</span> },
                { key: "actions",     label: "Actions",     render: (r) => <RowActions onEdit={() => { setSkuForm({ sku_id: r.sku_id, description: r.description, uom_id: r.uom_id || "EA", epc_value: r.epc_value || "" }); setSkuFormError(""); }} onDelete={() => setSkuDeleteTarget(r)} /> },
              ]}
            />
          </TableCard>
        </TabsContent>

        {/* ── LOCATIONS ── */}
        <TabsContent value="locations" className="mt-4 space-y-4">
          <FormCard title={isEditingLocation ? `Edit Location — ${locationForm.location_id}` : "New Location"}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <FormField label="Location Code" required>
                <Input value={locationForm.location_code} onChange={(e) => setLocationForm((c) => ({ ...c, location_code: e.target.value }))} placeholder="e.g. A-01-003" disabled={savingLocation} />
              </FormField>
              <FormField label="Zone" required>
                <Select value={locationForm.zone_id || "none"} onValueChange={(v) => setLocationForm((c) => ({ ...c, zone_id: v === "none" ? "" : v }))} disabled={savingLocation}>
                  <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select zone</SelectItem>
                    {zones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id}>{z.zone_name} ({z.zone_id})</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Capacity">
                <Input type="number" value={locationForm.capacity} onChange={(e) => setLocationForm((c) => ({ ...c, capacity: e.target.value }))} placeholder="100" disabled={savingLocation} />
              </FormField>
            </div>
            {(locationFormError || locationError) && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{locationFormError || locationError}</p>}
            <FormFooter isEditing={isEditingLocation} saving={savingLocation}
              onCancelEdit={() => { setLocationForm({ location_id: "", location_code: "", zone_id: "", capacity: "100" }); setLocationFormError(""); }}
              onClear={() => setLocationForm({ location_id: "", location_code: "", zone_id: "", capacity: "100" })}
              onSave={handleSaveLocation} saveLabel="Add Location" editLabel="Update Location" />
          </FormCard>

          <TableCard>
            <Toolbar search={locationSearch} onSearch={setLocationSearch} onClear={() => setLocationSearch("")} onRefresh={loadLocations} loading={locationLoading} placeholder="Search location code, zone…" />
            <DataTable loading={locationLoading} rows={locationRows} search={locationSearch} emptyText="No locations found."
              cols={[
                { key: "location_id",   label: "Location ID",  render: (r) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: T_SECONDARY }}>{r.location_id}</span> },
                { key: "location_code", label: "Code" },
                { key: "zone_name",     label: "Zone",         render: (r) => r.zone_name || r.zone_id },
                { key: "capacity",      label: "Capacity",     right: true },
                { key: "used_qty",      label: "Used",         right: true, render: (r) => r.used_qty ?? "—" },
                { key: "actions",       label: "Actions",      render: (r) => <RowActions onEdit={() => { setLocationForm({ location_id: r.location_id, location_code: r.location_code, zone_id: r.zone_id, capacity: String(r.capacity || 100) }); setLocationFormError(""); }} onDelete={() => setLocationDeleteTarget(r)} /> },
              ]}
            />
          </TableCard>
        </TabsContent>

        {/* ── WAREHOUSES ── */}
        <TabsContent value="warehouses" className="mt-4 space-y-4">
          <FormCard title={isEditingWarehouse ? `Edit Warehouse — ${warehouseForm.warehouse_id}` : "New Warehouse"}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Warehouse ID" required>
                <Input value={warehouseForm.warehouse_id} onChange={(e) => setWarehouseForm((c) => ({ ...c, warehouse_id: e.target.value }))} placeholder="e.g. WH000004" disabled={isEditingWarehouse || savingWarehouse} />
              </FormField>
              <FormField label="Warehouse Name" required>
                <Input value={warehouseForm.warehouse_name} onChange={(e) => setWarehouseForm((c) => ({ ...c, warehouse_name: e.target.value }))} placeholder="e.g. South Distribution Center" disabled={savingWarehouse} />
              </FormField>
              <FormField label="City">
                <Input value={warehouseForm.city} onChange={(e) => setWarehouseForm((c) => ({ ...c, city: e.target.value }))} placeholder="e.g. Shah Alam" disabled={savingWarehouse} />
              </FormField>
              <FormField label="Country">
                <Input value={warehouseForm.country} onChange={(e) => setWarehouseForm((c) => ({ ...c, country: e.target.value }))} placeholder="e.g. MY" disabled={savingWarehouse} />
              </FormField>
            </div>
            {warehouseFormError && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{warehouseFormError}</p>}
            <FormFooter isEditing={isEditingWarehouse} saving={savingWarehouse}
              onCancelEdit={() => { setWarehouseForm({ warehouse_id: "", warehouse_name: "", city: "", country: "" }); setIsEditingWarehouse(false); setWarehouseFormError(""); }}
              onClear={() => { setWarehouseForm({ warehouse_id: "", warehouse_name: "", city: "", country: "" }); setWarehouseFormError(""); }}
              onSave={handleSaveWarehouse} saveLabel="Add Warehouse" editLabel="Update Warehouse" />
          </FormCard>

          <TableCard>
            <Toolbar search={warehouseSearch} onSearch={setWarehouseSearch} onClear={() => setWarehouseSearch("")} onRefresh={loadWarehouses} loading={warehouseLoading} placeholder="Search warehouse ID, name…" />
            <DataTable loading={warehouseLoading} rows={warehouseRows} search={warehouseSearch} emptyText="No warehouses found."
              cols={[
                { key: "warehouse_id",   label: "Warehouse ID",  render: (r) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: T_SECONDARY }}>{r.warehouse_id}</span> },
                { key: "warehouse_name", label: "Name",          render: (r) => <span style={{ fontWeight: 500 }}>{r.warehouse_name}</span> },
                { key: "city",           label: "City",          render: (r) => r.city || <span style={{ color: T_MUTED }}>—</span> },
                { key: "country",        label: "Country",       render: (r) => r.country || <span style={{ color: T_MUTED }}>—</span> },
                { key: "actions",        label: "Actions",       render: (r) => <RowActions
                  onEdit={() => { setWarehouseForm({ warehouse_id: r.warehouse_id, warehouse_name: r.warehouse_name, city: r.city || "", country: r.country || "" }); setIsEditingWarehouse(true); setWarehouseFormError(""); }}
                  onDelete={() => setWarehouseDeleteTarget(r)} /> },
              ]}
            />
          </TableCard>
        </TabsContent>

        {/* ── SUPPLIERS ── */}
        <TabsContent value="suppliers" className="mt-4 space-y-4">
          <FormCard title={isEditingSupplier ? `Edit Supplier — ${supplierForm.supplier_id}` : "New Supplier"}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "span 2" }}>
                <FormField label="Supplier Name" required>
                  <Input value={supplierForm.supplier_name} onChange={(e) => setSupplierForm((c) => ({ ...c, supplier_name: e.target.value }))} placeholder="e.g. ABC Trading Sdn Bhd" disabled={savingSupplier} />
                </FormField>
              </div>
              <FormField label="Status">
                <Select value={supplierForm.is_active ? "active" : "inactive"} onValueChange={(v) => setSupplierForm((c) => ({ ...c, is_active: v === "active" }))} disabled={savingSupplier}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Contact Person">
                <Input value={supplierForm.contact_person} onChange={(e) => setSupplierForm((c) => ({ ...c, contact_person: e.target.value }))} placeholder="e.g. Ahmad Razif" disabled={savingSupplier} />
              </FormField>
              <FormField label="Email" required>
                <Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm((c) => ({ ...c, email: e.target.value }))} placeholder="e.g. orders@abctrading.com" disabled={savingSupplier} />
              </FormField>
              <FormField label="Phone" required>
                <Input value={supplierForm.phone} onChange={(e) => setSupplierForm((c) => ({ ...c, phone: e.target.value }))} placeholder="e.g. +60123456789" disabled={savingSupplier} />
              </FormField>
              <div style={{ gridColumn: "span 3" }}>
                <FormField label="Address">
                  <Input value={supplierForm.address} onChange={(e) => setSupplierForm((c) => ({ ...c, address: e.target.value }))} placeholder="e.g. No. 12, Jalan Industri 3, Shah Alam" disabled={savingSupplier} />
                </FormField>
              </div>
            </div>
            {(supplierFormError || supplierError) && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{supplierFormError || supplierError}</p>}
            <FormFooter isEditing={isEditingSupplier} saving={savingSupplier}
              onCancelEdit={() => { setSupplierForm({ supplier_id: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true }); setSupplierFormError(""); }}
              onClear={() => setSupplierForm({ supplier_id: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true })}
              onSave={handleSaveSupplier} saveLabel="Add Supplier" editLabel="Update Supplier" />
          </FormCard>

          <TableCard>
            <Toolbar search={supplierSearch} onSearch={setSupplierSearch} onClear={() => setSupplierSearch("")} onRefresh={loadSuppliers} loading={supplierLoading} placeholder="Search supplier name, ID…" />
            <DataTable loading={supplierLoading} rows={supplierRows} search={supplierSearch} emptyText="No suppliers found."
              idKey="supplier_id" selectedId={selectedSupplierId} onSelect={setSelectedSupplierId}
              cols={[
                { key: "supplier_id",   label: "Supplier ID",   render: (r) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: T_SECONDARY }}>{r.supplier_id}</span> },
                { key: "supplier_name", label: "Supplier Name", render: (r) => <span style={{ fontWeight: 500 }}>{r.supplier_name}</span> },
                { key: "email",         label: "Email",         render: (r) => r.email || <span style={{ color: T_MUTED }}>—</span> },
                { key: "phone",         label: "Phone",         render: (r) => r.phone || <span style={{ color: T_MUTED }}>—</span> },
                { key: "is_active",     label: "Status",        render: (r) => <StatusPill status={r.is_active ? "active" : "inactive"} /> },
                { key: "actions",       label: "Actions",       render: (r) => <RowActions
                  onEdit={() => { setSupplierForm({ supplier_id: r.supplier_id, supplier_name: r.supplier_name, contact_person: r.contact_person || "", email: r.email || "", phone: r.phone || "", address: r.address || "", is_active: r.is_active }); setSupplierFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  onDelete={() => setSupplierDeleteTarget(r)} /> },
              ]}
            />
            <SupplierDetailPanel supplier={selectedSupplier}
              onEdit={(r) => { setSupplierForm({ supplier_id: r.supplier_id, supplier_name: r.supplier_name, contact_person: r.contact_person || "", email: r.email || "", phone: r.phone || "", address: r.address || "", is_active: r.is_active }); setSupplierFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              onDelete={(r) => setSupplierDeleteTarget(r)} />
          </TableCard>
        </TabsContent>

        {/* ── CUSTOMERS ── */}
        <TabsContent value="customers" className="mt-4 space-y-4">
          <FormCard title={isEditingCustomer ? `Edit Customer — ${customerForm.customer_id}` : "New Customer"}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Customer Name" required>
                <Input value={customerForm.customer_name} onChange={(e) => setCustomerForm((c) => ({ ...c, customer_name: e.target.value }))} placeholder="e.g. RetailMax" disabled={savingCustomer} />
              </FormField>
              <FormField label="Email" required>
                <Input value={customerForm.contact} onChange={(e) => setCustomerForm((c) => ({ ...c, contact: e.target.value }))} placeholder="e.g. orders@retailmax.com" disabled={savingCustomer} />
              </FormField>
              <FormField label="Phone Number" required>
                <Input value={customerForm.phone} onChange={(e) => setCustomerForm((c) => ({ ...c, phone: e.target.value }))} placeholder="e.g. +60123456789" disabled={savingCustomer} />
              </FormField>
            </div>
            {(customerFormError || customerError) && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{customerFormError || customerError}</p>}
            <FormFooter isEditing={isEditingCustomer} saving={savingCustomer}
              onCancelEdit={() => { setCustomerForm({ customer_id: "", customer_name: "", contact: "", phone: "" }); setCustomerFormError(""); }}
              onClear={() => setCustomerForm({ customer_id: "", customer_name: "", contact: "", phone: "" })}
              onSave={handleSaveCustomer} saveLabel="Add Customer" editLabel="Update Customer" />
          </FormCard>

          <TableCard>
            <Toolbar search={customerSearch} onSearch={setCustomerSearch} onClear={() => setCustomerSearch("")} onRefresh={loadCustomers} loading={customerLoading} placeholder="Search customer name, email…" />
            <DataTable loading={customerLoading} rows={customerRows} search={customerSearch} emptyText="No customers found."
              cols={[
                { key: "customer_id",   label: "Customer ID",   render: (r) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: T_SECONDARY }}>{r.customer_id}</span> },
                { key: "customer_name", label: "Name",          render: (r) => <span style={{ fontWeight: 500 }}>{r.customer_name}</span> },
                { key: "contact",       label: "Email",         render: (r) => r.contact || <span style={{ color: T_MUTED }}>—</span> },
                { key: "phone",         label: "Phone",         render: (r) => r.phone || <span style={{ color: T_MUTED }}>—</span> },
                { key: "actions",       label: "Actions",       render: (r) => <RowActions
                  onEdit={() => { setCustomerForm({ customer_id: r.customer_id, customer_name: r.customer_name, contact: r.contact || "", phone: r.phone || "" }); setCustomerFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  onDelete={() => setCustomerDeleteTarget(r)} /> },
              ]}
            />
          </TableCard>
        </TabsContent>
      </Tabs>

      {/* ── Delete confirmation modals ── */}
      {[
        { target: supplierDeleteTarget,  onClose: () => setSupplierDeleteTarget(null),  onConfirm: handleDeleteSupplier,  id: supplierDeleteTarget?.supplier_id,  name: supplierDeleteTarget?.supplier_name },
        { target: skuDeleteTarget,       onClose: () => setSkuDeleteTarget(null),       onConfirm: handleDeleteSku,       id: skuDeleteTarget?.sku_id,            name: skuDeleteTarget?.description },
        { target: locationDeleteTarget,  onClose: () => setLocationDeleteTarget(null),  onConfirm: handleDeleteLocation,  id: locationDeleteTarget?.location_id,  name: locationDeleteTarget?.location_code },
        { target: warehouseDeleteTarget, onClose: () => setWarehouseDeleteTarget(null), onConfirm: handleDeleteWarehouse, id: warehouseDeleteTarget?.warehouse_id, name: warehouseDeleteTarget?.warehouse_name },
        { target: customerDeleteTarget,  onClose: () => setCustomerDeleteTarget(null),  onConfirm: handleDeleteCustomer,  id: customerDeleteTarget?.customer_id,  name: customerDeleteTarget?.customer_name },
      ].map((m, i) => (
        <DeleteModal key={i} open={Boolean(m.target)} onClose={m.onClose} onConfirm={m.onConfirm}
          title={m.id ? `Delete ${m.id}` : "Confirm Delete"}
          description={m.name ? `Delete "${m.name}"? This action cannot be undone.` : ""} />
      ))}
    </AppLayout>
  );
};

export default MasterDataPage;