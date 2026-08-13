import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { api, inr } from "../lib/api";
import { Trash2, Minus, Plus, ShoppingBag, Tag, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function CartPage() {
  const { items, updateQty, removeItem, subtotal, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState(null); // {code, discount, label}
  const [busy, setBusy] = useState(false);

  const delivery = subtotal === 0 ? 0 : subtotal >= 999 ? 0 : 49;
  const discount = applied?.discount || 0;
  const total = Math.max(0, subtotal + delivery - discount);

  const apply = async () => {
    if (!coupon.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/coupons/apply", { code: coupon.trim(), subtotal });
      setApplied(data);
      toast.success(`Coupon ${data.code} applied — you saved ${inr(data.discount)}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid coupon");
      setApplied(null);
    } finally {
      setBusy(false);
    }
  };

  const goCheckout = () => {
    if (!user) { toast.error("Please login to continue"); nav("/login?redirect=/checkout"); return; }
    sessionStorage.setItem("terramart_coupon", applied ? JSON.stringify(applied) : "");
    nav("/checkout");
  };

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
    <div className="container-x py-8 md:py-12 pb-24 md:pb-12">
      <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal mb-6">Your Cart <span className="text-charcoal-muted text-lg font-normal">({items.length} items)</span></h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3" data-testid="cart-items">
          {items.map((it) => (
            <div key={it.key} className="flex gap-4 bg-white border border-border p-4">
              <img src={it.image} alt="" className="w-24 h-24 md:w-28 md:h-28 object-cover" />
              <div className="flex-1 min-w-0">
                <Link to={`/product/${it.id}`} className="font-medium text-charcoal hover:text-terracotta line-clamp-2">{it.title}</Link>
                {it.variant && <div className="text-xs text-charcoal-muted mt-1">Variant: <span className="text-charcoal font-medium">{it.variant}</span></div>}
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center border border-border bg-off-white">
                    <button data-testid={`qty-dec-${it.key}`} onClick={() => updateQty(it.key, it.qty - 1)} className="p-2 hover:bg-off-white-alt"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="px-3 text-sm font-medium min-w-[2rem] text-center">{it.qty}</span>
                    <button data-testid={`qty-inc-${it.key}`} onClick={() => updateQty(it.key, it.qty + 1)} className="p-2 hover:bg-off-white-alt"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button data-testid={`remove-${it.key}`} onClick={() => removeItem(it.key)} className="text-xs text-destructive inline-flex items-center gap-1 hover:underline">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
              <div className="text-right">
                <div className="font-heading font-bold text-charcoal">{inr(it.price * it.qty)}</div>
                <div className="text-[11px] text-charcoal-muted mt-1">{inr(it.price)} each</div>
              </div>
            </div>
          ))}
          <button onClick={clear} className="text-xs text-charcoal-muted hover:text-destructive" data-testid="clear-cart-btn">Clear cart</button>
        </div>

        <aside className="bg-white border border-border p-6 h-fit lg:sticky lg:top-32" data-testid="cart-summary">
          <h3 className="font-heading font-semibold text-lg text-charcoal mb-4">Price Details</h3>

          {/* Coupon */}
          <div className="mb-5">
            {applied ? (
              <div className="flex items-center justify-between bg-sage/10 border border-sage/40 px-3 py-2" data-testid="coupon-applied">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="w-4 h-4 text-sage" />
                  <div>
                    <div className="font-semibold text-charcoal">{applied.code}</div>
                    <div className="text-[11px] text-charcoal-muted">{applied.label}</div>
                  </div>
                </div>
                <button data-testid="coupon-remove" onClick={() => { setApplied(null); setCoupon(""); }} className="text-charcoal-muted hover:text-destructive"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  data-testid="coupon-input"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                  placeholder="Coupon code (WELCOME10)"
                  className="flex-1 border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 text-sm outline-none"
                />
                <button data-testid="coupon-apply" onClick={apply} disabled={busy || !coupon.trim()} className="btn-terracotta py-2 px-4 text-sm">Apply</button>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
              {["WELCOME10", "TERRA200", "FIRSTBUY"].map((c) => (
                <button key={c} data-testid={`coupon-suggest-${c}`} onClick={() => setCoupon(c)} className="uppercase tracking-widest text-terracotta border border-terracotta/40 hover:bg-terracotta/10 px-2 py-1">{c}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between text-charcoal-muted"><span>Subtotal ({items.length} items)</span><span className="text-charcoal">{inr(subtotal)}</span></div>
            <div className="flex justify-between text-charcoal-muted">
              <span>Delivery</span>
              {delivery === 0 ? <span className="text-sage font-medium">FREE</span> : <span className="text-charcoal">{inr(delivery)}</span>}
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sage" data-testid="cart-discount"><span>Discount</span><span>−{inr(discount)}</span></div>
            )}
          </div>
          <div className="border-t border-border pt-3 mb-5 flex justify-between items-baseline">
            <span className="text-charcoal font-medium">Total</span>
            <span className="font-heading font-bold text-2xl text-charcoal" data-testid="cart-total">{inr(total)}</span>
          </div>

          {subtotal < 999 && (
            <div className="text-[11px] text-charcoal-muted bg-off-white-alt p-2 mb-4">
              Add {inr(999 - subtotal)} more for FREE delivery
            </div>
          )}

          <button onClick={goCheckout} className="btn-terracotta w-full hidden md:inline-flex" data-testid="checkout-btn">
            Proceed to Checkout <ArrowRight className="w-4 h-4" />
          </button>
        </aside>
      </div>

      {/* Mobile sticky checkout */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-border p-3 z-40 flex items-center justify-between gap-3 shadow-cardHover" data-testid="mobile-checkout-bar">
        <div>
          <div className="text-[11px] text-charcoal-muted uppercase tracking-widest">Total</div>
          <div className="font-heading font-bold text-lg text-charcoal">{inr(total)}</div>
        </div>
        <button onClick={goCheckout} className="btn-terracotta flex-1" data-testid="mobile-checkout-btn">
          Checkout <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
