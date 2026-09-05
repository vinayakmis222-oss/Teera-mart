import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import ProductCard from "../components/ProductCard";
import FilterSidebar from "../components/FilterSidebar";
import { SlidersHorizontal } from "lucide-react";

const SORTS = [
  { value: "", label: "Featured" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Customer Rating" },
  { value: "newest", label: "Newest First" },
  { value: "popular", label: "Popularity" },
];

export default function CategoryPage() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const q = sp.get("q") || "";
  const urlMinPrice = sp.get("min_price") || "";
  const urlMaxPrice = sp.get("max_price") || "";
  const urlMaterial = sp.get("material") || "";

  const [items, setItems] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [sort, setSort] = useState("");
  const [filters, setFilters] = useState({ min_price: urlMinPrice, max_price: urlMaxPrice, seller_id: "", min_rating: "", material: urlMaterial });
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFilters((f) => ({ ...f, min_price: urlMinPrice, max_price: urlMaxPrice, material: urlMaterial }));
  }, [urlMinPrice, urlMaxPrice, urlMaterial]);

  const params = useMemo(() => {
    const p = { sort, limit: 60 };
    if (slug && slug !== "all") p.category = slug;
    if (q) p.q = q;
    Object.entries(filters).forEach(([k, v]) => { if (v !== "" && v != null) p[k] = v; });
    return p;
  }, [slug, sort, filters, q]);

  useEffect(() => {
    setLoading(true);
    api.get("/products", { params }).then((r) => { setItems(r.data); setLoading(false); });
  }, [params]);

  useEffect(() => {
    // Load all sellers by scanning products (simple derivation)
    api.get("/products", { params: { limit: 300 } }).then(async (r) => {
      const ids = [...new Set(r.data.map((p) => p.seller_id))];
      const results = await Promise.all(ids.map((id) => api.get(`/products`, { params: { seller_id: id, limit: 1 } })));
      const map = {};
      r.data.forEach((p) => { map[p.seller_id] = { id: p.seller_id, business_name: p.seller_name || "Seller" }; });
      // We don't have a public sellers list endpoint - infer names via product data.  Fallback: use seller_id short.
      const uniq = ids.map((id) => ({ id, business_name: `Seller ${id.slice(0, 6)}` }));
      setSellers(uniq);
    });
  }, []);

  const materials = useMemo(() => [...new Set(items.map((p) => p.material).filter(Boolean))].slice(0, 8), [items]);

  const title = slug === "all" ? "All Products" : (slug || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="container-x py-6 md:py-8">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-1">Category</div>
          <h1 className="font-heading font-bold text-2xl md:text-4xl text-charcoal tracking-tight" data-testid="category-title">
            {q ? `Results for "${q}"` : title}
          </h1>
          <p className="text-sm text-charcoal-muted mt-1">{items.length} products</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="mobile-filters-btn"
            onClick={() => setShowFilters((s) => !s)}
            className="lg:hidden inline-flex items-center gap-2 px-3 py-2 border-2 border-charcoal text-charcoal text-sm font-medium hover:bg-charcoal hover:text-off-white"
          >
            <SlidersHorizontal className="w-4 h-4" /> Filters
          </button>
          <select
            data-testid="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-white border-2 border-border focus:border-terracotta text-charcoal px-3 py-2 text-sm outline-none"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className={`${showFilters ? "block" : "hidden"} lg:block`}>
          <FilterSidebar filters={filters} setFilters={setFilters} sellers={sellers} materials={materials} />
        </div>

        <div className="flex-1 min-w-0" data-testid="products-grid">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-off-white-alt animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border">
              <div className="font-heading text-xl text-charcoal mb-2">No products match your filters</div>
              <div className="text-sm text-charcoal-muted">Try clearing some filters or exploring other categories.</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
              {items.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
