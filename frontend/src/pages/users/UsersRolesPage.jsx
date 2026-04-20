import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { roles, permissions, rolePermissions } from "@/data/mockData";
import { Checkbox } from "@/components/ui/checkbox";
import { toSessionContext } from "@/services/api";
import { ShieldCheck } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name = "") {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLOURS = [
  "bg-teal-200 text-teal-800",
  "bg-amber-200 text-amber-800",
  "bg-violet-200 text-violet-800",
  "bg-rose-200 text-rose-800",
  "bg-sky-200 text-sky-800",
  "bg-lime-200 text-lime-800",
];

function avatarColour(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
}

function formatLastLogin(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

const ROLE_OPTIONS = [
  { value: "superadmin", label: "Super Admin" },
  { value: "hqadmin", label: "HQ Admin" },
  { value: "storemanager", label: "Store Manager" },
  { value: "storeoperator", label: "Store Operator" },
  { value: "auditor", label: "Auditor" },
];

const WAREHOUSE_OPTIONS = [
  { value: "WH000001", label: "Main Distribution Center" },
  { value: "WH000002", label: "Overflow Warehouse" },
  { value: "WH000003", label: "Tenant2 Warehouse" },
];

const ADMIN_ROLES = new Set(["superadmin", "hqadmin"]);
const EMPTY_FORM = { user_name: "", email: "", role_id: "", warehouse_id: "", is_active: true };

const GROUP_COLOURS = {
  dashboard: "bg-slate-100 text-slate-700",
  inbound: "bg-blue-100 text-blue-700",
  putaway: "bg-cyan-100 text-cyan-700",
  inventory: "bg-teal-100 text-teal-700",
  picking: "bg-violet-100 text-violet-700",
  packing: "bg-purple-100 text-purple-700",
  shipping: "bg-indigo-100 text-indigo-700",
  returns: "bg-orange-100 text-orange-700",
  trace: "bg-amber-100 text-amber-700",
  masterdata: "bg-lime-100 text-lime-700",
  users: "bg-rose-100 text-rose-700",
  lov: "bg-pink-100 text-pink-700",
  audit: "bg-yellow-100 text-yellow-700",
  settings: "bg-gray-100 text-gray-700",
};

function permColour(perm) {
  const group = perm.split(".")[0];
  return GROUP_COLOURS[group] || "bg-muted text-muted-foreground";
}

// Inline status badge
function StatusDot({ status }) {
  const isActive = status === "active";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${isActive ? "bg-green-500" : "bg-rose-400"}`} />
      <span className={`text-sm capitalize ${isActive ? "text-green-700" : "text-rose-600"}`}>{status}</span>
    </div>
  );
}


// ─── Permission Matrix Data ───────────────────────────────────────────────────

const PERMISSION_MATRIX = [
  {
    module: "Inbound",
    rows: [
      { label: "View ASN / GRN", perm: "inbound.view" },
      { label: "Create ASN / GRN", perm: "inbound.create" },
      { label: "Transition (Submit, Arrive...)", perm: "inbound.transition" },
      { label: "Cancel Documents", perm: "inbound.cancel" },
    ],
  },
  {
    module: "Putaway",
    rows: [
      { label: "View Putaway Tasks", perm: "putaway.view" },
      { label: "Assign Tasks", perm: "putaway.assign" },
      { label: "Mark Exception", perm: "putaway.exception" },
      { label: "Recompute Bin", perm: "putaway.recompute" },
    ],
  },
  {
    module: "Inventory",
    rows: [
      { label: "View Stock Summary", perm: "inventory.view_summary" },
      { label: "View Transactions", perm: "inventory.view_transactions" },
      { label: "View Count Plans", perm: "inventory.view_count_plans" },
      { label: "Create Count Plan", perm: "inventory.create_count_plan" },
      { label: "Execute Count Plan", perm: "inventory.execute_count_plan" },
      { label: "Submit Count Plan", perm: "inventory.submit_count_plan" },
      { label: "Approve Count Plan", perm: "inventory.approve_count_plan" },
      { label: "View Adjustments", perm: "inventory.view_adjustments" },
      { label: "Create Adjustment", perm: "inventory.create_adjustment" },
      { label: "Submit Adjustment", perm: "inventory.submit_adjustment" },
      { label: "Approve Adjustment", perm: "inventory.approve_adjustment" },
    ],
  },
  {
    module: "Picking",
    rows: [
      { label: "View Pick Lists", perm: "picking.view" },
    ],
  },
  {
    module: "Packing",
    rows: [
      { label: "View Pack Orders", perm: "packing.view" },
      { label: "Confirm Packing", perm: "packing.confirm" },
    ],
  },
  {
    module: "Outbound / Shipping",
    rows: [
      { label: "View Orders / Shipments", perm: "outbound.view" },
      { label: "Create Order", perm: "outbound.create" },
      { label: "Release Order", perm: "outbound.release" },
      { label: "Dispatch Shipment", perm: "shipping.dispatch" },
      { label: "Close Shipment", perm: "shipping.close" },
      { label: "Cancel Shipment", perm: "shipping.cancel" },
    ],
  },
  {
    module: "Returns & RMA",
    rows: [
      { label: "View Returns", perm: "returns.view" },
      { label: "Create Return", perm: "returns.create" },
      { label: "Cancel Return", perm: "returns.cancel" },
      { label: "Create RMA", perm: "returns.create_rma" },
      { label: "View / Cancel RMA", perm: "rma.view" },
    ],
  },
  {
    module: "Trace",
    rows: [
      { label: "View Trace Events", perm: "trace.view" },
    ],
  },
  {
    module: "Master Data",
    rows: [
      { label: "View Master Data", perm: "masterdata.view" },
      { label: "Manage Suppliers / Customers", perm: "masterdata.manage" },
      { label: "Manage SKU / Locations", perm: "masterdata.manage_sku" },
    ],
  },
  {
    module: "Users & LOV",
    rows: [
      { label: "View Users", perm: "users.view" },
      { label: "Manage Users", perm: "users.manage" },
      { label: "LOV Maintenance", perm: "lov.manage" },
    ],
  },
  {
    module: "Audit",
    rows: [
      { label: "View Audit Logs", perm: "audit.view" },
    ],
  },
];

const DISPLAY_ROLES = [
  { id: "warehousemanager", label: "Warehouse Manager", short: "WH Mgr" },
  { id: "storekeeper", label: "Store Keeper", short: "Keeper" },
  { id: "auditor", label: "Auditor", short: "Auditor" },
];

function PermissionMatrix({ roles, rolePermissions }) {
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-[280px]">Function</th>
              {DISPLAY_ROLES.map((r) => (
                <th key={r.id} className="px-3 py-3 text-center text-xs font-medium text-muted-foreground min-w-[120px]">
                  <div className="font-semibold text-foreground">{r.short}</div>
                  <div className="font-normal text-muted-foreground mt-0.5">{r.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MATRIX.map((section) => (
              <>
                {/* Module header row */}
                <tr key={`section-${section.module}`} className="bg-muted/20 border-t border-b">
                  <td colSpan={DISPLAY_ROLES.length + 1} className="px-4 py-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.module}</span>
                  </td>
                </tr>
                {/* Permission rows */}
                {section.rows.map((row) => (
                  <tr key={row.perm} className="border-b last:border-0 hover:bg-accent/20">
                    <td className="px-4 py-2 text-sm">{row.label}</td>
                    {DISPLAY_ROLES.map((r) => {
                      const perms = rolePermissions[r.id] || [];
                      const has = perms.some((p) =>
                        p === row.perm ||
                        p.startsWith(row.perm.split(".")[0] + ".")
                      );
                      return (
                        <td key={r.id} className="px-3 py-2 text-center">
                          {has ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 22, height: 22, borderRadius: "50%",
                              background: "#D1FAE5", color: "#065F46", fontSize: 13, fontWeight: 700,
                            }}>✓</span>
                          ) : (
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 22, height: 22, borderRadius: "50%",
                              background: "#F3F4F6", color: "#9CA3AF", fontSize: 13,
                            }}>✗</span>
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
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const UsersRolesPage = () => {
  const auth = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const isAdmin = ADMIN_ROLES.has(session?.role_id);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewAsRole, setViewAsRole] = useState(null);

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
          id: u.user_id,
          name: u.user_name,
          email: u.email || null,
          role: u.role_id,
          status: u.is_active ? "active" : "inactive",
          lastLogin: u.lastLogin || null,
          warehouse_ids: u.warehouse_ids || [],
        })));
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, [session]);

  const uniqueRoles = useMemo(() => [...new Set(users.map((u) => u.role))], [users]);

  const filteredUsers = useMemo(() => users.filter((u) => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(search.toLowerCase())) ||
      u.id.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  }), [users, search, roleFilter, statusFilter]);

  const openInvite = () => {
    setEditingUser(null);
    setUserForm(EMPTY_FORM);
    setFormError("");
    setShowUserModal(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setUserForm({
      user_name: user.name,
      email: user.email || "",
      role_id: user.role,
      warehouse_id: user.warehouse_ids?.[0] || "",
      is_active: user.status === "active",
    });
    setFormError("");
    setShowUserModal(true);
  };

  const handleSave = async () => {
    if (!userForm.user_name.trim()) { setFormError("Name is required"); return; }
    if (!userForm.role_id) { setFormError("Role is required"); return; }
    if (!userForm.warehouse_id) { setFormError("Warehouse is required"); return; }
    if (!editingUser && !userForm.email.trim()) { setFormError("Email is required"); return; }
    try {
      setSaving(true);
      setFormError("");
      const url = editingUser
        ? `${import.meta.env.VITE_API_URL}/api/v1/users/${editingUser.id}`
        : `${import.meta.env.VITE_API_URL}/api/v1/users`;
      const res = await fetch(url, {
        method: editingUser ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": session.tenant_id,
          "x-user-id": session.user_id || "",
          "x-roles": session.role_id || "superadmin",
          "x-warehouse-id": session.warehouse_id || "",
          "x-client-source": "PORTAL",
        },
        body: JSON.stringify({
          user_name: userForm.user_name.trim(),
          email: userForm.email.trim(),
          role_id: userForm.role_id,
          warehouse_ids: [userForm.warehouse_id],
          is_active: userForm.is_active,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Failed to save user");
      const saved = result.data;
      if (editingUser) {
        setUsers((prev) => prev.map((u) => u.id === editingUser.id ? {
          ...u, name: saved.user_name, email: saved.email || null,
          role: saved.role_id, status: saved.is_active ? "active" : "inactive",
          warehouse_ids: saved.warehouse_ids || [],
        } : u));
      } else {
        setUsers((prev) => [...prev, {
          id: saved.user_id, name: saved.user_name, email: saved.email || null,
          role: saved.role_id, status: "active", lastLogin: null,
          warehouse_ids: saved.warehouse_ids || [],
        }]);
      }
      setShowUserModal(false);
    } catch (err) {
      setFormError(err.message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          "x-tenant-id": session.tenant_id,
          "x-user-id": session.user_id || "",
          "x-roles": session.role_id || "superadmin",
          "x-client-source": "PORTAL",
        },
      });
      if (!res.ok) throw new Error("Failed to delete user");
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Users & Roles" }]} />
      <h1 className="text-2xl font-bold mb-1">Users & Roles</h1>
      <p className="text-sm text-muted-foreground mb-4">Manage system users and access permissions</p>

      {!isAdmin && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <ShieldCheck className="h-4 w-4 shrink-0" />
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
          {/* Filter bar — consistent with other pages */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-9 min-w-[200px] flex-1"
                  placeholder="Search name, email, ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <Button variant="outline" className="h-9" onClick={() => setSearch("")}>Clear</Button>
                )}
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="All roles" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {uniqueRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_OPTIONS.find((o) => o.value === r)?.label || r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="All status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" className="h-9" onClick={loadUsers} disabled={loading}>Refresh</Button>
                {isAdmin && (
                  <Button className="h-9" onClick={openInvite}>+ Invite User</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Last Login</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Warehouse</th>
                    {isAdmin && <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">Loading users...</td></tr>
                  )}
                  {!loading && filteredUsers.length === 0 && (
                    <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">No users found.</td></tr>
                  )}
                  {!loading && filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColour(user.name)}`}>
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <p className="leading-tight">{user.name}</p>
                            {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                            <p className="text-xs text-muted-foreground font-mono">{user.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {ROLE_OPTIONS.find((r) => r.value === user.role)?.label || user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusDot status={user.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatLastLogin(user.lastLogin)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {user.warehouse_ids?.map((w) =>
                          WAREHOUSE_OPTIONS.find((opt) => opt.value === w)?.label || w
                        ).join(", ") || "-"}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => openEdit(user)}>Edit</Button>
                            <Button size="sm" variant="destructive" className="h-7 text-[11px] px-2" onClick={() => setDeleteTarget(user)}>Delete</Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && filteredUsers.length > 0 && (
                <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                  {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
                  {(search || roleFilter !== "all" || statusFilter !== "all") && ` matching filters`}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ROLES & PERMISSIONS TAB ── */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Permission matrix — rows show system functions, columns show roles. Tick means the role has that permission.
          </p>
          <PermissionMatrix roles={roles} rolePermissions={rolePermissions} />
        </TabsContent>
      </Tabs>

      {/* ── INVITE / EDIT USER MODAL ── */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? `Edit User — ${editingUser.name}` : "Invite User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Ahmad Faiz" value={userForm.user_name}
                onChange={(e) => setUserForm((c) => ({ ...c, user_name: e.target.value }))} disabled={saving} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email {!editingUser && <span className="text-destructive">*</span>}</Label>
              <Input type="email" placeholder="e.g. ahmad@acme.com" value={userForm.email}
                onChange={(e) => setUserForm((c) => ({ ...c, email: e.target.value }))} disabled={saving} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Role <span className="text-destructive">*</span></Label>
              <Select value={userForm.role_id || "none"} onValueChange={(v) => setUserForm((c) => ({ ...c, role_id: v === "none" ? "" : v }))} disabled={saving}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select role</SelectItem>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Warehouse <span className="text-destructive">*</span></Label>
              <Select value={userForm.warehouse_id || "none"} onValueChange={(v) => setUserForm((c) => ({ ...c, warehouse_id: v === "none" ? "" : v }))} disabled={saving}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select warehouse</SelectItem>
                  {WAREHOUSE_OPTIONS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editingUser && (
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="is-active" checked={userForm.is_active}
                  onCheckedChange={(v) => setUserForm((c) => ({ ...c, is_active: Boolean(v) }))} disabled={saving} />
                <Label htmlFor="is-active" className="cursor-pointer text-sm">Active</Label>
              </div>
            )}
            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setShowUserModal(false)} disabled={saving}>Back</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingUser ? "Save Changes" : "Invite User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM ── */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? `Delete ${deleteTarget.name}` : "Delete User"}
        description={deleteTarget ? `Delete ${deleteTarget.name} (${deleteTarget.id})? This cannot be undone.` : ""}
        confirmLabel={deleting ? "Deleting..." : "Confirm"}
        cancelLabel="Back"
        variant="destructive"
      />
    </AppLayout>
  );
};

export default UsersRolesPage;