import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { canEditMasterData, canDeleteMasterData } from "@/services/rbac";
import { useToast } from "@/hooks/use-toast";
import {
  fetchSuppliers, createSupplier, updateSupplier, deleteSupplier,
  fetchSkus, createSkuApi, updateSkuApi, deleteSkuApi,
  fetchLocations, createLocationApi, updateLocationApi, deleteLocationApi,
  fetchWarehouses, createWarehouseApi,
  fetchCustomers, createCustomerApi, updateCustomerApi, deleteCustomerApi,
  toSessionContext,
} from "@/services/api";

// ── Inline StatusBadge ──
const STATUS_CONFIG = {
  active:   { bg: "#D1FAE5", color: "#065F46", label: "Active" },
  inactive: { bg: "#F3F4F6", color: "#6B7280", label: "Inactive" },
};
function StatusBadge({ status }) {
  const key = String(status || "").toLowerCase();
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

function FormField({ label, required, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}{required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

function TableActions({ onEdit, onDelete }) {
  return (
    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={onEdit}>Edit</Button>
      <Button size="sm" variant="destructive" className="h-7 text-[11px] px-2" onClick={onDelete}>Delete</Button>
    </div>
  );
}

function SimpleTable({ columns, rows, loading, emptyText = "No data found.", search = "" }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/60">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2 text-left font-medium text-xs">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">Loading...</td></tr>
          )}
          {!loading && filtered.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">{search ? "No results match your search." : emptyText}</td></tr>
          )}
          {!loading && filtered.map((row, i) => (
            <tr key={row.id || i} className="border-t hover:bg-muted/30">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2">
                  {col.render ? col.render(row) : (row[col.key] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && filtered.length > 0 && (
        <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
          {filtered.length} record{filtered.length === 1 ? "" : "s"}{search ? ` matching "${search}"` : ""}
        </div>
      )}
    </div>
  );
}

function SectionDivider({ title }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{title}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}


function SupplierTable({ rows, loading, search, selectedId, onSelect, onEdit, onDelete }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [rows, search]);

  const selected = useMemo(() => filtered.find((r) => r.supplier_id === selectedId) || null, [filtered, selectedId]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium">Supplier ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Supplier Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Phone</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{search ? "No results match your search." : "No suppliers found."}</td></tr>
            )}
            {!loading && filtered.map((row) => (
              <tr
                key={row.supplier_id}
                className={`border-t cursor-pointer hover:bg-accent/40 ${selectedId === row.supplier_id ? "bg-accent/30" : ""}`}
                onClick={() => onSelect(selectedId === row.supplier_id ? "" : row.supplier_id)}
              >
                <td className="px-3 py-2 font-mono text-xs">{row.supplier_id}</td>
                <td className="px-3 py-2">{row.supplier_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.email || "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.phone || "-"}</td>
                <td className="px-3 py-2"><StatusBadge status={row.is_active ? "active" : "inactive"} /></td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <TableActions
                    onEdit={() => onEdit(row)}
                    onDelete={() => onDelete(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
            {filtered.length} record{filtered.length === 1 ? "" : "s"}{search ? ` matching "${search}"` : ""}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
          {/* Header strip */}
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">{selected.supplier_id}</span>
              <span className="text-sm">{selected.supplier_name}</span>
            </div>
            <StatusBadge status={selected.is_active ? "active" : "inactive"} />
          </div>

          {/* Info grid */}
          <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Contact Person</span>
              <span>{selected.contact_person || <span className="text-muted-foreground italic">Not provided</span>}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Email</span>
              {selected.email
                ? <a href={`mailto:${selected.email}`} className="text-blue-600 hover:underline">{selected.email}</a>
                : <span className="text-muted-foreground italic">Not provided</span>}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Phone</span>
              {selected.phone
                ? <a href={`tel:${selected.phone}`} className="text-blue-600 hover:underline">{selected.phone}</a>
                : <span className="text-muted-foreground italic">Not provided</span>}
            </div>
            {selected.address ? (
              <div className="flex flex-col gap-0.5 sm:col-span-2 md:col-span-3">
                <span className="text-xs text-muted-foreground">Address</span>
                <span>{selected.address}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Address</span>
                <span className="text-muted-foreground italic">Not provided</span>
              </div>
            )}
          </div>

          {/* Action footer */}
          <div className="px-4 py-3 border-t bg-muted/10 flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => onEdit(selected)}>
              Edit Supplier
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs px-3" onClick={() => onDelete(selected)}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


function CustomerTable({ rows, loading, search, onEdit, onDelete }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium">Customer ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Phone</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{search ? "No results match your search." : "No customers found."}</td></tr>
            )}
            {!loading && filtered.map((row) => (
              <tr key={row.customer_id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{row.customer_id}</td>
                <td className="px-3 py-2">{row.customer_name}</td>
                <td className="px-3 py-2">{row.contact || "-"}</td>
                <td className="px-3 py-2">{row.phone || "-"}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <TableActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
            {filtered.length} record{filtered.length === 1 ? "" : "s"}{search ? ` matching "${search}"` : ""}
          </div>
        )}
      </div>


    </div>
  );
}

const MasterDataPage = () => {
  const auth = useAuth();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const userRole = auth.currentUser?.role || "";

  // ── Suppliers ──
  const [supplierRows, setSupplierRows] = useState([]);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [supplierError, setSupplierError] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierDeleteTarget, setSupplierDeleteTarget] = useState(null);
  const [supplierForm, setSupplierForm] = useState({ supplier_id: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true });
  const [supplierFormError, setSupplierFormError] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const isEditingSupplier = Boolean(supplierForm.supplier_id);

  // ── SKU ──
  const [skuRows, setSkuRows] = useState([]);
  const [skuLoading, setSkuLoading] = useState(true);
  const [skuError, setSkuError] = useState("");
  const [savingSku, setSavingSku] = useState(false);
  const [skuDeleteTarget, setSkuDeleteTarget] = useState(null);
  const [skuForm, setSkuForm] = useState({ sku_id: "", description: "", uom_id: "EA", epc_value: "" });
  const [skuFormError, setSkuFormError] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const isEditingSku = Boolean(skuForm.sku_id && skuRows.some((r) => r.sku_id === skuForm.sku_id));

  // ── Locations ──
  const [locationRows, setLocationRows] = useState([]);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationDeleteTarget, setLocationDeleteTarget] = useState(null);
  const [locationForm, setLocationForm] = useState({ location_id: "", location_code: "", zone_id: "", capacity: "100" });
  const [locationFormError, setLocationFormError] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [zones, setZones] = useState([]);
  const isEditingLocation = Boolean(locationForm.location_id);

  // ── Warehouses ──
  const [warehouseRows, setWarehouseRows] = useState([]);
  const [warehouseLoading, setWarehouseLoading] = useState(true);
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({ warehouse_id: "", warehouse_name: "", city: "", country: "" });
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [isEditingWarehouse, setIsEditingWarehouse] = useState(false);
  const [warehouseDeleteTarget, setWarehouseDeleteTarget] = useState(null);
  const [warehouseFormError, setWarehouseFormError] = useState("");

  // ── Customers ──
  const [customerRows, setCustomerRows] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerError, setCustomerError] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerDeleteTarget, setCustomerDeleteTarget] = useState(null);
  const [customerForm, setCustomerForm] = useState({ customer_id: "", customer_name: "", contact: "", phone: "" });
  const [customerFormError, setCustomerFormError] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const isEditingCustomer = Boolean(customerForm.customer_id);

  // ── Load functions ──
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
  useEffect(() => { loadSkus(); }, [loadSkus]);
  useEffect(() => { loadLocations(); }, [loadLocations]);
  useEffect(() => { loadWarehouses(); }, [loadWarehouses]);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // ── Supplier handlers ──
  const handleSaveSupplier = async () => {
    if (!supplierForm.supplier_name.trim()) { setSupplierFormError("Supplier name is required"); return; }
    if (!supplierForm.email.trim()) { setSupplierFormError("Email is required"); return; }
    if (!supplierForm.phone.trim()) { setSupplierFormError("Phone number is required"); return; }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierForm.email.trim())) {
      setSupplierFormError("Please enter a valid email address"); return;
    }
    // Duplicate email check
    const duplicateEmail = supplierRows.find((r) =>
      r.email?.trim().toLowerCase() === supplierForm.email.trim().toLowerCase() &&
      r.supplier_id !== supplierForm.supplier_id
    );
    if (duplicateEmail) { setSupplierFormError(`Email already used by ${duplicateEmail.supplier_id}`); return; }

    const payload = {
      supplier_name: supplierForm.supplier_name.trim(),
      contact_person: supplierForm.contact_person.trim() || null,
      email: supplierForm.email.trim(),
      phone: supplierForm.phone.trim(),
      address: supplierForm.address.trim() || null,
      is_active: supplierForm.is_active,
    };
    try {
      setSavingSupplier(true); setSupplierFormError("");
      if (isEditingSupplier) {
        const updated = await updateSupplier(session, supplierForm.supplier_id, payload);
        const enriched = { ...updated, ...payload, supplier_id: supplierForm.supplier_id };
        setSupplierRows((c) => c.map((r) => r.supplier_id === enriched.supplier_id ? enriched : r));
        toast({ title: "Supplier updated" });
      } else {
        const created = await createSupplier(session, payload);
        const enriched = { ...(created?.data ?? created), ...payload };
        setSupplierRows((c) => [enriched, ...c]);
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

  // ── SKU handlers ──
  const handleSaveSku = async () => {
    if (!skuForm.description.trim()) { setSkuFormError("Description is required"); return; }
    if (!isEditingSku && !skuForm.sku_id.trim()) { setSkuFormError("SKU ID is required"); return; }
    try {
      setSavingSku(true); setSkuFormError("");
      if (isEditingSku) {
        // eslint-disable-next-line no-console
        console.debug("[handleSaveSku] updating sku_id:", skuForm.sku_id);
        const result = await updateSkuApi(session, skuForm.sku_id, { description: skuForm.description.trim(), uom_id: skuForm.uom_id, epc_value: skuForm.epc_value || null });
        const updated = result?.data ?? result;
        setSkuRows((c) => c.map((r) => r.sku_id === updated.sku_id ? updated : r));
        toast({ title: "SKU updated" });
      } else {
        const result = await createSkuApi(session, { sku_id: skuForm.sku_id.trim().toUpperCase(), description: skuForm.description.trim(), uom_id: skuForm.uom_id, epc_value: skuForm.epc_value || null });
        const created = result?.data ?? result;
        setSkuRows((c) => [created, ...c]);
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

  // ── Location handlers ──
  const handleSaveLocation = async () => {
    if (!locationForm.location_code.trim()) { setLocationFormError("Location code is required"); return; }
    if (!locationForm.zone_id) { setLocationFormError("Zone is required"); return; }

    // Check duplicate location_code within same zone
    const duplicate = locationRows.find((r) =>
      r.location_code.trim().toLowerCase() === locationForm.location_code.trim().toLowerCase() &&
      r.zone_id === locationForm.zone_id &&
      r.location_id !== locationForm.location_id // allow same record when editing
    );
    if (duplicate) {
      setLocationFormError(`Location code "${locationForm.location_code}" already exists in this zone (${duplicate.location_id})`);
      return;
    }

    try {
      setSavingLocation(true); setLocationFormError("");
      if (isEditingLocation) {
        const result = await updateLocationApi(session, locationForm.location_id, { location_code: locationForm.location_code.trim(), zone_id: locationForm.zone_id, capacity: Number(locationForm.capacity) || 100 });
        const updated = result?.data ?? result;
        // Enrich with zone_name from zones list since API may not return it
        const matchedZone = zones.find((z) => z.zone_id === updated.zone_id);
        const enriched = { ...updated, zone_name: matchedZone?.zone_name || updated.zone_name || updated.zone_id };
        setLocationRows((c) => c.map((r) => r.location_id === enriched.location_id ? enriched : r));
        toast({ title: "Location updated" });
      } else {
        const result = await createLocationApi(session, { location_code: locationForm.location_code.trim(), zone_id: locationForm.zone_id, capacity: Number(locationForm.capacity) || 100 });
        const created = result?.data ?? result;
        const matchedZone = zones.find((z) => z.zone_id === created.zone_id);
        const enrichedCreated = { ...created, zone_name: matchedZone?.zone_name || created.zone_name || created.zone_id };
        setLocationRows((c) => [enrichedCreated, ...c]);
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

  // ── Warehouse handlers ──
  const handleSaveWarehouse = async () => {
    if (!warehouseForm.warehouse_name.trim()) { setWarehouseFormError("Warehouse Name is required"); return; }
    if (!isEditingWarehouse && !warehouseForm.warehouse_id.trim()) { setWarehouseFormError("Warehouse ID is required"); return; }
    // Duplicate check
    const duplicate = warehouseRows.find((r) =>
      r.warehouse_id.trim().toUpperCase() === warehouseForm.warehouse_id.trim().toUpperCase() &&
      !isEditingWarehouse
    );
    if (duplicate) { setWarehouseFormError(`Warehouse ID "${warehouseForm.warehouse_id}" already exists`); return; }
    try {
      setSavingWarehouse(true); setWarehouseFormError("");
      if (isEditingWarehouse) {
        // Update name, city, country — warehouse_id is immutable
        setWarehouseRows((c) => c.map((r) => r.warehouse_id === warehouseForm.warehouse_id
          ? { ...r, warehouse_name: warehouseForm.warehouse_name.trim(), city: warehouseForm.city.trim(), country: warehouseForm.country.trim() }
          : r));
        toast({ title: "Warehouse updated" });
      } else {
        const result = await createWarehouseApi(session, {
          warehouse_id: warehouseForm.warehouse_id.trim().toUpperCase(),
          warehouse_name: warehouseForm.warehouse_name.trim(),
          city: warehouseForm.city.trim(),
          country: warehouseForm.country.trim(),
        });
        const created = result?.data ?? result;
        setWarehouseRows((c) => [...c, created]);
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

  // ── Customer handlers ──
  const handleSaveCustomer = async () => {
    if (!customerForm.customer_name.trim()) { setCustomerFormError("Customer name is required"); return; }
    if (!customerForm.contact.trim()) { setCustomerFormError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.contact.trim())) {
      setCustomerFormError("Please enter a valid email address"); return;
    }
    if (!customerForm.phone.trim()) { setCustomerFormError("Phone number is required"); return; }
    const duplicateEmail = customerRows.find((r) =>
      r.contact?.trim().toLowerCase() === customerForm.contact.trim().toLowerCase() &&
      r.customer_id !== customerForm.customer_id
    );
    if (duplicateEmail) { setCustomerFormError(`Email already used by ${duplicateEmail.customer_id}`); return; }
    try {
      setSavingCustomer(true); setCustomerFormError("");
      const payload = { customer_name: customerForm.customer_name.trim(), contact: customerForm.contact.trim(), phone: customerForm.phone.trim() };
      if (isEditingCustomer) {
        const result = await updateCustomerApi(session, customerForm.customer_id, payload);
        const enriched = { ...(result?.data ?? result), ...payload, customer_id: customerForm.customer_id };
        setCustomerRows((c) => c.map((r) => r.customer_id === enriched.customer_id ? enriched : r));
        toast({ title: "Customer updated" });
      } else {
        const result = await createCustomerApi(session, payload);
        const enriched = { ...(result?.data ?? result), ...payload };
        setCustomerRows((c) => [enriched, ...c]);
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

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Master Data" }]} />
      <h1 className="text-2xl font-bold mb-4">Master Data</h1>

      <Tabs defaultValue="sku">
        <TabsList>
          <TabsTrigger value="sku">SKU</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        {/* ── SKU TAB ── */}
        <TabsContent value="sku" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isEditingSku ? `Edit SKU — ${skuForm.sku_id}` : "New SKU"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  <Input value={skuForm.epc_value} onChange={(e) => setSkuForm((c) => ({ ...c, epc_value: e.target.value }))} placeholder="e.g. EPC:300833B2DDD901..." disabled={savingSku} />
                </FormField>
              </div>
              {skuFormError && <p className="text-xs text-destructive">{skuFormError}</p>}
              {skuError && <p className="text-xs text-destructive">{skuError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                {isEditingSku && <Button size="sm" variant="outline" onClick={() => { setSkuForm({ sku_id: "", description: "", uom_id: "EA", epc_value: "" }); setSkuFormError(""); }} disabled={savingSku}>Cancel Edit</Button>}
                <Button size="sm" variant="outline" onClick={() => setSkuForm({ sku_id: "", description: "", uom_id: "EA", epc_value: "" })} disabled={savingSku}>Clear</Button>
                <Button size="sm" onClick={handleSaveSku} disabled={savingSku}>{savingSku ? "Saving..." : isEditingSku ? "Update SKU" : "Add SKU"}</Button>
              </div>
            </CardContent>
          </Card>

          <SectionDivider title="SKU List" />

          <div className="flex flex-wrap gap-2 mb-2">
            <Input className="h-9 min-w-[200px] flex-1" placeholder="Search SKU ID, description..." value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} />
            {skuSearch && <Button variant="outline" className="h-9" onClick={() => setSkuSearch("")}>Clear</Button>}
            <Button variant="outline" className="h-9" onClick={loadSkus} disabled={skuLoading}>Refresh</Button>
          </div>

          <SimpleTable loading={skuLoading} rows={skuRows} search={skuSearch} emptyText="No SKUs found."
            columns={[
              { key: "sku_id", label: "SKU ID", render: (r) => <span className="font-mono text-xs">{r.sku_id}</span> },
              { key: "description", label: "Description" },
              { key: "uom_id", label: "UOM" },
              { key: "epc_value", label: "EPC Value", render: (r) => r.epc_value ? <span className="font-mono text-xs">{r.epc_value}</span> : "-" },
              { key: "actions", label: "Actions", render: (r) => <TableActions onEdit={() => { setSkuForm({ sku_id: r.sku_id, description: r.description, uom_id: r.uom_id || "EA", epc_value: r.epc_value || "" }); setSkuFormError(""); }} onDelete={() => setSkuDeleteTarget(r)} /> },
            ]}
          />
        </TabsContent>

        {/* ── LOCATIONS TAB ── */}
        <TabsContent value="locations" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isEditingLocation ? `Edit Location — ${locationForm.location_id}` : "New Location"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              {locationFormError && <p className="text-xs text-destructive">{locationFormError}</p>}
              {locationError && <p className="text-xs text-destructive">{locationError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                {isEditingLocation && <Button size="sm" variant="outline" onClick={() => { setLocationForm({ location_id: "", location_code: "", zone_id: "", capacity: "100" }); setLocationFormError(""); }} disabled={savingLocation}>Cancel Edit</Button>}
                <Button size="sm" variant="outline" onClick={() => setLocationForm({ location_id: "", location_code: "", zone_id: "", capacity: "100" })} disabled={savingLocation}>Clear</Button>
                <Button size="sm" onClick={handleSaveLocation} disabled={savingLocation}>{savingLocation ? "Saving..." : isEditingLocation ? "Update Location" : "Add Location"}</Button>
              </div>
            </CardContent>
          </Card>

          <SectionDivider title="Location List" />

          <div className="flex flex-wrap gap-2 mb-2">
            <Input className="h-9 min-w-[200px] flex-1" placeholder="Search location code, zone..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} />
            {locationSearch && <Button variant="outline" className="h-9" onClick={() => setLocationSearch("")}>Clear</Button>}
            <Button variant="outline" className="h-9" onClick={loadLocations} disabled={locationLoading}>Refresh</Button>
          </div>

          <SimpleTable loading={locationLoading} rows={locationRows} search={locationSearch} emptyText="No locations found."
            columns={[
              { key: "location_id", label: "Location ID", render: (r) => <span className="font-mono text-xs">{r.location_id}</span> },
              { key: "location_code", label: "Code" },
              { key: "zone_name", label: "Zone", render: (r) => r.zone_name || r.zone_id },
              { key: "capacity", label: "Capacity", render: (r) => <span className="text-right">{r.capacity ?? "-"}</span> },
              { key: "used_qty", label: "Used", render: (r) => r.used_qty ?? "-" },
              { key: "actions", label: "Actions", render: (r) => <TableActions onEdit={() => { setLocationForm({ location_id: r.location_id, location_code: r.location_code, zone_id: r.zone_id, capacity: String(r.capacity || 100) }); setLocationFormError(""); }} onDelete={() => setLocationDeleteTarget(r)} /> },
            ]}
          />
        </TabsContent>

        {/* ── WAREHOUSES TAB ── */}
        <TabsContent value="warehouses" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isEditingWarehouse ? `Edit Warehouse — ${warehouseForm.warehouse_id}` : "New Warehouse"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              {warehouseFormError && <p className="text-xs text-destructive">{warehouseFormError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                {isEditingWarehouse && <Button size="sm" variant="outline" onClick={() => { setWarehouseForm({ warehouse_id: "", warehouse_name: "", city: "", country: "" }); setIsEditingWarehouse(false); setWarehouseFormError(""); }} disabled={savingWarehouse}>Cancel Edit</Button>}
                <Button size="sm" variant="outline" onClick={() => { setWarehouseForm({ warehouse_id: "", warehouse_name: "", city: "", country: "" }); setWarehouseFormError(""); }} disabled={savingWarehouse}>Clear</Button>
                <Button size="sm" onClick={handleSaveWarehouse} disabled={savingWarehouse}>{savingWarehouse ? "Saving..." : isEditingWarehouse ? "Update Warehouse" : "Add Warehouse"}</Button>
              </div>
            </CardContent>
          </Card>

          <SectionDivider title="Warehouse List" />

          <div className="flex flex-wrap gap-2 mb-2">
            <Input className="h-9 min-w-[200px] flex-1" placeholder="Search warehouse ID, name..." value={warehouseSearch} onChange={(e) => setWarehouseSearch(e.target.value)} />
            {warehouseSearch && <Button variant="outline" className="h-9" onClick={() => setWarehouseSearch("")}>Clear</Button>}
            <Button variant="outline" className="h-9" onClick={loadWarehouses} disabled={warehouseLoading}>Refresh</Button>
          </div>

          <SimpleTable loading={warehouseLoading} rows={warehouseRows} search={warehouseSearch} emptyText="No warehouses found."
            columns={[
              { key: "warehouse_id", label: "Warehouse ID", render: (r) => <span className="font-mono text-xs">{r.warehouse_id}</span> },
              { key: "warehouse_name", label: "Name" },
              { key: "city", label: "City", render: (r) => r.city || "-" },
              { key: "country", label: "Country", render: (r) => r.country || "-" },
              { key: "actions", label: "Actions", render: (r) => <TableActions
                onEdit={() => { setWarehouseForm({ warehouse_id: r.warehouse_id, warehouse_name: r.warehouse_name, city: r.city || "", country: r.country || "" }); setIsEditingWarehouse(true); setWarehouseFormError(""); }}
                onDelete={() => setWarehouseDeleteTarget(r)}
              /> },
            ]}
          />
        </TabsContent>

        {/* ── SUPPLIERS TAB ── */}
        <TabsContent value="suppliers" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isEditingSupplier ? `Edit Supplier — ${supplierForm.supplier_id}` : "New Supplier"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
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
                <div className="md:col-span-3">
                  <FormField label="Address">
                    <Input value={supplierForm.address} onChange={(e) => setSupplierForm((c) => ({ ...c, address: e.target.value }))} placeholder="e.g. No. 12, Jalan Industri 3, Shah Alam" disabled={savingSupplier} />
                  </FormField>
                </div>
              </div>
              {supplierFormError && <p className="text-xs text-destructive">{supplierFormError}</p>}
              {supplierError && <p className="text-xs text-destructive">{supplierError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                {isEditingSupplier && <Button size="sm" variant="outline" onClick={() => { setSupplierForm({ supplier_id: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true }); setSupplierFormError(""); }} disabled={savingSupplier}>Cancel Edit</Button>}
                <Button size="sm" variant="outline" onClick={() => setSupplierForm({ supplier_id: "", supplier_name: "", contact_person: "", email: "", phone: "", address: "", is_active: true })} disabled={savingSupplier}>Clear</Button>
                <Button size="sm" onClick={handleSaveSupplier} disabled={savingSupplier}>{savingSupplier ? "Saving..." : isEditingSupplier ? "Update Supplier" : "Add Supplier"}</Button>
              </div>
            </CardContent>
          </Card>

          <SectionDivider title="Supplier List" />

          <div className="flex flex-wrap gap-2 mb-2">
            <Input className="h-9 min-w-[200px] flex-1" placeholder="Search supplier name, ID..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
            {supplierSearch && <Button variant="outline" className="h-9" onClick={() => setSupplierSearch("")}>Clear</Button>}
            <Button variant="outline" className="h-9" onClick={loadSuppliers} disabled={supplierLoading}>Refresh</Button>
          </div>

          <SupplierTable
            rows={supplierRows}
            loading={supplierLoading}
            search={supplierSearch}
            selectedId={selectedSupplierId}
            onSelect={setSelectedSupplierId}
            onEdit={(r) => { setSupplierForm({ supplier_id: r.supplier_id, supplier_name: r.supplier_name, contact_person: r.contact_person || "", email: r.email || "", phone: r.phone || "", address: r.address || "", is_active: r.is_active }); setSupplierFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            onDelete={(r) => setSupplierDeleteTarget(r)}
          />
        </TabsContent>

        {/* ── CUSTOMERS TAB ── */}
        <TabsContent value="customers" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isEditingCustomer ? `Edit Customer — ${customerForm.customer_id}` : "New Customer"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              {customerFormError && <p className="text-xs text-destructive">{customerFormError}</p>}
              {customerError && <p className="text-xs text-destructive">{customerError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                {isEditingCustomer && <Button size="sm" variant="outline" onClick={() => { setCustomerForm({ customer_id: "", customer_name: "", contact: "", phone: "" }); setCustomerFormError(""); }} disabled={savingCustomer}>Cancel Edit</Button>}
                <Button size="sm" variant="outline" onClick={() => setCustomerForm({ customer_id: "", customer_name: "", contact: "", phone: "" })} disabled={savingCustomer}>Clear</Button>
                <Button size="sm" onClick={handleSaveCustomer} disabled={savingCustomer}>{savingCustomer ? "Saving..." : isEditingCustomer ? "Update Customer" : "Add Customer"}</Button>
              </div>
            </CardContent>
          </Card>

          <SectionDivider title="Customer List" />

          <div className="flex flex-wrap gap-2 mb-2">
            <Input className="h-9 min-w-[200px] flex-1" placeholder="Search customer name, email..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
            {customerSearch && <Button variant="outline" className="h-9" onClick={() => setCustomerSearch("")}>Clear</Button>}
            <Button variant="outline" className="h-9" onClick={loadCustomers} disabled={customerLoading}>Refresh</Button>
          </div>

          <CustomerTable
            rows={customerRows}
            loading={customerLoading}
            search={customerSearch}
            onEdit={(r) => { setCustomerForm({ customer_id: r.customer_id, customer_name: r.customer_name, contact: r.contact || "", phone: r.phone || "" }); setCustomerFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            onDelete={(r) => setCustomerDeleteTarget(r)}
          />
        </TabsContent>
      </Tabs>

      {/* Confirm Modals */}
      <ConfirmModal open={Boolean(supplierDeleteTarget)} onClose={() => setSupplierDeleteTarget(null)} onConfirm={handleDeleteSupplier}
        title={supplierDeleteTarget ? `Delete ${supplierDeleteTarget.supplier_id}` : "Delete Supplier"}
        description={supplierDeleteTarget ? `Delete ${supplierDeleteTarget.supplier_name}? This cannot be undone.` : ""}
        confirmLabel="Confirm" cancelLabel="Back" variant="destructive" />
      <ConfirmModal open={Boolean(skuDeleteTarget)} onClose={() => setSkuDeleteTarget(null)} onConfirm={handleDeleteSku}
        title={skuDeleteTarget ? `Delete ${skuDeleteTarget.sku_id}` : "Delete SKU"}
        description={skuDeleteTarget ? `Delete ${skuDeleteTarget.description}? This cannot be undone.` : ""}
        confirmLabel="Confirm" cancelLabel="Back" variant="destructive" />
      <ConfirmModal open={Boolean(locationDeleteTarget)} onClose={() => setLocationDeleteTarget(null)} onConfirm={handleDeleteLocation}
        title={locationDeleteTarget ? `Delete ${locationDeleteTarget.location_id}` : "Delete Location"}
        description={locationDeleteTarget ? `Delete location ${locationDeleteTarget.location_code}? This cannot be undone.` : ""}
        confirmLabel="Confirm" cancelLabel="Back" variant="destructive" />
      <ConfirmModal open={Boolean(warehouseDeleteTarget)} onClose={() => setWarehouseDeleteTarget(null)} onConfirm={handleDeleteWarehouse}
        title={warehouseDeleteTarget ? `Delete ${warehouseDeleteTarget.warehouse_id}` : "Delete Warehouse"}
        description={warehouseDeleteTarget ? `Delete ${warehouseDeleteTarget.warehouse_name}? This cannot be undone.` : ""}
        confirmLabel="Confirm" cancelLabel="Back" variant="destructive" />
      <ConfirmModal open={Boolean(customerDeleteTarget)} onClose={() => setCustomerDeleteTarget(null)} onConfirm={handleDeleteCustomer}
        title={customerDeleteTarget ? `Delete ${customerDeleteTarget.customer_id}` : "Delete Customer"}
        description={customerDeleteTarget ? `Delete ${customerDeleteTarget.customer_name}? This cannot be undone.` : ""}
        confirmLabel="Confirm" cancelLabel="Back" variant="destructive" />
    </AppLayout>
  );
};

export default MasterDataPage;