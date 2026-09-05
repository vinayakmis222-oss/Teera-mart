import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { ShieldCheck, Store, Package, ShoppingBag, LogOut, Users, IndianRupee } from "lucide-react";
import { toast } from "sonner";

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="bg-white border border-border p-4">
      <div className="flex items-center gap-2 text-charcoal-muted text-xs uppercase tracking-[0.2em] mb-1">
        <Icon className="w-3.5 h-3.5 text-terracotta" /> {label}
      </div>
      <div className="font-heading font-bold text-2xl text-charcoal">{value}</div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user?.role === "admin") api.get("/admin/stats").then((r) => setStats(r.data));
  }, [user]);

  if (loading || user === null) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;

  const links = [
    { to: "/admin", label: "Dashboard", icon: ShieldCheck, end: true },
    { to: "/admin/sellers", label: "Sellers", icon: Store },
    { to: "/admin/products", label: "Products", icon: Package },
    { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
    { to: "/admin/dues", label: "Dues", icon: IndianRupee },
  ];

  return (
    <div className="container-x py-6 md:py-10" data-testid="admin-layout">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-1"><ShieldCheck className="w-4 h-4" /> Admin console</div>
          <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal">Marketplace Admin</h1>
          <div className="text-xs text-charcoal-muted mt-1">Signed in as {user.email}</div>
        </div>
        <button data-testid="admin-logout" onClick={async () => { await logout(); toast.success("Signed out"); nav("/admin/login"); }} className="btn-outline-charcoal text-sm py-2 px-4">
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6" data-testid="admin-stats">
          <Stat icon={Store} label="Sellers" value={stats.sellers} />
          <Stat icon={ShieldCheck} label="Verified" value={stats.sellers_verified} />
          <Stat icon={Users} label="Buyers" value={stats.buyers} />
          <Stat icon={Package} label="Products" value={stats.products} />
          <Stat icon={ShoppingBag} label="Orders" value={stats.orders} />
          <Stat icon={IndianRupee} label="GMV (paid)" value={new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(stats.revenue || 0)} />
        </div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <aside className="bg-white border border-border p-2 h-fit" data-testid="admin-sidebar">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                data-testid={`admin-nav-${l.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${isActive ? "bg-terracotta text-off-white" : "text-charcoal hover:bg-off-white-alt"}`
                }
              >
                <l.icon className="w-4 h-4" /> {l.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
