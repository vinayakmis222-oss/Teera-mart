import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, inr } from "../lib/api";
import { ArrowLeft, IndianRupee, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function SellerDuesPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/seller/dues").then((r) => setData(r.data));
  useEffect(() => { if (user?.role === "seller") load(); }, [user]);

  if (loading || user === null) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/seller/login" replace />;
  if (user.role !== "seller") return <Navigate to="/" replace />;
  if (!data) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;

  const total = data.seller.pending_dues;
  const payAmount = amount ? Math.min(parseFloat(amount) || 0, total) : total;

  const pay = async () => {
    if (total <= 0) return;
    setBusy(true);
    try {
      const payload = amount ? { amount: parseFloat(amount) } : {};
      const { data: intent } = await api.post("/seller/dues/pay/create", payload);
      const finish = async (rpo, rpp, rps) => {
        await api.post("/seller/dues/pay/verify", {
          razorpay_order_id: rpo, razorpay_payment_id: rpp, razorpay_signature: rps,
          demo_mode: !!intent.demo_mode, amount: intent.amount_rupees,
        });
        toast.success("Dues cleared");
        setAmount("");
        load();
      };
      if (intent.demo_mode) {
        toast.info("Demo payment — dues cleared");
        await finish(intent.razorpay_order_id, `demo_pay_${Date.now()}`, "demo_signature");
        setBusy(false);
        return;
      }
      if (!window.Razorpay) { toast.error("Payment SDK not loaded"); setBusy(false); return; }
      const rzp = new window.Razorpay({
        key: intent.key_id, amount: intent.amount, currency: intent.currency, order_id: intent.razorpay_order_id,
        name: "TerraMart", description: "Commission dues", theme: { color: "#C4633A" },
        handler: async (res) => { try { await finish(res.razorpay_order_id, res.razorpay_payment_id, res.razorpay_signature); } catch (e) { toast.error(e.response?.data?.detail || "Verify failed"); } finally { setBusy(false); } },
        modal: { ondismiss: () => { toast.warning("Payment cancelled"); setBusy(false); } },
      });
      rzp.open();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
      setBusy(false);
    }
  };

  return (
    <div className="container-x py-8 md:py-12" data-testid="dues-page">
      <Link to="/seller/dashboard" className="inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-terracotta mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>
      <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Commission dues</div>
      <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal mb-6">Pay Dues</h1>

      {data.seller.effective_paused && (
        <div className="mb-6 bg-destructive/10 border border-destructive/40 text-destructive p-4 flex items-start gap-3" data-testid="paused-banner">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">Your account is paused</div>
            <div>New product uploads and status changes are blocked until pending commission dues are paid.</div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white border border-border" data-testid="dues-list">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-heading font-semibold text-charcoal">Orders contributing to your dues ({data.pending.length})</h2>
          </div>
          {data.pending.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-sage mx-auto mb-2" />
              <div className="text-sm text-charcoal-muted">All caught up — no pending commission dues.</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-off-white-alt text-xs uppercase tracking-[0.15em] text-charcoal-muted">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-right px-4 py-3">Order value</th>
                  <th className="text-right px-4 py-3">Rate</th>
                  <th className="text-right px-4 py-3">Commission</th>
                  <th className="text-left px-4 py-3">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {data.pending.map((d) => (
                  <tr key={d.id} className="border-t border-border" data-testid={`due-row-${d.short_id}`}>
                    <td className="px-4 py-3 font-medium text-charcoal">{d.short_id}</td>
                    <td className="px-4 py-3 text-right text-charcoal-muted">{inr(d.order_value)}</td>
                    <td className="px-4 py-3 text-right text-charcoal-muted">{d.commission_rate}%</td>
                    <td className="px-4 py-3 text-right font-medium">{inr(d.commission_amount)}</td>
                    <td className="px-4 py-3 text-xs text-charcoal-muted">{new Date(d.delivered_at).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="bg-white border border-border p-6 h-fit lg:sticky lg:top-32">
          <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Total pending</div>
          <div className="font-heading font-bold text-3xl text-charcoal mb-4 inline-flex items-center gap-1" data-testid="dues-total"><IndianRupee className="w-6 h-6" /> {new Intl.NumberFormat("en-IN").format(total)}</div>
          <label className="block text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold mb-1">Pay amount</label>
          <input
            data-testid="dues-amount-input"
            type="number"
            placeholder={`Full: ${total}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none mb-2"
          />
          <div className="text-[11px] text-charcoal-muted mb-4">Leave blank to pay the full pending amount.</div>
          <button
            onClick={pay}
            disabled={busy || total <= 0}
            data-testid="pay-dues-btn"
            className="btn-terracotta w-full"
          >
            {busy ? "Processing…" : `Pay ${inr(payAmount || total)}`}
          </button>
          <div className="text-[11px] text-charcoal-muted mt-3">Payments settle via Razorpay (UPI, cards, netbanking). Demo mode auto-clears when keys aren't configured.</div>

          {data.cleared.length > 0 && (
            <div className="mt-6 border-t border-border pt-4" data-testid="dues-cleared">
              <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-2">Recently cleared</div>
              <ul className="space-y-1 text-xs">
                {data.cleared.slice(0, 5).map((d) => (
                  <li key={d.id} className="flex justify-between text-charcoal-muted">
                    <span>{d.short_id} <span className="opacity-60">({d.cleared_note})</span></span>
                    <span>{inr(d.commission_amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
