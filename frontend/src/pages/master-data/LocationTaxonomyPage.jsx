import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, Edit2, FolderTree, Plus, Search, Trash2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { CustomConfirmModal } from "@/components/shared/CustomConfirmModal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  createLocationTaxonomy,
  createLocationApi,
  fetchLocations,
  deleteLocationTaxonomy,
  fetchLocationTaxonomyTree,
  toSessionContext,
  updateLocationTaxonomy,
} from "@/services/api";
import { canEditMasterData } from "@/services/rbac";
import { formatCapacityValue, formatDimensions } from "@/utils/locationDimensions";

const TYPES = {
  warehouses: {
    singular: "Warehouse", id: "warehouse_id", code: "warehouse_code", name: "warehouse_name",
    child: "zones",
  },
  zones: {
    singular: "Zone", id: "zone_id", code: "zone_code", name: "zone_name",
    parent: "warehouse_id", child: "aisles", zoneType: true,
  },
  aisles: {
    singular: "Aisle", id: "aisle_id", code: "aisle_code", name: "aisle_name", autoCode: true,
    parent: "zone_id", child: "bays",
  },
  bays: {
    singular: "Bay", id: "bay_id", code: "bay_code", name: "bay_name", autoCode: true, dimensions: true,
    parent: "aisle_id", child: "levels",
  },
  levels: {
    singular: "Level", id: "level_id", code: "level_code", autoCode: true,
    parent: "bay_id", child: "bins",
  },
  bins: {
    singular: "Bin", id: "bin_id", code: "bin_code", autoCode: true,
    parent: "level_id",
  },
};

const PAGE_SIZE = 10;

function emptyForm(type, parentId = "") {
  const config = TYPES[type];
  return {
    [config.code]: "",
    ...(config.name ? { [config.name]: "" } : {}),
    ...(config.zoneType ? { zone_type: "storage" } : {}),
    ...(config.dimensions ? {
      width_cm: "200", depth_cm: "50", level_height_cm: "50",
      level_count: "4", max_weight_kg: "500",
    } : {}),
    ...(config.parent ? { [config.parent]: parentId } : {}),
    ...(type === "bins" ? { max_weight: "", max_volume: "" } : {}),
    status: "active",
  };
}

