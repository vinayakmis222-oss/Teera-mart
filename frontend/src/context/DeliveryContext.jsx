import { createContext, useContext, useEffect, useState } from "react";

export const SERVICEABLE_PINCODE = "226013";
export const SERVICEABLE_AREAS = "Mubarakpur, Bhitauli & Allu";
export const DELIVERY_PROMISE = "2-hour delivery";

const KEY = "terramart_delivery_pincode_v1";
const DeliveryContext = createContext(null);

export function DeliveryProvider({ children }) {
  const [pincode, setPincodeState] = useState(() => localStorage.getItem(KEY) || "");
  useEffect(() => {
    if (pincode) localStorage.setItem(KEY, pincode);
    else localStorage.removeItem(KEY);
  }, [pincode]);

  const isServiceable = pincode === SERVICEABLE_PINCODE;
  const setPincode = (p) => setPincodeState((p || "").replace(/\D/g, "").slice(0, 6));
  const clearPincode = () => setPincodeState("");

  return (
    <DeliveryContext.Provider value={{ pincode, isServiceable, setPincode, clearPincode, SERVICEABLE_PINCODE, SERVICEABLE_AREAS }}>
      {children}
    </DeliveryContext.Provider>
  );
}

export const useDelivery = () => useContext(DeliveryContext);
