import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, inr } from "../lib/api";
import { Package, ShoppingBag, IndianRupee, Star, Plus, ShieldCheck, ShieldAlert, Upload, ClipboardList, Zap, AlertTriangle, Edit3, Trash2, TrendingUp, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import AddEditProductModal from "../components/AddEditProductModal";

const STATUS_META = {
  placed: { label: "Placed", cls: "bg-terracotta/15 text-terracotta" },
  confirmed: { label: "Confirmed", cls: "bg-sage/15 text-sage" },
  packed: { label: "Packed", cls: "bg-ochre/15 text-ochre" },
  shipped: { label: "Shipped", cls: "bg-terracotta/15 text-terracotta" },
  delivered: { label: "Delivered", cls: "bg-sage/15 text-sage" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};
const NEXT = { placed: "confirmed", confirmed: "packed", packed: "shipped", shipped: "delivered" };

export default function SellerDashboardPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [modal, setModal] = useState(null); // {existing?}

  const loadAll = async () => {
    const [d, p, o] = await Promise.all([
      api.get("/seller/dashboard"),
      api.get("/seller/products"),
      api.get("/seller/orders"),
    ]);
    setData(d.data); setProducts(p.data); setOrders(o.data);
  };

  useEffect(() => { if (user?.role === "seller") loadAll(); }, [user]);

  if (loading || user === null) return <div className="container-x py-12 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/seller/login" replace />;
  if (user.role !== "seller") return <Navigate to="/" replace />;
  if (!data) return <div className="container-x py-12 text-charcoal-muted">Loading dashboard…</div>;

  const stats = data.stats;
  const seller = data.seller;

  const delProduct = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try { await api.delete(`/seller/products/${p.id}`); toast.success("Product removed"); loadAll(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const advanceOrder = async (o, next) => {
    if (next === "shipped") {
      const link = window.prompt("Delivery location link (optional, leave blank to skip):", "") || "";
      try { await api.patch(`/seller/orders/${o.id}/status`, { status: "shipped", location_link: link || null }); toast.success("Marked Shipped"); loadAll(); }
      catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
      return;
    }
    try { await api.patch(`/seller/orders/${o.id}/status`, { status: next }); toast.success(`Marked ${STATUS_META[next]?.label || next}`); loadAll(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="container-x py-8 md:py-12">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Seller Dashboard</div>
          <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal">
            Hello, <span className="text-terracotta">{seller?.business_name || user.name}</span>
          </h1>
          <div className="mt-3 inline-flex items-center gap-2 text-xs bg-white border border-border px-3 py-1.5">
            {seller?.verified ? (
              <><ShieldCheck className="w-4 h-4 text-sage" /> <span className="font-medium text-sage">Verified Seller</span></>
            ) : (
              <><ShieldAlert className="w-4 h-4 text-ochre" /> <span className="font-medium text-charcoal-muted">Verification pending</span></>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/seller/orders" data-testid="seller-orders-link" className="btn-outline-charcoal">
            <ClipboardList className="w-4 h-4" /> Orders
          </Link>
          <Link to="/seller/bulk-upload" data-testid="seller-bulk-upload-link" className="btn-outline-charcoal">
            <Upload className="w-4 h-4" /> Bulk Upload
          </Link>
          <button
            onClick={() => stats.subscription_status === "active" && !seller?.effective_paused ? setModal({}) : toast.error("Renew your subscription to start listing")}
            disabled={stats.subscription_status !== "active" || seller?.effective_paused}
            data-testid="add-product-btn"
            className="btn-terracotta disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {stats.subscription_status !== "active" && (
        <div className="mb-6 bg-ochre/10 border border-ochre/40 p-4 flex items-start gap-3 flex-wrap" data-testid="renew-banner">
          <AlertTriangle className="w-5 h-5 text-ochre shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-semibold text-charcoal">Subscription {stats.subscription_status} — listings paused</div>
            <div className="text-charcoal-muted">Renew your ₹{data.settings.subscription_price}/month plan to start adding products and receive new orders.</div>
          </div>
          <Link to="/seller/subscription" className="btn-terracotta text-sm py-2 px-4">Renew now</Link>
        </div>
      )}

      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-testid="seller-stats">
        <Stat icon={Package} label="Products" value={stats.products} testid="stat-products" />
        <Stat icon={ShoppingBag} label="Orders" value={stats.orders} testid="stat-orders" />
        <Stat icon={IndianRupee} label="Revenue (delivered)" value={inr(stats.revenue)} testid="stat-revenue" />
        <Stat icon={Star} label="Rating" value={stats.rating.toFixed(1)} testid="stat-rating" />
      </div>

      {/* Subscription + Dues cards */}
      <div className="grid md:grid-cols-2 gap-4 mb-8" data-testid="subscription-dues-row">
        <div className={`border p-5 bg-white ${stats.subscription_status !== "active" ? "border-destructive/40" : "border-border"}`} data-testid="subscription-card">
          <div className="flex items-start justify-between mb-1">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1 inline-flex items-center gap-1">
                <Zap className="w-3 h-3 text-terracotta" /> Subscription
              </div>
              <div className="font-heading font-bold text-lg text-charcoal capitalize" data-testid="dash-subscription-status">{stats.subscription_status}</div>
              {stats.subscription_status === "active" ? (
                <div className="text-xs text-charcoal-muted mt-1">{stats.subscription_days_left} days left · {inr(data.settings.subscription_price)}/month</div>
              ) : (
                <div className="text-xs text-destructive mt-1">Products hidden from buyers until renewed</div>
              )}
            </div>
            <Link to="/seller/subscription" data-testid="renew-link" className={stats.subscription_status === "active" ? "btn-outline-charcoal text-sm py-2 px-4" : "btn-terracotta text-sm py-2 px-4"}>
              {stats.subscription_status === "active" ? "Extend" : "Renew Now"}
            </Link>
          </div>
        </div>
        <div className={`border p-5 bg-white ${stats.pending_dues > 0 ? "border-ochre/40" : "border-border"}`} data-testid="dues-card">
          <div className="flex items-start justify-between mb-1">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1 inline-flex items-center gap-1">
                <IndianRupee className="w-3 h-3 text-terracotta" /> Pending Commission Dues
              </div>
              <div className="font-heading font-bold text-2xl text-charcoal" data-testid="dash-pending-dues">{inr(stats.pending_dues)}</div>
              <div className="text-xs text-charcoal-muted mt-1">Commission rate: {data.settings.commission_rate}% · Booked on delivery</div>
              {seller?.effective_paused && <div className="mt-2 text-xs text-destructive inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Account paused</div>}
            </div>
            <Link to="/seller/dues" data-testid="pay-dues-link" className={stats.pending_dues > 0 ? "btn-terracotta text-sm py-2 px-4" : "btn-outline-charcoal text-sm py-2 px-4"}>
              {stats.pending_dues > 0 ? "Pay Dues" : "View"}
            </Link>
          </div>
        </div>
      </div>

      {/* Payouts & Analytics — real numbers */}
      <section className="mb-8" data-testid="payouts-analytics">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-terracotta" />
          <h2 className="font-heading font-semibold text-xl text-charcoal">Payouts &amp; Analytics</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Analytic label="Gross revenue" value={inr(stats.revenue)} sub="from delivered orders" />
          <Analytic label="Commission owed" value={`${data.settings.commission_rate}%`} sub="applied on delivery" />
          <Analytic label="Delivered orders" value={stats.delivered_orders ?? 0} sub="lifetime" />
          <Analytic label="Net after dues" value={inr(Math.max(0, stats.revenue - stats.pending_dues))} sub="approx." />
        </div>
      </section>

      {/* Your Listings */}
      <section className="mb-8" data-testid="listings-section">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-terracotta" />
            <h2 className="font-heading font-semibold text-xl text-charcoal">Your Listings ({products.length})</h2>
          </div>
          <button
            onClick={() => stats.subscription_status === "active" && !seller?.effective_paused ? setModal({}) : toast.error("Renew subscription to start listing")}
            disabled={stats.subscription_status !== "active" || seller?.effective_paused}
            data-testid="add-first-product-btn"
            className="btn-terracotta text-sm py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
        {products.length === 0 ? (
          <div className="bg-white border border-dashed border-border p-10 text-center">
            <Package className="w-10 h-10 mx-auto text-charcoal-muted mb-3" />
            <div className="font-heading text-lg text-charcoal mb-1">No products yet</div>
            <div className="text-sm text-charcoal-muted mb-4">Add your first product to appear in buyer searches.</div>
            <button onClick={() => setModal({})} className="btn-terracotta">Add first product</button>
          </div>
        ) : (
          <div className="bg-white border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]" data-testid="listings-table">
              <thead className="bg-off-white-alt text-xs uppercase tracking-[0.15em] text-charcoal-muted">
                <tr>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-right px-4 py-3">Price</th>
                  <th className="text-right px-4 py-3">Stock</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-border" data-testid={`listing-row-${p.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={p.images?.[0]} alt="" className="w-10 h-10 object-cover" loading="lazy" />
                        <div>
                          <Link to={`/product/${p.id}`} className="font-medium text-charcoal hover:text-terracotta line-clamp-1">{p.title}</Link>
                          <div className="text-[11px] text-charcoal-muted">{p.rating} ★ ({p.reviews_count})</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-charcoal-muted capitalize">{p.category.replace(/-/g, " ")}</td>
                    <td className="px-4 py-3 text-right font-medium">{inr(p.price)}</td>
                    <td className="px-4 py-3 text-right text-charcoal-muted">{p.stock}</td>
                    <td className="px-4 py-3">
                      {stats.subscription_status === "active" && !seller?.effective_paused ? (
                        <span className="text-[10px] uppercase tracking-widest text-sage font-semibold">Live</span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-widest text-destructive font-semibold">Hidden</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setModal({ existing: p })} data-testid={`edit-product-${p.id}`} className="text-xs border border-charcoal-muted text-charcoal hover:bg-off-white-alt px-2 py-1 inline-flex items-center gap-1">
                          <Edit3 className="w-3 h-3" /> Edit
                        </button>
                        <button onClick={() => delProduct(p)} data-testid={`delete-product-${p.id}`} className="text-xs border border-destructive/40 text-destructive hover:bg-destructive/10 px-2 py-1 inline-flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Orders & Fulfilment */}
      <section className="mb-8" data-testid="orders-fulfilment">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-terracotta" />
            <h2 className="font-heading font-semibold text-xl text-charcoal">Orders &amp; Fulfilment</h2>
          </div>
          <Link to="/seller/orders" className="text-sm text-terracotta hover:underline inline-flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {orders.length === 0 ? (
          <div className="bg-white border border-dashed border-border p-8 text-center">
            <ShoppingBag className="w-8 h-8 mx-auto text-charcoal-muted mb-2" />
            <div className="text-sm text-charcoal-muted">No orders yet — buyers will show up here as they check out.</div>
          </div>
        ) : (
          <div className="bg-white border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]" data-testid="orders-table">
              <thead className="bg-off-white-alt text-xs uppercase tracking-[0.15em] text-charcoal-muted">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Buyer</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Advance</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 8).map((o) => {
                  const meta = STATUS_META[o.status] || STATUS_META.placed;
                  const next = NEXT[o.status];
                  return (
                    <tr key={o.id} className="border-t border-border" data-testid={`dash-order-${o.short_id}`}>
                      <td className="px-4 py-3">
                        <div className="font-heading font-bold text-charcoal">{o.short_id}</div>
                        <div className="text-[11px] text-charcoal-muted">{new Date(o.created_at).toLocaleDateString("en-IN")}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-charcoal">{o.address?.name}</div>
                        <div className="text-[11px] text-charcoal-muted">{o.address?.pincode}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{inr(o.seller_total)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {next && o.status !== "cancelled" ? (
                            <select
                              data-testid={`dash-status-${o.short_id}`}
                              value={o.status}
                              onChange={(e) => advanceOrder(o, e.target.value)}
                              className="border-2 border-border focus:border-terracotta bg-off-white text-xs px-2 py-1 outline-none"
                            >
                              <option value={o.status}>{meta.label}</option>
                              <option value={next}>→ {STATUS_META[next].label}</option>
                            </select>
                          ) : (
                            <span className="text-xs text-charcoal-muted">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <AddEditProductModal
          existing={modal.existing}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadAll(); }}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, testid }) {
  return (
    <div className="bg-white border border-border p-4" data-testid={testid}>
      <div className="w-9 h-9 grid place-items-center bg-terracotta/10 text-terracotta mb-2">
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">{label}</div>
      <div className="font-heading font-bold text-2xl text-charcoal">{value}</div>
    </div>
  );
}
function Analytic({ label, value, sub }) {
  return (
    <div className="bg-white border border-border p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-charcoal-muted mb-1">{label}</div>
      <div className="font-heading font-bold text-xl text-charcoal">{value}</div>
      {sub && <div className="text-[11px] text-charcoal-muted mt-0.5">{sub}</div>}
    </div>
  );
}
