import { useState } from "react";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api, inr, resolveImg, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";

const ROOM_PRESETS = ["Living Room", "Bedroom", "Bathroom", "Kitchen", "Kids Room", "Home Office", "Balcony"];
const STYLE_PRESETS = ["Minimalist", "Scandinavian", "Boho", "Modern Luxe", "Rustic", "Industrial", "Coastal", "Traditional Indian"];

export default function RoomDesignerPage() {
  const [form, setForm] = useState({ room_type: "Living Room", style: "Minimalist", budget: 50000, description: "" });
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);

  const generate = async () => {
    if (!form.room_type.trim()) { toast.error("Pick a room"); return; }
    setLoading(true);
    setPlan(null);
    try {
      const { data } = await api.post("/ai/design-room", {
        room_type: form.room_type,
        style: form.style || null,
        budget: form.budget ? Number(form.budget) : null,
        description: form.description || null,
      });
      setPlan(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "AI is busy right now, try again");
    } finally { setLoading(false); }
  };

  return (
    <div className="container-x py-8" data-testid="room-designer-page">
      <div className="max-w-3xl mb-8">
        <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> AI Room Designer
        </div>
        <h1 className="font-heading font-bold text-4xl md:text-5xl text-charcoal leading-tight">
          Describe your room. We'll pick the pieces.
        </h1>
        <p className="mt-3 text-charcoal-muted text-base max-w-2xl">
          TerraBot studies your room, style, and budget, then curates a shortlist across tiles, paints, wallpapers, and decor from verified TerraMart sellers.
        </p>
      </div>

      <div className="grid md:grid-cols-[380px_1fr] gap-6">
        <div className="bg-white border border-border p-5 h-fit md:sticky md:top-24">
          <div>
            <label className="text-xs uppercase tracking-widest text-charcoal-muted font-semibold">Room</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ROOM_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  data-testid={`room-preset-${r.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => setForm({ ...form, room_type: r })}
                  className={`text-xs px-3 py-1.5 border transition-colors ${form.room_type === r ? "bg-charcoal text-off-white border-charcoal" : "bg-off-white border-border text-charcoal hover:border-terracotta"}`}
                >{r}</button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="text-xs uppercase tracking-widest text-charcoal-muted font-semibold">Style</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`style-preset-${s.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => setForm({ ...form, style: s })}
                  className={`text-xs px-3 py-1.5 border transition-colors ${form.style === s ? "bg-charcoal text-off-white border-charcoal" : "bg-off-white border-border text-charcoal hover:border-terracotta"}`}
                >{s}</button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="text-xs uppercase tracking-widest text-charcoal-muted font-semibold">Budget (₹)</label>
            <input
              type="number"
              min={0}
              data-testid="designer-budget-input"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              className="w-full mt-2 border-2 border-border focus:border-terracotta bg-off-white px-3 py-2.5 outline-none"
            />
          </div>

          <div className="mt-5">
            <label className="text-xs uppercase tracking-widest text-charcoal-muted font-semibold">Notes (optional)</label>
            <textarea
              rows={3}
              data-testid="designer-notes-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. north-facing, small window, prefer warm tones"
              className="w-full mt-2 border-2 border-border focus:border-terracotta bg-off-white px-3 py-2.5 outline-none text-sm"
            />
          </div>

          <button
            data-testid="designer-generate-btn"
            onClick={generate}
            disabled={loading}
            className="btn-terracotta w-full mt-6 py-3 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Designing…</> : <><Sparkles className="w-4 h-4" /> Design my room</>}
          </button>
        </div>

        <div>
          {!plan && !loading && (
            <div className="border border-dashed border-border p-10 text-center text-charcoal-muted">
              Your curated room plan will appear here.
            </div>
          )}
          {loading && (
            <div className="border border-border p-10 text-center text-charcoal-muted flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
              Assembling colour palette and picks…
            </div>
          )}
          {plan && (
            <div className="space-y-6" data-testid="designer-result">
              <div className="bg-white border border-border p-5">
                <div className="text-xs uppercase tracking-widest text-terracotta font-semibold mb-2">The vision</div>
                <p className="text-charcoal text-base leading-relaxed">{plan.summary}</p>
                {plan.palette?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-widest text-charcoal-muted font-semibold mb-2">Palette</div>
                    <div className="flex flex-wrap gap-2">
                      {plan.palette.map((c) => (
                        <span key={c} className="text-xs px-2.5 py-1 bg-off-white border border-border">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {plan.picks?.map((pick, i) => (
                <div key={`pick-${pick.category}-${i}`} className="bg-white border border-border p-5" data-testid={`designer-pick-${i}`}>
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-terracotta font-semibold">{pick.category?.replace(/-/g, " ")}</div>
                      <div className="font-heading font-bold text-xl text-charcoal">{pick.keyword}</div>
                    </div>
                    <Link to={`/category/${pick.category}?q=${encodeURIComponent(pick.keyword || "")}`} className="text-xs text-terracotta hover:underline inline-flex items-center gap-1 shrink-0">
                      View all <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <p className="text-sm text-charcoal-muted mb-3">{pick.why}</p>
                  {pick.products?.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {pick.products.map((p) => (
                        <Link
                          to={`/product/${p.id}`}
                          key={p.id}
                          data-testid={`designer-product-${p.id}`}
                          className="border border-border hover:border-terracotta transition-colors"
                        >
                          <div className="aspect-square bg-off-white-alt overflow-hidden">
                            <img src={resolveImg(p.images?.[0])} alt={p.title} loading="lazy" className="w-full h-full object-cover" />
                          </div>
                          <div className="p-2">
                            <div className="text-xs text-charcoal line-clamp-2 min-h-[2.5rem]">{p.title}</div>
                            <div className="text-sm font-heading font-bold text-charcoal mt-1">{inr(p.price)}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-charcoal-muted italic">No live products yet — browse the category to explore options.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
