import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, inr } from "../lib/api";
import { CheckCircle2, Package, Truck, Home, ArrowLeft, MapPin, ShieldCheck, XCircle, Star } from "lucide-react";
import { toast } from "sonner";

const FLOW = [
  { key: "placed", label: "Placed", icon: CheckCircle2 },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "packed", label: "Packed", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Home },
];
const LABEL = Object.fromEntries(FLOW.map((f) => [f.key, f.label]));

function fmt(dt) {
  return new Date(dt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const prevStatus = useRef(null);

  const load = () => api.get(`/orders/${id}`).then((r) => setO(r.data));

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!o) return;
    if (prevStatus.current && prevStatus.current !== o.status && o.status !== "cancelled") {
      toast.success(`Order update: ${LABEL[o.status] || o.status}`);
    }
    prevStatus.current = o.status;
  }, [o?.status]);

  if (!o) return <div className="bg-white border border-border p-8 text-charcoal-muted">Loading…</div>;

  const isCancelled = o.status === "cancelled";
  const activeIdx = FLOW.findIndex((f) => f.key === o.status);
  const canCancel = ["placed", "confirmed"].includes(o.status);
  const timestamps = (o.status_history || []).reduce((acc, h) => { acc[h.status] = h.at; return acc; }, {});

  const cancel = async () => {
    if (!window.confirm("Cancel this order?")) return;
    setCancelling(true);
    try {
      await api.post(`/orders/${id}/cancel`);
      toast.success("Order cancelled");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setCancelling(false); }
  };

  return (
    <div className="space-y-6" data-testid="order-detail">
      <Link to="/account/orders" className="inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-terracotta">
        <ArrowLeft className="w-4 h-4" /> Back to orders
      </Link>

      <div className="bg-white border border-border p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted">Order ID</div>
            <div className="font-heading font-bold text-2xl text-charcoal">{o.short_id}</div>
            <div className="text-xs text-charcoal-muted mt-1">Placed on {new Date(o.created_at).toLocaleString("en-IN")}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted">Estimated delivery</div>
              <div className="font-heading font-semibold text-lg text-charcoal">{new Date(o.estimated_delivery).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</div>
            </div>
            {canCancel && (
              <button onClick={cancel} disabled={cancelling} data-testid="cancel-order-btn" className="inline-flex items-center gap-1 text-xs text-destructive border border-destructive/30 hover:bg-destructive/10 px-3 py-1.5 transition-colors">
                <XCircle className="w-3.5 h-3.5" /> {cancelling ? "Cancelling…" : "Cancel order"}
              </button>
            )}
          </div>
        </div>

        {/* Tracking */}
        {!isCancelled ? (
          <div className="mt-8" data-testid="order-tracker">
            <div className="grid grid-cols-5 gap-1 md:gap-2 relative">
              {FLOW.map((f, i) => {
                const Icon = f.icon;
                const done = i <= activeIdx;
                const isActive = i === activeIdx;
                const ts = timestamps[f.key];
                return (
                  <div key={f.key} className="text-center" data-testid={`tracker-step-${f.key}`}>
                    <div className={`w-10 h-10 md:w-12 md:h-12 grid place-items-center mx-auto rounded-full transition-colors ${done ? (isActive ? "bg-terracotta text-off-white" : "bg-sage text-off-white") : "bg-off-white-alt text-charcoal-muted"} ${isActive ? "ring-4 ring-terracotta/20 animate-pulse" : ""}`}>
                      <Icon className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                    <div className={`text-[10px] md:text-xs mt-2 font-medium ${done ? "text-charcoal" : "text-charcoal-muted"}`}>{f.label}</div>
                    {ts && (
                      <div className="text-[10px] text-charcoal-muted mt-0.5" data-testid={`tracker-ts-${f.key}`}>{fmt(ts)}</div>
                    )}
                  </div>
                );
              })}
              <div className="absolute top-5 md:top-6 left-0 right-0 h-[2px] bg-border -z-10">
                <div className="h-full bg-terracotta transition-all" style={{ width: `${(activeIdx / (FLOW.length - 1)) * 100}%` }} />
              </div>
            </div>

            {activeIdx >= 3 && o.location_link && (
              <div className="mt-6 flex justify-center">
                <a
                  href={o.location_link}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="track-delivery-location-btn"
                  className="btn-outline-charcoal text-sm py-2 px-4"
                >
                  <MapPin className="w-4 h-4 text-terracotta" /> Track Delivery Location
                </a>
              </div>
            )}

            {activeIdx === 4 && (
              <div className="mt-6 bg-sage/10 border border-sage/40 p-4 flex items-center gap-3 justify-between flex-wrap" data-testid="delivered-banner">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-sage" />
                  <div>
                    <div className="font-heading font-semibold text-charcoal">Delivered {timestamps.delivered && `on ${fmt(timestamps.delivered)}`}</div>
                    <div className="text-xs text-charcoal-muted">Hope you love it — share your experience.</div>
                  </div>
                </div>
                {o.items?.[0]?.product_id && (
                  <Link
                    to={`/product/${o.items[0].product_id}`}
                    data-testid="rate-order-btn"
                    className="btn-terracotta text-sm py-2 px-4"
                  >
                    <Star className="w-4 h-4" /> Rate this order
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 bg-destructive/10 text-destructive p-4 text-sm">This order was cancelled.</div>
        )}
      </div>

      {/* Items grouped by seller */}
      {groupBySeller(o.items).map((grp) => (
        <div key={grp.seller_id} className="bg-white border border-border" data-testid={`seller-group-${grp.seller_id}`}>
          <div className="px-5 md:px-6 py-3 border-b border-border flex items-center gap-2 bg-off-white-alt">
            <ShieldCheck className={`w-4 h-4 ${grp.seller?.verified ? "text-sage" : "text-charcoal-muted"}`} />
            <div className="text-sm font-semibold text-charcoal">Sold by {grp.seller?.business_name || "Seller"}</div>
            {grp.seller?.verified && <span className="text-[10px] uppercase tracking-widest text-sage font-bold">Verified</span>}
          </div>
          <div className="p-5 md:p-6 space-y-4">
            {grp.items.map((it, i) => (
              <div key={i} className="flex gap-3 items-center">
                <img src={it.image} alt="" className="w-16 h-16 object-cover" />
                <div className="flex-1 min-w-0 text-sm">
                  <Link to={`/product/${it.product_id}`} className="text-charcoal hover:text-terracotta font-medium line-clamp-1">{it.title}</Link>
                  <div className="text-xs text-charcoal-muted">Qty {it.qty}{it.variant ? ` · ${it.variant}` : ""}</div>
                </div>
                <div className="text-sm font-medium">{inr(it.line_total)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-border p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-3 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> Delivery Address</div>
          <div className="text-sm">
            <div className="font-semibold text-charcoal">{o.address.name} · {o.address.phone}</div>
            <div className="text-charcoal-muted mt-1">{o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ""}, {o.address.city}, {o.address.state} — {o.address.pincode}</div>
          </div>
        </div>
        <div className="bg-white border border-border p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-3">Payment Summary</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-charcoal-muted"><span>Subtotal</span><span className="text-charcoal">{inr(o.subtotal)}</span></div>
            <div className="flex justify-between text-charcoal-muted"><span>Delivery</span>{o.delivery_charge === 0 ? <span className="text-sage font-medium">FREE</span> : <span>{inr(o.delivery_charge)}</span>}</div>
            {o.discount > 0 && <div className="flex justify-between text-sage"><span>Discount ({o.coupon_code})</span><span>−{inr(o.discount)}</span></div>}
            <div className="border-t border-border pt-2 mt-2 flex justify-between font-heading font-bold text-lg">
              <span>Total</span><span>{inr(o.total)}</span>
            </div>
            <div className="text-xs text-charcoal-muted mt-1">
              {o.payment_method === "cod"
                ? (o.payment_status === "paid" ? "Cash on Delivery — paid" : "Cash on Delivery (pay on delivery)")
                : <>Paid via <span className="font-medium text-charcoal uppercase">{o.payment_method}</span></>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function groupBySeller(items) {
  const map = {};
  items.forEach((it) => {
    if (!map[it.seller_id]) map[it.seller_id] = { seller_id: it.seller_id, seller: it.seller, items: [] };
    map[it.seller_id].items.push(it);
  });
  return Object.values(map);
}
