import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { User, Package, MapPin, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function AccountLayout() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();

  if (loading || user === null) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/login?redirect=/account" replace />;
  if (user.role !== "buyer" && user.role !== "admin") return <Navigate to="/" replace />;

  const links = [
    { to: "/account", label: "Profile", icon: User, end: true },
    { to: "/account/orders", label: "My Orders", icon: Package },
    { to: "/account/addresses", label: "Addresses", icon: MapPin },
  ];

  return (
    <div className="container-x py-8 md:py-12">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Account</div>
          <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal">Hi, <span className="text-terracotta">{user.name?.split(" ")[0]}</span></h1>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 bg-white border border-border p-2 h-fit" data-testid="account-sidebar">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                data-testid={`account-nav-${l.label.toLowerCase().replace(/\s/g, "-")}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${isActive ? "bg-terracotta text-off-white" : "text-charcoal hover:bg-off-white-alt"}`
                }
              >
                <l.icon className="w-4 h-4" /> {l.label}
              </NavLink>
            ))}
            <button
              data-testid="account-logout"
              onClick={async () => { await logout(); toast.success("Logged out"); nav("/"); }}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </nav>
        </aside>

        <div className="lg:col-span-3">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
