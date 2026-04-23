import { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, StatusBar, ActivityIndicator, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { apiClient } from "@/services/api";

interface Warehouse {
  id?:             string;
  warehouse_id?:   string;
  name?:           string;
  warehouse_name?: string;
  city?:           string;
  country?:        string;
}

// Normalize different API field names
function normalizeWh(wh: Warehouse) {
  return {
    id:      wh.id      || wh.warehouse_id || "",
    name:    wh.name    || wh.warehouse_name || wh.id || wh.warehouse_id || "Warehouse",
    city:    wh.city    || "",
    country: wh.country || "",
  };
}

export default function SelectWarehouseScreen() {
  const router = useRouter();
  const { user, setAuth, token } = useAuthStore();

  const [warehouses, setWarehouses] = useState<ReturnType<typeof normalizeWh>[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selecting,  setSelecting]  = useState("");
  const [error,      setError]      = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res   = await apiClient.get("/master/warehouses");
        const raw   = res.data?.data?.items || res.data?.data || res.data?.items || res.data || [];
        const items = Array.isArray(raw) ? raw : [];
        setWarehouses(items.map(normalizeWh));
      } catch (_) {
        // Fallback stub
        setWarehouses([
          { id: "WH000001", name: "Main Distribution Center", city: "Kuala Lumpur", country: "MY" },
          { id: "WH000002", name: "Overflow Warehouse",       city: "Penang",       country: "MY" },
        ]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSelect = async (wh: ReturnType<typeof normalizeWh>) => {
    if (!user || !token) return;
    try {
      setSelecting(wh.id);
      setError("");
      const updatedUser = { ...user, warehouse_id: wh.id, warehouse_name: wh.name };
      await setAuth(updatedUser, { token });
      router.replace("/(app)");
    } catch (_) {
      setError("Failed to select warehouse. Please try again.");
      setSelecting("");
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>W</Text>
          </View>
          <Text style={styles.logoText}>WMS Portal</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.whIconBox}>
              <Text style={styles.whIconEmoji}>🏭</Text>
            </View>
            <Text style={styles.cardTitle}>Select Warehouse</Text>
            <Text style={styles.cardSub}>Tenant: {user?.tenant_id || "—"}</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color="#3b82f6" style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
              {warehouses.map((wh) => (
                <TouchableOpacity
                  key={wh.id}
                  style={[styles.whBtn, selecting === wh.id && styles.whBtnActive]}
                  onPress={() => handleSelect(wh)}
                  disabled={Boolean(selecting)}
                  activeOpacity={0.75}
                >
                  <View style={styles.whItemIcon}>
                    <Text style={{ fontSize: 18 }}>🏢</Text>
                  </View>
                  <View style={styles.whInfo}>
                    <Text style={styles.whName}>{wh.name}</Text>
                    <Text style={styles.whMeta}>
                      {[wh.city, wh.country].filter(Boolean).join(", ")}
                      {(wh.city || wh.country) ? " · " : ""}{wh.id}
                    </Text>
                  </View>
                  {selecting === wh.id
                    ? <ActivityIndicator size="small" color="#3b82f6" />
                    : <Text style={styles.arrow}>›</Text>
                  }
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },

  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  logoRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBox:    { width: 30, height: 30, borderRadius: 8, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center" },
  logoLetter: { fontSize: 15, fontWeight: "700", color: "#fff" },
  logoText:   { fontSize: 15, fontWeight: "700", color: "#fff" },

  body: { flex: 1, backgroundColor: "#f1f5f9", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },

  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardHeader:  { alignItems: "center", marginBottom: 24 },
  whIconBox:   { width: 56, height: 56, borderRadius: 16, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  whIconEmoji: { fontSize: 28 },
  cardTitle:   { fontSize: 20, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  cardSub:     { fontSize: 13, color: "#64748b" },

  errorBox:  { backgroundColor: "#fee2e2", borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 13, color: "#991b1b", textAlign: "center" },

  list: { maxHeight: 360 },

  whBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
    marginBottom: 10, backgroundColor: "#fff",
  },
  whBtnActive:  { borderColor: "#3b82f6", backgroundColor: "#eff6ff" },
  whItemIcon:   { width: 36, height: 36, borderRadius: 10, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  whInfo:       { flex: 1 },
  whName:       { fontSize: 14, fontWeight: "600", color: "#0f172a", marginBottom: 2 },
  whMeta:       { fontSize: 12, color: "#64748b" },
  arrow:        { fontSize: 20, color: "#94a3b8" },
});