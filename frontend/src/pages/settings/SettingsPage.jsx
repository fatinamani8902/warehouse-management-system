import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, Shield, Radio, QrCode, Code, AlertTriangle } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT      = "#3b5bdb";
const T_PRIMARY   = "#111827";
const T_SECONDARY = "#374151";
const T_LABEL     = "#6b7280";
const T_MUTED     = "#9ca3af";

const btnBase    = { cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit", border: "none" };
const btnNeutral = { ...btnBase, height: 40, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, lineHeight: "20px", background: ACCENT, color: "#fff" };
const cardStyle  = { background: "#fff", borderRadius: 12, border: "0.5px solid #e8ebf8", overflow: "hidden", boxShadow: "0 2px 10px rgba(59,91,219,.07)" };

// ── Section card header ───────────────────────────────────────────────────────
function CardHeader({ icon: Icon, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "#fafbff", borderBottom: "0.5px solid #eef0fc" }}>
      <Icon size={14} color={T_LABEL} />
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: "20px", color: T_PRIMARY }}>{title}</span>
    </div>
  );
}

// ── Field label ───────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return <label style={{ fontSize: 12, fontWeight: 500, lineHeight: "16px", color: T_LABEL, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>{children}</label>;
}

// ── Page ──────────────────────────────────────────────────────────────────────
const SettingsPage = () => {
  const { getTenantName, currentTenantId } = useAuth();

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Settings" }]} />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", color: T_PRIMARY, marginBottom: 2 }}>Settings</h1>
        <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>System configuration and preferences</p>
      </div>

      <Tabs defaultValue="tenant">
        <TabsList>
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="dev">Dev Notes</TabsTrigger>
        </TabsList>

        {/* ── TENANT ── */}
        <TabsContent value="tenant" className="mt-4">
          <div style={cardStyle}>
            <CardHeader icon={Building2} title="Tenant Settings" />
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <FieldLabel>Tenant Name</FieldLabel>
                  <Input value={getTenantName()} readOnly style={{ height: 40, fontSize: 13, fontWeight: 400, lineHeight: "20px" }} />
                </div>
                <div>
                  <FieldLabel>Tenant ID</FieldLabel>
                  <Input value={currentTenantId || ""} readOnly style={{ height: 40, fontSize: 13, fontWeight: 400, lineHeight: "20px", fontFamily: "var(--font-mono)" }} />
                </div>
              </div>
              <div>
                <FieldLabel>Default Warehouse</FieldLabel>
                <Input value="WH000001 — Main Distribution Center" readOnly style={{ height: 40, fontSize: 13, fontWeight: 400, lineHeight: "20px" }} />
              </div>
              <div>
                <button style={btnNeutral}>Save Changes</button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── SECURITY ── */}
        <TabsContent value="security" className="mt-4">
          <div style={cardStyle}>
            <CardHeader icon={Shield} title="Security Settings" />
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  { label: "Password Policy",  value: "Min 12 chars, 1 uppercase, 1 number, 1 special" },
                  { label: "Session Timeout",  value: "60 minutes of inactivity" },
                  { label: "JWT Token",        value: "RS256, 1-hour expiry, refresh enabled" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <FieldLabel>{label}</FieldLabel>
                    <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{value}</p>
                  </div>
                ))}
                <div>
                  <FieldLabel>MFA</FieldLabel>
                  <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "#f0f4ff", color: ACCENT, border: "0.5px solid #c7d2fe" }}>
                    Available via Clerk
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── INTEGRATIONS ── */}
        <TabsContent value="integrations" className="mt-4">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={cardStyle}>
              <CardHeader icon={Radio} title="RFID Reader" />
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <FieldLabel>Reader Endpoint</FieldLabel>
                  <Input placeholder="ws://rfid-reader.local:8080" style={{ height: 40, fontSize: 12, fontFamily: "var(--font-mono)" }} />
                </div>
                <div>
                  <FieldLabel>Antenna Power (dBm)</FieldLabel>
                  <Input type="number" defaultValue={25} style={{ height: 40, fontSize: 13, fontWeight: 400, lineHeight: "20px" }} />
                </div>
                <div>
                  <button style={btnNeutral}>Test Connection</button>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <CardHeader icon={QrCode} title="QR Scanner" />
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  "QR scanning uses the device camera or a connected handheld scanner.",
                  "Supported formats: QR Code, Code 128, EAN-13",
                  "For handheld scanners, ensure they are configured in keyboard wedge mode.",
                ].map((text, i) => (
                  <p key={i} style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY }}>{text}</p>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── DEV NOTES ── */}
        <TabsContent value="dev" className="mt-4">
          <div style={{ ...cardStyle, border: "0.5px solid #fde68a" }}>
            <CardHeader icon={Code} title="Developer Notes" />
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Warning banner */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 8, background: "#fffbeb", border: "0.5px solid #fde68a" }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: "#d97706" }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, lineHeight: "20px", color: T_PRIMARY }}>Sensitive information must only be stored in .env files</p>
                  <p style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY, marginTop: 4 }}>API keys, database credentials, JWT secrets, and RFID reader credentials should never be hardcoded in source code or displayed in the UI.</p>
                </div>
              </div>

              {/* .env example */}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "#f9fafb", padding: 12, borderRadius: 8, border: "0.5px solid #e8ebf8", lineHeight: 1.8, color: T_SECONDARY }}>
                <p style={{ color: T_MUTED }}># .env example</p>
                <p>DATABASE_URL=postgresql://...</p>
                <p>JWT_SECRET=••••••••••••••••</p>
                <p>CLERK_SECRET_KEY=••••••••••••••••</p>
                <p>RFID_READER_AUTH=••••••••••••••••</p>
              </div>

              {/* Stack info */}
              <div style={{ fontSize: 13, fontWeight: 400, lineHeight: "20px", color: T_SECONDARY, display: "flex", flexDirection: "column", gap: 4 }}>
                <p><strong style={{ color: T_PRIMARY }}>Frontend:</strong> React app on port 3000</p>
                <p><strong style={{ color: T_PRIMARY }}>Backend:</strong> Node.js API on port 4000</p>
                <p>Both run independently. CORS configured for local dev.</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default SettingsPage;
