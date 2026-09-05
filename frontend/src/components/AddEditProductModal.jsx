import { useEffect, useState, useRef } from "react";
import { api, inr, API } from "../lib/api";
import { X, Plus, Trash2, UploadCloud, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { slug: "tiles", name: "Tiles" },
  { slug: "wall-stencils", name: "Wall Stencils" },
  { slug: "wall-stickers", name: "Wall Stickers" },
  { slug: "wallpapers", name: "Wallpapers" },
  { slug: "paints", name: "Paints" },
  { slug: "home-decor", name: "Home Decor" },
  { slug: "flooring", name: "Flooring" },
];

const EMPTY = { title: "", category: "tiles", price: "", mrp: "", stock: 0, description: "", material: "", images: [""], variants: [] };

export default function AddEditProductModal({ existing, onClose, onSaved }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const fileRef = useRef(null);

  const resolveImg = (u) => (u?.startsWith("/api/uploads/") ? `${process.env.REACT_APP_BACKEND_URL}${u}` : u);

  const aiFill = async () => {
    if (!f.title.trim()) { toast.error("Add a product title first — even a rough one"); return; }
    setAiBusy(true);
    try {
      const { data } = await api.post("/ai/generate-description", {
        title: f.title,
        category: f.category,
        keywords: (f.description || "").slice(0, 200),
        material: f.material || null,
      });
      setF((prev) => ({
        ...prev,
        title: data.title || prev.title,
        description: [data.description, (data.bullets || []).map((b) => `• ${b}`).join("\n")].filter(Boolean).join("\n\n"),
      }));
      toast.success("AI listing generated — review and edit before saving");
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI unavailable, try again");
    } finally { setAiBusy(false); }
  };

  const doUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await api.post("/uploads/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
        uploaded.push(data.url);
      }
      const existingImgs = f.images.filter((u) => u.trim());
      setF({ ...f, images: [...existingImgs, ...uploaded] });
      toast.success(`Uploaded ${uploaded.length} photo(s)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) doUpload(e.dataTransfer.files);
  };

  useEffect(() => {
    if (existing) {
      setF({
        title: existing.title || "",
        category: existing.category || "tiles",
        price: existing.price ?? "",
        mrp: existing.mrp ?? "",
        stock: existing.stock ?? 0,
        description: existing.description || "",
        material: existing.material || "",
        images: existing.images?.length ? [...existing.images] : [""],
        variants: existing.variants?.length ? [...existing.variants] : [],
      });
    } else setF(EMPTY);
  }, [existing]);

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      title: f.title.trim(),
      category: f.category,
      price: parseFloat(f.price) || 0,
      mrp: f.mrp ? parseFloat(f.mrp) : null,
      stock: parseInt(f.stock, 10) || 0,
      description: f.description,
      material: f.material,
      images: f.images.filter((i) => i.trim()),
      variants: f.variants.filter((v) => v.name && v.value),
    };
    if (!payload.title || payload.price <= 0 || payload.images.length === 0) {
      toast.error("Title, price and at least one image are required");
      return;
    }
    setBusy(true);
    try {
      if (existing) await api.patch(`/seller/products/${existing.id}`, payload);
      else await api.post("/seller/products", payload);
      toast.success(existing ? "Product updated" : "Product added");
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  const setImage = (idx, v) => {
    const imgs = [...f.images];
    imgs[idx] = v;
    setF({ ...f, images: imgs });
  };
  const addImage = () => setF({ ...f, images: [...f.images, ""] });
  const removeImage = (idx) => setF({ ...f, images: f.images.filter((_, i) => i !== idx) });

  const setVariant = (idx, key, v) => {
    const vs = [...f.variants];
    vs[idx] = { ...vs[idx], [key]: key === "price_delta" ? parseFloat(v) || 0 : v };
    setF({ ...f, variants: vs });
  };
  const addVariant = () => setF({ ...f, variants: [...f.variants, { name: "Size", value: "", price_delta: 0 }] });
  const removeVariant = (idx) => setF({ ...f, variants: f.variants.filter((_, i) => i !== idx) });

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/40 grid place-items-center p-4 overflow-y-auto" data-testid="product-modal">
      <div className="bg-white border border-border w-full max-w-2xl p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold">{existing ? "Edit product" : "New product"}</div>
            <div className="font-heading font-bold text-2xl text-charcoal">{existing ? existing.title : "Add a product"}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-off-white-alt" data-testid="product-modal-close"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input required placeholder="Product name" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="product-title" className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />

          <div className="grid md:grid-cols-2 gap-3">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="product-category" className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none">
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            <input placeholder="Material (e.g. Ceramic)" value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })} data-testid="product-material" className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <input required type="number" placeholder="Price ₹" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} data-testid="product-price" className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
            <input type="number" placeholder="MRP ₹ (optional)" value={f.mrp} onChange={(e) => setF({ ...f, mrp: e.target.value })} data-testid="product-mrp" className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
            <input type="number" placeholder="Stock" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} data-testid="product-stock" className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
          </div>

          <textarea placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="product-description" rows={3} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />

          <div className="flex justify-end -mt-2">
            <button
              type="button"
              onClick={aiFill}
              disabled={aiBusy}
              data-testid="ai-generate-description-btn"
              className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 border border-terracotta text-terracotta hover:bg-terracotta hover:text-off-white transition-colors disabled:opacity-60"
            >
              {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {aiBusy ? "Generating…" : "AI generate title + description"}
            </button>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold mb-2">Photos *</div>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              data-testid="upload-dropzone"
              className="border-2 border-dashed border-border hover:border-terracotta bg-off-white p-5 text-center cursor-pointer mb-3 transition-colors"
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                data-testid="upload-file-input"
                onChange={(e) => doUpload(e.target.files)}
                className="hidden"
              />
              {uploading ? (
                <div className="inline-flex items-center gap-2 text-sm text-charcoal-muted"><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</div>
              ) : (
                <div>
                  <UploadCloud className="w-8 h-8 text-terracotta mx-auto mb-2" />
                  <div className="text-sm text-charcoal font-medium">Drop photos here or click to browse</div>
                  <div className="text-[11px] text-charcoal-muted mt-1">JPG/PNG/WEBP · Max 8MB each</div>
                </div>
              )}
            </div>
            {f.images.filter((u) => u.trim()).length > 0 && (
              <div className="grid grid-cols-4 md:grid-cols-6 gap-2 mb-2" data-testid="image-previews">
                {f.images.filter((u) => u.trim()).map((img, i) => (
                  <div key={i} className="relative aspect-square border border-border bg-off-white-alt" data-testid={`image-preview-${i}`}>
                    <img src={resolveImg(img)} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      data-testid={`remove-image-${i}`}
                      onClick={() => setF({ ...f, images: f.images.filter((_, idx) => idx !== i) })}
                      className="absolute top-1 right-1 w-5 h-5 grid place-items-center bg-charcoal/80 text-off-white rounded-full hover:bg-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <details className="text-xs text-charcoal-muted">
              <summary className="cursor-pointer hover:text-terracotta">Or paste image URLs</summary>
              <div className="mt-2 space-y-2">
                {f.images.map((img, i) => (
                  <div key={i} className="flex gap-2">
                    <input placeholder="https://…" value={img} onChange={(e) => setImage(i, e.target.value)} data-testid={`product-image-${i}`} className="flex-1 border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none" />
                  </div>
                ))}
                <button type="button" onClick={addImage} data-testid="add-image-url" className="text-xs text-terracotta hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add URL row</button>
              </div>
            </details>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold mb-2">Variants (size / color / finish) — optional</div>
            {f.variants.map((v, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_110px_auto] gap-2 mb-2">
                <select value={v.name} onChange={(e) => setVariant(i, "name", e.target.value)} data-testid={`variant-name-${i}`} className="border-2 border-border focus:border-terracotta bg-off-white px-2 py-2 outline-none text-sm">
                  <option>Size</option><option>Color</option><option>Finish</option>
                </select>
                <input placeholder="Value (e.g. 600x600mm)" value={v.value} onChange={(e) => setVariant(i, "value", e.target.value)} data-testid={`variant-value-${i}`} className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none text-sm" />
                <input type="number" placeholder="Δ price" value={v.price_delta ?? 0} onChange={(e) => setVariant(i, "price_delta", e.target.value)} data-testid={`variant-delta-${i}`} className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none text-sm" />
                <button type="button" onClick={() => removeVariant(i)} className="p-2 border border-destructive/40 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={addVariant} data-testid="add-variant" className="text-xs text-terracotta hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add variant</button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-charcoal-muted hover:text-charcoal">Cancel</button>
            <button type="submit" disabled={busy} data-testid="product-save-btn" className="btn-terracotta text-sm py-2 px-5">
              {busy ? "Saving…" : (existing ? "Save changes" : `Add product${f.price ? ` (${inr(parseFloat(f.price) || 0)})` : ""}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
