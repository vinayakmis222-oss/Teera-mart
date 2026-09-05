import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, LockKeyhole } from "lucide-react";

export default function AdminLoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user && user.role === "admin") return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await login(f.email, f.password, "admin");
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    if (res.user?.role !== "admin") { setErr("Not an admin account"); return; }
    toast.success("Welcome, admin");
    nav("/admin");
  };

  return (
    <div className="bg-charcoal text-off-white">
      <div className="container-x py-16 md:py-24 max-w-md">
        <div className="bg-off-white text-charcoal border border-border p-6 md:p-8" data-testid="admin-login-card">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-3">
            <ShieldCheck className="w-4 h-4" /> Admin access
          </div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-charcoal mb-1">Admin Login</h1>
          <p className="text-sm text-charcoal-muted mb-6 inline-flex items-center gap-1"><LockKeyhole className="w-3 h-3" /> Separate from buyer &amp; seller logins</p>
          <form onSubmit={submit} className="space-y-4">
            <input
              data-testid="admin-email"
              required
              type="email"
              placeholder="Admin email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none"
            />
            <input
              data-testid="admin-password"
              required
              type="password"
              placeholder="Password"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none"
            />
            {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2" data-testid="admin-login-error">{err}</div>}
            <button data-testid="admin-login-submit" disabled={busy} className="btn-terracotta w-full">
              {busy ? "Signing in…" : "Sign in as Admin"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
