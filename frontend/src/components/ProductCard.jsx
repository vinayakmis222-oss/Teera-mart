import { Link } from "react-router-dom";
import { Star, Zap } from "lucide-react";
import { useState } from "react";
import { inr, resolveImg } from "../lib/api";

export default function ProductCard({ p }) {
  const [loaded, setLoaded] = useState(false);
  const discount = p.discount || Math.round(((p.mrp - p.price) / p.mrp) * 100);
  return (
    <Link
      to={`/product/${p.id}`}
      data-testid={`product-card-${p.id}`}
      className="group bg-white border border-border hover:shadow-cardHover hover:-translate-y-1 transition-all duration-300 flex flex-col"
    >
      <div className="relative aspect-square overflow-hidden bg-off-white-alt">
        {!loaded && <div className="absolute inset-0 bg-off-white-alt animate-pulse" data-testid="img-skeleton" />}
        <img
          src={resolveImg(p.images?.[0])}
          alt={p.title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
        {discount > 0 && (
          <div className="absolute top-2 left-2 bg-terracotta text-off-white text-[10px] font-bold uppercase tracking-wider px-2 py-1">
            {discount}% off
          </div>
        )}
        <div className="absolute bottom-2 left-2 bg-charcoal text-off-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 inline-flex items-center gap-1" data-testid="two-hour-badge">
          <Zap className="w-2.5 h-2.5 text-terracotta" /> 2-Hour Delivery
        </div>
      </div>
      <div className="p-3 md:p-4 flex flex-col gap-2 flex-1">
        <h3 className="text-sm md:text-base font-medium text-charcoal line-clamp-2 leading-snug">{p.title}</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="badge-rating">
            {p.rating} <Star className="w-2.5 h-2.5 fill-current" />
          </span>
          <span className="text-charcoal-muted">({p.reviews_count})</span>
        </div>
        <div className="mt-auto flex items-baseline gap-2 flex-wrap">
          <span className="text-base md:text-lg font-bold text-charcoal">{inr(p.price)}</span>
          {p.mrp > p.price && <span className="text-xs text-charcoal-muted line-through">{inr(p.mrp)}</span>}
        </div>
        <div className="text-[11px] text-charcoal-muted truncate">{p.material}</div>
        {p.seller_verified === false && (
          <div className="text-[10px] uppercase tracking-widest text-charcoal-muted inline-flex items-center gap-1" data-testid="card-pending-note">
            <span className="w-1.5 h-1.5 bg-charcoal-muted rounded-full" /> Pending verification
          </div>
        )}
      </div>
    </Link>
  );
}
