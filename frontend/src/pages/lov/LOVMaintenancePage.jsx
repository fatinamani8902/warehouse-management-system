import { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/services/rbac";
import { formatDate } from "@/utils/dateTimeFormatter";
import {
  fetchLovGroups, fetchLovGroupById, createLovGroup, deleteLovGroup, addLovValue,
  updateLovValue, deleteLovValue, toSessionContext,
} from "@/services/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
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
const cardStyle  = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };
const thStyle    = { padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, lineHeight: "16px", letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap", background: "#fafbff" };
const tdStyle    = { padding: "12px 14px", borderBottom: "0.5px solid #f0f0f0", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY };

const MODULE_OPTIONS = [
  "Inbound", "Inventory", "Putaway", "Picking", "Packing",
  "Outbound", "Shipping", "Returns", "Trace", "Master Data",
];

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeLovCode = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

const normalizeLovValue = (value, index) => {
  if (typeof value === "string") {
    return {
      id: value,
      lov_value_id: null,
      value_code: value,
      value_label: value,
      label: value,
      key: `${value}-${index}`,
    };
  }

  const valueCode = value?.value_code ?? value?.code ?? value?.value ?? "";
  const valueLabel = value?.value_label ?? value?.label ?? valueCode;
  const valueId = value?.lov_value_id ?? value?.id ?? null;

  return {
    ...value,
    id: valueId ?? valueCode,
    lov_value_id: valueId,
    value_code: valueCode,
    value_label: valueLabel,
    label: valueLabel,
    key: valueId ?? valueCode ?? `${valueLabel}-${index}`,
  };
};

const normalizeLovGroup = (group) => {
  const groupId = group?.lov_group_id ?? group?.id ?? group?.group_code ?? "";
  const groupCode = group?.group_code ?? group?.id ?? groupId;
  const groupName = group?.group_name ?? group?.name ?? groupCode;

  return {
    ...group,
    id: groupId,
    lov_group_id: groupId,
    group_code: groupCode,
    group_name: groupName,
    name: groupName,
    usedIn: asArray(group?.usedIn ?? group?.used_in),
    values: asArray(group?.values).map(normalizeLovValue),
    lastUpdated: formatDate(group?.updated_at ?? group?.lastUpdated),
  };
};

// ── DeleteModal ───────────────────────────────────────────────────────────────
function DeleteModal({ open, onClose, onConfirm, title, description, confirming }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{description}</p>
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
  const canEditLov   = can(userRole, "lov.edit");
  const canDeleteLov = can(userRole, "lov.delete");

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
  const [editingValue, setEditingValue]             = useState(null);
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
      setGroups(asArray(result?.data).map(normalizeLovGroup));
    } catch (err) {
      toast({ title: "Failed to load LOV groups", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [session, search]);

  const refreshGroup = useCallback(async (groupId) => {
    const result = await fetchLovGroupById(session, groupId);
    const updated = normalizeLovGroup(result?.data);
    setGroups((prev) => asArray(prev).map((g) => g.id === updated.id ? updated : g));
    setSelected(updated);
    return updated;
  }, [session]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (selected) {
      const updated = asArray(groups).find((g) => g.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [groups]);

  // ── Handlers (unchanged) ──────────────────────────────────────────────────
  const handleAddGroup = async () => {
    const groupCode = normalizeLovCode(groupForm.id);
    const groupName = groupForm.name.trim();
    if (!groupCode) { setGroupFormError("Group code must contain at least one letter or number"); return; }
    if (!groupName) { setGroupFormError("Group name is required"); return; }
    try {
      setSavingGroup(true); setGroupFormError("");
      const result = await createLovGroup(session, {
        group_code: groupCode,
        group_name: groupName,
        usedIn: groupForm.usedIn,
      });
      const created = normalizeLovGroup(result?.data);
      await loadGroups();
      setShowAddGroup(false);
      setGroupForm({ id: "", name: "", usedIn: [] });
      toast({ title: "Group created", description: `${created.name} added` });
    } catch (err) { setGroupFormError(err.message || "Failed to create group"); }
    finally { setSavingGroup(false); }
  };

  const openAddValue = () => { setEditingValue(null); setValueInput(""); setValueError(""); setShowValueModal(true); };
  const openEditValue = (currentValue) => { setEditingValue(currentValue); setValueInput(currentValue?.value_label || ""); setValueError(""); setShowValueModal(true); };

  const handleSaveValue = async () => {
    const valueLabel = valueInput.trim();
    const valueCode = normalizeLovCode(valueLabel);
    if (!valueLabel) { setValueError("Value label is required"); return; }
    if (!valueCode) { setValueError("Value code must contain at least one letter or number"); return; }
    if (!selected) return;
    try {
      setSavingValue(true); setValueError("");
      if (editingValue) {
        const valueId = editingValue.lov_value_id ?? editingValue.id;
        if (!valueId) {
          setValueError("Cannot update a value without lov_value_id");
          return;
        }
        await updateLovValue(session, selected.id, valueId, {
          value_code: valueCode,
          value_label: valueLabel,
        });
        toast({ title: "Value updated" });
      } else {
        await addLovValue(session, selected.id, {
          value_code: valueCode,
          value_label: valueLabel,
        });
        toast({ title: "Value added" });
      }
      await refreshGroup(selected.id);
      setShowValueModal(false);
    } catch (err) { setValueError(err.message || "Failed to save value"); }
    finally { setSavingValue(false); }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupConfirm) return;
    try {
      setDeletingGroup(true);
      await deleteLovGroup(session, deleteGroupConfirm.id);
      await loadGroups();
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
      await deleteLovValue(session, selected.id, deleteConfirm.lov_value_id);
      await refreshGroup(selected.id);
      toast({ title: "Value deleted", description: `Removed: ${deleteConfirm.value_label}` });
      setDeleteConfirm(null);
    } catch (err) { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); }
    finally { setDeletingValue(false); }
  };

  const filteredGroups = search
    ? asArray(groups).filter((g) => (g.name || "").toLowerCase().includes(search.toLowerCase()) || (g.id || "").toLowerCase().includes(search.toLowerCase()))
    : asArray(groups);
  const selectedValues = asArray(selected?.values);
  const selectedUsedIn = asArray(selected?.usedIn);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "LOV Maintenance" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>LOV Maintenance</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Manage list of values used across the system</p>
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
              style={{ width: "100%", height: 40, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY, outline: "none", background: "#fff" }}
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
            {loading && <tr><td colSpan={5} style={{ padding: "28px 14px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>Loading…</td></tr>}
            {!loading && filteredGroups.length === 0 && <tr><td colSpan={5} style={{ padding: "28px 14px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>No groups found.</td></tr>}
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
                      {asArray(group.values).length}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {asArray(group.usedIn).map((u) => (
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
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, lineHeight: "20px", color: T_PRIMARY }}>{selected.id}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: T_PRIMARY }}>{selected.name}</span>
              </div>
              <div style={{ fontSize: 12, color: T_MUTED, display: "flex", gap: 16 }}>
                {selectedUsedIn.length > 0 && (
                  <span>Used in: <span style={{ color: T_SECONDARY }}>{selectedUsedIn.join(", ")}</span></span>
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
          {selectedValues.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_MUTED }}>
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
                  {selectedValues.map((v) => (
                    <tr key={v.key}
                      style={{ background: "transparent" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f5f7ff"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={tdStyle}>{v.value_label}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {canEditLov && <button style={btnOutline} onClick={() => openEditValue(v)}>Edit</button>}
                          {canDeleteLov && (
                            <button style={{ ...btnBase, height: 28, padding: "0 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#fee2e2", color: "#b91c1c", border: "0.5px solid #fca5a5" }}
                              onClick={() => setDeleteConfirm(v)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: "8px 14px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", fontSize: 12, color: T_MUTED }}>
                {selectedValues.length} value{selectedValues.length === 1 ? "" : "s"}
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
              <label style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL }}>Group ID <span style={{ color: "#e03131" }}>*</span></label>
              <Input value={groupForm.id} onChange={(e) => setGroupForm((c) => ({ ...c, id: e.target.value }))} placeholder="e.g. return_reasons" disabled={savingGroup} />
              <p style={{ fontSize: 12, fontWeight: 400, lineHeight: "16px", color: T_MUTED }}>Lowercase, underscores only</p>
            </div>
            <div className="space-y-1">
              <label style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL }}>Group Name <span style={{ color: "#e03131" }}>*</span></label>
              <Input value={groupForm.name} onChange={(e) => setGroupForm((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. Return Reasons" disabled={savingGroup} />
            </div>
            <div className="space-y-1">
              <label style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL }}>Used In</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, border: "0.5px solid #d1d5db", borderRadius: 7, padding: 12 }}>
                {MODULE_OPTIONS.map((mod) => (
                  <label key={mod} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_PRIMARY, cursor: "pointer" }}>
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
          <DialogHeader><DialogTitle>{editingValue ? "Edit Value" : "Add Value"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL }}>Value <span style={{ color: "#e03131" }}>*</span></label>
            <Input value={valueInput} onChange={(e) => setValueInput(e.target.value)} placeholder="Enter value…" disabled={savingValue}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveValue(); }} />
            {valueError && <p style={{ fontSize: 12, color: "#991b1b" }}>{valueError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setShowValueModal(false)} disabled={savingValue}>Back</button>
              <button style={{ ...btnPrimary, opacity: savingValue ? 0.6 : 1 }} onClick={handleSaveValue} disabled={savingValue}>
                {savingValue ? "Saving..." : editingValue ? "Update" : "Add"}
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
        description={`Delete "${deleteConfirm?.value_label || ""}"? This may affect screens that use this value.`} />
    </AppLayout>
  );
};

export default LOVMaintenancePage;
