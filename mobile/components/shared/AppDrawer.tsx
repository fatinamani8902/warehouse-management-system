import { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, TouchableWithoutFeedback, ScrollView,
  Platform, StatusBar,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 300);

const menuSections = [
  {
    header: "Overview",
    items: [
      { label: "Dashboard", icon: "🏠", path: "/(app)", key: "dashboard" },
    ],
  },
  {
    header: "Inbound",
    items: [
      { label: "Inbound", icon: "📥", path: "/(app)/inbound", key: "inbound" },
    ],
  },
  {
    header: "Warehouse",
    items: [
      { label: "Putaway",   icon: "📦", path: "/(app)/putaway",   key: "putaway" },
      { label: "Inventory", icon: "🗃️", path: "/(app)/inventory", key: "inventory" },
      { label: "Picking",   icon: "📋", path: "/(app)/picking",   key: "picking" },
      { label: "Packing",   icon: "📫", path: "/(app)/packing",   key: "packing" },
    ],
  },
  {
    header: "Outbound",
    items: [
      { label: "Shipping", icon: "🚚", path: "/(app)/shipping" },
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
  open: boolean;
  onClose: () => void;
}

export function AppDrawer({ open, onClose }: AppDrawerProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const [mounted, setMounted]  = useState(open);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0,             useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(opacity,    { toValue: 1,             useNativeDriver: true, duration: 200 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, useNativeDriver: true, duration: 220 }),
        Animated.timing(opacity,    { toValue: 0,             useNativeDriver: true, duration: 180 }),
      ]).start(() => setMounted(false));
    }
  }, [open]);

  if (!mounted) return null;

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
  const roleLabel   = ROLE_LABELS[roleId]  || roleId;
  const roleColour  = ROLE_COLOURS[roleId] || { bg: "#f1f5f9", color: "#374151" };
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const initials    = displayName.slice(0, 2).toUpperCase();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity }]} />
      </TouchableWithoutFeedback>

      {/* Drawer panel */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        {/* Header */}
        <View style={styles.drawerHeader}>
          <View style={styles.drawerLogoRow}>
            <View style={styles.drawerLogoBox}>
              <Text style={styles.drawerLogoLetter}>W</Text>
            </View>
            <Text style={styles.drawerLogoText}>WMS Mobile</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{initials}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.userEmail} numberOfLines={1}>{user?.email || ""}</Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            <View style={[styles.roleBadge, { backgroundColor: roleColour.bg }]}>
              <Text style={[styles.roleBadgeText, { color: roleColour.color }]}>{roleLabel}</Text>
            </View>
            {(user?.warehouse_name || user?.warehouse_id) ? (
              <View style={styles.whBadge}>
                <Text style={styles.whBadgeText}>📦 {user?.warehouse_name || user?.warehouse_id}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Nav */}
        <ScrollView style={styles.nav} showsVerticalScrollIndicator={false}>
          {menuSections.map((section, idx) => ( // ← guna visibleSections
            <View key={section.header}>
              {idx > 0 && <View style={styles.sectionDivider} />}
              <Text style={styles.sectionHeader}>{section.header}</Text>
              {section.items.map((item) => {
                const active = pathname === item.path || pathname.startsWith(item.path + "/");
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

        {/* Footer */}
        <View style={styles.drawerFooter}>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigate("/(app)/profile")}
            activeOpacity={0.8}
          >
            <Text style={styles.profileIcon}>👤</Text>
            <Text style={styles.profileText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.logoutIcon}>⎋</Text>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
          <Text style={styles.version}>WMS Mobile v1.0</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop:         { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  drawer:           { position: "absolute", left: 0, top: 0, bottom: 0, width: DRAWER_WIDTH, backgroundColor: "#0f1623", borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.06)", flexDirection: "column" },
  drawerHeader:     { paddingTop: Platform.OS === "ios" ? 56 : (StatusBar.currentHeight || 24) + 12, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  drawerLogoRow:    { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  drawerLogoBox:    { width: 28, height: 28, borderRadius: 7, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  drawerLogoLetter: { fontSize: 13, fontWeight: "700", color: "#fff" },
  drawerLogoText:   { fontSize: 15, fontWeight: "600", color: "#fff", marginLeft: 10, flex: 1 },
  closeBtn:         { width: 28, height: 28, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  closeBtnText:     { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  userRow:          { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  userAvatar:       { width: 38, height: 38, borderRadius: 19, backgroundColor: "#1e40af", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#3b82f6" },
  userAvatarText:   { fontSize: 14, fontWeight: "700", color: "#fff" },
  userInfo:         { flex: 1 },
  userName:         { fontSize: 14, fontWeight: "600", color: "#fff", marginBottom: 1 },
  userEmail:        { fontSize: 11, color: "rgba(255,255,255,0.4)" },
  badgeRow:         { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  roleBadge:        { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  roleBadgeText:    { fontSize: 11, fontWeight: "600" },
  whBadge:          { backgroundColor: "#1e3a5f", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  whBadgeText:      { fontSize: 11, color: "#93c5fd", fontWeight: "600" },
  nav:              { flex: 1, paddingHorizontal: 8, paddingTop: 8 },
  sectionDivider:   { height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 6, marginHorizontal: 4 },
  sectionHeader:    { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 10, paddingVertical: 5 },
  navItem:          { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 7, marginBottom: 1 },
  navItemActive:    { backgroundColor: "#2563eb" },
  navIcon:          { fontSize: 16, width: 22, textAlign: "center" },
  navLabel:         { flex: 1, fontSize: 14, color: "rgba(255,255,255,0.55)", fontWeight: "400" },
  navLabelActive:   { color: "#fff", fontWeight: "600" },
  activeIndicator:  { width: 6, height: 6, borderRadius: 3, backgroundColor: "#93c5fd" },
  drawerFooter:     { padding: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", gap: 8 },
  profileBtn:       { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)" },
  profileIcon:      { fontSize: 16 },
  profileText:      { fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  logoutBtn:        { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.12)" },
  logoutIcon:       { fontSize: 16, color: "#f87171" },
  logoutText:       { fontSize: 14, color: "#f87171", fontWeight: "600" },
  version:          { fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" },
});