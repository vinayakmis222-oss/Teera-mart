import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
const KEY = "terramart_cart_v1";

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (product, variant, qty = 1) => {
    const key = `${product.id}::${variant?.value || "default"}`;
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      return [
        ...prev,
        {
          key,
          id: product.id,
          title: product.title,
          image: product.images?.[0],
          price: product.price + (variant?.price_delta || 0),
          variant: variant?.value || null,
          seller_id: product.seller_id,
          qty,
        },
      ];
    });
  };

  const updateQty = (key, qty) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty: Math.max(1, qty) } : i)));
  };
  const removeItem = (key) => setItems((prev) => prev.filter((i) => i.key !== key));
  const clear = () => setItems([]);

  const count = items.reduce((n, i) => n + i.qty, 0);
  const subtotal = items.reduce((n, i) => n + i.qty * i.price, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clear, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
