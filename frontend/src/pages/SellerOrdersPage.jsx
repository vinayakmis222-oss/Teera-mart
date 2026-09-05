import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { api, inr } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { ArrowLeft, Package, Truck, Home, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const STATUS_META = {
  placed: { label: "Placed", cls: "bg-terracotta/15 text-terracotta" },
  confirmed: { label: "Confirmed", cls: "bg-sage/15 text-sage" },
  shipped: { label: "Shipped", cls: "bg-ochre/15 text-ochre" },
  out_for_delivery: { label: "Out for Delivery", cls: "bg-terracotta/15 text-terracotta" },
  delivered: { label: "Delivered", cls: "bg-sage/15 text-sage" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

const NEXT_STATUS = {
  placed: { next: "shipped", label: "Mark Shipped", icon: Package },
  confirmed: { next: "shipped", label: "Mark Shipped", icon: Package },
  shipped: { next: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  out_for_delivery: { next: "delivered", label: "Mark Delivered", icon: Home },
};

export default function SellerOrdersPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState(null);
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState("all");

  const load = () => api.get("/seller/orders").then((r) => setOrders(r.data));
  useEffect(() => { if (user?.role === "seller") load(); }, [user]);

  if (loading || user === null) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/seller/login" replace />;
  if (user.role !== "seller") return <Navigate to="/" replace />;
  if (orders === null) return <div className="container-x py-16 text-charcoal-muted">Loading orders…</div>;

  const advance = async (o) => {
    const meta = NEXT_STATUS[o.status];
    if (!meta) return;
    try {
      await api.patch(`/seller/orders/${o.id}/status?status=${meta.next}`);
      toast.success(`Order marked as ${meta.label.replace(/^Mark /, "").replace(/^Out for Delivery$/i, "Out for Delivery")}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="container-x py-8 md:py-12" data-testid="seller-orders-page">
      <Link to="/seller/dashboard" className="inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-terracotta mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Seller</div>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal">Orders Queue</h1>
        <p className="text-sm text-charcoal-muted mt-1">{orders.length} order(s) linked to your catalogue</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        {["all", "placed", "confirmed", "shipped", "out_for_delivery", "delivered", "cancelled"].map((s) => (
          <button
            key={s}
            data-testid={`filter-${s}`}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs uppercase tracking-widest border-2 transition-colors ${filter === s ? "border-terracotta text-terracotta bg-terracotta/5" : "border-border text-charcoal-muted hover:border-charcoal"}`}
          >
            {s === "all" ? "All" : (STATUS_META[s]?.label || s)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-border p-10 text-center">
          <Package className="w-10 h-10 mx-auto text-charcoal-muted mb-3" />
          <div className="font-heading text-lg text-charcoal mb-1">No orders here</div>
          <div className="text-sm text-charcoal-muted">Orders will appear as buyers place them.</div>
        </div>
      ) : (
        <div className="space-y-3" data-testid="seller-orders-list">
          {filtered.map((o) => {
            const meta = STATUS_META[o.status] || STATUS_META.placed;
            const advanceMeta = NEXT_STATUS[o.status];
            const isOpen = !!open[o.id];
            return (
              <div key={o.id} className="bg-white border border-border" data-testid={`seller-order-${o.short_id}`}>
                <div className="p-4 md:p-5 flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs uppercase tracking-[0.2em] text-charcoal-muted">Order</span>
                      <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                      {o.payment_status === "paid" && (
                        <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 bg-sage/15 text-sage inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Paid</span>
                      )}
                      {o.payment_method === "cod" && (
                        <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 bg-off-white-alt text-charcoal-muted">COD</span>
                      )}
                    </div>
                    <div className="font-heading font-bold text-lg text-charcoal">{o.short_id}</div>
                    <div className="text-xs text-charcoal-muted mt-1">
                      Placed on {new Date(o.created_at).toLocaleString("en-IN")} · Buyer: {o.address?.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted">Your share</div>
                    <div className="font-heading font-bold text-xl text-charcoal">{inr(o.seller_total)}</div>
                    <div className="text-[11px] text-charcoal-muted">{o.items.length} item(s)</div>
                  </div>
                </div>

                <div className="border-t border-border px-4 md:px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
                  <button
                    data-testid={`toggle-order-${o.short_id}`}
                    onClick={() => setOpen({ ...open, [o.id]: !isOpen })}
                    className="inline-flex items-center gap-1 text-sm text-charcoal hover:text-terracotta"
                  >
                    {isOpen ? <>Hide details <ChevronUp className="w-4 h-4" /></> : <>View details <ChevronDown className="w-4 h-4" /></>}
                  </button>
                  {advanceMeta && o.status !== "cancelled" && (
                    <button
                      onClick={() => advance(o)}
                      data-testid={`advance-${o.short_id}`}
                      className="btn-terracotta text-sm py-2 px-4"
                    >
                      <advanceMeta.icon className="w-4 h-4" /> {advanceMeta.label}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-border p-4 md:p-5 bg-off-white-alt" data-testid={`order-details-${o.short_id}`}>
                    <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-3">Your items in this order</div>
                    <div className="space-y-3 mb-4">
                      {o.items.map((it, i) => (
                        <div key={i} className="flex gap-3 items-center bg-white p-3">
                          <img src={it.image} alt="" className="w-12 h-12 object-cover" />
                          <div className="flex-1 min-w-0 text-sm">
                            <div className="font-medium text-charcoal line-clamp-1">{it.title}</div>
                            <div className="text-xs text-charcoal-muted">Qty {it.qty}{it.variant ? ` · ${it.variant}` : ""}</div>
                          </div>
                          <div className="text-sm font-medium">{inr(it.line_total)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Ship to</div>
                        <div className="text-charcoal font-medium">{o.address?.name} · {o.address?.phone}</div>
                        <div className="text-charcoal-muted">{o.address?.line1}{o.address?.line2 ? `, ${o.address.line2}` : ""}, {o.address?.city}, {o.address?.state} — {o.address?.pincode}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Payment</div>
                        <div className="text-charcoal font-medium uppercase">{o.payment_method}</div>
                        {o.razorpay_payment_id && <div className="text-[11px] text-charcoal-muted mt-1">Ref: {o.razorpay_payment_id}</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
