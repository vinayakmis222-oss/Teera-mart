import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Store, Phone, Mail } from "lucide-react";

export default function LoginPage() {
  const { login, otpSend, otpVerify } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const redirect = sp.get("redirect") || "/";
  const [tab, setTab] = useState("email");

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

        <div className="grid grid-cols-2 border border-border mb-5">
          <button data-testid="tab-email" onClick={() => setTab("email")} className={`py-2 text-sm font-medium inline-flex items-center justify-center gap-2 ${tab === "email" ? "bg-terracotta text-off-white" : "bg-white text-charcoal hover:bg-off-white-alt"}`}>
            <Mail className="w-4 h-4" /> Email
          </button>
          <button data-testid="tab-otp" onClick={() => setTab("otp")} className={`py-2 text-sm font-medium inline-flex items-center justify-center gap-2 ${tab === "otp" ? "bg-terracotta text-off-white" : "bg-white text-charcoal hover:bg-off-white-alt"}`}>
            <Phone className="w-4 h-4" /> Phone / OTP
          </button>
        </div>

        {tab === "email" ? (
          <EmailForm login={login} onSuccess={(u) => { toast.success(`Welcome, ${u.name}!`); nav(redirect); }} />
        ) : (
          <OtpForm otpSend={otpSend} otpVerify={otpVerify} onSuccess={(u) => { toast.success(`Welcome, ${u.name}!`); nav(redirect); }} />
        )}

        <div className="my-6 border-t border-border" />
        <Link to="/seller/login" className="flex items-center justify-center gap-2 text-sm text-charcoal hover:text-terracotta" data-testid="seller-login-switch">
          <Store className="w-4 h-4" /> Are you a seller? Login here
        </Link>
      </div>
    </div>
  );
}

function EmailForm({ login, onSuccess }) {
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await login(f.email, f.password, "buyer");
    setBusy(false);
    if (res.ok) onSuccess(res.user);
    else setErr(res.error);
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="email-login-form">
      <input data-testid="login-email" required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
      <input data-testid="login-password" required type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
      {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
      <button data-testid="login-submit" disabled={busy} className="btn-terracotta w-full">{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function OtpForm({ otpSend, otpVerify, onSuccess }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    setBusy(true); setErr("");
    const res = await otpSend(phone);
    setBusy(false);
    if (res.ok) { setSent(true); toast.success(`OTP sent — try ${res.demo_otp} (mock)`); }
    else setErr(res.error);
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await otpVerify(phone, otp);
    setBusy(false);
    if (res.ok) onSuccess(res.user);
    else setErr(res.error);
  };

  return (
    <div className="space-y-4" data-testid="otp-login-form">
      <input data-testid="otp-phone" required placeholder="Phone number (10 digits)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} disabled={sent} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none disabled:opacity-70" />
      {!sent ? (
        <button data-testid="otp-send-btn" disabled={busy || phone.length < 10} onClick={send} className="btn-terracotta w-full">{busy ? "Sending…" : "Send OTP"}</button>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <input data-testid="otp-input" required placeholder="6-digit OTP (any code works)" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none tracking-[0.5em] text-center font-heading font-bold text-xl" />
          {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
          <div className="text-[11px] text-charcoal-muted">Demo OTP: any 6-digit number (e.g. 123456)</div>
          <button data-testid="otp-verify-btn" disabled={busy || otp.length !== 6} className="btn-terracotta w-full">{busy ? "Verifying…" : "Verify & sign in"}</button>
          <button type="button" data-testid="otp-resend" onClick={() => { setSent(false); setOtp(""); }} className="text-xs text-terracotta hover:underline">Change number</button>
        </form>
      )}
      {!sent && err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
    </div>
  );
}
