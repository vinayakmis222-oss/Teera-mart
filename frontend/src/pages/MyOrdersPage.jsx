import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, inr } from "../lib/api";
import { Package, ChevronRight, ShoppingBag } from "lucide-react";

const STATUS_META = {
  placed: { label: "Placed", cls: "bg-terracotta/15 text-terracotta" },
  shipped: { label: "Shipped", cls: "bg-ochre/15 text-ochre" },
  out_for_delivery: { label: "Out for Delivery", cls: "bg-terracotta/15 text-terracotta" },
  delivered: { label: "Delivered", cls: "bg-sage/15 text-sage" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

export default function MyOrdersPage() {
  const [orders, setOrders] = useState(null);

  useEffect(() => { api.get("/orders").then((r) => setOrders(r.data)); }, []);

  if (!orders) return <div className="bg-white border border-border p-8 text-charcoal-muted">Loading…</div>;

  if (orders.length === 0) {
    return (
      <div className="bg-white border border-border p-10 text-center" data-testid="orders-empty">
        <div className="w-14 h-14 grid place-items-center bg-off-white-alt mx-auto mb-4">
          <ShoppingBag className="w-6 h-6 text-terracotta" />
        </div>
        <h2 className="font-heading font-bold text-2xl text-charcoal mb-2">No orders yet</h2>
        <p className="text-sm text-charcoal-muted mb-4">When you place an order, it will show up here.</p>
        <Link to="/" className="btn-terracotta">Start shopping</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="orders-list">
      <h2 className="font-heading font-semibold text-xl text-charcoal">My Orders</h2>
      {orders.map((o) => {
        const meta = STATUS_META[o.status] || STATUS_META.placed;
        return (
          <Link
            key={o.id}
            to={`/account/orders/${o.id}`}
            data-testid={`order-row-${o.short_id}`}
            className="block bg-white border border-border p-4 md:p-5 hover:shadow-cardHover transition-all"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted">Order</div>
                  <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                </div>
                <div className="font-heading font-bold text-lg text-charcoal">{o.short_id}</div>
                <div className="text-xs text-charcoal-muted mt-1">Placed on {new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
              </div>
              <div className="text-right">
                <div className="font-heading font-bold text-xl text-charcoal">{inr(o.total)}</div>
                <div className="text-xs text-charcoal-muted">{o.items.length} item(s)</div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
              <div className="flex -space-x-2">
                {o.items.slice(0, 4).map((it, i) => (
                  <img key={i} src={it.image} alt="" className="w-10 h-10 object-cover border-2 border-white" />
                ))}
              </div>
              <div className="flex-1 min-w-0 text-sm text-charcoal-muted truncate">
                {o.items.map((it) => it.title).join(" · ")}
              </div>
              <ChevronRight className="w-4 h-4 text-charcoal-muted" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