function StatusBadge({ status }) {
  const active = status === "active";
  return (
    <span className={`rounded-full px-2.5 py-[3px] text-xs font-medium leading-4 ${
      active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
    }`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function TreeNode({ type, item, depth, expanded, toggle, canManage, onAdd, onEdit, onDelete, onCreateStorageLocation }) {
  const config = TYPES[type];
  const children = config.child ? item[config.child] || [] : [];
  const nodeKey = `${type}:${item[config.id]}`;
  const isExpanded = expanded.has(nodeKey);
  const hasChildren = children.length > 0;
  const label = config.name
    ? `${item[config.code]} - ${item[config.name]}`
    : item[config.code];

  return (
    <div>
      <div
        className="group flex min-h-11 items-center gap-2 border-b border-slate-100 px-3 hover:bg-slate-50"
        style={{ paddingLeft: 12 + depth * 24 }}
      >
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-slate-200 disabled:opacity-30"
          onClick={() => toggle(nodeKey)}
          disabled={!hasChildren}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {hasChildren && (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
        </button>
        <FolderTree size={16} className="text-indigo-500" />
        <span className="min-w-24 font-mono text-xs text-slate-500">{item[config.id]}</span>
        <span className="flex-1 text-[13px] font-medium text-slate-800">{label}</span>
        {item.location_code && (
          <span className="hidden font-mono text-xs text-slate-500 md:inline">{item.location_code}</span>
        )}
        {type === "bins" && (
          <span className="hidden text-xs text-slate-500 lg:inline">
            Weight: {formatCapacityValue(item.max_weight)} | Volume: {formatCapacityValue(item.max_volume)}
          </span>
        )}
        {type === "bays" && (
          <span className="hidden text-xs text-slate-500 xl:inline">
            {formatDimensions(item.width_cm, item.depth_cm, item.level_height_cm)} cm
            {" | "}Max Weight: {formatCapacityValue(item.max_weight_kg)} kg
          </span>
        )}
        <StatusBadge status={item.status} />
        {canManage && (
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {type === "bins" && (
              <Button size="sm" variant="ghost" onClick={() => onCreateStorageLocation(item)}>
                Create Storage Location
              </Button>
            )}
            {config.child && (
              <Button size="sm" variant="ghost" onClick={() => onAdd(config.child, item[config.id])}>
                <Plus size={14} /> Add
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => onEdit(type, item)}>
              <Edit2 size={14} />
            </Button>
            <Button size="icon" variant="ghost" className="text-red-600" onClick={() => onDelete(type, item)}>
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>
      {hasChildren && isExpanded && children.map((child) => (
        <TreeNode
          key={child[TYPES[config.child].id]}
          type={config.child}
          item={child}
          depth={depth + 1}
          expanded={expanded}
          toggle={toggle}
          canManage={canManage}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
          onCreateStorageLocation={onCreateStorageLocation}
        />
      ))}
    </div>
  );
}

export default function LocationTaxonomyPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [
    auth.currentTenantId, auth.currentWarehouseId, auth.currentUser,
  ]);
  const canManage = canEditMasterData(auth.currentUser?.role);
  const [tree, setTree] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [storageLocationTarget, setStorageLocationTarget] = useState(null);
  const [creatingStorageLocation, setCreatingStorageLocation] = useState(false);
  const [storageLocationError, setStorageLocationError] = useState("");

  const loadTree = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetchLocationTaxonomyTree(session, {
        page, pageSize: PAGE_SIZE, search: query,
      });
      setTree(Array.isArray(response.data) ? response.data : []);
      setTotal(response.total || 0);
      setTotalPages(response.totalPages || 1);
    } catch (error) {
      toast({ title: "Unable to load location taxonomy", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, query, session, toast]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  function openAdd(type, parentId = "") {
    setEditor({ type, mode: "create" });
    setForm(emptyForm(type, parentId));
    setFormError("");
  }

  function openEdit(type, item) {
    const config = TYPES[type];
    setEditor({ type, mode: "edit", id: item[config.id] });
    setForm({
      [config.code]: item[config.code] || "",
      ...(config.name ? { [config.name]: item[config.name] || "" } : {}),
      ...(config.zoneType ? { zone_type: item.zone_type || "storage" } : {}),
      ...(config.dimensions ? {
        width_cm: item.width_cm ?? "200",
        depth_cm: item.depth_cm ?? "50",
        level_height_cm: item.level_height_cm ?? "50",
        level_count: item.level_count ?? "4",
        max_weight_kg: item.max_weight_kg ?? "500",
      } : {}),
      ...(config.parent ? { [config.parent]: item[config.parent] || "" } : {}),
      ...(type === "bins" ? {
        max_weight: item.max_weight ?? "",
        max_volume: item.max_volume ?? "",
      } : {}),
      status: item.status || "active",
    });
    setFormError("");
  }

  async function openCreateStorageLocation(bin) {
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
  }

  async function confirmCreateStorageLocation() {
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
      await loadTree();
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
  }

  async function saveNode() {
    const config = TYPES[editor.type];
    if (!config.autoCode && !String(form[config.code] || "").trim()) {
      setFormError(`${config.singular} code is required.`);
      return;
    }
    if (config.name && !String(form[config.name] || "").trim()) {
      setFormError(`${config.singular} name is required.`);
      return;
    }
    try {
      setSaving(true);
      setFormError("");
      if (editor.mode === "create") {
        await createLocationTaxonomy(session, editor.type, form);
      } else {
        await updateLocationTaxonomy(session, editor.type, editor.id, form);
      }
      toast({ title: `${config.singular} ${editor.mode === "create" ? "created" : "updated"}` });
      setEditor(null);
      await loadTree();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const config = TYPES[deleteTarget.type];
    try {
      const response = await deleteLocationTaxonomy(
        session, deleteTarget.type, deleteTarget.item[config.id]
      );
      toast({ title: response.message || `${config.singular} deleted` });
      setDeleteTarget(null);
      await loadTree();
    } catch (error) {
      toast({ title: `Unable to delete ${config.singular.toLowerCase()}`, description: error.message, variant: "destructive" });
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  const editorConfig = editor ? TYPES[editor.type] : null;

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Master Data", path: "/master-data" }, { label: "Location Taxonomy" }]} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-[30px] text-slate-900">Location Taxonomy</h1>
          <p className="mt-1 text-[13px] text-slate-500">Warehouse to bin hierarchy for tenant warehouse operations.</p>
        </div>
        {canManage && <Button onClick={() => openAdd("warehouses")}><Plus size={16} /> Add Warehouse</Button>}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-3">
          <form className="flex w-full max-w-md gap-2" onSubmit={submitSearch}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search code, name, or location code"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline">Search</Button>
          </form>
          <span className="text-[13px] text-slate-500">{total} warehouses</span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-[13px] text-slate-500">Loading location hierarchy...</div>
        ) : tree.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-slate-500">No location taxonomy records found.</div>
        ) : tree.map((warehouse) => (
          <TreeNode
            key={warehouse.warehouse_id}
            type="warehouses"
            item={warehouse}
            depth={0}
            expanded={expanded}
            toggle={(key) => setExpanded((current) => {
              const next = new Set(current);
              if (next.has(key)) next.delete(key); else next.add(key);
              return next;
            })}
            canManage={canManage}
            onAdd={openAdd}
            onEdit={openEdit}
            onDelete={(type, item) => setDeleteTarget({ type, item })}
            onCreateStorageLocation={openCreateStorageLocation}
          />
        ))}

        <div className="flex items-center justify-between border-t p-3">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <span className="text-[13px] text-slate-500">Page {page} of {totalPages}</span>
          <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent>
          {editorConfig && (
            <>
              <DialogHeader>
                <DialogTitle>{editor.mode === "create" ? "Add" : "Edit"} {editorConfig.singular}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {!editorConfig.autoCode && (
                  <div className="space-y-1.5">
                    <Label>{editorConfig.singular} Code <span className="text-red-600">*</span></Label>
                    <Input
                      value={form[editorConfig.code] || ""}
                      onChange={(event) => setForm((current) => ({ ...current, [editorConfig.code]: event.target.value }))}
                      disabled={editorConfig.autoCode}
                    />
                  </div>
                )}
                {editorConfig.autoCode && editor.mode === "create" && (
                  <p className="text-[13px] text-slate-500">
                    {editorConfig.singular} code will be auto-assigned (
                    {editor?.type === "levels" ? "L01, L02..." : "B001, B002..."}).
                  </p>
                )}
                {editorConfig.name && (
                  <div className="space-y-1.5">
                    <Label>{editorConfig.singular} Name <span className="text-red-600">*</span></Label>
                    <Input
                      value={form[editorConfig.name] || ""}
                      onChange={(event) => setForm((current) => ({ ...current, [editorConfig.name]: event.target.value }))}
                    />
                  </div>
                )}
                {editorConfig.zoneType && (
                  <div className="space-y-1.5">
                    <Label>Zone Type <span className="text-red-600">*</span></Label>
                    <Select value={form.zone_type || "storage"} onValueChange={(value) => setForm((current) => ({ ...current, zone_type: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="storage">Storage</SelectItem>
                        <SelectItem value="receiving">Receiving</SelectItem>
                        <SelectItem value="shipping">Shipping</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="quarantine">Quarantine</SelectItem>
                        <SelectItem value="returns">Returns</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {editorConfig.dimensions && (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["width_cm", "Width (cm)"],
                      ["depth_cm", "Depth (cm)"],
                      ["level_height_cm", "Level Height (cm)"],
                      ["level_count", "Level Count"],
                      ["max_weight_kg", "Maximum Weight (kg)"],
                    ].map(([field, label]) => (
                      <div key={field} className="space-y-1.5">
                        <Label>{label}</Label>
                        <Input type="number" min="0" value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} />
                      </div>
                    ))}
                  </div>
                )}
                {editor?.type === "bins" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Maximum Weight</Label>
                      <Input type="number" min="0" value={form.max_weight} onChange={(event) => setForm((current) => ({ ...current, max_weight: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Maximum Volume</Label>
                      <Input type="number" min="0" value={form.max_volume} onChange={(event) => setForm((current) => ({ ...current, max_volume: event.target.value }))} />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Status <span className="text-red-600">*</span></Label>
                  <Select value={form.status || "active"} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formError && <p className="rounded-md bg-red-50 p-2 text-[13px] text-red-700">{formError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
                <Button disabled={saving} onClick={saveNode}>{saving ? "Saving..." : "Save"}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CustomConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Delete ${deleteTarget ? TYPES[deleteTarget.type].singular : ""}`}
        description="Referenced records will be retained and set to inactive. Unreferenced records will be permanently deleted."
        confirmLabel="Delete"
      />

      <Dialog open={Boolean(storageLocationTarget)} onOpenChange={(open) => !open && setStorageLocationTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Storage Location</DialogTitle>
          </DialogHeader>
          {storageLocationTarget?.bin && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generated Location Code</p>
                <p className="mt-1 font-mono text-[13px] font-semibold text-slate-900">
                  {storageLocationTarget.bin.location_code || "Unavailable"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bin</p>
                  <p className="font-mono text-slate-900">{storageLocationTarget.bin.bin_id}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warehouse</p>
                  <p className="font-mono text-slate-900">{storageLocationTarget.bin.warehouse_id || session.warehouse_id || "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zone</p>
                  <p className="text-slate-900">{storageLocationTarget.bin.zone_name || storageLocationTarget.bin.zone_id || "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location Type</p>
                  <p className="text-slate-900">storage</p>
                </div>
              </div>
              {storageLocationTarget.existing && (
                <div className="rounded-md bg-amber-50 p-3 text-[13px] text-amber-800">
                  Existing location: {storageLocationTarget.existing.display_name || storageLocationTarget.existing.location_code || storageLocationTarget.existing.location_id}
                </div>
              )}
              {storageLocationError && (
                <p className="rounded-md bg-red-50 p-2 text-[13px] text-red-700">{storageLocationError}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStorageLocationTarget(null)}>Cancel</Button>
            <Button
              disabled={creatingStorageLocation || Boolean(storageLocationTarget?.existing)}
              onClick={confirmCreateStorageLocation}
            >
              {creatingStorageLocation ? "Creating..." : "Create Storage Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
