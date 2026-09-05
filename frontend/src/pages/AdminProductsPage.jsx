import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, inr } from "../lib/api";
import { Trash2, Search, Package } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { slug: "", name: "All" },
  { slug: "tiles", name: "Tiles" },
  { slug: "wall-stencils", name: "Stencils" },
  { slug: "wall-stickers", name: "Stickers" },
  { slug: "wallpapers", name: "Wallpapers" },
  { slug: "paints", name: "Paints" },
  { slug: "home-decor", name: "Home Decor" },
  { slug: "flooring", name: "Flooring" },
];

export default function AdminProductsPage() {
  const [products, setProducts] = useState(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  const load = () => {
    const params = {};
    if (q) params.q = q;
    if (category) params.category = category;
    return api.get("/admin/products", { params }).then((r) => setProducts(r.data));
  };
  useEffect(() => { load(); }, [category]);

  const del = async (p) => {
    if (!confirm(`Remove "${p.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/products/${p.id}`);
      toast.success("Product removed");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (!products) return <div className="text-charcoal-muted">Loading products…</div>;

  return (
    <div data-testid="admin-products-page">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-heading font-semibold text-2xl text-charcoal">Products ({products.length})</h2>
        <div className="flex gap-2 items-center">
          <form
            onSubmit={(e) => { e.preventDefault(); load(); }}
            className="relative"
          >
            <Search className="w-4 h-4 text-charcoal-muted absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title…"
              data-testid="admin-products-search"
              className="border-2 border-border focus:border-terracotta bg-white pl-8 pr-3 py-2 text-sm outline-none w-56"
            />
          </form>
          <select
            data-testid="admin-products-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border-2 border-border focus:border-terracotta bg-white px-3 py-2 text-sm outline-none"
          >
            {CATEGORIES.map((c) => <option key={c.slug || "all"} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="bg-white border border-dashed border-border p-10 text-center">
          <Package className="w-10 h-10 mx-auto text-charcoal-muted mb-3" />
          <div className="text-sm text-charcoal-muted">No products match.</div>
        </div>
      ) : (
        <div className="bg-white border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]" data-testid="admin-products-table">
            <thead className="bg-off-white-alt text-xs uppercase tracking-[0.15em] text-charcoal-muted">
              <tr>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3">Seller</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3">Stock</th>
                <th className="text-right px-4 py-3">Rating</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-border" data-testid={`admin-product-row-${p.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={p.images?.[0]} alt="" className="w-10 h-10 object-cover" loading="lazy" />
                      <Link to={`/product/${p.id}`} className="font-medium text-charcoal hover:text-terracotta line-clamp-1">{p.title}</Link>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-charcoal">{p.seller_name || "—"}</div>
                    <div className="text-[11px] text-charcoal-muted">{p.seller_verified_flag ? "Verified" : "Pending"}</div>
                  </td>
                  <td className="px-4 py-3 text-charcoal-muted">{p.category}</td>
                  <td className="px-4 py-3 text-right font-medium">{inr(p.price)}</td>
                  <td className="px-4 py-3 text-right text-charcoal-muted">{p.stock}</td>
                  <td className="px-4 py-3 text-right text-charcoal-muted">{p.rating} ({p.reviews_count})</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => del(p)}
                        data-testid={`delete-product-${p.id}`}
                        className="text-xs border border-destructive/40 text-destructive hover:bg-destructive/10 px-2 py-1 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
