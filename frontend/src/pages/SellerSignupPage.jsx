import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";

export default function SellerSignupPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", business_name: "", gst_number: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await register({ ...f, role: "seller" });
    setBusy(false);
    if (res.ok) { toast.success("Welcome, seller!"); nav("/seller/dashboard"); }
    else setErr(res.error);
  };

  return (
    <div className="bg-charcoal text-off-white">
      <div className="container-x py-12 md:py-20 max-w-lg">
        <div className="bg-off-white text-charcoal border border-border p-6 md:p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Become a seller</div>
          <h2 className="font-heading font-bold text-2xl mb-1">Register your business</h2>
          <p className="text-sm text-charcoal-muted mb-6">Already registered? <Link to="/seller/login" className="text-terracotta font-medium hover:underline">Seller login</Link></p>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <input data-testid="seller-signup-name" required placeholder="Owner name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none" />
              <input data-testid="seller-signup-business" required placeholder="Business name" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} className="border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none" />
            </div>
            <input data-testid="seller-signup-email" required type="email" placeholder="Business email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none" />
            <input data-testid="seller-signup-gst" placeholder="GST Number (optional for pending verification)" value={f.gst_number} onChange={(e) => setF({ ...f, gst_number: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none" />
            <input data-testid="seller-signup-password" required type="password" placeholder="Password (min 6 chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-3 outline-none" />
            {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
            <button data-testid="seller-signup-submit" disabled={busy} className="btn-terracotta w-full">{busy ? "Registering…" : "Register & continue"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
