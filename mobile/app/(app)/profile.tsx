import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

interface ConfirmModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ visible, onConfirm, onCancel }: ConfirmModalProps) {
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

interface InfoRowProps {
  label: string;
  value?: string;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const initials    = displayName.slice(0, 2).toUpperCase();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>W</Text>
          </View>
          <Text style={styles.logoText}>WMS Portal</Text>
        </View>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.userName}>{displayName}</Text>
        <Text style={styles.userEmail}>{user?.email || ""}</Text>
      </View>

      {/* Info */}
      <View style={styles.card}>
        <InfoRow label="User ID"   value={user?.user_id} />
        <InfoRow label="Role"      value={user?.role_id} />
        <InfoRow label="Tenant"    value={user?.tenant_id} />
        <InfoRow label="Warehouse" value={user?.warehouse_name || user?.warehouse_id} />
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={() => setShowModal(true)}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <ConfirmModal
        visible={showModal}
        onCancel={() => setShowModal(false)}
        onConfirm={handleLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f5f9" },

  header: {
    backgroundColor: "#0f172a",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  logoRow:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  logoBox:    { width: 30, height: 30, borderRadius: 8, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center" },
  logoLetter: { fontSize: 15, fontWeight: "700", color: "#fff" },
  logoText:   { fontSize: 15, fontWeight: "700", color: "#fff" },
  headerTitle:{ fontSize: 22, fontWeight: "800", color: "#fff" },

  avatarSection: { alignItems: "center", paddingVertical: 28 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#1e40af", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#3b82f6", marginBottom: 12 },
  avatarText: { fontSize: 26, fontWeight: "800", color: "#fff" },
  userName:   { fontSize: 18, fontWeight: "700", color: "#0f172a", marginBottom: 2 },
  userEmail:  { fontSize: 13, color: "#64748b" },

  card: { backgroundColor: "#fff", borderRadius: 14, marginHorizontal: 16, paddingHorizontal: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  infoRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f1f5f9" },
  infoLabel: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  infoValue: { fontSize: 13, color: "#0f172a", fontWeight: "700", maxWidth: "60%", textAlign: "right" },

  signOutBtn: { margin: 24, height: 48, borderRadius: 12, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" },
  signOutText:{ fontSize: 15, fontWeight: "700", color: "#fff" },

  overlay: { flex: 1, backgroundColor: "#00000066", alignItems: "center", justifyContent: "center" },
  modal:   { backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "82%", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },
  modalTitle:    { fontSize: 17, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  modalMessage:  { fontSize: 14, color: "#64748b", lineHeight: 20, marginBottom: 24 },
  modalActions:  { flexDirection: "row", gap: 10 },
  cancelBtn:     { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: "#475569" },
  confirmBtn:    { flex: 1, height: 44, borderRadius: 10, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" },
  confirmBtnText:{ fontSize: 14, fontWeight: "600", color: "#fff" },
});