import { Link, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, User, Store, LogOut, Package } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { toast } from "sonner";

export default function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const nav = useNavigate();
  const [q, setQ] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) nav(`/category/all?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-50 bg-off-white border-b border-border">
      <div className="container-x flex items-center gap-4 md:gap-8 py-3">
        <Link to="/" data-testid="header-logo" className="flex items-center gap-2 shrink-0">
          <span className="w-9 h-9 bg-terracotta text-off-white grid place-items-center font-heading font-bold text-lg">T</span>
          <div className="hidden sm:block leading-none">
            <div className="font-heading font-bold text-lg text-charcoal tracking-tight">TerraMart</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-terracotta font-semibold">Build · Decor</div>
          </div>
        </Link>

        <form onSubmit={submit} className="flex-1 max-w-2xl relative">
          <input
            data-testid="header-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tiles, paints, wallpapers, decor…"
            className="w-full bg-white border-2 border-border focus:border-terracotta text-charcoal placeholder:text-charcoal-light px-4 py-2.5 pr-12 outline-none transition-colors"
          />
          <button
            type="submit"
            data-testid="header-search-btn"
            className="absolute right-0 top-0 h-full px-4 bg-terracotta text-off-white hover:bg-terracotta-hover transition-colors"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>

        <div className="flex items-center gap-1 md:gap-3">
          {user && user !== false ? (
            <Popover>
              <PopoverTrigger asChild>
                <button data-testid="header-account-btn" className="flex items-center gap-2 px-3 py-2 hover:bg-off-white-alt transition-colors">
                  <User className="w-5 h-5 text-charcoal" />
                  <span className="hidden md:inline text-sm font-medium text-charcoal">{user.name?.split(" ")[0]}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 bg-white border border-border p-2 shadow-dropdown" align="end">
                <div className="px-3 py-2 border-b border-border">
                  <div className="text-xs text-charcoal-muted">Signed in as</div>
                  <div className="text-sm font-medium text-charcoal truncate">{user.email}</div>
                  <div className="text-[10px] uppercase tracking-widest text-terracotta font-semibold mt-1">{user.role}</div>
                </div>
                {user.role === "buyer" && (
                  <>
                    <Link data-testid="header-account-link" to="/account" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-off-white text-charcoal">
                      <User className="w-4 h-4" /> My Account
                    </Link>
                    <Link data-testid="header-orders-link" to="/account/orders" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-off-white text-charcoal">
                      <Package className="w-4 h-4" /> My Orders
                    </Link>
                  </>
                )}
                {user.role === "seller" && (
                  <Link data-testid="header-seller-dashboard-link" to="/seller/dashboard" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-off-white text-charcoal">
                    <Store className="w-4 h-4" /> Seller Dashboard
                  </Link>
                )}
                <button
                  data-testid="header-logout-btn"
                  onClick={async () => { await logout(); toast.success("Logged out"); nav("/"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-off-white text-charcoal text-left"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex items-center gap-1">
              <Link data-testid="header-login-link" to="/login" className="px-3 py-2 text-sm font-medium text-charcoal hover:text-terracotta transition-colors">
                Login
              </Link>
              <Link data-testid="header-seller-link" to="/seller/login" className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-charcoal border border-charcoal hover:bg-charcoal hover:text-off-white transition-colors">
                <Store className="w-4 h-4" /> Sell on TerraMart
              </Link>
            </div>
          )}

          <Link
            data-testid="header-cart-link"
            to="/cart"
            className="relative flex items-center gap-2 px-3 py-2 hover:bg-off-white-alt transition-colors"
          >
            <ShoppingCart className="w-5 h-5 text-charcoal" />
            <span className="hidden md:inline text-sm font-medium text-charcoal">Cart</span>
            {count > 0 && (
              <span className="absolute -top-0 -right-0 md:top-1 md:right-1 bg-terracotta text-off-white text-[10px] font-bold w-4 h-4 grid place-items-center rounded-full">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
