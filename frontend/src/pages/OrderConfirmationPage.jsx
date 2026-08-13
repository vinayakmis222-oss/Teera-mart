import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, inr } from "../lib/api";
import { CheckCircle2, Package, ArrowRight, Truck } from "lucide-react";

export default function OrderConfirmationPage() {
  const { id } = useParams();
  const [o, setO] = useState(null);

  useEffect(() => { api.get(`/orders/${id}`).then((r) => setO(r.data)); }, [id]);

  if (!o) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;

  const eta = new Date(o.estimated_delivery);
  const etaStr = eta.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="container-x py-10 md:py-16 max-w-3xl">
      <div className="bg-white border border-border p-8 md:p-10 text-center" data-testid="order-success">
        <div className="w-16 h-16 grid place-items-center bg-sage/15 text-sage mx-auto mb-4 rounded-full">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Order placed</div>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal mb-2">Thank you for your order!</h1>
        <p className="text-charcoal-muted mb-6">A confirmation has been recorded. You can track it anytime from My Orders.</p>

        <div className="grid md:grid-cols-2 gap-4 text-left mb-6">
          <div className="border border-border p-4 bg-off-white-alt">
            <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Order ID</div>
            <div className="font-heading font-bold text-lg text-charcoal" data-testid="order-id">{o.short_id}</div>
          </div>
          <div className="border border-border p-4 bg-off-white-alt">
            <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Estimated delivery</div>
            <div className="font-heading font-bold text-lg text-charcoal inline-flex items-center gap-2" data-testid="order-eta"><Truck className="w-4 h-4 text-terracotta" /> {etaStr}</div>
          </div>
        </div>

        <div className="border border-border p-4 mb-6 text-left">
          <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-3">Items ({o.items.length})</div>
          <div className="space-y-3">
            {o.items.map((it, i) => (
              <div key={i} className="flex gap-3 items-center">
                <img src={it.image} alt="" className="w-12 h-12 object-cover" />
                <div className="flex-1 min-w-0 text-sm text-left">
                  <div className="text-charcoal line-clamp-1">{it.title}</div>
                  <div className="text-xs text-charcoal-muted">Qty {it.qty}{it.variant ? ` · ${it.variant}` : ""}</div>
                </div>
                <div className="text-sm font-medium">{inr(it.line_total)}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-4 pt-3 flex justify-between text-sm">
            <span className="text-charcoal-muted">Total paid</span>
            <span className="font-heading font-bold text-lg text-charcoal">{inr(o.total)}</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 justify-center">
          <Link to={`/account/orders/${o.id}`} className="btn-terracotta" data-testid="track-order-btn">
            <Package className="w-4 h-4" /> Track Order
          </Link>
          <Link to="/" className="btn-outline-charcoal">Continue Shopping <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </div>
  );
}
