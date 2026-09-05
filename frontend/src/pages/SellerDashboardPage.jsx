import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, inr } from "../lib/api";
import { Package, ShoppingBag, IndianRupee, Star, Plus, ShieldCheck, ShieldAlert, Upload, ClipboardList } from "lucide-react";

export default function SellerDashboardPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user && user.role === "seller") {
      api.get("/seller/dashboard").then((r) => setData(r.data)).catch((e) => setErr(e.response?.data?.detail || "Failed to load"));
    }
  }, [user]);

  if (loading || user === null) return <div className="container-x py-12 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/seller/login" replace />;
  if (user.role !== "seller") return <Navigate to="/" replace />;

  const stats = data?.stats || { products: 0, orders: 0, revenue: 0, rating: 0 };
  const seller = data?.seller;

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
          <Link to="/seller/bulk-upload" data-testid="seller-bulk-upload-link" className="btn-terracotta">
            <Upload className="w-4 h-4" /> Bulk Upload
          </Link>
          <button data-testid="add-product-btn" className="btn-outline-charcoal">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {err && <div className="bg-destructive/10 text-destructive p-4 mb-6">{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10" data-testid="seller-stats">
        <Stat icon={Package} label="Products" value={stats.products} color="terracotta" />
        <Stat icon={ShoppingBag} label="Orders" value={stats.orders} color="sage" />
        <Stat icon={IndianRupee} label="Revenue" value={inr(stats.revenue)} color="ochre" />
        <Stat icon={Star} label="Rating" value={stats.rating.toFixed(1)} color="terracotta" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Your listings" desc="Product management coming soon." tag="Phase 2" />
        <Card title="Orders & fulfilment" desc="Order queue, shipping labels, invoices." tag="Phase 2" />
        <Card title="Payouts & analytics" desc="Bank details, weekly settlements, insights." tag="Phase 2" />
      </div>

      <div className="mt-8 p-6 bg-white border border-border">
        <h3 className="font-heading font-semibold text-lg text-charcoal mb-2">Business details</h3>
        {seller && (
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <Row k="Business" v={seller.business_name} />
            <Row k="GST" v={seller.gst_number || "Not provided"} />
            <Row k="Status" v={seller.verified ? "Verified" : "Pending"} />
          </div>
        )}
      </div>

      <div className="mt-8 text-sm text-charcoal-muted">
        Need help? <Link to="/" className="text-terracotta hover:underline">Read seller guide</Link>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white border border-border p-4 md:p-5">
      <div className={`w-10 h-10 grid place-items-center bg-${color}/10 text-${color} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">{label}</div>
      <div className="font-heading font-bold text-2xl text-charcoal">{value}</div>
    </div>
  );
}
function Card({ title, desc, tag }) {
  return (
    <div className="bg-white border border-border p-6 hover:shadow-cardHover transition-shadow">
      <div className="text-[10px] uppercase tracking-[0.25em] text-terracotta font-semibold mb-2">{tag}</div>
      <div className="font-heading font-semibold text-lg text-charcoal mb-1">{title}</div>
      <div className="text-sm text-charcoal-muted">{desc}</div>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">{k}</div>
      <div className="text-charcoal font-medium">{v}</div>
    </div>
  );
}
