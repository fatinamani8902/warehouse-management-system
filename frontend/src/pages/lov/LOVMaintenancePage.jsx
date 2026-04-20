import { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchLovGroups,
  createLovGroup,
  addLovValue,
  updateLovValue,
  deleteLovValue,
  toSessionContext,
} from "@/services/api";

const MODULE_OPTIONS = [
  "Inbound", "Inventory", "Putaway", "Picking", "Packing",
  "Outbound", "Shipping", "Returns", "Trace", "Master Data",
];

const LOVMaintenancePage = () => {
  const auth = useAuth();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [auth]);

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  // Add Group modal
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ id: "", name: "", usedIn: [] });
  const [groupFormError, setGroupFormError] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  // Add/Edit Value modal
  const [showValueModal, setShowValueModal] = useState(false);
  const [editingValueIndex, setEditingValueIndex] = useState(null);
  const [valueInput, setValueInput] = useState("");
  const [valueError, setValueError] = useState("");
  const [savingValue, setSavingValue] = useState(false);

  // Delete Group confirm
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  // Delete Value confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingValue, setDeletingValue] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!session?.tenant_id) return;
    try {
      setLoading(true);
      const result = await fetchLovGroups(session, { search });
      setGroups(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      toast({ title: "Failed to load LOV groups", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [session, search]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (selected) {
      const updated = groups.find((g) => g.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [groups]);

  const handleAddGroup = async () => {
    if (!groupForm.id.trim()) { setGroupFormError("Group ID is required"); return; }
    if (!groupForm.name.trim()) { setGroupFormError("Group name is required"); return; }
    try {
      setSavingGroup(true);
      setGroupFormError("");
      const result = await createLovGroup(session, {
        id: groupForm.id.trim().toLowerCase().replace(/\s+/g, "_"),
        name: groupForm.name.trim(),
        usedIn: groupForm.usedIn,
      });
      setGroups((prev) => [...prev, result.data]);
      setShowAddGroup(false);
      setGroupForm({ id: "", name: "", usedIn: [] });
      toast({ title: "Group created", description: `${result.data.name} added` });
    } catch (err) {
      setGroupFormError(err.message || "Failed to create group");
    } finally {
      setSavingGroup(false);
    }
  };

  const openAddValue = () => {
    setEditingValueIndex(null);
    setValueInput("");
    setValueError("");
    setShowValueModal(true);
  };

  const openEditValue = (index, currentValue) => {
    setEditingValueIndex(index);
    setValueInput(currentValue);
    setValueError("");
    setShowValueModal(true);
  };

  const handleSaveValue = async () => {
    if (!valueInput.trim()) { setValueError("Value is required"); return; }
    if (!selected) return;
    try {
      setSavingValue(true);
      setValueError("");
      let result;
      if (editingValueIndex !== null) {
        result = await updateLovValue(session, selected.id, editingValueIndex, valueInput.trim());
        toast({ title: "Value updated" });
      } else {
        result = await addLovValue(session, selected.id, valueInput.trim());
        toast({ title: "Value added" });
      }
      setGroups((prev) => prev.map((g) => g.id === selected.id ? result.data : g));
      setShowValueModal(false);
    } catch (err) {
      setValueError(err.message || "Failed to save value");
    } finally {
      setSavingValue(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupConfirm) return;
    try {
      setDeletingGroup(true);
      setGroups((prev) => prev.filter((g) => g.id !== deleteGroupConfirm.id));
      if (selected?.id === deleteGroupConfirm.id) setSelected(null);
      toast({ title: "Group deleted", description: `${deleteGroupConfirm.name} removed` });
      setDeleteGroupConfirm(null);
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeletingGroup(false);
    }
  };

  const handleDeleteValue = async () => {
    if (!deleteConfirm || !selected) return;
    try {
      setDeletingValue(true);
      const result = await deleteLovValue(session, selected.id, deleteConfirm.index);
      setGroups((prev) => prev.map((g) => g.id === selected.id ? result.data : g));
      toast({ title: "Value deleted", description: `Removed: ${deleteConfirm.value}` });
      setDeleteConfirm(null);
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeletingValue(false);
    }
  };

  const filteredGroups = search
    ? groups.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.id.toLowerCase().includes(search.toLowerCase())
      )
    : groups;

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "LOV Maintenance" }]} />
      <h1 className="text-2xl font-bold mb-4">List of Values (LOV) Maintenance</h1>

      {/* Filter bar — consistent with other pages */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-9 min-w-[220px] flex-1"
              placeholder="Search group ID or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <Button variant="outline" className="h-9" onClick={() => setSearch("")}>Clear</Button>
            )}
            <Button variant="outline" className="h-9" onClick={loadGroups} disabled={loading}>Refresh</Button>
            <Button className="h-9" onClick={() => { setGroupForm({ id: "", name: "", usedIn: [] }); setGroupFormError(""); setShowAddGroup(true); }}>
              + Add Group
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Groups Table */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium">Group ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium">Values</th>
                  <th className="px-3 py-2 text-left text-xs font-medium">Used In</th>
                  <th className="px-3 py-2 text-left text-xs font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Loading...</td></tr>
                )}
                {!loading && filteredGroups.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No groups found.</td></tr>
                )}
                {!loading && filteredGroups.map((group) => (
                  <tr
                    key={group.id}
                    className={`border-t cursor-pointer hover:bg-accent/40 ${selected?.id === group.id ? "bg-accent/30" : ""}`}
                    onClick={() => setSelected(selected?.id === group.id ? null : group)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{group.id}</td>
                    <td className="px-3 py-2">{group.name}</td>
                    <td className="px-3 py-2">
                      <span style={{
                        fontSize: 12, fontWeight: 500, padding: "2px 9px", borderRadius: 20,
                        background: "#DBEAFE", color: "#1E40AF",
                      }}>
                        {group.values.length}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {group.usedIn.map((u) => (
                          <Badge key={u} variant="outline" className="text-[10px]">{u}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{group.lastUpdated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && filteredGroups.length > 0 && (
              <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                {filteredGroups.length} group{filteredGroups.length === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Selected Group Values */}
      {selected && (
        <Card>
          {/* Header */}
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">{selected.id}</span>
                <span className="text-sm font-medium">{selected.name}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {selected.usedIn.length > 0 && (
                  <span>Used in: <span className="text-foreground">{selected.usedIn.join(", ")}</span></span>
                )}
                <span>Last updated: <span className="text-foreground">{selected.lastUpdated}</span></span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="destructive" className="h-8" onClick={() => setDeleteGroupConfirm(selected)}>Delete Group</Button>
              <Button size="sm" className="h-8" onClick={openAddValue}>+ Add Value</Button>
            </div>
          </div>

          <CardContent className="pt-4">
            {selected.values.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No values yet. Click Add Value to start.</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium">Value</th>
                      <th className="px-3 py-2 text-left text-xs font-medium w-[120px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.values.map((v, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2">{v}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => openEditValue(i, v)}>Edit</Button>
                            <Button size="sm" variant="destructive" className="h-7 text-[11px] px-2" onClick={() => setDeleteConfirm({ index: i, value: v })}>Delete</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                  {selected.values.length} value{selected.values.length === 1 ? "" : "s"}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ADD GROUP MODAL */}
      <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add LOV Group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Group ID <span className="text-destructive">*</span></Label>
              <Input
                value={groupForm.id}
                onChange={(e) => setGroupForm((c) => ({ ...c, id: e.target.value }))}
                placeholder="e.g. return_reasons"
                disabled={savingGroup}
              />
              <p className="text-xs text-muted-foreground">Lowercase, underscores only</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Group Name <span className="text-destructive">*</span></Label>
              <Input
                value={groupForm.name}
                onChange={(e) => setGroupForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="e.g. Return Reasons"
                disabled={savingGroup}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Used In</Label>
              <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3">
                {MODULE_OPTIONS.map((mod) => (
                  <label key={mod} className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={groupForm.usedIn.includes(mod)}
                      onChange={(e) => {
                        setGroupForm((c) => ({
                          ...c,
                          usedIn: e.target.checked
                            ? [...c.usedIn, mod]
                            : c.usedIn.filter((m) => m !== mod),
                        }));
                      }}
                      disabled={savingGroup}
                    />
                    <span>{mod}</span>
                  </label>
                ))}
              </div>
            </div>
            {groupFormError && <p className="text-xs text-destructive">{groupFormError}</p>}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddGroup(false)} disabled={savingGroup}>Back</Button>
            <Button onClick={handleAddGroup} disabled={savingGroup}>
              {savingGroup ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD/EDIT VALUE MODAL */}
      <Dialog open={showValueModal} onOpenChange={setShowValueModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingValueIndex !== null ? "Edit Value" : "Add Value"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 mt-1">
            <Label className="text-xs text-muted-foreground">Value <span className="text-destructive">*</span></Label>
            <Input
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder="Enter value..."
              disabled={savingValue}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveValue(); }}
            />
            {valueError && <p className="text-xs text-destructive mt-1">{valueError}</p>}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowValueModal(false)} disabled={savingValue}>Back</Button>
            <Button onClick={handleSaveValue} disabled={savingValue}>
              {savingValue ? "Saving..." : editingValueIndex !== null ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE GROUP CONFIRM */}
      <ConfirmModal
        open={!!deleteGroupConfirm}
        onClose={() => setDeleteGroupConfirm(null)}
        onConfirm={handleDeleteGroup}
        title={deleteGroupConfirm ? `Delete "${deleteGroupConfirm.name}"` : "Delete Group"}
        description={deleteGroupConfirm ? `Delete group "${deleteGroupConfirm.name}" and all its values? This cannot be undone and may affect screens that use this group.` : ""}
        confirmLabel={deletingGroup ? "Deleting..." : "Confirm"}
        cancelLabel="Back"
        variant="destructive"
      />

      {/* DELETE VALUE CONFIRM */}
      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteValue}
        title="Delete LOV Value"
        description={`Delete "${deleteConfirm?.value}"? This may affect screens that use this value.`}
        confirmLabel={deletingValue ? "Deleting..." : "Confirm"}
        cancelLabel="Back"
        variant="destructive"
      />
    </AppLayout>
  );
};

export default LOVMaintenancePage;