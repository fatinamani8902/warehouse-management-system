import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, PackageOpen, ArrowDownToLine, Warehouse,
  ClipboardList, Package, Truck, RotateCcw, QrCode, Database,
  Users, List, FileText, Settings, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

// Define which roles can see each menu item
// Empty array = all roles can see
// roles: [] = all roles, otherwise specify allowed roles
const ADMIN_ROLES = ["superadmin"]; // Settings: superadmin only
const MGR_ROLES = ["superadmin", "hqadmin", "warehousemanager"];
const ALL_ROLES = [];

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
      { label: "Putaway", icon: PackageOpen, path: "/putaway", roles: ALL_ROLES },
      { label: "Inventory", icon: Warehouse, path: "/inventory", roles: ALL_ROLES },
      { label: "Picking", icon: ClipboardList, path: "/picking", roles: ALL_ROLES },
      { label: "Packing", icon: Package, path: "/packing", roles: ALL_ROLES },
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
      { label: "Master Data", icon: Database, path: "/master-data", roles: MGR_ROLES },
      { label: "LOV Maintenance", icon: List, path: "/lov", roles: MGR_ROLES },
    ],
  },
  {
    header: "Security & Administration",
    items: [
      { label: "Users & Roles", icon: Users, path: "/users", roles: MGR_ROLES },
      { label: "Audit Log", icon: FileText, path: "/audit", roles: [...MGR_ROLES, "auditor"] },
      { label: "Settings", icon: Settings, path: "/settings", roles: ADMIN_ROLES },
    ],
  },
];

const ROLE_LABELS = {
  superadmin:       "Super Admin",
  hqadmin:          "HQ Admin",
  warehousemanager: "WH Manager",
  storekeeper:      "Store Keeper",
  auditor:          "Auditor",
};

const ROLE_COLOURS = {
  superadmin:       { bg: "#FEE2E2", color: "#991B1B" },
  hqadmin:          { bg: "#EDE9FE", color: "#5B21B6" },
  warehousemanager: { bg: "#DBEAFE", color: "#1E40AF" },
  storekeeper:      { bg: "#D1FAE5", color: "#065F46" },
  auditor:          { bg: "#FEF9C3", color: "#854D0E" },
};

export const AppSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { currentUser } = useAuth();
  const userRole = currentUser?.role || "";

  // Filter sections — only show items the user has access to
  const visibleSections = menuSections.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      item.roles.length === 0 || item.roles.includes(userRole)
    ),
  })).filter((section) => section.items.length > 0);

  const roleLabel = ROLE_LABELS[userRole] || userRole;
  const roleColour = ROLE_COLOURS[userRole] || { bg: "#F1EFE8", color: "#5F5E5A" };

  return (
    <aside className={cn(
      "flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0",
      "transition-[width] duration-200 ease-in-out",
      collapsed ? "w-16" : "w-56"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <svg width="32" height="32" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
              <rect x="8" y="8" width="48" height="48" rx="12" fill="#2563eb" />
              <circle cx="32" cy="32" r="16" fill="#fff" />
              <text x="32" y="38" fontSize="18" textAnchor="middle" fill="#2563eb" fontFamily="Arial" fontWeight="bold">W</text>
            </svg>
            <span className="text-base font-semibold text-sidebar-primary whitespace-nowrap">WMS</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "p-1.5 rounded-md transition-all duration-150",
            "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
            "active:scale-95",
            collapsed && "mx-auto"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>



      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {visibleSections.map((section, idx) => (
          <div key={section.header} className="mb-2">
            {!collapsed && (
              <div className="px-2 py-1 text-xs font-semibold text-sidebar-muted uppercase tracking-wide select-none">
                {section.header}
              </div>
            )}
            {collapsed && (
              <div className="px-2 py-1">
                <div className="border-t border-sidebar-border opacity-30" />
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={item.tooltip || item.label}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium",
                      "transition-all duration-150 ease-in-out",
                      "relative overflow-hidden group",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      collapsed && "justify-center px-2"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-sidebar-primary" />
                    )}
                    <item.icon className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-150",
                      "group-hover:scale-110",
                      active && "scale-110"
                    )} />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
            {!collapsed && idx < visibleSections.length - 1 && (
              <div className="my-2 border-t border-sidebar-border opacity-50" />
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-sidebar-border text-xs text-sidebar-muted">
          WMS v1.0 — Mockup
        </div>
      )}
    </aside>
  );
};