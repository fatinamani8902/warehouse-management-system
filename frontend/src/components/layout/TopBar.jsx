import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { tenants } from "@/data/mockData";
import { Search, Bell, ChevronDown, LogOut, Shield, Building2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const ROLE_CONFIG = {
  superadmin:       { label: "Super Admin", bg: "#FEE2E2", color: "#991B1B" },
  hqadmin:          { label: "HQ Admin",    bg: "#EDE9FE", color: "#5B21B6" },
  warehousemanager: { label: "WH Manager",  bg: "#DBEAFE", color: "#1E40AF" },
  storekeeper:      { label: "Store Keeper",bg: "#D1FAE5", color: "#065F46" },
  auditor:          { label: "Auditor",     bg: "#FEF9C3", color: "#854D0E" },
};

function getInitials(name = "") {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export const TopBar = () => {
  const auth = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [showTenantConfirm, setShowTenantConfirm] = useState(null);

  const roleConfig = ROLE_CONFIG[auth.currentUser?.role] || null;
  const initials = getInitials(auth.currentUser?.name || "");

  const confirmTenantSwitch = () => {
    if (showTenantConfirm) {
      auth.selectTenant(showTenantConfirm);
      setShowTenantConfirm(null);
    }
  };

  return (
    <>
      <header className="h-14 border-b border-border shrink-0 flex items-center overflow-hidden">

        {/* LEFT — context zone, muted background */}
        <div className="flex items-center gap-0 h-full border-r border-border bg-muted/40">
          {/* Tenant Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 h-full px-4 text-xs font-medium text-foreground hover:bg-accent transition-colors border-r border-border/50">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="max-w-[110px] truncate">{auth.getTenantName() || "Select Tenant"}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-popover z-50">
              {auth.getUserTenants().map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => setShowTenantConfirm(t.id)}
                  className="cursor-pointer"
                >
                  {t.name}
                  {t.id === auth.currentTenantId && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">Current</Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Warehouse Selector */}
          {auth.currentTenantId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 h-full px-4 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <Warehouse className="h-3.5 w-3.5 shrink-0" />
                  <span className="max-w-[160px] truncate">
                    {auth.getWarehouseName() || "Select Warehouse"}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-popover z-50">
                {auth.getUserWarehouses().map((w) => (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => auth.selectWarehouse(w.id)}
                    className="cursor-pointer"
                  >
                    {w.name}
                    {w.id === auth.currentWarehouseId && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">Current</Badge>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* RIGHT — white zone: search + actions */}
        <div className="flex-1 flex items-center gap-3 px-4 bg-card h-full">
          {/* Search */}
          <div className="flex-1 max-w-lg relative">
            <Search className={[
              "absolute left-2.5 top-2.5 h-4 w-4 transition-colors duration-150",
              searchFocused ? "text-foreground" : "text-muted-foreground",
            ].join(" ")} />
            <Input
              placeholder="Search SKU, GRN, EPC, Location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="pl-9 h-9 text-sm bg-muted/30 border-border/60 focus:bg-background"
            />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bell */}
          <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center leading-none">
              3
            </span>
          </Button>

          {/* User button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 h-9 pl-1 pr-3 rounded-lg border border-border/60 hover:bg-accent transition-colors">
                {/* Avatar */}
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                  style={{ background: roleConfig?.bg || "#F1EFE8", color: roleConfig?.color || "#5F5E5A" }}
                >
                  {initials}
                </div>
                <div className="text-left leading-tight hidden sm:block">
                  <div className="text-xs font-medium text-foreground leading-tight">{auth.currentUser?.name}</div>
                  {roleConfig && (
                    <div className="text-[10px] leading-tight" style={{ color: roleConfig.color }}>
                      {roleConfig.label}
                    </div>
                  )}
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover z-50 w-52">
              {/* User info header */}
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-medium">{auth.currentUser?.name}</p>
                <p className="text-xs text-muted-foreground">{auth.currentUser?.email}</p>
              </div>
              <DropdownMenuItem onClick={() => setShowSession(true)} className="cursor-pointer mt-1">
                <Shield className="h-3.5 w-3.5 mr-2" /> Session Info
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={auth.signOut} className="text-destructive cursor-pointer">
                <LogOut className="h-3.5 w-3.5 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Session Info Dialog */}
      <Dialog open={showSession} onOpenChange={setShowSession}>
        <DialogContent>
          <DialogHeader><DialogTitle>Session Information</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">User:</span><span>{auth.currentUser?.name}</span>
              <span className="text-muted-foreground">Email:</span><span>{auth.currentUser?.email}</span>
              <span className="text-muted-foreground">Role:</span>
              {roleConfig ? (
                <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: roleConfig.bg, color: roleConfig.color, width: "fit-content" }}>
                  {roleConfig.label}
                </span>
              ) : (
                <Badge variant="outline">{auth.currentUser?.role}</Badge>
              )}
              <span className="text-muted-foreground">Tenant:</span><span className="font-mono text-xs">{auth.currentTenantId}</span>
              <span className="text-muted-foreground">Warehouse:</span><span className="font-mono text-xs">{auth.currentWarehouseId || "—"}</span>
              <span className="text-muted-foreground">Token Expiry:</span>
              <span className="font-mono text-xs">
                {auth.tokenExpiry ? new Date(auth.tokenExpiry).toLocaleTimeString() : "—"}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tenant Switch Confirmation */}
      <Dialog open={!!showTenantConfirm} onOpenChange={() => setShowTenantConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Switch Tenant?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Switching tenants will clear your current warehouse selection. Any unsaved changes will be lost.
          </p>
          <p className="text-sm font-medium">
            Switch to: {tenants.find((t) => t.id === showTenantConfirm)?.name}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTenantConfirm(null)}>Back</Button>
            <Button onClick={confirmTenantSwitch}>Confirm Switch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};