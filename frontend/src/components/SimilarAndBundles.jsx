import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, inr } from "../lib/api";
import { useCart } from "../context/CartContext";
import { Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import ProductCard from "./ProductCard";

export function SimilarProducts({ productId }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api.get(`/products/${productId}/similar?limit=8`).then((r) => setItems(r.data));
  }, [productId]);
  if (items === null) return <SkeletonRow />;
  if (items.length === 0) return null;
  return (
    <section className="mt-14 border-t border-border pt-10" data-testid="similar-products">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-1">You may also like</div>
          <h2 className="font-heading font-bold text-2xl md:text-3xl text-charcoal">Similar Products</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.slice(0, 4).map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}

export function BoughtTogether({ productId }) {
  const [data, setData] = useState(null);
  const { addItem } = useCart();
  const [selected, setSelected] = useState({}); // id -> bool
  useEffect(() => {
    api.get(`/products/${productId}/bought-together`).then((r) => {
      setData(r.data);
      const s = { [r.data.anchor.id]: true };
      r.data.items.forEach((i) => (s[i.id] = true));
      setSelected(s);
    });
  }, [productId]);

  if (!data || data.items.length === 0) return null;

  const all = [data.anchor, ...data.items];
  const selectedItems = all.filter((p) => selected[p.id]);
  const bundleTotal = selectedItems.reduce((sum, p) => sum + p.price, 0);
  const bundleMrp = selectedItems.reduce((sum, p) => sum + (p.mrp || p.price), 0);

  const addAll = () => {
    selectedItems.forEach((p) => addItem(p, p.variants?.[0] || null, 1));
    toast.success(`Added ${selectedItems.length} items to cart`);
  };

  return (
    <section className="mt-14 border-t border-border pt-10" data-testid="bought-together">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-1">Complete the look</div>
        <h2 className="font-heading font-bold text-2xl md:text-3xl text-charcoal">Frequently Bought Together</h2>
      </div>
      <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
        <div className="flex items-center gap-3 md:gap-4 overflow-x-auto pb-2">
          {all.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 md:gap-4">
              {i > 0 && <Plus className="w-4 h-4 text-charcoal-muted shrink-0" />}
              <label className={`shrink-0 w-32 md:w-40 border-2 p-2 cursor-pointer transition-colors ${selected[p.id] ? "border-terracotta bg-terracotta/5" : "border-border bg-white"}`} data-testid={`bt-card-${p.id}`}>
                <div className="relative aspect-square bg-off-white-alt overflow-hidden mb-2">
                  <img src={p.images?.[0]} loading="lazy" alt="" className="w-full h-full object-cover" />
                  <div className="absolute bottom-1 left-1 bg-charcoal text-off-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5" data-testid="two-hour-badge">
                    2-Hour Delivery
                  </div>
                </div>
                <div className="text-xs text-charcoal line-clamp-2 min-h-[2rem]">{p.title}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-bold text-charcoal">{inr(p.price)}</span>
                  <input
                    type="checkbox"
                    checked={!!selected[p.id]}
                    onChange={(e) => setSelected({ ...selected, [p.id]: e.target.checked })}
                    className="accent-terracotta"
                    data-testid={`bt-check-${p.id}`}
                  />
                </div>
              </label>
            </div>
          ))}
        </div>

        <div className="bg-off-white-alt border border-border p-5 md:min-w-[220px]">
          <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted mb-1">Bundle total</div>
          <div className="font-heading font-bold text-2xl text-charcoal mb-1">{inr(bundleTotal)}</div>
          {bundleMrp > bundleTotal && (
            <div className="text-xs text-charcoal-muted line-through mb-2">{inr(bundleMrp)}</div>
          )}
          <div className="text-[11px] text-charcoal-muted mb-3">{selectedItems.length} items selected</div>
          <button
            onClick={addAll}
            disabled={selectedItems.length === 0}
            data-testid="bt-add-all-btn"
            className="btn-terracotta w-full text-sm py-2"
          >
            <ShoppingCart className="w-4 h-4" /> Add all to cart
          </button>
        </div>
      </div>
    </section>
  );
}

function SkeletonRow() {
  return (
    <div className="mt-14 border-t border-border pt-10">
      <div className="h-8 bg-off-white-alt w-64 animate-pulse mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] bg-off-white-alt animate-pulse" />
        ))}
      </div>
    </div>
  );
}
