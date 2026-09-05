import { useDelivery, SERVICEABLE_PINCODE, SERVICEABLE_AREAS } from "../context/DeliveryContext";
import { Zap, X } from "lucide-react";
import { useState } from "react";

export default function ServiceableAreaBanner() {
  const { pincode, isServiceable } = useDelivery();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-terracotta text-off-white" data-testid="service-area-banner">
      <div className="container-x py-2.5 flex items-center gap-3 text-xs md:text-sm">
        <Zap className="w-4 h-4 shrink-0" />
        <div className="flex-1 leading-snug">
          <span className="font-semibold">Currently serving {SERVICEABLE_AREAS} ({SERVICEABLE_PINCODE}) only</span>
          <span className="mx-2 opacity-60">·</span>
          <span className="opacity-95">2-hour delivery guaranteed</span>
          {pincode && !isServiceable && (
            <span className="ml-3 bg-off-white/20 px-2 py-0.5 uppercase tracking-widest text-[10px] font-semibold">
              Your pincode {pincode} is not serviceable
            </span>
          )}
        </div>
        <button
          data-testid="banner-dismiss"
          onClick={() => setDismissed(true)}
          className="opacity-70 hover:opacity-100 shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
