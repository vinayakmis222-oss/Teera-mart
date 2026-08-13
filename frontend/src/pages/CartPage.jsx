import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { inr } from "../lib/api";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";

export default function CartPage() {
  const { items, updateQty, removeItem, subtotal, clear } = useCart();

  if (items.length === 0) {
    return (
      <div className="container-x py-16 text-center">
        <div className="w-16 h-16 grid place-items-center bg-white border border-border mx-auto mb-4">
          <ShoppingBag className="w-6 h-6 text-terracotta" />
        </div>
        <h1 className="font-heading font-bold text-3xl text-charcoal mb-2">Your cart is empty</h1>
        <p className="text-charcoal-muted mb-6">Discover tiles, paints, wallpapers and décor for your next project.</p>
        <Link to="/" className="btn-terracotta" data-testid="continue-shopping-btn">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="container-x py-8 md:py-12">
      <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal mb-6">Your Cart</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3" data-testid="cart-items">
          {items.map((it) => (
            <div key={it.key} className="flex gap-4 bg-white border border-border p-4">
              <img src={it.image} alt="" className="w-24 h-24 md:w-28 md:h-28 object-cover" />
              <div className="flex-1 min-w-0">
                <Link to={`/product/${it.id}`} className="font-medium text-charcoal hover:text-terracotta line-clamp-2">{it.title}</Link>
                {it.variant && <div className="text-xs text-charcoal-muted mt-1">Variant: {it.variant}</div>}
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center border border-border">
                    <button data-testid={`qty-dec-${it.key}`} onClick={() => updateQty(it.key, it.qty - 1)} className="p-2 hover:bg-off-white-alt"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="px-3 text-sm font-medium">{it.qty}</span>
                    <button data-testid={`qty-inc-${it.key}`} onClick={() => updateQty(it.key, it.qty + 1)} className="p-2 hover:bg-off-white-alt"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button data-testid={`remove-${it.key}`} onClick={() => removeItem(it.key)} className="text-xs text-destructive inline-flex items-center gap-1 hover:underline">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
              <div className="font-heading font-bold text-charcoal">{inr(it.price * it.qty)}</div>
            </div>
          ))}
          <button onClick={clear} className="text-xs text-charcoal-muted hover:text-destructive" data-testid="clear-cart-btn">Clear cart</button>
        </div>

        <aside className="bg-white border border-border p-6 h-fit sticky top-32" data-testid="cart-summary">
          <h3 className="font-heading font-semibold text-lg text-charcoal mb-4">Order summary</h3>
          <div className="space-y-2 text-sm text-charcoal-muted mb-4">
            <div className="flex justify-between"><span>Subtotal</span><span className="text-charcoal font-medium">{inr(subtotal)}</span></div>
            <div className="flex justify-between"><span>Shipping</span><span className="text-sage font-medium">FREE</span></div>
          </div>
          <div className="border-t border-border pt-3 mb-5 flex justify-between items-baseline">
            <span className="text-charcoal font-medium">Total</span>
            <span className="font-heading font-bold text-2xl text-charcoal">{inr(subtotal)}</span>
          </div>
          <button className="btn-terracotta w-full" data-testid="checkout-btn">Place order</button>
          <div className="text-[11px] text-charcoal-muted text-center mt-3">Checkout coming in Phase 2</div>
        </aside>
      </div>
    </div>
  );
}
