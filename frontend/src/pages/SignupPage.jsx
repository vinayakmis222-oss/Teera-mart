import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";

export default function SignupPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await register({ ...f, role: "buyer" });
    setBusy(false);
    if (res.ok) { toast.success("Welcome to TerraMart!"); nav("/"); }
    else setErr(res.error);
  };

  return (
    <div className="container-x py-10 md:py-16 max-w-md">
      <div className="bg-white border border-border p-6 md:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Buyer signup</div>
        <h2 className="font-heading font-bold text-2xl text-charcoal mb-1">Create your account</h2>
        <p className="text-sm text-charcoal-muted mb-6">Already have one? <Link to="/login" className="text-terracotta font-medium hover:underline">Sign in</Link></p>
        <form onSubmit={submit} className="space-y-4">
          <input data-testid="signup-name" required placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
          <input data-testid="signup-email" required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
          <input data-testid="signup-password" required type="password" placeholder="Password (min 6 chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
          {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
          <button data-testid="signup-submit" disabled={busy} className="btn-terracotta w-full">{busy ? "Creating…" : "Create account"}</button>
        </form>
      </div>
    </div>
  );
}
