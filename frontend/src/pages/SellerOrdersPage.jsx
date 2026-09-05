import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { api, inr } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { ArrowLeft, Package, Truck, Home, CheckCircle2, ChevronDown, ChevronUp, MapPin, X } from "lucide-react";
import { toast } from "sonner";

const STATUS_META = {
  placed: { label: "Placed", cls: "bg-terracotta/15 text-terracotta" },
  confirmed: { label: "Confirmed", cls: "bg-sage/15 text-sage" },
  packed: { label: "Packed", cls: "bg-ochre/15 text-ochre" },
  shipped: { label: "Shipped", cls: "bg-terracotta/15 text-terracotta" },
  delivered: { label: "Delivered", cls: "bg-sage/15 text-sage" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

const NEXT_STATUS = {
  placed: { next: "confirmed", label: "Confirm Order", icon: CheckCircle2 },
  confirmed: { next: "packed", label: "Mark Packed", icon: Package },
  packed: { next: "shipped", label: "Mark Shipped", icon: Truck },
  shipped: { next: "delivered", label: "Mark Delivered", icon: Home },
};

export default function SellerOrdersPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState(null);
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState("all");
  const [shipModal, setShipModal] = useState(null); // {order, link}

  const load = () => api.get("/seller/orders").then((r) => setOrders(r.data));
  useEffect(() => { if (user?.role === "seller") load(); }, [user]);

  if (loading || user === null) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/seller/login" replace />;
  if (user.role !== "seller") return <Navigate to="/" replace />;
  if (orders === null) return <div className="container-x py-16 text-charcoal-muted">Loading orders…</div>;

  const advance = async (o, extra = {}) => {
    const meta = NEXT_STATUS[o.status];
    if (!meta) return;
    try {
      await api.patch(`/seller/orders/${o.id}/status`, { status: meta.next, ...extra });
      toast.success(`Order marked as ${STATUS_META[meta.next]?.label || meta.next}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const openShipModal = (o) => setShipModal({ order: o, link: "" });
  const submitShip = async () => {
    if (!shipModal) return;
    await advance(shipModal.order, { location_link: shipModal.link || null });
    setShipModal(null);
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
        {["all", "placed", "confirmed", "packed", "shipped", "delivered", "cancelled"].map((s) => (
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
                      {o.location_link && (
                        <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 bg-sage/15 text-sage inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> Map</span>
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
                      onClick={() => advanceMeta.next === "shipped" ? openShipModal(o) : advance(o)}
                      data-testid={`update-status-${o.short_id}`}
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
                        {o.location_link && (
                          <a href={o.location_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-terracotta hover:underline mt-2" data-testid={`map-link-${o.short_id}`}>
                            <MapPin className="w-3 h-3" /> Delivery map
                          </a>
                        )}
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Timeline</div>
                        <ul className="space-y-1">
                          {(o.status_history || []).slice(-5).map((h, i) => (
                            <li key={i} className="text-xs text-charcoal">
                              <span className="capitalize font-medium">{h.status.replace(/_/g, " ")}</span>
                              <span className="text-charcoal-muted"> · {new Date(h.at).toLocaleString("en-IN")}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Shipped modal */}
      {shipModal && (
        <div className="fixed inset-0 z-50 bg-charcoal/40 grid place-items-center p-4" data-testid="ship-modal">
          <div className="bg-white border border-border w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold">Mark Shipped</div>
                <div className="font-heading font-bold text-xl text-charcoal">Order {shipModal.order.short_id}</div>
              </div>
              <button onClick={() => setShipModal(null)} className="p-2 hover:bg-off-white-alt"><X className="w-4 h-4" /></button>
            </div>
            <label className="block text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold mb-1">
              Delivery location link (optional)
            </label>
            <input
              data-testid="ship-location-input"
              value={shipModal.link}
              onChange={(e) => setShipModal({ ...shipModal, link: e.target.value })}
              placeholder="Paste Google Maps link"
              className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-2.5 outline-none"
            />
            <div className="text-[11px] text-charcoal-muted mt-2">
              Optional — leave blank to mark shipped without a map link. This never blocks the status update.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShipModal(null)} className="px-4 py-2 text-sm text-charcoal-muted hover:text-charcoal">Cancel</button>
              <button data-testid="ship-modal-submit" onClick={submitShip} className="btn-terracotta text-sm py-2 px-4">
                <Truck className="w-4 h-4" /> Mark Shipped
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
