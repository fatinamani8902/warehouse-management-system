import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { apiClient } from "@/services/api";

const DEMO_ACCOUNTS = [
  { initials: "JA", name: "John Admin",    email: "john@acme.com",    role: "superadmin",       roleLabel: "Super Admin",  color: "#fee2e2", textColor: "#991b1b" },
  { initials: "HA", name: "HQ Admin",      email: "hq@acme.com",      role: "hqadmin",          roleLabel: "HQ Admin",     color: "#fef9c3", textColor: "#854d0e" },
  { initials: "SM", name: "Sarah Manager", email: "sarah@acme.com",   role: "storemanager",     roleLabel: "WH Manager",   color: "#dbeafe", textColor: "#1e40af" },
  { initials: "MO", name: "Mike Operator", email: "mike@acme.com",    role: "storekeeper",      roleLabel: "Store Keeper", color: "#dcfce7", textColor: "#166534" },
  { initials: "LA", name: "Lisa Auditor",  email: "lisa@acme.com",    role: "auditor",          roleLabel: "Auditor",      color: "#fef9c3", textColor: "#854d0e" },
];

export default function LoginScreen() {
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const { setAuth } = useAuthStore();
  const router = useRouter();

  const handleLogin = async (overrideEmail?: string, overrideRole?: string) => {
    const loginEmail = overrideEmail || email.trim();
    const loginPass  = password.trim() || "demo1234";

    if (!loginEmail) {
      setError("Email and password are required");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await apiClient.post(
        "/auth/login",
        { email: loginEmail, password: loginPass },
        overrideRole ? { headers: { "x-roles": overrideRole } } : {},
      );

      const { user, session } = res.data;
      await setAuth(user, session);
      router.replace("/(auth)/select-warehouse");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (account: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(account.email);
    setPassword("demo1234");
    handleLogin(account.email, account.role);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Top dark branding */}
      <View style={styles.top}>
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>W</Text>
          </View>
          <Text style={styles.logoText}>WMS Portal</Text>
        </View>
        <Text style={styles.headline}>
          Warehouse{"\n"}
          <Text style={styles.headlineBlue}>Operations{"\n"}</Text>
          Made Simple.
        </Text>
        <Text style={styles.subtext}>
          End-to-end warehouse management — from inbound receiving to outbound shipping.
        </Text>
      </View>

      {/* Bottom white form */}
      <KeyboardAvoidingView
        style={styles.formWrapper}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.welcome}>Welcome back</Text>
          <Text style={styles.welcomeSub}>Sign in to your account to continue</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Email */}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={(v) => { setEmail(v); setError(""); }}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, { paddingRight: 44, marginBottom: 0 }]}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(""); }}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁"}</Text>
            </TouchableOpacity>
          </View>

          {/* Sign In */}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={() => handleLogin()}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Sign In</Text>
            }
          </TouchableOpacity>

          <Text style={styles.noAccount}>
            Don't have an account?{" "}
            <Text style={styles.noAccountMuted}>Contact your system administrator.</Text>
          </Text>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Demo accounts (any password)</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Demo accounts */}
          <View style={styles.demoList}>
            {DEMO_ACCOUNTS.map((account) => (
              <TouchableOpacity
                key={account.email}
                style={styles.demoRow}
                onPress={() => handleDemoLogin(account)}
                disabled={loading}
                activeOpacity={0.7}
              >
                <View style={[styles.demoAvatar, { backgroundColor: account.color }]}>
                  <Text style={[styles.demoAvatarText, { color: account.textColor }]}>
                    {account.initials}
                  </Text>
                </View>
                <Text style={styles.demoName}>{account.name}</Text>
                <View style={[styles.demoRoleBadge, { backgroundColor: account.color }]}>
                  <Text style={[styles.demoRoleText, { color: account.textColor }]}>
                    {account.roleLabel}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },

  top: {
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  logoRow:      { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 28 },
  logoBox:      { width: 36, height: 36, borderRadius: 9, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center" },
  logoLetter:   { fontSize: 18, fontWeight: "700", color: "#fff" },
  logoText:     { fontSize: 17, fontWeight: "700", color: "#fff" },
  headline:     { fontSize: 30, fontWeight: "800", color: "#fff", lineHeight: 38, marginBottom: 12 },
  headlineBlue: { color: "#60a5fa" },
  subtext:      { fontSize: 13, color: "#94a3b8", lineHeight: 20, maxWidth: 280 },

  formWrapper: { flex: 1, backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  formScroll:  { padding: 28, paddingBottom: 48 },
  welcome:     { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 4 },
  welcomeSub:  { fontSize: 13, color: "#6b7280", marginBottom: 24 },

  errorBox:  { backgroundColor: "#fee2e2", borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 13, color: "#991b1b", textAlign: "center" },

  label:        { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  inputWrapper: { position: "relative", marginBottom: 14 },
  input: {
    height: 46, borderWidth: 0.5, borderColor: "#d1d5db",
    borderRadius: 10, paddingHorizontal: 14,
    fontSize: 14, color: "#111827", backgroundColor: "#fafafa",
    marginBottom: 14,
  },
  eyeBtn:  { position: "absolute", right: 12, top: 12 },
  eyeText: { fontSize: 16 },

  btn:         { height: 48, borderRadius: 10, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 16 },
  btnDisabled: { opacity: 0.6 },
  btnText:     { fontSize: 15, fontWeight: "600", color: "#fff" },

  noAccount:      { fontSize: 12, color: "#6b7280", textAlign: "center", marginBottom: 24 },
  noAccountMuted: { color: "#9ca3af" },

  divider:     { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  dividerText: { fontSize: 11, color: "#9ca3af", textAlign: "center" },

  demoList: { gap: 8 },
  demoRow: {
    flexDirection: "row", alignItems: "center",
    gap: 12, padding: 12,
    borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9",
    backgroundColor: "#fafafa",
  },
  demoAvatar:     { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  demoAvatarText: { fontSize: 12, fontWeight: "700" },
  demoName:       { flex: 1, fontSize: 14, fontWeight: "500", color: "#111827" },
  demoRoleBadge:  { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  demoRoleText:   { fontSize: 11, fontWeight: "600" },
});