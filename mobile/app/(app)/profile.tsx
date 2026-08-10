import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const C = {
  bg:          "#f4f6fb",
  card:        "#ffffff",
  accent:      "#3b5bdb",
  accentLight: "#eef2ff",
  border:      "#e8eaf0",
  t1:          "#111827",
  t2:          "#374151",
  t3:          "#6b7280",
  t4:          "#9ca3af",
  danger:      "#dc2626",
  dangerBg:    "#fee2e2",
  dangerBdr:   "#fca5a5",
};

function ConfirmModal({ visible, onConfirm, onCancel }) {
  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Sign Out</Text>
          <Text style={styles.modalMessage}>
            Are you sure you want to sign out of WMS Portal?
          </Text>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={styles.confirmBtnText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <View style={styles.iconBox}>
          <Ionicons name={icon} size={15} color={C.accent} />
        </View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const router           = useRouter();
  const insets           = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const initials    = displayName.slice(0, 2).toUpperCase();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/(app)")} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <Text style={styles.headerSub}>Account details and preferences</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Avatar card */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userEmail}>{user?.email || ""}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark-outline" size={12} color={C.accent} />
            <Text style={styles.roleBadgeText}>{user?.role_name || user?.role_id || "—"}</Text>
          </View>
        </View>

        {/* Info card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <View style={styles.card}>
            <InfoRow icon="finger-print-outline"  label="User ID"   value={user?.user_id} />
            <InfoRow icon="business-outline"       label="Tenant"    value={user?.tenant_id} />
            <InfoRow icon="location-outline"       label="Warehouse" value={user?.warehouse_name || user?.warehouse_id} />
          </View>
        </View>

        {/* Sign out */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.signOutBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="log-out-outline" size={18} color={C.danger} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      <ConfirmModal
        visible={showModal}
        onCancel={() => setShowModal(false)}
        onConfirm={handleLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 40 },

  // Header
  header: {
    backgroundColor: C.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn:    { marginRight: 4 },
  headerTitle:{ fontSize: 20, fontWeight: "700", color: C.t1 },
  headerSub:  { fontSize: 12, color: C.t3, marginTop: 2 },

  // Avatar
  avatarCard: {
    backgroundColor: C.card,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: C.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    backgroundColor: C.accentLight,
  },
  avatar:     { width: 76, height: 76, borderRadius: 38, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 28, fontWeight: "800", color: "#fff" },
  userName:   { fontSize: 18, fontWeight: "700", color: C.t1, marginBottom: 4 },
  userEmail:  { fontSize: 13, color: C.t3, marginBottom: 12 },
  roleBadge:  { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.accentLight, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  roleBadgeText: { fontSize: 12, fontWeight: "600", color: C.accent },

  // Section
  section:      { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: C.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },

  // Info card
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  infoLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox:   { width: 30, height: 30, borderRadius: 8, backgroundColor: C.accentLight, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 13, color: C.t2, fontWeight: "600" },
  infoValue: { fontSize: 13, color: C.t1, fontWeight: "700", maxWidth: "55%", textAlign: "right" },

  // Sign out
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.dangerBdr,
    backgroundColor: C.dangerBg,
  },
  signOutText: { fontSize: 15, fontWeight: "700", color: C.danger },

  // Modal
  overlay: { flex: 1, backgroundColor: "#00000066", alignItems: "center", justifyContent: "center" },
  modal:   { backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "82%", elevation: 10 },
  modalTitle:    { fontSize: 17, fontWeight: "700", color: C.t1, marginBottom: 8 },
  modalMessage:  { fontSize: 14, color: C.t3, lineHeight: 20, marginBottom: 24 },
  modalActions:  { flexDirection: "row", gap: 10 },
  cancelBtn:     { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: C.t2 },
  confirmBtn:    { flex: 1, height: 44, borderRadius: 10, backgroundColor: C.danger, alignItems: "center", justifyContent: "center" },
  confirmBtnText:{ fontSize: 14, fontWeight: "600", color: "#fff" },
});