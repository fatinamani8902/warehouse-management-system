import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, Mail, Eye, EyeOff, Package, BarChart3, Truck, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { users } from "@/data/mockData";

const ROLE_LABELS = {
  superadmin:       { label: "Super Admin",    bg: "#FEE2E2", color: "#991B1B" },
  hqadmin:          { label: "HQ Admin",        bg: "#EDE9FE", color: "#5B21B6" },
  warehousemanager: { label: "WH Manager",      bg: "#DBEAFE", color: "#1E40AF" },
  storemanager:     { label: "WH Manager",      bg: "#DBEAFE", color: "#1E40AF" },
  storeoperator:    { label: "Store Operator",  bg: "#D1FAE5", color: "#065F46" }, // ← gantikan storekeeper
  storekeeper:      { label: "Store Operator",  bg: "#D1FAE5", color: "#065F46" }, // ← fallback (backward compat)
  auditor:          { label: "Auditor",         bg: "#FEF9C3", color: "#854D0E" },
};

const DEMO_ACCOUNTS = [
  { email: "john@acme.com",    role: "superadmin"    },
  { email: "hq@acme.com",      role: "hqadmin"       },
  { email: "sarah@acme.com",   role: "storemanager"  },
  { email: "mike@acme.com",    role: "storeoperator" }, // ← ditukar dari storekeeper
  { email: "lisa_op@acme.com", role: "storeoperator" }, // ← Lisa Operator (baru)
  { email: "lisa@acme.com",    role: "auditor"       },
];

const SignIn = () => {
  const [email, setEmail] = useState("john@acme.com");
  const [password, setPassword] = useState("demo");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detectedUser, setDetectedUser] = useState(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Detect user from email input
  useEffect(() => {
    const found = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    setDetectedUser(found || null);
  }, [email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      if (signIn(email, password)) {
        navigate("/select-tenant");
      } else {
        toast({ title: "Sign in failed", description: "Invalid email or password", variant: "destructive" });
      }
      setLoading(false);
    }, 400);
  };

  const roleConfig = detectedUser ? ROLE_LABELS[detectedUser.role] : null;

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between p-10" style={{
        background: "linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0f2744 100%)",
      }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-500 flex items-center justify-center">
            <Package className="h-5 w-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">WMS Portal</span>
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              Warehouse<br />
              <span style={{ color: "#60A5FA" }}>Operations</span><br />
              Made Simple.
            </h1>
            <p className="mt-4 text-slate-400 text-[13px] leading-5 max-w-xs">
              End-to-end warehouse management — from inbound receiving to outbound shipping, all in one platform.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: Package,   text: "Real-time inventory tracking" },
              { icon: BarChart3, text: "Cycle count & adjustments" },
              { icon: Truck,     text: "Inbound to outbound workflow" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md flex items-center justify-center" style={{ background: "rgba(96,165,250,0.15)" }}>
                  <Icon className="h-4 w-4" style={{ color: "#60A5FA" }} />
                </div>
                <span className="text-slate-300 text-[13px] leading-5">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-xs">© 2026 WMS Portal. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Package className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-lg">WMS Portal</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-[22px] leading-[30px] font-bold text-gray-900">Welcome back</h2>
            <p className="text-[13px] leading-5 text-gray-500 mt-1">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email field */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-700">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 h-10"
                  placeholder="you@company.com"
                  required
                />
                {detectedUser && (
                  <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
                )}
              </div>

              {/* Email not found */}
              {email.includes("@") && !detectedUser && (
                <p className="text-xs text-red-500 px-1">No account found for this email</p>
              )}
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-gray-700">Password</Label>
                <button type="button" onClick={() => navigate("/forgot-password")} className="text-xs text-blue-600 hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-9 h-10"
                  placeholder="••••••••"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-10" disabled={loading || !detectedUser}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            <p className="text-xs text-center text-gray-500">
              Don't have an account?{" "}
              <span className="text-gray-400">Contact your system administrator.</span>
            </p>
          </form>

          {/* Demo accounts */}
          <div className="mt-8 pt-6 border-t">
            <p className="text-xs text-gray-400 text-center mb-3">Demo accounts (any password)</p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((acc) => {
                const user = users.find((u) => u.email === acc.email);
                const cfg  = ROLE_LABELS[acc.role] || ROLE_LABELS.auditor;
                if (!user) return null;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => setEmail(acc.email)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-xs transition-colors hover:bg-gray-50 ${
                      email === acc.email ? "border-blue-300 bg-blue-50" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {(user.name || user.user_name || "")
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="text-gray-700">{user.name || user.user_name}</span>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: "1px 7px", borderRadius: 20,
                      background: cfg.bg, color: cfg.color,
                    }}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
