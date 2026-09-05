import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, inr } from "../lib/api";
import { ArrowLeft, CheckCircle2, Zap, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const STATUS_META = {
  active: { label: "Active", cls: "bg-sage/15 text-sage" },
  due: { label: "Due", cls: "bg-ochre/15 text-ochre" },
  expired: { label: "Expired", cls: "bg-destructive/10 text-destructive" },
};

export default function SellerSubscriptionPage() {
  const { user, loading } = useAuth();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/seller/subscription").then((r) => setInfo(r.data));
  useEffect(() => { if (user?.role === "seller") load(); }, [user]);

  if (loading || user === null) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/seller/login" replace />;
  if (user.role !== "seller") return <Navigate to="/" replace />;
  if (!info) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;

  const meta = STATUS_META[info.subscription_status] || STATUS_META.due;

  const renew = async () => {
    setBusy(true);
    try {
      const { data: intent } = await api.post("/seller/subscription/create");
      const finish = async (rpo, rpp, rps) => {
        await api.post("/seller/subscription/verify", {
          razorpay_order_id: rpo, razorpay_payment_id: rpp, razorpay_signature: rps,
          demo_mode: !!intent.demo_mode,
        });
        toast.success("Subscription renewed");
        load();
      };
      if (intent.demo_mode) {
        toast.info("Demo payment (no Razorpay keys) — subscription extended");
        await finish(intent.razorpay_order_id, `demo_pay_${Date.now()}`, "demo_signature");
        setBusy(false);
        return;
      }
      if (!window.Razorpay) { toast.error("Payment SDK not loaded"); setBusy(false); return; }
      const rzp = new window.Razorpay({
        key: intent.key_id, amount: intent.amount, currency: intent.currency, order_id: intent.razorpay_order_id,
        name: "TerraMart", description: "Seller subscription", theme: { color: "#C4633A" },
        handler: async (res) => { try { await finish(res.razorpay_order_id, res.razorpay_payment_id, res.razorpay_signature); } catch (e) { toast.error(e.response?.data?.detail || "Verify failed"); } finally { setBusy(false); } },
        modal: { ondismiss: () => { toast.warning("Payment cancelled"); setBusy(false); } },
      });
      rzp.open();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
      setBusy(false);
    }
  };

  const expiryDate = info.subscription_expires_at ? new Date(info.subscription_expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—";

  return (
    <div className="container-x py-8 md:py-12 max-w-3xl" data-testid="subscription-page">
      <Link to="/seller/dashboard" className="inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-terracotta mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>
      <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Seller Subscription</div>
      <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal mb-6">Keep your store live</h1>

      <div className="bg-white border border-border p-6 md:p-8">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Current status</div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs uppercase tracking-widest font-semibold px-2 py-0.5 ${meta.cls}`} data-testid="subscription-status">{meta.label}</span>
              {info.subscription_status === "active" && <span className="text-xs text-charcoal-muted">· {info.subscription_days_left} days left</span>}
            </div>
            <div className="text-sm text-charcoal-muted">
              {info.subscription_status === "active" ? `Renews / expires on ${expiryDate}` : "Renew now to keep your products visible to buyers."}
            </div>
          </div>
          {info.subscription_status !== "active" && <ShieldAlert className="w-10 h-10 text-ochre" />}
          {info.subscription_status === "active" && <CheckCircle2 className="w-10 h-10 text-sage" />}
        </div>

        <div className="grid md:grid-cols-3 gap-4 my-6">
          <Info label="Price / month" value={inr(info.price)} />
          <Info label="Period" value={`${info.period_days} days`} />
          <Info label="Payment" value="Razorpay (UPI · Card · Netbanking)" />
        </div>

        <button
          onClick={renew}
          disabled={busy}
          data-testid="renew-subscription-btn"
          className="btn-terracotta w-full md:w-auto"
        >
          <Zap className="w-4 h-4" /> {info.subscription_status === "active" ? "Extend by 30 days" : "Renew Now"}
        </button>
        <p className="text-[11px] text-charcoal-muted mt-3">
          Subscription price is set by TerraMart admin and can change. Your existing balance is not affected.
        </p>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="border border-border p-4 bg-off-white-alt">
      <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">{label}</div>
      <div className="font-heading font-semibold text-charcoal">{value}</div>
    </div>
  );
}
