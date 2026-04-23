import { useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, TouchableWithoutFeedback, ScrollView,
  Platform, StatusBar,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 300);

// ── Menu structure (mirrors portal sidebar) ──────────────────────────────────
const ADMIN_ROLES = ["superadmin"];
const MGR_ROLES   = ["superadmin", "hqadmin", "storemanager", "warehousemanager"];
const ALL_ROLES:string[]   = [];

const menuSections = [
  {
    header: "Overview",
    items: [
      { label: "Dashboard", icon: "🏠", path: "/(app)", roles: ALL_ROLES },
    ],
  },
  {
    header: "Inbound Operations",
    items: [
      { label: "Inbound",      icon: "📥", path: "/(app)/inbound",   roles: ALL_ROLES },
      { label: "Returns",      icon: "↩", path: "/(app)/returns",   roles: ALL_ROLES },
    ],
  },
  {
    header: "Warehouse Operations",
    items: [
      { label: "Putaway",      icon: "📦", path: "/(app)/putaway",   roles: ALL_ROLES },
      { label: "Inventory",    icon: "🗃️",  path: "/(app)/inventory", roles: ALL_ROLES },
      { label: "Picking",      icon: "📋", path: "/(app)/picking",   roles: ALL_ROLES },
      { label: "Packing",      icon: "📫", path: "/(app)/packing",   roles: ALL_ROLES },
    ],
  },
  {
    header: "Outbound Operations",
    items: [
      { label: "Outbound",     icon: "📤",  path: "/(app)/outbound",  roles: ALL_ROLES },
      { label: "Shipping",     icon: "🚚", path: "/(app)/shipping",  roles: ALL_ROLES },
    ],
  },
  {
    header: "Trace & Visibility",
    items: [
      { label: "Trace (QR/RF)", icon: "📡", path: "/(app)/trace",   roles: ALL_ROLES },
    ],
  },
  {
    header: "Master & Config",
    items: [
      { label: "Master Data",    icon: "🗄️", path: "/(app)/master-data", roles: MGR_ROLES },
      { label: "LOV Maintenance",icon: "📝", path: "/(app)/lov",         roles: MGR_ROLES },
    ],
  },
  {
    header: "Administration",
    items: [
      { label: "Users & Roles", icon: "👥", path: "/(app)/users",   roles: MGR_ROLES },
      { label: "Audit Log",     icon: "📄", path: "/(app)/audit",   roles: [...MGR_ROLES, "auditor"] },
      { label: "Settings",      icon: "⚙️", path: "/(app)/settings",roles: ADMIN_ROLES },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  superadmin:       "Super Admin",
  hqadmin:          "HQ Admin",
  warehousemanager: "WH Manager",
  storemanager:     "WH Manager",
  storekeeper:      "Store Keeper",
  auditor:          "Auditor",
};

const ROLE_COLOURS: Record<string, { bg: string; color: string }> = {
  superadmin:       { bg: "#FEE2E2", color: "#991B1B" },
  hqadmin:          { bg: "#EDE9FE", color: "#5B21B6" },
  warehousemanager: { bg: "#DBEAFE", color: "#1E40AF" },
  storemanager:     { bg: "#DBEAFE", color: "#1E40AF" },
  storekeeper:      { bg: "#D1FAE5", color: "#065F46" },
  auditor:          { bg: "#FEF9C3", color: "#854D0E" },
};

interface AppDrawerProps {
  open:    boolean;
  onClose: () => void;
}

export function AppDrawer({ open, onClose }: AppDrawerProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0,            useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(opacity,    { toValue: 1,            useNativeDriver: true, duration: 200 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, useNativeDriver: true, duration: 220 }),
        Animated.timing(opacity,    { toValue: 0,             useNativeDriver: true, duration: 180 }),
      ]).start();
    }
  }, [open]);

  const navigate = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 250);
  };

  const handleLogout = async () => {
    onClose();
    await logout();
    setTimeout(() => router.replace("/(auth)/login"), 300);
  };

  const roleId      = user?.role_id || "readonly";
  const roleLabel   = ROLE_LABELS[roleId]   || roleId;
  const roleColour  = ROLE_COLOURS[roleId]  || { bg: "#f1f5f9", color: "#374151" };
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const initials    = displayName.slice(0, 2).toUpperCase();

  // Filter sections by role
  const visibleSections = menuSections.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.roles.length === 0 || item.roles.includes(roleId)
    ),
  })).filter((section) => section.items.length > 0);

  if (!open && translateX._value === -DRAWER_WIDTH) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity }]} />
      </TouchableWithoutFeedback>

      {/* Drawer panel */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        {/* User header */}
        <View style={styles.drawerHeader}>
          <View style={styles.drawerLogoRow}>
            <View style={styles.drawerLogoBox}>
              <Text style={styles.drawerLogoLetter}>W</Text>
            </View>
            <Text style={styles.drawerLogoText}>WMS Portal</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* User info */}
          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{initials}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.userEmail} numberOfLines={1}>{user?.email || ""}</Text>
            </View>
          </View>

          {/* Role + warehouse badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.roleBadge, { backgroundColor: roleColour.bg }]}>
              <Text style={[styles.roleBadgeText, { color: roleColour.color }]}>{roleLabel}</Text>
            </View>
            {user?.warehouse_name || user?.warehouse_id ? (
              <View style={styles.whBadge}>
                <Text style={styles.whBadgeText}>📦 {user?.warehouse_name || user?.warehouse_id}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Nav items */}
        <ScrollView style={styles.nav} showsVerticalScrollIndicator={false}>
          {visibleSections.map((section, idx) => (
            <View key={section.header}>
              {idx > 0 && <View style={styles.sectionDivider} />}
              <Text style={styles.sectionHeader}>{section.header}</Text>
              {section.items.map((item) => {
                const active = pathname === item.path || pathname.startsWith(item.path.replace("/index", ""));
                return (
                  <TouchableOpacity
                    key={item.path}
                    style={[styles.navItem, active && styles.navItemActive]}
                    onPress={() => navigate(item.path)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.navIcon}>{item.icon}</Text>
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                      {item.label}
                    </Text>
                    {active && <View style={styles.activeIndicator} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Footer — logout */}
        <View style={styles.drawerFooter}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.logoutIcon}>⎋</Text>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
          <Text style={styles.version}>WMS v1.0</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#0f1623",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.06)",
    flexDirection: "column",
  },

  // Header
  drawerHeader: {
    paddingTop: Platform.OS === "ios" ? 56 : (StatusBar.currentHeight || 24) + 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  drawerLogoRow:   { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  drawerLogoBox:   { width: 28, height: 28, borderRadius: 7, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  drawerLogoLetter:{ fontSize: 13, fontWeight: "700", color: "#fff" },
  drawerLogoText:  { fontSize: 15, fontWeight: "600", color: "#fff", marginLeft: 10, flex: 1 },
  closeBtn:        { width: 28, height: 28, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  closeBtnText:    { fontSize: 12, color: "rgba(255,255,255,0.6)" },

  userRow:       { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  userAvatar:    { width: 38, height: 38, borderRadius: 19, backgroundColor: "#1e40af", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#3b82f6" },
  userAvatarText:{ fontSize: 14, fontWeight: "700", color: "#fff" },
  userInfo:      { flex: 1 },
  userName:      { fontSize: 14, fontWeight: "600", color: "#fff", marginBottom: 1 },
  userEmail:     { fontSize: 11, color: "rgba(255,255,255,0.4)" },

  badgeRow:       { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  roleBadge:      { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  roleBadgeText:  { fontSize: 11, fontWeight: "600" },
  whBadge:        { backgroundColor: "#1e3a5f", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  whBadgeText:    { fontSize: 11, color: "#93c5fd", fontWeight: "600" },

  // Nav
  nav: { flex: 1, paddingHorizontal: 8, paddingTop: 8 },

  sectionDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 6, marginHorizontal: 4 },
  sectionHeader:  { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 10, paddingVertical: 5 },

  navItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 9,
    borderRadius: 7, marginBottom: 1,
  },
  navItemActive: { backgroundColor: "#2563eb" },
  navIcon:       { fontSize: 15, width: 20, textAlign: "center" },
  navLabel:      { flex: 1, fontSize: 13.5, color: "rgba(255,255,255,0.55)", fontWeight: "400" },
  navLabelActive:{ color: "#fff", fontWeight: "500" },
  activeIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#93c5fd" },

  // Footer
  drawerFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  logoutBtn:  { flexDirection: "row", alignItems: "center", gap: 10, padding: "10px 12px" as any, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.12)" },
  logoutIcon: { fontSize: 16, color: "#f87171" },
  logoutText: { fontSize: 14, color: "#f87171", fontWeight: "600" },
  version:    { fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" },
});