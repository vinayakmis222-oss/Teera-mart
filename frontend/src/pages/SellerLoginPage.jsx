import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Store, TrendingUp, ShieldCheck, Truck } from "lucide-react";

export default function SellerLoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await login(f.email, f.password, "seller");
    setBusy(false);
    if (res.ok) { toast.success("Welcome back!"); nav("/seller/dashboard"); }
    else setErr(res.error);
  };

  return (
    <div className="bg-charcoal text-off-white -mt-[1px]">
      <div className="container-x py-12 md:py-20 grid md:grid-cols-2 gap-10 items-center max-w-5xl">
        <div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-4">
            <Store className="w-4 h-4" /> Sell on TerraMart
          </div>
          <h1 className="font-heading font-bold text-4xl lg:text-5xl leading-[1.05] tracking-tight mb-4">
            Reach India&apos;s most design-conscious buyers.
          </h1>
          <p className="text-off-white/70 mb-6">List construction materials & décor. Get discovered by architects, homeowners and interior designers.</p>
          <div className="grid grid-cols-3 gap-3 text-off-white/80 text-xs">
            <div className="flex items-center gap-2 border border-off-white/20 p-3"><TrendingUp className="w-4 h-4 text-terracotta" /> Lower fees</div>
            <div className="flex items-center gap-2 border border-off-white/20 p-3"><ShieldCheck className="w-4 h-4 text-terracotta" /> GST verified</div>
            <div className="flex items-center gap-2 border border-off-white/20 p-3"><Truck className="w-4 h-4 text-terracotta" /> Logistics support</div>
          </div>
        </div>

        <div className="bg-off-white text-charcoal border border-border p-6 md:p-8">
          <h2 className="font-heading font-bold text-2xl mb-1">Seller Login</h2>
          <p className="text-sm text-charcoal-muted mb-6">New seller? <Link to="/seller/signup" className="text-terracotta font-medium hover:underline" data-testid="seller-signup-link">Register your business</Link></p>
          <form onSubmit={submit} className="space-y-4">
            <input data-testid="seller-login-email" required type="email" placeholder="Business email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none" />
            <input data-testid="seller-login-password" required type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none" />
            {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
            <button data-testid="seller-login-submit" disabled={busy} className="btn-terracotta w-full">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <div className="my-6 border-t border-border" />
          <Link to="/login" className="block text-center text-sm text-charcoal-muted hover:text-terracotta" data-testid="buyer-login-switch">
            Shopping instead? Buyer login
          </Link>
        </div>
      </div>
    </div>
  );
}
