import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toSessionContext } from "@/services/api";
import { roles, permissions, rolePermissions } from "@/data/mockData";
import { ShieldCheck } from "lucide-react";

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
const thStyle    = { padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T_LABEL, borderBottom: "0.5px solid #eef0fc", whiteSpace: "nowrap", background: "#fafbff" };
const tdStyle    = { padding: "13px 16px", borderBottom: "0.5px solid #f0f0f0" };

// ── Helpers (unchanged) ───────────────────────────────────────────────────────
function getInitials(name = "") {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: "#ccfbf1", color: "#0f766e" },
  { bg: "#fef9c3", color: "#854d0e" },
  { bg: "#ede9fe", color: "#5b21b6" },
  { bg: "#fee2e2", color: "#9f1239" },
  { bg: "#e0f2fe", color: "#0369a1" },
  { bg: "#ecfccb", color: "#365314" },
];

function avatarColour(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function formatLastLogin(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

const ROLE_OPTIONS = [
  { value: "superadmin",    label: "Super Admin" },
  { value: "hqadmin",       label: "HQ Admin" },
  { value: "storemanager",  label: "Store Manager" },
  { value: "storeoperator", label: "Store Operator" },
  { value: "auditor",       label: "Auditor" },
];

const WAREHOUSE_OPTIONS = [
  { value: "WH000001", label: "Main Distribution Center" },
  { value: "WH000002", label: "Overflow Warehouse" },
  { value: "WH000003", label: "Tenant2 Warehouse" },
];

const ADMIN_ROLES = new Set(["superadmin", "hqadmin"]);
const EMPTY_FORM  = { user_name: "", email: "", role_id: "", warehouse_id: "", is_active: true };

// ── Permission matrix data (unchanged) ───────────────────────────────────────
const PERMISSION_MATRIX = [
  { module: "Inbound", rows: [
    { label: "View ASN / GRN",               perm: "inbound.view" },
    { label: "Create ASN / GRN",             perm: "inbound.create" },
    { label: "Transition (Submit, Arrive…)", perm: "inbound.transition" },
    { label: "Cancel Documents",             perm: "inbound.cancel" },
  ]},
  { module: "Putaway", rows: [
    { label: "View Putaway Tasks", perm: "putaway.view" },
    { label: "Assign Tasks",       perm: "putaway.assign" },
    { label: "Mark Exception",     perm: "putaway.exception" },
    { label: "Recompute Bin",      perm: "putaway.recompute" },
  ]},
  { module: "Inventory", rows: [
    { label: "View Stock Summary",   perm: "inventory.view_summary" },
    { label: "View Transactions",    perm: "inventory.view_transactions" },
    { label: "View Count Plans",     perm: "inventory.view_count_plans" },
    { label: "Create Count Plan",    perm: "inventory.create_count_plan" },
    { label: "Execute Count Plan",   perm: "inventory.execute_count_plan" },
    { label: "Submit Count Plan",    perm: "inventory.submit_count_plan" },
    { label: "Approve Count Plan",   perm: "inventory.approve_count_plan" },
    { label: "View Adjustments",     perm: "inventory.view_adjustments" },
    { label: "Create Adjustment",    perm: "inventory.create_adjustment" },
    { label: "Submit Adjustment",    perm: "inventory.submit_adjustment" },
    { label: "Approve Adjustment",   perm: "inventory.approve_adjustment" },
  ]},
  { module: "Picking",  rows: [{ label: "View Pick Lists", perm: "picking.view" }]},
  { module: "Packing",  rows: [
    { label: "View Pack Orders", perm: "packing.view" },
    { label: "Confirm Packing",  perm: "packing.confirm" },
  ]},
  { module: "Outbound / Shipping", rows: [
    { label: "View Orders / Shipments", perm: "outbound.view" },
    { label: "Create Order",            perm: "outbound.create" },
    { label: "Release Order",           perm: "outbound.release" },
    { label: "Dispatch Shipment",       perm: "shipping.dispatch" },
    { label: "Close Shipment",          perm: "shipping.close" },
    { label: "Cancel Shipment",         perm: "shipping.cancel" },
  ]},
  { module: "Returns & RMA", rows: [
    { label: "View Returns",    perm: "returns.view" },
    { label: "Create Return",   perm: "returns.create" },
    { label: "Cancel Return",   perm: "returns.cancel" },
    { label: "Create RMA",      perm: "returns.create_rma" },
    { label: "View / Cancel RMA", perm: "rma.view" },
  ]},
  { module: "Trace",       rows: [{ label: "View Trace Events", perm: "trace.view" }]},
  { module: "Master Data", rows: [
    { label: "View Master Data",              perm: "masterdata.view" },
    { label: "Manage Suppliers / Customers",  perm: "masterdata.manage" },
    { label: "Manage SKU / Locations",        perm: "masterdata.manage_sku" },
  ]},
  { module: "Users & LOV", rows: [
    { label: "View Users",     perm: "users.view" },
    { label: "Manage Users",   perm: "users.manage" },
    { label: "LOV Maintenance", perm: "lov.manage" },
  ]},
  { module: "Audit", rows: [{ label: "View Audit Logs", perm: "audit.view" }]},
];

const DISPLAY_ROLES = [
  { id: "warehousemanager", label: "Warehouse Manager", short: "WH Mgr" },
  { id: "storekeeper",      label: "Store Keeper",      short: "Keeper" },
  { id: "auditor",          label: "Auditor",           short: "Auditor" },
];

// ── Permission matrix component ───────────────────────────────────────────────
function PermissionMatrix({ rolePermissions }) {
  return (
    <div style={cardStyle}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 280 }}>Function</th>
              {DISPLAY_ROLES.map((r) => (
                <th key={r.id} style={{ ...thStyle, textAlign: "center", minWidth: 130 }}>
                  <div style={{ fontWeight: 700, color: T_PRIMARY }}>{r.short}</div>
                  <div style={{ fontWeight: 400, color: T_MUTED, fontSize: 11, marginTop: 2 }}>{r.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MATRIX.map((section) => (
              <>
                <tr key={`section-${section.module}`} style={{ background: "#fafbff", borderTop: "0.5px solid #eef0fc", borderBottom: "0.5px solid #eef0fc" }}>
                  <td colSpan={DISPLAY_ROLES.length + 1} style={{ padding: "6px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T_LABEL }}>{section.module}</span>
                  </td>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.perm} style={{ borderBottom: "0.5px solid #f0f0f0" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f5f7ff"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "10px 16px", fontSize: 13, color: T_PRIMARY }}>{row.label}</td>
                    {DISPLAY_ROLES.map((r) => {
                      const perms = rolePermissions[r.id] || [];
                      const has = perms.some((p) => p === row.perm || p.startsWith(row.perm.split(".")[0] + "."));
                      return (
                        <td key={r.id} style={{ padding: "10px 16px", textAlign: "center" }}>
                          {has ? (
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#dcfce7", color: "#14532d", fontSize: 13, fontWeight: 700 }}>✓</span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#f3f4f6", color: T_MUTED, fontSize: 13 }}>✗</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Delete modal ──────────────────────────────────────────────────────────────
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
const UsersRolesPage = () => {
  const auth    = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const isAdmin = ADMIN_ROLES.has(session?.role_id);

  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [roleFilter, setRoleFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser]     = useState(null);
  const [userForm, setUserForm]           = useState(EMPTY_FORM);
  const [formError, setFormError]         = useState("");
  const [saving, setSaving]               = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);

  // ── Load (unchanged) ──────────────────────────────────────────────────────
  const loadUsers = async () => {
    if (!session?.tenant_id) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/users`, {
        headers: {
          "x-tenant-id": session.tenant_id,
          "x-user-id": session.user_id || "",
          "x-roles": session.role_id || "superadmin",
          "x-warehouse-id": session.warehouse_id || "",
          "x-client-source": "PORTAL",
        },
      });
      const result = await res.json();
      if (result?.success && Array.isArray(result.data)) {
        setUsers(result.data.map((u) => ({
          id: u.user_id, name: u.user_name, email: u.email || null,
          role: u.role_id, status: u.is_active ? "active" : "inactive",
          lastLogin: u.lastLogin || null, warehouse_ids: u.warehouse_ids || [],
        })));
      }
    } catch (err) { console.error("Failed to fetch users:", err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, [session]);

  const uniqueRoles = useMemo(() => [...new Set(users.map((u) => u.role))], [users]);

  const filteredUsers = useMemo(() => users.filter((u) => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(search.toLowerCase())) ||
      u.id.toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter === "all"   || u.role === roleFilter;
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  }), [users, search, roleFilter, statusFilter]);

  // ── Handlers (unchanged) ──────────────────────────────────────────────────
  const openInvite = () => { setEditingUser(null); setUserForm(EMPTY_FORM); setFormError(""); setShowUserModal(true); };
  const openEdit   = (user) => {
    setEditingUser(user);
    setUserForm({ user_name: user.name, email: user.email || "", role_id: user.role, warehouse_id: user.warehouse_ids?.[0] || "", is_active: user.status === "active" });
    setFormError(""); setShowUserModal(true);
  };

  const handleSave = async () => {
    if (!userForm.user_name.trim())            { setFormError("Name is required"); return; }
    if (!userForm.role_id)                     { setFormError("Role is required"); return; }
    if (!userForm.warehouse_id)                { setFormError("Warehouse is required"); return; }
    if (!editingUser && !userForm.email.trim()) { setFormError("Email is required"); return; }
    try {
      setSaving(true); setFormError("");
      const url = editingUser
        ? `${import.meta.env.VITE_API_URL}/api/v1/users/${editingUser.id}`
        : `${import.meta.env.VITE_API_URL}/api/v1/users`;
      const res = await fetch(url, {
        method: editingUser ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": session.tenant_id, "x-user-id": session.user_id || "", "x-roles": session.role_id || "superadmin", "x-warehouse-id": session.warehouse_id || "", "x-client-source": "PORTAL" },
        body: JSON.stringify({ user_name: userForm.user_name.trim(), email: userForm.email.trim(), role_id: userForm.role_id, warehouse_ids: [userForm.warehouse_id], is_active: userForm.is_active }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Failed to save user");
      const saved = result.data;
      if (editingUser) {
        setUsers((prev) => prev.map((u) => u.id === editingUser.id ? { ...u, name: saved.user_name, email: saved.email || null, role: saved.role_id, status: saved.is_active ? "active" : "inactive", warehouse_ids: saved.warehouse_ids || [] } : u));
      } else {
        setUsers((prev) => [...prev, { id: saved.user_id, name: saved.user_name, email: saved.email || null, role: saved.role_id, status: "active", lastLogin: null, warehouse_ids: saved.warehouse_ids || [] }]);
      }
      setShowUserModal(false);
    } catch (err) { setFormError(err.message || "Failed to save user"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "x-tenant-id": session.tenant_id, "x-user-id": session.user_id || "", "x-roles": session.role_id || "superadmin", "x-client-source": "PORTAL" },
      });
      if (!res.ok) throw new Error("Failed to delete user");
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Users & Roles" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: T_PRIMARY, marginBottom: 2 }}>Users & Roles</h1>
        <p style={{ fontSize: 13, color: T_SECONDARY }}>Manage system users and access permissions</p>
      </div>

      {/* Read-only banner */}
      {!isAdmin && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#fffbeb", border: "0.5px solid #fde68a", fontSize: 13, color: "#92400e" }}>
          <ShieldCheck size={15} style={{ flexShrink: 0, color: "#d97706" }} />
          <span>You have read-only access. User management is restricted to Super Admin and HQ Admin.</span>
        </div>
      )}

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
        </TabsList>

        {/* ── USERS TAB ── */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div style={cardStyle}>
            {/* Toolbar */}
            <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, background: "#fafbff", borderBottom: "0.5px solid #eef0fc", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
                <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#6b7280" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  style={{ width: "100%", height: 32, border: "0.5px solid #d1d5db", borderRadius: 7, padding: "0 10px 0 30px", fontSize: 13, color: T_PRIMARY, outline: "none", background: "#fff" }}
                  placeholder="Search name, email, ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger style={{ height: 32, width: 150, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {uniqueRoles.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_OPTIONS.find((o) => o.value === r)?.label || r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger style={{ height: 32, width: 130, fontSize: 13, border: "0.5px solid #d1d5db", borderRadius: 7, background: "#fff", color: T_PRIMARY }}>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <div style={{ flex: 1 }} />
              <button style={btnNeutral} onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); }}>Clear</button>
              <button style={{ ...btnNeutral, opacity: loading ? 0.6 : 1 }} onClick={loadUsers} disabled={loading}>Refresh</button>
              {isAdmin && <button style={btnPrimary} onClick={openInvite}>+ Invite User</button>}
            </div>

            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Last Login</th>
                  <th style={thStyle}>Warehouse</th>
                  {isAdmin && <th style={thStyle}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={isAdmin ? 6 : 5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>Loading users…</td></tr>
                )}
                {!loading && filteredUsers.length === 0 && (
                  <tr><td colSpan={isAdmin ? 6 : 5} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: T_SECONDARY }}>No users found.</td></tr>
                )}
                {!loading && filteredUsers.map((user) => {
                  const av = avatarColour(user.name);
                  const isActive = user.status === "active";
                  return (
                    <tr key={user.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f5f7ff"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      {/* User */}
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: av.bg, color: av.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: T_PRIMARY, lineHeight: 1.3 }}>{user.name}</p>
                            {user.email && <p style={{ fontSize: 12, color: T_MUTED, lineHeight: 1.3 }}>{user.email}</p>}
                            <p style={{ fontSize: 11, color: T_MUTED, fontFamily: "var(--font-mono)", lineHeight: 1.3 }}>{user.id}</p>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "#f0f4ff", color: ACCENT, border: "0.5px solid #c7d2fe" }}>
                          {ROLE_OPTIONS.find((r) => r.value === user.role)?.label || user.role}
                        </span>
                      </td>
                      {/* Status */}
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: isActive ? "#22c55e" : "#f87171", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: isActive ? "#15803d" : "#dc2626" }}>{isActive ? "Active" : "Inactive"}</span>
                        </div>
                      </td>
                      {/* Last Login */}
                      <td style={{ ...tdStyle, fontSize: 12, color: T_MUTED }}>{formatLastLogin(user.lastLogin)}</td>
                      {/* Warehouse */}
                      <td style={{ ...tdStyle, fontSize: 12, color: T_SECONDARY }}>
                        {user.warehouse_ids?.map((w) => WAREHOUSE_OPTIONS.find((opt) => opt.value === w)?.label || w).join(", ") || "—"}
                      </td>
                      {/* Actions */}
                      {isAdmin && (
                        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button style={btnOutline} onClick={() => openEdit(user)}>Edit</button>
                            <button style={{ ...btnBase, height: 28, padding: "0 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#fee2e2", color: "#b91c1c", border: "0.5px solid #fca5a5" }}
                              onClick={() => setDeleteTarget(user)}>Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Footer */}
            {!loading && filteredUsers.length > 0 && (
              <div style={{ padding: "8px 16px", borderTop: "0.5px solid #eef0fc", background: "#fafbff", fontSize: 12, color: T_MUTED }}>
                {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
                {(search || roleFilter !== "all" || statusFilter !== "all") && " matching filters"}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── ROLES & PERMISSIONS TAB ── */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          <p style={{ fontSize: 13, color: T_SECONDARY }}>
            Permission matrix — rows show system functions, columns show roles. Tick means the role has that permission.
          </p>
          <PermissionMatrix rolePermissions={rolePermissions} />
        </TabsContent>
      </Tabs>

      {/* ── Invite / Edit User modal ── */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? `Edit User — ${editingUser.name}` : "Invite User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[
              { label: "Name",  field: "user_name", type: "text",  placeholder: "e.g. Ahmad Faiz",       required: true },
              { label: "Email", field: "email",     type: "email", placeholder: "e.g. ahmad@acme.com",   required: !editingUser },
            ].map(({ label, field, type, placeholder, required }) => (
              <div key={field} className="space-y-1">
                <label style={{ fontSize: 12, fontWeight: 600, color: T_LABEL }}>
                  {label} {required && <span style={{ color: "#e03131" }}>*</span>}
                </label>
                <Input type={type} placeholder={placeholder} value={userForm[field]}
                  onChange={(e) => setUserForm((c) => ({ ...c, [field]: e.target.value }))} disabled={saving} />
              </div>
            ))}
            <div className="space-y-1">
              <label style={{ fontSize: 12, fontWeight: 600, color: T_LABEL }}>Role <span style={{ color: "#e03131" }}>*</span></label>
              <Select value={userForm.role_id || "none"} onValueChange={(v) => setUserForm((c) => ({ ...c, role_id: v === "none" ? "" : v }))} disabled={saving}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select role</SelectItem>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label style={{ fontSize: 12, fontWeight: 600, color: T_LABEL }}>Warehouse <span style={{ color: "#e03131" }}>*</span></label>
              <Select value={userForm.warehouse_id || "none"} onValueChange={(v) => setUserForm((c) => ({ ...c, warehouse_id: v === "none" ? "" : v }))} disabled={saving}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select warehouse</SelectItem>
                  {WAREHOUSE_OPTIONS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editingUser && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
                <Checkbox id="is-active" checked={userForm.is_active}
                  onCheckedChange={(v) => setUserForm((c) => ({ ...c, is_active: Boolean(v) }))} disabled={saving} />
                <Label htmlFor="is-active" style={{ cursor: "pointer", fontSize: 13, color: T_PRIMARY }}>Active</Label>
              </div>
            )}
            {formError && <p style={{ fontSize: 12, color: "#991b1b" }}>{formError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button style={btnNeutral} onClick={() => setShowUserModal(false)} disabled={saving}>Back</button>
              <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editingUser ? "Save Changes" : "Invite User"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete modal ── */}
      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirming={deleting}
        title={deleteTarget ? `Delete ${deleteTarget.name}` : "Delete User"}
        description={deleteTarget ? `Delete ${deleteTarget.name} (${deleteTarget.id})? This cannot be undone.` : ""}
      />
    </AppLayout>
  );
};

export default UsersRolesPage;