import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";

export const SERVICEABLE_PINCODE = "226013";
export const SERVICEABLE_AREAS = "Mubarakpur, Bhitauli & Allu";
export const DELIVERY_PROMISE = "2-hour delivery";

// Note: pincode is a non-sensitive UI preference — safe to persist in localStorage.
const KEY = "terramart_delivery_pincode_v1";
const DeliveryContext = createContext(null);

export function DeliveryProvider({ children }) {
  const [pincode, setPincodeState] = useState(() => localStorage.getItem(KEY) || "");
  useEffect(() => {
    if (pincode) localStorage.setItem(KEY, pincode);
    else localStorage.removeItem(KEY);
  }, [pincode]);

  const isServiceable = pincode === SERVICEABLE_PINCODE;
  const setPincode = useCallback((p) => setPincodeState((p || "").replace(/\D/g, "").slice(0, 6)), []);
  const clearPincode = useCallback(() => setPincodeState(""), []);

  const value = useMemo(
    () => ({ pincode, isServiceable, setPincode, clearPincode, SERVICEABLE_PINCODE, SERVICEABLE_AREAS }),
    [pincode, isServiceable, setPincode, clearPincode]
  );

  return <DeliveryContext.Provider value={value}>{children}</DeliveryContext.Provider>;
}

export const useDelivery = () => useContext(DeliveryContext);
