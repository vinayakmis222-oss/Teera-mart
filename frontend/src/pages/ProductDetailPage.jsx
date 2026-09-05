import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, inr } from "../lib/api";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useDelivery } from "../context/DeliveryContext";
import { Star, ShieldCheck, ShieldAlert, Truck, RotateCcw, ShoppingCart, Zap } from "lucide-react";
import { toast } from "sonner";
import { SimilarProducts, BoughtTogether } from "../components/SimilarAndBundles";
import PincodeChecker from "../components/PincodeChecker";

export default function ProductDetailPage() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [activeImg, setActiveImg] = useState(0);
  const [variantByGroup, setVariantByGroup] = useState({});
  const [rev, setRev] = useState({ rating: 5, comment: "" });
  const { addItem } = useCart();
  const { user } = useAuth();
  const { isServiceable } = useDelivery();

  useEffect(() => {
    api.get(`/products/${id}`).then((r) => setP(r.data));
    api.get(`/products/${id}/reviews`).then((r) => setReviews(r.data));
  }, [id]);

  if (!p) return <div className="container-x py-12 text-charcoal-muted">Loading…</div>;

  // group variants by name (Size, Finish, Color)
  const groups = (p.variants || []).reduce((acc, v) => {
    acc[v.name] = acc[v.name] || [];
    acc[v.name].push(v);
    return acc;
  }, {});
  const selectedVariants = Object.entries(groups).map(([name, arr]) => variantByGroup[name] || arr[0]);
  const finalPrice = p.price + selectedVariants.reduce((n, v) => n + (v?.price_delta || 0), 0);

  const submit = async () => {
    if (!user) { toast.error("Please login to review"); return; }
    try {
      const { data } = await api.post(`/products/${id}/reviews`, rev);
      setReviews((r) => [data, ...r]);
      setRev({ rating: 5, comment: "" });
      toast.success("Review submitted");
    } catch (e) {
      toast.error("Failed to submit review");
    }
  };

  const doAdd = () => {
    if (!isServiceable) { toast.error("Enter a serviceable pincode first (226013)"); return; }
    addItem(p, selectedVariants[0] || null, 1);
    toast.success("Added to cart");
  };

  return (
    <div className="container-x py-6 md:py-10">
      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Gallery */}
        <div className="flex gap-3">
          <div className="hidden md:flex flex-col gap-2 w-20">
            {p.images.map((img, i) => (
              <button
                key={i}
                data-testid={`thumb-${i}`}
                onClick={() => setActiveImg(i)}
                className={`aspect-square border-2 ${i === activeImg ? "border-terracotta" : "border-border"} overflow-hidden`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
          <div className="flex-1 aspect-square bg-white border border-border overflow-hidden">
            <img src={p.images[activeImg]} alt={p.title} className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Details */}
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">{p.category.replace(/-/g, " ")}</div>
          <h1 className="font-heading font-bold text-2xl md:text-4xl text-charcoal leading-tight mb-3" data-testid="product-title">{p.title}</h1>

          <div className="flex items-center gap-3 mb-4">
            <span className="badge-rating text-sm px-2.5 py-1">{p.rating} <Star className="w-3 h-3 fill-current" /></span>
            <span className="text-sm text-charcoal-muted">{p.reviews_count} ratings</span>
          </div>

          {p.seller && (
            <div className="inline-flex items-center gap-2 text-xs bg-off-white-alt border border-border px-3 py-1.5 mb-4" data-testid="seller-badge">
              {p.seller.verified ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-sage" />
                  <span className="font-medium text-charcoal">Sold by {p.seller.business_name}</span>
                  <span className="text-[10px] uppercase tracking-widest text-sage font-bold" data-testid="verified-badge">Verified</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-charcoal-muted" />
                  <span className="font-medium text-charcoal">Sold by {p.seller.business_name}</span>
                  <span className="text-[10px] uppercase tracking-widest text-charcoal-muted font-bold" data-testid="pending-badge">Pending Verification</span>
                </>
              )}
            </div>
          )}

          <div className="flex items-baseline gap-3 flex-wrap mb-6">
            <span className="font-heading font-bold text-3xl md:text-4xl text-charcoal" data-testid="product-price">{inr(finalPrice)}</span>
            {p.mrp > finalPrice && <span className="text-charcoal-muted line-through">{inr(p.mrp)}</span>}
            {p.discount > 0 && <span className="text-terracotta font-semibold text-sm">{p.discount}% off</span>}
          </div>

          <PincodeChecker />

          {/* Variants */}
          {Object.entries(groups).map(([name, arr]) => (
            <div key={name} className="mb-5">
              <div className="text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold mb-2">{name}</div>
              <div className="flex flex-wrap gap-2">
                {arr.map((v, i) => {
                  const selected = (variantByGroup[name]?.value || arr[0].value) === v.value;
                  return (
                    <button
                      key={v.value + i}
                      data-testid={`variant-${name}-${v.value}`}
                      onClick={() => setVariantByGroup((s) => ({ ...s, [name]: v }))}
                      className={`px-4 py-2 border-2 text-sm font-medium transition-colors ${
                        selected ? "border-terracotta bg-terracotta/5 text-terracotta" : "border-border bg-white text-charcoal hover:border-charcoal"
                      }`}
                    >
                      {v.value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex gap-3 mt-6">
            <button data-testid="add-to-cart-btn" onClick={doAdd} disabled={!isServiceable} className="btn-terracotta flex-1 disabled:cursor-not-allowed">
              <ShoppingCart className="w-4 h-4" /> Add to Cart
            </button>
            <button data-testid="buy-now-btn" onClick={doAdd} disabled={!isServiceable} className="btn-outline-charcoal flex-1 disabled:cursor-not-allowed disabled:opacity-50">
              <Zap className="w-4 h-4" /> Buy Now
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 text-xs text-charcoal-muted">
            <div className="flex items-center gap-2 border border-border p-3"><Truck className="w-4 h-4 text-terracotta" /> Fast dispatch</div>
            <div className="flex items-center gap-2 border border-border p-3"><RotateCcw className="w-4 h-4 text-terracotta" /> 7-day returns</div>
            <div className="flex items-center gap-2 border border-border p-3"><ShieldCheck className="w-4 h-4 text-terracotta" /> Verified seller</div>
          </div>

          <div className="mt-8">
            <h3 className="font-heading font-semibold text-lg text-charcoal mb-2">About this product</h3>
            <p className="text-sm text-charcoal-muted leading-relaxed">{p.description}</p>
            <div className="mt-3 text-xs text-charcoal-muted"><span className="text-charcoal font-medium">Material:</span> {p.material}</div>
          </div>
        </div>
      </div>

      {/* Similar + Frequently Bought Together */}
      <BoughtTogether productId={p.id} />
      <SimilarProducts productId={p.id} />

      {/* Reviews */}
      <section className="mt-14 border-t border-border pt-10" data-testid="reviews-section">
        <h2 className="font-heading font-bold text-2xl md:text-3xl text-charcoal mb-6">Ratings & Reviews</h2>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="border border-border p-6 bg-white">
            <div className="text-5xl font-heading font-bold text-charcoal flex items-baseline gap-2">
              {p.rating}<Star className="w-5 h-5 fill-terracotta text-terracotta" />
            </div>
            <div className="text-sm text-charcoal-muted mb-4">{p.reviews_count} ratings</div>
            {user ? (
              <div className="space-y-3">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRev({ ...rev, rating: n })} data-testid={`star-${n}`}>
                      <Star className={`w-5 h-5 ${n <= rev.rating ? "fill-terracotta text-terracotta" : "text-border"}`} />
                    </button>
                  ))}
                </div>
                <textarea
                  data-testid="review-input"
                  value={rev.comment}
                  onChange={(e) => setRev({ ...rev, comment: e.target.value })}
                  placeholder="Share your thoughts…"
                  className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 text-sm outline-none"
                  rows={3}
                />
                <button data-testid="submit-review-btn" onClick={submit} className="btn-terracotta w-full">Submit review</button>
              </div>
            ) : (
              <div className="text-sm text-charcoal-muted">Login to write a review.</div>
            )}
          </div>
          <div className="md:col-span-2 space-y-4">
            {reviews.length === 0 && <div className="text-sm text-charcoal-muted">Be the first to review this product.</div>}
            {reviews.map((r) => (
              <div key={r.id} className="border border-border bg-white p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-rating">{r.rating} <Star className="w-2.5 h-2.5 fill-current" /></span>
                  <span className="text-sm font-medium text-charcoal">{r.author_name}</span>
                </div>
                <p className="text-sm text-charcoal-muted leading-relaxed">{r.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
