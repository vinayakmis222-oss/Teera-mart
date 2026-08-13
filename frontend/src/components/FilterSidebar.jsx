import { Star } from "lucide-react";

export default function FilterSidebar({ filters, setFilters, sellers, materials }) {
  const upd = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  return (
    <aside className="w-full lg:w-64 shrink-0 bg-white border border-border p-4 lg:p-5 h-fit sticky top-[120px]" data-testid="filter-sidebar">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-semibold text-lg text-charcoal">Filters</h3>
        <button
          data-testid="filter-clear-btn"
          onClick={() => setFilters({ min_price: "", max_price: "", seller_id: "", min_rating: "", material: "" })}
          className="text-xs text-terracotta hover:underline font-medium"
        >
          Clear all
        </button>
      </div>

      <div className="py-4 border-t border-border">
        <div className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold mb-3">Price</div>
        <div className="flex gap-2">
          <input
            data-testid="filter-min-price"
            type="number"
            placeholder="Min"
            value={filters.min_price}
            onChange={(e) => upd("min_price", e.target.value)}
            className="w-full border border-border bg-off-white px-2 py-1.5 text-sm outline-none focus:border-terracotta"
          />
          <input
            data-testid="filter-max-price"
            type="number"
            placeholder="Max"
            value={filters.max_price}
            onChange={(e) => upd("max_price", e.target.value)}
            className="w-full border border-border bg-off-white px-2 py-1.5 text-sm outline-none focus:border-terracotta"
          />
        </div>
      </div>

      <div className="py-4 border-t border-border">
        <div className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold mb-3">Rating</div>
        <div className="flex flex-col gap-2">
          {[4, 3, 2].map((r) => (
            <label key={r} className="flex items-center gap-2 cursor-pointer text-sm text-charcoal">
              <input
                type="radio"
                name="rating"
                data-testid={`filter-rating-${r}`}
                checked={String(filters.min_rating) === String(r)}
                onChange={() => upd("min_rating", r)}
                className="accent-terracotta"
              />
              <span className="flex items-center gap-1">
                {r}+ <Star className="w-3 h-3 fill-terracotta text-terracotta" />
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="py-4 border-t border-border">
        <div className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold mb-3">Seller</div>
        <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-charcoal">
            <input type="radio" name="seller" checked={!filters.seller_id} onChange={() => upd("seller_id", "")} className="accent-terracotta" />
            All sellers
          </label>
          {sellers.map((s) => (
            <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm text-charcoal">
              <input
                type="radio"
                name="seller"
                data-testid={`filter-seller-${s.id}`}
                checked={filters.seller_id === s.id}
                onChange={() => upd("seller_id", s.id)}
                className="accent-terracotta"
              />
              <span className="truncate">{s.business_name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="py-4 border-t border-border">
        <div className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold mb-3">Material</div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-charcoal">
            <input type="radio" name="mat" checked={!filters.material} onChange={() => upd("material", "")} className="accent-terracotta" />
            Any
          </label>
          {materials.map((m) => (
            <label key={m} className="flex items-center gap-2 cursor-pointer text-sm text-charcoal">
              <input
                type="radio"
                name="mat"
                data-testid={`filter-material-${m}`}
                checked={filters.material === m}
                onChange={() => upd("material", m)}
                className="accent-terracotta"
              />
              {m}
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}
