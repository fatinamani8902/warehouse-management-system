import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, PackageOpen, ArrowDownToLine, Warehouse, ClipboardList, Package, Truck, RotateCcw, QrCode, Database, Users, List, FileText, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
const menuSections = [
    {
        header: "Overview",
        items: [
            { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
        ],
    },
    {
        header: "Inbound Operations",
        items: [
            { label: "Inbound", icon: ArrowDownToLine, path: "/inbound", tooltip: "ASN / Goods Receipt / Receiving" },
            { label: "Returns", icon: RotateCcw, path: "/returns", tooltip: "Inbound Returns" },
        ],
    },
    {
        header: "Internal Warehouse Operations",
        items: [
            { label: "Putaway", icon: PackageOpen, path: "/putaway" },
            { label: "Inventory", icon: Warehouse, path: "/inventory" },
            { label: "Picking", icon: ClipboardList, path: "/picking" },
            { label: "Packing", icon: Package, path: "/packing" },
        ],
    },
    {
        header: "Outbound Operations",
  items: [
    { label: "Outbound", icon: Truck, path: "/outbound", tooltip: "Outbound Orders" },
    { label: "Shipping", icon: Truck, path: "/shipping" },
  ],
    },
    {
        header: "Trace & Visibility",
        items: [
            { label: "Trace (QR/RF)", icon: QrCode, path: "/trace", tooltip: "Supports QR and RFID" },
        ],
    },
    {
        header: "Master & Configuration Data",
        items: [
            { label: "Master Data", icon: Database, path: "/master-data" },
            { label: "LOV Maintenance", icon: List, path: "/lov" },
        ],
    },
    {
        header: "Security & Administration",
        items: [
            { label: "Users & Roles", icon: Users, path: "/users" },
            { label: "Audit Log", icon: FileText, path: "/audit" },
            { label: "Settings", icon: Settings, path: "/settings" },
        ],
    },
];
export const AppSidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    return (<aside className={cn("flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200 shrink-0", collapsed ? "w-16" : "w-56")}>
      <div className="flex items-center justify-between h-14 px-3 border-b border-sidebar-border">
        {!collapsed && (<div className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
              <rect x="8" y="8" width="48" height="48" rx="12" fill="#2563eb"/>
              <circle cx="32" cy="32" r="16" fill="#fff"/>
              <text  x="32" y="38" fontSize="18" textAnchor="middle" fill="#2563eb" fontFamily="Arial" fontWeight="bold">W</text>
            </svg>
            <span className="text-base font-semibold text-sidebar-primary whitespace-nowrap">WMS</span>
          </div>)}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded hover:bg-sidebar-accent text-sidebar-muted">
          {collapsed ? <ChevronRight className="h-4 w-4"/> : <ChevronLeft className="h-4 w-4"/>}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {menuSections.map((section, idx) => (<div key={section.header} className="mb-2">
            {/* Section Header */}
            <div className="px-2 py-1 text-xs font-semibold text-sidebar-muted uppercase tracking-wide select-none" title={section.header + ' section'}>
              {section.header}
              {/* Optional tooltip icon */}
            </div>
            {/* Menu Items */}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = location.pathname.startsWith(item.path);
                return (<Link key={item.path} to={item.path} className={cn("flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors", active
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground")} title={item.tooltip || item.label}>
                    <item.icon className="h-4 w-4 shrink-0"/>
                    {!collapsed && (<span className="truncate">
                        {item.label}
                        {item.badge && (<span className="ml-2 px-2 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 font-medium align-middle">{item.badge}</span>)}
                      </span>)}
                  </Link>);
            })}
            </div>
            {/* Divider between groups */}
            {idx < menuSections.length - 1 && (<div className="my-2 border-t border-sidebar-border opacity-50"/>)}
          </div>))}
      </nav>
      {!collapsed && (<div className="px-3 py-3 border-t border-sidebar-border text-xs text-sidebar-muted">
          WMS v1.0 — Mockup
        </div>)}
    </aside>);
};
