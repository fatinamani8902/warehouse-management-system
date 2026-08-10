import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, PackageOpen, ArrowDownToLine, Warehouse,
  ClipboardList, Package, Truck, RotateCcw, QrCode, Database,
  Users, List, FileText, Settings, ChevronLeft, ChevronRight, LogOut, Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const ADMIN_ROLES = ["superadmin"];
const MGR_ROLES   = ["superadmin", "hqadmin", "warehousemanager", "storemanager"];
const MASTER_VIEW_ROLES = [...MGR_ROLES, "readonly", "viewer", "auditor"];
const ALL_ROLES   = [];

const menuSections = [
  {
    header: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", roles: ALL_ROLES },
    ],
  },
  {
    header: "Inbound Operations",
    items: [
      { label: "Inbound", icon: ArrowDownToLine, path: "/inbound", tooltip: "ASN / Goods Receipt / Receiving", roles: ALL_ROLES },
      { label: "Returns", icon: RotateCcw, path: "/returns", tooltip: "Inbound Returns", roles: ALL_ROLES },
    ],
  },
  {
    header: "Internal Warehouse Operations",
    items: [
      { label: "Putaway",   icon: PackageOpen,  path: "/putaway",   roles: ALL_ROLES },
      { label: "Inventory", icon: Warehouse,     path: "/inventory", roles: ALL_ROLES },
      { label: "Picking",   icon: ClipboardList, path: "/picking",   roles: ALL_ROLES },
      { label: "Packing",   icon: Package,       path: "/packing",   roles: ALL_ROLES },
    ],
  },
  {
    header: "Outbound Operations",
    items: [
      { label: "Outbound", icon: Truck, path: "/outbound", tooltip: "Outbound Orders", roles: ALL_ROLES },
      { label: "Shipping", icon: Truck, path: "/shipping", roles: ALL_ROLES },
    ],
  },
  {
    header: "Trace & Visibility",
    items: [
      { label: "Trace (QR/RF)", icon: QrCode, path: "/trace", tooltip: "Supports QR and RFID", roles: ALL_ROLES },
    ],
  },
  {
    header: "Master & Configuration Data",
    items: [
      { label: "Master Data",     icon: Database, path: "/master-data", roles: MGR_ROLES },
      { label: "Location Taxonomy", icon: Network, path: "/location-taxonomy", roles: MASTER_VIEW_ROLES },
      { label: "LOV Maintenance", icon: List,     path: "/lov",         roles: MGR_ROLES },
    ],
  },
  {
    header: "Security & Administration",
    items: [
      { label: "Users & Roles", icon: Users,    path: "/users",    roles: MGR_ROLES },
      { label: "Audit Log",     icon: FileText, path: "/audit",    roles: [...MGR_ROLES, "auditor"] },
      { label: "Settings",      icon: Settings, path: "/settings", roles: ADMIN_ROLES },
    ],
  },
];

const ROLE_LABELS = {
  superadmin:       "Super Admin",
  hqadmin:          "HQ Admin",
  warehousemanager: "WH Manager",
  storemanager:     "Store Manager",
  storeoperator:    "Store Operator",
  storekeeper:      "Store Keeper",
  auditor:          "Auditor",
  readonly:         "Read Only",
};

const ROLE_COLOURS = {
  superadmin:       { bg: "#FEE2E2", color: "#991B1B" },
  hqadmin:          { bg: "#EDE9FE", color: "#5B21B6" },
  warehousemanager: { bg: "#DBEAFE", color: "#1E40AF" },
  storemanager:     { bg: "#DBEAFE", color: "#1E40AF" },
  storeoperator:    { bg: "#D1FAE5", color: "#065F46" },
  storekeeper:      { bg: "#D1FAE5", color: "#065F46" },
  auditor:          { bg: "#FEF9C3", color: "#854D0E" },
  readonly:         { bg: "#F3F4F6", color: "#374151" },
};

export const AppSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location   = useLocation();
  const auth = useAuth();
  const { currentUser } = auth;
  const userRole   = currentUser?.role || "";

  const visibleSections = menuSections.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      item.roles.length === 0 || item.roles.includes(userRole)
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <aside className={cn(
      "flex flex-col h-screen shrink-0",
      "transition-[width] duration-200 ease-in-out",
      collapsed ? "w-16" : "w-56"
    )}
      style={{ background: "#0f1623", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Header */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              W
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>WMS</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            padding: 6, borderRadius: 6, border: "none", cursor: "pointer",
            background: "transparent", color: "rgba(255,255,255,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginLeft: collapsed ? "auto" : 0, marginRight: collapsed ? "auto" : 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}
        className="no-scrollbar"
      >
        {visibleSections.map((section, idx) => (
          <div key={section.header} style={{ marginBottom: 2 }}>
            {/* Section divider */}
            {idx > 0 && (
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 4px 10px" }} />
            )}
            {/* Section header */}
            {!collapsed && (
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 10px 5px", userSelect: "none" }}>
                {section.header}
              </div>
            )}

            {/* Items */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {section.items.map((item) => {
                const active = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={item.tooltip || (collapsed ? item.label : undefined)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: collapsed ? "8px 0" : "7px 10px",
                      justifyContent: collapsed ? "center" : "flex-start",
                      borderRadius: 7,
                      fontSize: 13.5,
                      fontWeight: active ? 500 : 400,
                      color: active ? "#ffffff" : "rgba(255,255,255,0.55)",
                      background: active ? "#2563eb" : "transparent",
                      textDecoration: "none",
                      transition: "background 0.15s, color 0.15s",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                        e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                      }
                      // active: do nothing — stays solid blue
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "rgba(255,255,255,0.55)";
                      }
                    }}
                  >
                    <item.icon size={16} style={{ flexShrink: 0, opacity: active ? 1 : 0.8 }} />
                    {!collapsed && (
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile + Sign Out */}
      <div style={{ padding: "8px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        {!collapsed ? (
          <div style={{ padding: "10px 10px 6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: ROLE_COLOURS[userRole]?.bg || "#1e293b",
                color: ROLE_COLOURS[userRole]?.color || "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
              }}>
                {(currentUser?.name || "U").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {currentUser?.name || "User"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                  {ROLE_LABELS[userRole] || userRole}
                </div>
              </div>
            </div>
            <button
              onClick={auth.signOut}
              style={{
                width: "100%", height: 32, borderRadius: 6, border: "none",
                background: "rgba(239,68,68,0.12)", color: "#f87171",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.22)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={auth.signOut}
            title="Sign Out"
            style={{
              width: "100%", height: 36, borderRadius: 6, border: "none",
              background: "transparent", color: "rgba(239,68,68,0.7)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(239,68,68,0.7)"; }}
          >
            <LogOut size={16} />
          </button>
        )}
        {!collapsed && (
          <div style={{ padding: "6px 10px 2px", fontSize: 10, color: "rgba(255,255,255,0.18)" }}>
            WMS v1.0 — Mockup
          </div>
        )}
      </div>
    </aside>
  );
};
