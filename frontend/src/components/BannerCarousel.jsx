import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

const BANNERS = [
  {
    tag: "Deals of the Day",
    title: "Warm your walls in terracotta",
    subtitle: "Up to 40% off on premium interior emulsion",
    cta: "Shop Paints",
    href: "/category/paints",
    image: "https://images.unsplash.com/photo-1525909002-1b05e0c869d8?w=1600&q=80",
    tint: "from-terracotta/70 to-terracotta/10",
  },
  {
    tag: "New Arrivals",
    title: "Handcrafted decor for calm homes",
    subtitle: "Ceramics, rattan, brass — curated pieces",
    cta: "Explore Decor",
    href: "/category/home-decor",
    image: "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=1600&q=80",
    tint: "from-charcoal/70 to-charcoal/10",
  },
  {
    tag: "Best of Tiles",
    title: "Floors that feel like art",
    subtitle: "Marble looks · Terracotta hex · Slate stone",
    cta: "Browse Tiles",
    href: "/category/tiles",
    image: "https://images.unsplash.com/photo-1600607686527-6fb886090705?w=1600&q=80",
    tint: "from-sage/70 to-sage/10",
  },
];

export default function BannerCarousel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % BANNERS.length), 5500);
    return () => clearInterval(t);
  }, []);
  const b = BANNERS[i];
  return (
    <div className="relative h-[280px] md:h-[420px] overflow-hidden bg-off-white-alt" data-testid="banner-carousel">
      <img src={b.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className={`absolute inset-0 bg-gradient-to-r ${b.tint}`} />
      <div className="relative container-x h-full flex items-center">
        <div className="max-w-xl text-off-white animate-fade-up" key={b.title}>
          <div className="inline-block text-[11px] uppercase tracking-[0.3em] font-semibold bg-off-white text-terracotta px-3 py-1 mb-4">
            {b.tag}
          </div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl lg:text-6xl leading-[0.95] tracking-tight mb-4">
            {b.title}
          </h1>
          <p className="text-base md:text-lg opacity-90 mb-6">{b.subtitle}</p>
          <Link to={b.href} data-testid={`banner-cta-${i}`} className="btn-terracotta bg-off-white text-charcoal hover:bg-charcoal hover:text-off-white">
            {b.cta}
          </Link>
        </div>
      </div>
      <button
        aria-label="Previous"
        onClick={() => setI((i - 1 + BANNERS.length) % BANNERS.length)}
        className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center bg-off-white/90 hover:bg-off-white text-charcoal"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        aria-label="Next"
        onClick={() => setI((i + 1) % BANNERS.length)}
        className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center bg-off-white/90 hover:bg-off-white text-charcoal"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
        {BANNERS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            className={`h-1.5 transition-all ${idx === i ? "w-8 bg-off-white" : "w-4 bg-off-white/50"}`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
