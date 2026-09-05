import { useState, useEffect } from "react";
import { useDelivery, SERVICEABLE_PINCODE, SERVICEABLE_AREAS } from "../context/DeliveryContext";
import { MapPin, CheckCircle2, XCircle, Zap } from "lucide-react";

export default function PincodeChecker() {
  const { pincode, isServiceable, setPincode } = useDelivery();
  const [input, setInput] = useState(pincode || "");
  const [checked, setChecked] = useState(!!pincode);

  useEffect(() => { setInput(pincode || ""); setChecked(!!pincode); }, [pincode]);

  const check = (e) => {
    e?.preventDefault?.();
    if (input.length !== 6) return;
    setPincode(input);
    setChecked(true);
  };

  const change = () => { setChecked(false); setPincode(""); setInput(""); };

  return (
    <div className="border border-border bg-off-white-alt p-4 mb-5" data-testid="pincode-checker">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-4 h-4 text-terracotta" />
        <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold">Check delivery</div>
      </div>
      {!checked ? (
        <form onSubmit={check} className="flex gap-2">
          <input
            data-testid="pincode-input"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Enter pincode to check delivery"
            inputMode="numeric"
            className="flex-1 border-2 border-border focus:border-terracotta bg-white px-3 py-2.5 outline-none tracking-widest"
          />
          <button
            data-testid="pincode-check-btn"
            type="submit"
            disabled={input.length !== 6}
            className="btn-terracotta py-2 px-5 text-sm"
          >
            Check
          </button>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          {isServiceable ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-sage shrink-0 mt-0.5" />
              <div className="flex-1" data-testid="pincode-serviceable">
                <div className="text-sm font-semibold text-charcoal">Delivery available in your area</div>
                <div className="text-xs text-charcoal-muted inline-flex items-center gap-1 mt-0.5">
                  <Zap className="w-3 h-3 text-terracotta" /> Arrives within 2 hours · Pincode {pincode}
                </div>
              </div>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1" data-testid="pincode-not-serviceable">
                <div className="text-sm font-semibold text-charcoal">Not available in your area yet</div>
                <div className="text-xs text-charcoal-muted mt-0.5">
                  Currently we deliver only in {SERVICEABLE_AREAS} (Pincode {SERVICEABLE_PINCODE}).
                </div>
              </div>
            </>
          )}
          <button
            data-testid="pincode-change-btn"
            onClick={change}
            className="text-xs text-terracotta font-medium hover:underline shrink-0"
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
}
