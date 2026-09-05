import { Link } from "react-router-dom";
import { Store, Package, ShoppingBag, ArrowRight } from "lucide-react";

const CARDS = [
  { to: "/admin/sellers", title: "Sellers", desc: "Approve / reject verification, remove accounts.", icon: Store, tag: "Manage" },
  { to: "/admin/products", title: "Products", desc: "Search & moderate the entire catalogue.", icon: Package, tag: "Catalogue" },
  { to: "/admin/orders", title: "Orders", desc: "See every order across the platform.", icon: ShoppingBag, tag: "Fulfilment" },
];

export default function AdminDashboardPage() {
  return (
    <div className="grid md:grid-cols-3 gap-4" data-testid="admin-dashboard">
      {CARDS.map((c) => (
        <Link
          key={c.to}
          to={c.to}
          data-testid={`admin-tile-${c.title.toLowerCase()}`}
          className="bg-white border border-border p-6 hover:shadow-cardHover hover:border-terracotta transition-all group"
        >
          <div className="text-[10px] uppercase tracking-[0.25em] text-terracotta font-semibold mb-2">{c.tag}</div>
          <c.icon className="w-8 h-8 text-charcoal mb-3" />
          <div className="font-heading font-semibold text-xl text-charcoal mb-1">{c.title}</div>
          <div className="text-sm text-charcoal-muted mb-4">{c.desc}</div>
          <div className="inline-flex items-center gap-1 text-sm text-terracotta font-medium">
            Open <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      ))}
    </div>
  );
}
