import { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/services/rbac";
import {
  fetchLovGroups, createLovGroup, addLovValue,
  updateLovValue, deleteLovValue, toSessionContext,
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

const MODULE_OPTIONS = [
  "Inbound", "Inventory", "Putaway", "Picking", "Packing",
  "Outbound", "Shipping", "Returns", "Trace", "Master Data",
];

// ── DeleteModal ───────────────────────────────────────────────────────────────
function DeleteModal({ open, onClose, onConfirm, title, description, confirming }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p style={{ fontSize: 13, color: T_SECONDARY }}>{description}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
            <button style={btnNeutral} onClick={onClose} disabled={confirming}>Back</button>
            <button style={{ ...btnDanger, opacity: confirming ? 0.6 : 1 }} onClick={onConfirm} disabled={confirming}>
              {confirming ? "Deleting…" : "Confirm Delete"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const LOVMaintenancePage = () => {
  const auth      = useAuth();
  const { toast } = useToast();
  const session   = useMemo(() => toSessionContext(auth), [auth]);
  const userRole  = auth.currentUser?.role || "";
  const canEditLov   = can(userRole, "lov", "edit");
  const canDeleteLov = can(userRole, "lov", "delete");

  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState(null);

  // Add Group modal
  const [showAddGroup, setShowAddGroup]     = useState(false);
  const [groupForm, setGroupForm]           = useState({ id: "", name: "", usedIn: [] });
  const [groupFormError, setGroupFormError] = useState("");
  const [savingGroup, setSavingGroup]       = useState(false);

  // Add/Edit Value modal
  const [showValueModal, setShowValueModal]         = useState(false);
  const [editingValueIndex, setEditingValueIndex]   = useState(null);
  const [valueInput, setValueInput]                 = useState("");
  const [valueError, setValueError]                 = useState("");
  const [savingValue, setSavingValue]               = useState(false);

  // Delete confirms
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(null);
  const [deletingGroup, setDeletingGroup]           = useState(false);
  const [deleteConfirm, setDeleteConfirm]           = useState(null);
  const [deletingValue, setDeletingValue]           = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (!session?.tenant_id) return;
    try {
      setLoading(true);
      const result = await fetchLovGroups(session, { search });
      setGroups(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      toast({ title: "Failed to load LOV groups", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [session, search]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (selected) {
      const updated = groups.find((g) => g.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [groups]);

  // ── Handlers (unchanged) ──────────────────────────────────────────────────
  const handleAddGroup = async () => {
    if (!groupForm.id.trim()) { setGroupFormError("Group ID is required"); return; }
    if (!groupForm.name.trim()) { setGroupFormError("Group name is required"); return; }
    try {
      setSavingGroup(true); setGroupFormError("");
      const result = await createLovGroup(session, {
        id: groupForm.id.trim().toLowerCase().replace(/\s+/g, "_"),
        name: groupForm.name.trim(),
        usedIn: groupForm.usedIn,
      });
      setGroups((prev) => [...prev, result.data]);
      setShowAddGroup(false);
      setGroupForm({ id: "", name: "", usedIn: [] });
      toast({ title: "Group created", description: `${result.data.name} added` });
    } catch (err) { setGroupFormError(err.message || "Failed to create group"); }
    finally { setSavingGroup(false); }
  };

  const openAddValue = () => { setEditingValueIndex(null); setValueInput(""); setValueError(""); setShowValueModal(true); };
  const openEditValue = (index, currentValue) => { setEditingValueIndex(index); setValueInput(currentValue); setValueError(""); setShowValueModal(true); };

  const handleSaveValue = async () => {
    if (!valueInput.trim()) { setValueError("Value is required"); return; }
    if (!selected) return;
    try {
      setSavingValue(true); setValueError("");
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
    } catch (err) { setValueError(err.message || "Failed to save value"); }
    finally { setSavingValue(false); }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupConfirm) return;
    try {
      setDeletingGroup(true);
      setGroups((prev) => prev.filter((g) => g.id !== deleteGroupConfirm.id));
      if (selected?.id === deleteGroupConfirm.id) setSelected(null);
      toast({ title: "Group deleted", description: `${deleteGroupConfirm.name} removed` });
      setDeleteGroupConfirm(null);
    } catch (err) { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); }
    finally { setDeletingGroup(false); }
  };

  const handleDeleteValue = async () => {
    if (!deleteConfirm || !selected) return;
    try {
      setDeletingValue(true);
      const result = await deleteLovValue(session, selected.id, deleteConfirm.index);
      setGroups((prev) => prev.map((g) => g.id === selected.id ? result.data : g));
      toast({ title: "Value deleted", description: `Removed: ${deleteConfirm.value}` });
      setDeleteConfirm(null);
    } catch (err) { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); }
    finally { setDeletingValue(false); }
  };

  const filteredGroups = search
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()) || g.id.toLowerCase().includes(search.toLowerCase()))
    : groups;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "LOV Maintenance" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>LOV Maintenance</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>Manage list of values used across the system</p>
      </div>

      {/* ── Groups table ── */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        {/* Toolbar */}
        <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              style={{ width: "100%", height: 32, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
              placeholder="Search group ID or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }} />
          <button style={btnNeutral} onClick={() => setSearch("")}>Clear</button>
          <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={loadGroups} disabled={loading}>Refresh</button>
          {canEditLov && (
            <button style={btnPrimary} onClick={() => { setGroupForm({ id: "", name: "", usedIn: [] }); setGroupFormError(""); setShowAddGroup(true); }}>
              + Add Group
            </button>
          )}
        </div>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Group ID", "Name", "Values", "Used In", "Last Updated"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={{ padding: "28px 14px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>Loading…</td></tr>}
            {!loading && filteredGroups.length === 0 && <tr><td colSpan={5} style={{ padding: "28px 14px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No groups found.</td></tr>}
            {!loading && filteredGroups.map((group) => {
              const isSel = selected?.id === group.id;
              return (
                <tr key={group.id}
                  style={{ cursor: "pointer", background: isSel ? ACCENT_LIGHT : "transparent" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f5f7ff"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  onClick={() => setSelected(isSel ? null : group)}
                >
                  <td style={tdStyle}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: T_SECONDARY }}>{group.id}</span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{group.name}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "#dbeafe", color: "#1e40af" }}>
                      {group.values.length}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {group.usedIn.map((u) => (
                        <span key={u} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#f3f4f6", color: T_LABEL, border: "0.5px solid #e5e7eb" }}>{u}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: T_MUTED }}>{group.lastUpdated}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        {!loading && filteredGroups.length > 0 && (
          <div style={{ padding: "8px 14px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", fontSize: 12, color: T_MUTED }}>
            {filteredGroups.length} group{filteredGroups.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {/* ── Selected group values panel ── */}
      {selected && (
        <div style={cardStyle}>
          {/* Panel header */}
          <div style={{ borderTop: "2px solid #3b5bdb", padding: "14px 16px", background: "#fff", borderBottom: "0.5px solid #eef0fc", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: T_PRIMARY }}>{selected.id}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: T_PRIMARY }}>{selected.name}</span>
              </div>
              <div style={{ fontSize: 12, color: T_MUTED, display: "flex", gap: 16 }}>
                {selected.usedIn.length > 0 && (
                  <span>Used in: <span style={{ color: T_SECONDARY }}>{selected.usedIn.join(", ")}</span></span>
                )}
                <span>Last updated: <span style={{ color: T_SECONDARY }}>{selected.lastUpdated}</span></span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnDanger} onClick={() => setDeleteGroupConfirm(selected)}>Delete Group</button>
              <button style={btnPrimary} onClick={openAddValue}>+ Add Value</button>
            </div>
          </div>

          {/* Values table */}
          {selected.values.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_MUTED }}>
              No values yet. Click <strong>+ Add Value</strong> to start.
            </div>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Value</th>
                    <th style={{ ...thStyle, width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.values.map((v, i) => (
                    <tr key={i}
                      style={{ background: "transparent" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f5f7ff"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={tdStyle}>{v}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {canEditLov   && <button style={btnOutline} onClick={() => openEditValue(i, v)}>Edit</button>}
                          <button style={btnOutline} onClick={() => openEditValue(i, v)}>Edit</button>
                            <button style={{ ...btnBase, height: 28, padding: "0 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#fee2e2", color: "#b91c1c", border: "0.5px solid #fca5a5" }}
                              onClick={() => setDeleteConfirm({ index: i, value: v })}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: "8px 14px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", fontSize: 12, color: T_MUTED }}>
                {selected.values.length} value{selected.values.length === 1 ? "" : "s"}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Add Group modal ── */}
      <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add LOV Group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label style={{ fontSize: 12, fontWeight: 600, color: T_LABEL }}>Group ID <span style={{ color: "#e03131" }}>*</span></label>
              <Input value={groupForm.id} onChange={(e) => setGroupForm((c) => ({ ...c, id: e.target.value }))} placeholder="e.g. return_reasons" disabled={savingGroup} />
              <p style={{ fontSize: 11, color: T_MUTED }}>Lowercase, underscores only</p>
            </div>
            <div className="space-y-1">
              <label style={{ fontSize: 12, fontWeight: 600, color: T_LABEL }}>Group Name <span style={{ color: "#e03131" }}>*</span></label>
              <Input value={groupForm.name} onChange={(e) => setGroupForm((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. Return Reasons" disabled={savingGroup} />
            </div>
            <div className="space-y-1">
              <label style={{ fontSize: 12, fontWeight: 600, color: T_LABEL }}>Used In</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, border: "0.5px solid #d1d5db", borderRadius: 7, padding: 12 }}>
                {MODULE_OPTIONS.map((mod) => (
                  <label key={mod} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T_PRIMARY, cursor: "pointer" }}>
                    <input type="checkbox" checked={groupForm.usedIn.includes(mod)}
                      onChange={(e) => setGroupForm((c) => ({ ...c, usedIn: e.target.checked ? [...c.usedIn, mod] : c.usedIn.filter((m) => m !== mod) }))}
                      disabled={savingGroup}
                    />
                    {mod}
                  </label>
                ))}
              </div>
            </div>
            {groupFormError && <p style={{ fontSize: 12, color: "#991b1b" }}>{groupFormError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setShowAddGroup(false)} disabled={savingGroup}>Back</button>
              <button style={{ ...btnPrimary, opacity: savingGroup ? 0.6 : 1 }} onClick={handleAddGroup} disabled={savingGroup}>
                {savingGroup ? "Creating…" : "Create Group"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Value modal ── */}
      <Dialog open={showValueModal} onOpenChange={setShowValueModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingValueIndex !== null ? "Edit Value" : "Add Value"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label style={{ fontSize: 12, fontWeight: 600, color: T_LABEL }}>Value <span style={{ color: "#e03131" }}>*</span></label>
            <Input value={valueInput} onChange={(e) => setValueInput(e.target.value)} placeholder="Enter value…" disabled={savingValue}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveValue(); }} />
            {valueError && <p style={{ fontSize: 12, color: "#991b1b" }}>{valueError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setShowValueModal(false)} disabled={savingValue}>Back</button>
              <button style={{ ...btnPrimary, opacity: savingValue ? 0.6 : 1 }} onClick={handleSaveValue} disabled={savingValue}>
                {savingValue ? "Saving…" : editingValueIndex !== null ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete modals ── */}
      <DeleteModal open={Boolean(deleteGroupConfirm)} onClose={() => setDeleteGroupConfirm(null)} onConfirm={handleDeleteGroup} confirming={deletingGroup}
        title={deleteGroupConfirm ? `Delete "${deleteGroupConfirm.name}"` : "Delete Group"}
        description={deleteGroupConfirm ? `Delete group "${deleteGroupConfirm.name}" and all its values? This cannot be undone and may affect screens that use this group.` : ""} />

      <DeleteModal open={Boolean(deleteConfirm)} onClose={() => setDeleteConfirm(null)} onConfirm={handleDeleteValue} confirming={deletingValue}
        title="Delete LOV Value"
        description={`Delete "${deleteConfirm?.value}"? This may affect screens that use this value.`} />
    </AppLayout>
  );
};

export default LOVMaintenancePage;