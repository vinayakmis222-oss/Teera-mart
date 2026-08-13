import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Phone, Mail } from "lucide-react";

export default function SignupPage() {
  const { register, otpSend, otpVerify } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("email");

  return (
    <div className="container-x py-10 md:py-16 max-w-md">
      <div className="bg-white border border-border p-6 md:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Buyer signup</div>
        <h2 className="font-heading font-bold text-2xl text-charcoal mb-1">Create your account</h2>
        <p className="text-sm text-charcoal-muted mb-6">Already have one? <Link to="/login" className="text-terracotta font-medium hover:underline">Sign in</Link></p>

        <div className="grid grid-cols-2 border border-border mb-5">
          <button data-testid="signup-tab-email" onClick={() => setTab("email")} className={`py-2 text-sm font-medium inline-flex items-center justify-center gap-2 ${tab === "email" ? "bg-terracotta text-off-white" : "bg-white text-charcoal hover:bg-off-white-alt"}`}>
            <Mail className="w-4 h-4" /> Email
          </button>
          <button data-testid="signup-tab-otp" onClick={() => setTab("otp")} className={`py-2 text-sm font-medium inline-flex items-center justify-center gap-2 ${tab === "otp" ? "bg-terracotta text-off-white" : "bg-white text-charcoal hover:bg-off-white-alt"}`}>
            <Phone className="w-4 h-4" /> Phone / OTP
          </button>
        </div>

        {tab === "email" ? <EmailSignup register={register} onSuccess={() => { toast.success("Welcome to TerraMart!"); nav("/"); }} /> : <OtpSignup otpSend={otpSend} otpVerify={otpVerify} onSuccess={() => { toast.success("Welcome to TerraMart!"); nav("/"); }} />}
      </div>
    </div>
  );
}

function EmailSignup({ register, onSuccess }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await register({ ...f, role: "buyer" });
    setBusy(false);
    if (res.ok) onSuccess();
    else setErr(res.error);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <input data-testid="signup-name" required placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
      <input data-testid="signup-email" required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
      <input data-testid="signup-password" required type="password" placeholder="Password (min 6 chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
      {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
      <button data-testid="signup-submit" disabled={busy} className="btn-terracotta w-full">{busy ? "Creating…" : "Create account"}</button>
    </form>
  );
}

function OtpSignup({ otpSend, otpVerify, onSuccess }) {
  const [name, setName] = useState("");
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
    const res = await otpVerify(phone, otp, name);
    setBusy(false);
    if (res.ok) onSuccess();
    else setErr(res.error);
  };

  return (
    <div className="space-y-4">
      <input data-testid="signup-otp-name" required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} disabled={sent} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none disabled:opacity-70" />
      <input data-testid="signup-otp-phone" required placeholder="Phone number (10 digits)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} disabled={sent} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none disabled:opacity-70" />
      {!sent ? (
        <button data-testid="signup-otp-send" disabled={busy || !name || phone.length < 10} onClick={send} className="btn-terracotta w-full">{busy ? "Sending…" : "Send OTP"}</button>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <input data-testid="signup-otp-code" required placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none tracking-[0.5em] text-center font-heading font-bold text-xl" />
          {err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
          <div className="text-[11px] text-charcoal-muted">Demo OTP: any 6-digit number (e.g. 123456)</div>
          <button data-testid="signup-otp-verify" disabled={busy || otp.length !== 6} className="btn-terracotta w-full">{busy ? "Creating…" : "Verify & create"}</button>
        </form>
      )}
      {!sent && err && <div className="text-sm text-destructive bg-destructive/10 px-3 py-2">{err}</div>}
    </div>
  );
}
