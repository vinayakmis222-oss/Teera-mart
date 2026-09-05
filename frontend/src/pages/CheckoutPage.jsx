import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useDelivery, SERVICEABLE_PINCODE, SERVICEABLE_AREAS } from "../context/DeliveryContext";
import { api, inr } from "../lib/api";
import { MapPin, CreditCard, Wallet, Landmark, Truck, Plus, Check, ChevronRight, Home, Briefcase, XCircle } from "lucide-react";
import { toast } from "sonner";

const STEPS = ["Address", "Payment", "Review"];

export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const { items, subtotal, clear } = useCart();
  const { isServiceable, pincode: deliveryPin } = useDelivery();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pay, setPay] = useState("upi");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  const savedCoupon = (() => { try { return JSON.parse(sessionStorage.getItem("terramart_coupon") || "null"); } catch { return null; } })();
  const delivery = subtotal === 0 ? 0 : subtotal >= 999 ? 0 : 49;
  const discount = savedCoupon?.discount || 0;
  const total = Math.max(0, subtotal + delivery - discount);

  const loadAddrs = () => api.get("/addresses").then((r) => {
    setAddresses(r.data);
    const def = r.data.find((a) => a.is_default) || r.data[0];
    if (def && !addressId) setAddressId(def.id);
  });

  useEffect(() => { if (user) loadAddrs(); }, [user]);

  if (loading || user === null) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/login?redirect=/checkout" replace />;

  if (!isServiceable) {
    return (
      <div className="container-x py-16 max-w-lg" data-testid="checkout-blocked">
        <div className="bg-white border border-destructive/40 p-6 md:p-8 text-center">
          <XCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
          <h1 className="font-heading font-bold text-2xl text-charcoal mb-2">Not serviceable</h1>
          <p className="text-sm text-charcoal-muted mb-4">
            Currently we deliver only in {SERVICEABLE_AREAS} (Pincode {SERVICEABLE_PINCODE}).
            {deliveryPin && <> Your pincode <span className="font-medium">{deliveryPin}</span> is outside this zone.</>}
          </p>
          <button onClick={() => nav(-1)} className="btn-terracotta">Go back &amp; verify pincode</button>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !placed && !placing) return <Navigate to="/cart" replace />;

  const place = async () => {
    setPlacing(true);
    try {
      const payload = {
        items: items.map((i) => ({ product_id: i.id, variant: i.variant, qty: i.qty })),
        address_id: addressId,
        payment_method: pay,
        coupon_code: savedCoupon?.code || null,
      };
      const { data: order } = await api.post("/orders", payload);

      // COD - no gateway needed
      if (pay === "cod") {
        setPlaced(true);
        nav(`/order/success/${order.id}`, { replace: true });
        clear();
        sessionStorage.removeItem("terramart_coupon");
        return;
      }

      // Real / demo Razorpay flow
      const { data: pay_intent } = await api.post(`/payments/create/${order.id}`);
      const finishSuccess = async (rpo, rpp, rps) => {
        await api.post("/payments/verify", {
          order_id: order.id,
          razorpay_order_id: rpo,
          razorpay_payment_id: rpp,
          razorpay_signature: rps,
          demo_mode: !!pay_intent.demo_mode,
        });
        setPlaced(true);
        nav(`/order/success/${order.id}`, { replace: true });
        clear();
        sessionStorage.removeItem("terramart_coupon");
      };

      if (pay_intent.demo_mode) {
        // Demo mode – no real modal
        toast.info("Demo payment (Razorpay keys not configured) — confirming automatically");
        await finishSuccess(pay_intent.razorpay_order_id, `demo_pay_${Date.now()}`, "demo_signature");
        return;
      }

      if (!window.Razorpay) {
        toast.error("Payment SDK not loaded. Refresh & try again.");
        setPlacing(false);
        return;
      }
      const rzp = new window.Razorpay({
        key: pay_intent.key_id,
        amount: pay_intent.amount,
        currency: pay_intent.currency,
        order_id: pay_intent.razorpay_order_id,
        name: "TerraMart",
        description: `Order ${order.short_id}`,
        prefill: { name: user.name, email: user.email, contact: user.phone || "" },
        theme: { color: "#C4633A" },
        method: pay === "upi" ? { upi: true } : pay === "netbanking" ? { netbanking: true } : pay === "card" ? { card: true } : undefined,
        handler: async (res) => {
          try {
            await finishSuccess(res.razorpay_order_id, res.razorpay_payment_id, res.razorpay_signature);
          } catch (e) {
            toast.error(e.response?.data?.detail || "Payment verification failed. Please retry.");
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast.warning("Payment cancelled — your cart is intact. Retry when ready.");
            setPlacing(false);
          },
        },
      });
      rzp.on("payment.failed", (resp) => {
        toast.error(`Payment failed: ${resp?.error?.description || "Please retry"}`);
        setPlacing(false);
      });
      rzp.open();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to place order");
      setPlacing(false);
    }
  };

  return (
    <div className="container-x py-8 md:py-12">
      <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal mb-6">Checkout</h1>

      {/* Stepper */}
      <div className="flex items-center gap-2 md:gap-4 mb-8" data-testid="checkout-stepper">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 grid place-items-center text-sm font-semibold ${i <= step ? "bg-terracotta text-off-white" : "bg-off-white-alt text-charcoal-muted border border-border"}`}>
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <div className="text-sm font-medium hidden md:block">
              <div className={i <= step ? "text-charcoal" : "text-charcoal-muted"}>{s}</div>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-[2px] ${i < step ? "bg-terracotta" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {step === 0 && (
            <StepAddress
              addresses={addresses}
              addressId={addressId}
              setAddressId={setAddressId}
              showAdd={showAdd}
              setShowAdd={setShowAdd}
              onSaved={loadAddrs}
              onContinue={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <StepPayment pay={pay} setPay={setPay} onBack={() => setStep(0)} onContinue={() => setStep(2)} />
          )}
          {step === 2 && (
            <StepReview
              items={items}
              address={addresses.find((a) => a.id === addressId)}
              pay={pay}
              onBack={() => setStep(1)}
              onPlace={place}
              placing={placing}
            />
          )}
        </div>

        <aside className="bg-white border border-border p-6 h-fit lg:sticky lg:top-32">
          <h3 className="font-heading font-semibold text-lg text-charcoal mb-4">Order Summary</h3>
          <div className="space-y-3 mb-4">
            {items.map((it) => (
              <div key={it.key} className="flex gap-3">
                <img src={it.image} alt="" className="w-14 h-14 object-cover" />
                <div className="flex-1 min-w-0 text-sm">
                  <div className="text-charcoal line-clamp-1">{it.title}</div>
                  <div className="text-[11px] text-charcoal-muted">Qty {it.qty}{it.variant ? ` · ${it.variant}` : ""}</div>
                </div>
                <div className="text-sm font-medium">{inr(it.price * it.qty)}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1 text-sm text-charcoal-muted border-t border-border pt-3">
            <div className="flex justify-between"><span>Subtotal</span><span className="text-charcoal">{inr(subtotal)}</span></div>
            <div className="flex justify-between"><span>Delivery</span>{delivery === 0 ? <span className="text-sage font-medium">FREE</span> : <span>{inr(delivery)}</span>}</div>
            {discount > 0 && <div className="flex justify-between text-sage"><span>Discount ({savedCoupon.code})</span><span>−{inr(discount)}</span></div>}
          </div>
          <div className="border-t border-border mt-3 pt-3 flex justify-between items-baseline">
            <span className="text-charcoal font-medium">Total</span>
            <span className="font-heading font-bold text-2xl text-charcoal" data-testid="checkout-total">{inr(total)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepAddress({ addresses, addressId, setAddressId, showAdd, setShowAdd, onSaved, onContinue }) {
  return (
    <div className="bg-white border border-border p-5 md:p-6" data-testid="step-address">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-xl text-charcoal">Delivery address</h2>
        <button onClick={() => setShowAdd(true)} className="text-sm text-terracotta font-medium inline-flex items-center gap-1 hover:underline" data-testid="add-address-btn">
          <Plus className="w-4 h-4" /> Add new
        </button>
      </div>

      {addresses.length === 0 && !showAdd && (
        <div className="text-center py-6 border border-dashed border-border">
          <MapPin className="w-8 h-8 mx-auto text-charcoal-muted mb-2" />
          <div className="text-sm text-charcoal-muted mb-3">No saved addresses yet.</div>
          <button onClick={() => setShowAdd(true)} className="btn-terracotta text-sm py-2 px-4">Add your first address</button>
        </div>
      )}

      <div className="space-y-3" data-testid="address-list">
        {addresses.map((a) => (
          <label key={a.id} className={`flex gap-3 border-2 p-4 cursor-pointer transition-colors ${addressId === a.id ? "border-terracotta bg-terracotta/5" : "border-border bg-off-white hover:border-charcoal"}`} data-testid={`address-${a.id}`}>
            <input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="accent-terracotta mt-1" />
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-charcoal">{a.name}</span>
                <span className="text-[10px] uppercase tracking-widest bg-off-white-alt px-2 py-0.5 text-charcoal-muted inline-flex items-center gap-1">
                  {a.type === "work" ? <Briefcase className="w-3 h-3" /> : <Home className="w-3 h-3" />} {a.type}
                </span>
                {a.is_default && <span className="text-[10px] uppercase tracking-widest text-terracotta font-semibold">Default</span>}
              </div>
              <div className="text-charcoal-muted">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} — {a.pincode}</div>
              <div className="text-charcoal-muted mt-1">Phone: {a.phone}</div>
            </div>
          </label>
        ))}
      </div>

      {showAdd && <AddressForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); onSaved(); }} />}

      <div className="mt-6 flex justify-end">
        <button disabled={!addressId} onClick={onContinue} className="btn-terracotta" data-testid="address-continue-btn">
          Continue to Payment <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AddressForm({ onClose, onSaved, existing }) {
  const [f, setF] = useState(existing || { name: "", phone: "", pincode: SERVICEABLE_PINCODE, line1: "", line2: "", city: "Lucknow", state: "Uttar Pradesh", type: "home", is_default: false });
  const [busy, setBusy] = useState(false);
  const pinBad = f.pincode && f.pincode !== SERVICEABLE_PINCODE;
  const submit = async (e) => {
    e.preventDefault();
    if (f.pincode !== SERVICEABLE_PINCODE) {
      toast.error(`We deliver only to Pincode ${SERVICEABLE_PINCODE} (${SERVICEABLE_AREAS})`);
      return;
    }
    setBusy(true);
    try {
      if (existing) await api.patch(`/addresses/${existing.id}`, f);
      else await api.post("/addresses", f);
      toast.success("Address saved");
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-5 border border-border p-4 bg-off-white-alt space-y-3" data-testid="address-form">
      <div className="grid md:grid-cols-2 gap-3">
        <input data-testid="addr-name" required placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border-2 border-border focus:border-terracotta bg-white px-3 py-2 outline-none" />
        <input data-testid="addr-phone" required placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="border-2 border-border focus:border-terracotta bg-white px-3 py-2 outline-none" />
      </div>
      <input data-testid="addr-line1" required placeholder="Address line 1" value={f.line1} onChange={(e) => setF({ ...f, line1: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-2 outline-none" />
      <input data-testid="addr-line2" placeholder="Address line 2 (optional)" value={f.line2} onChange={(e) => setF({ ...f, line2: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-white px-3 py-2 outline-none" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <input data-testid="addr-city" required placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className="border-2 border-border focus:border-terracotta bg-white px-3 py-2 outline-none" />
        <input data-testid="addr-state" required placeholder="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} className="border-2 border-border focus:border-terracotta bg-white px-3 py-2 outline-none" />
        <div>
          <input
            data-testid="addr-pincode"
            required
            placeholder="Pincode"
            value={f.pincode}
            onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            className={`w-full border-2 focus:border-terracotta bg-white px-3 py-2 outline-none ${pinBad ? "border-destructive" : "border-border"}`}
          />
          {pinBad && (
            <div className="text-[11px] text-destructive mt-1" data-testid="addr-pincode-error">
              We deliver only to {SERVICEABLE_PINCODE} ({SERVICEABLE_AREAS})
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {["home", "work", "other"].map((t) => (
            <button key={t} type="button" data-testid={`addr-type-${t}`} onClick={() => setF({ ...f, type: t })} className={`px-3 py-1.5 text-xs uppercase tracking-widest border-2 ${f.type === t ? "border-terracotta text-terracotta bg-terracotta/5" : "border-border text-charcoal-muted"}`}>{t}</button>
          ))}
        </div>
        <label className="text-sm inline-flex items-center gap-2 text-charcoal">
          <input type="checkbox" checked={f.is_default} onChange={(e) => setF({ ...f, is_default: e.target.checked })} className="accent-terracotta" data-testid="addr-default" />
          Set as default
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-charcoal-muted hover:text-charcoal">Cancel</button>
        <button type="submit" disabled={busy || pinBad} className="btn-terracotta text-sm py-2 px-4" data-testid="addr-save">{busy ? "Saving…" : "Save address"}</button>
      </div>
    </form>
  );
}

function StepPayment({ pay, setPay, onBack, onContinue }) {
  const [rzpEnabled, setRzpEnabled] = useState(null);
  useEffect(() => { api.get("/payments/config").then((r) => setRzpEnabled(r.data.enabled)); }, []);
  const options = [
    { id: "upi", label: "UPI", desc: "PhonePe, GPay, Paytm & more", icon: Wallet, gateway: true },
    { id: "card", label: "Credit / Debit Card", desc: "Visa, Mastercard, RuPay", icon: CreditCard, gateway: true },
    { id: "netbanking", label: "Net Banking", desc: "All major banks supported", icon: Landmark, gateway: true },
    { id: "cod", label: "Cash on Delivery", desc: "Pay when you receive", icon: Truck, gateway: false },
  ];
  return (
    <div className="bg-white border border-border p-5 md:p-6" data-testid="step-payment">
      <h2 className="font-heading font-semibold text-xl text-charcoal mb-4">Payment method</h2>
      {rzpEnabled === false && (
        <div className="text-xs bg-ochre/10 border border-ochre/40 text-charcoal-muted p-3 mb-4" data-testid="razorpay-demo-notice">
          Razorpay test keys are not configured yet — non-COD selections will complete in demo mode. Add <span className="font-mono">RAZORPAY_KEY_ID</span> &amp; <span className="font-mono">RAZORPAY_KEY_SECRET</span> in <span className="font-mono">/app/backend/.env</span> to enable the real gateway.
        </div>
      )}
      <div className="space-y-3">
        {options.map((o) => (
          <label key={o.id} className={`flex items-center gap-3 border-2 p-4 cursor-pointer transition-colors ${pay === o.id ? "border-terracotta bg-terracotta/5" : "border-border bg-off-white hover:border-charcoal"}`} data-testid={`pay-${o.id}`}>
            <input type="radio" name="pay" checked={pay === o.id} onChange={() => setPay(o.id)} className="accent-terracotta" />
            <o.icon className={`w-5 h-5 ${pay === o.id ? "text-terracotta" : "text-charcoal-muted"}`} />
            <div className="flex-1">
              <div className="font-medium text-charcoal">{o.label}</div>
              <div className="text-xs text-charcoal-muted">{o.desc}</div>
            </div>
            {o.gateway && rzpEnabled && <span className="text-[10px] uppercase tracking-widest text-sage font-bold">Razorpay</span>}
          </label>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-charcoal-muted hover:text-charcoal">← Back</button>
        <button onClick={onContinue} className="btn-terracotta" data-testid="payment-continue-btn">Continue to Review <ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function StepReview({ items, address, pay, onBack, onPlace, placing }) {
  return (
    <div className="bg-white border border-border p-5 md:p-6" data-testid="step-review">
      <h2 className="font-heading font-semibold text-xl text-charcoal mb-4">Review your order</h2>

      <div className="mb-5 border border-border p-4 bg-off-white-alt">
        <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Delivering to</div>
        {address ? (
          <div className="text-sm">
            <div className="font-medium text-charcoal">{address.name} <span className="text-charcoal-muted">· {address.phone}</span></div>
            <div className="text-charcoal-muted">{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} — {address.pincode}</div>
          </div>
        ) : <div className="text-sm text-destructive">No address selected</div>}
      </div>

      <div className="mb-5 border border-border p-4 bg-off-white-alt">
        <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Payment method</div>
        <div className="text-sm font-medium text-charcoal uppercase">{pay}</div>
      </div>

      <div className="space-y-3 mb-5">
        {items.map((it) => (
          <div key={it.key} className="flex gap-3 border-b border-border pb-3 last:border-0">
            <img src={it.image} alt="" className="w-16 h-16 object-cover" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-charcoal">{it.title}</div>
              <div className="text-xs text-charcoal-muted">Qty {it.qty}{it.variant ? ` · ${it.variant}` : ""}</div>
            </div>
            <div className="text-sm font-medium">{inr(it.price * it.qty)}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-charcoal-muted hover:text-charcoal">← Back</button>
        <button onClick={onPlace} disabled={placing || !address} className="btn-terracotta" data-testid="place-order-btn">
          {placing ? "Placing order…" : "Place Order"}
        </button>
      </div>
    </div>
  );
}
