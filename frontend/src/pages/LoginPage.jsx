import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Store } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await login(f.email, f.password, "buyer");
    setBusy(false);
    if (res.ok) { toast.success(`Welcome back, ${res.user.name}!`); nav("/"); }
    else setErr(res.error);
  };

  return (
    <div className="container-x py-10 md:py-16 grid md:grid-cols-2 gap-10 items-center max-w-5xl">
      <div className="hidden md:block">
        <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-3">Welcome back</div>
        <h1 className="font-heading font-bold text-4xl lg:text-5xl text-charcoal leading-[1.05] tracking-tight mb-4">
          Sign in to shop tiles, paints & décor curated for warm homes.
        </h1>
        <p className="text-charcoal-muted">Track orders, save favourites and get seller-verified deals.</p>
      </div>

      <div className="bg-white border border-border p-6 md:p-8">
        <h2 className="font-heading font-bold text-2xl text-charcoal mb-1">Buyer Login</h2>
        <p className="text-sm text-charcoal-muted mb-6">New here? <Link to="/signup" className="text-terracotta font-medium hover:underline" data-testid="signup-link">Create an account</Link></p>
        <form onSubmit={submit} className="space-y-4">
          <input data-testid="login-email" required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
          <input data-testid="login-password" required type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
          {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
          <button data-testid="login-submit" disabled={busy} className="btn-terracotta w-full">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <div className="my-6 border-t border-border" />
        <Link to="/seller/login" className="flex items-center justify-center gap-2 text-sm text-charcoal hover:text-terracotta" data-testid="seller-login-switch">
          <Store className="w-4 h-4" /> Are you a seller? Login here
        </Link>
      </div>
    </div>
  );
}
