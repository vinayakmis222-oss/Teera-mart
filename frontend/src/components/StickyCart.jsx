import { Link, useLocation } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useCart } from "../context/CartContext";
import { inr } from "../lib/api";

export default function StickyCart() {
  const { count, subtotal } = useCart();
  const location = useLocation();
  if (count === 0) return null;
  if (location.pathname === "/cart") return null;
  return (
    <Link
      to="/cart"
      data-testid="sticky-cart"
      className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 bg-terracotta hover:bg-terracotta-hover text-off-white shadow-cardHover px-5 py-3 flex items-center gap-3 transition-all"
    >
      <div className="relative">
        <ShoppingCart className="w-5 h-5" />
        <span className="absolute -top-2 -right-2 bg-off-white text-terracotta text-[10px] font-bold w-4 h-4 grid place-items-center rounded-full">
          {count}
        </span>
      </div>
      <div className="text-sm">
        <div className="font-semibold leading-tight">View Cart</div>
        <div className="text-[11px] opacity-90">{inr(subtotal)}</div>
      </div>
    </Link>
  );
}
