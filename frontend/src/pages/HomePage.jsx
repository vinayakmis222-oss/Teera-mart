import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import BannerCarousel from "../components/BannerCarousel";
import ProductCard from "../components/ProductCard";
import { ArrowRight } from "lucide-react";

function Section({ title, tag, href, products }) {
  return (
    <section className="container-x py-8 md:py-12" data-testid={`section-${tag}`}>
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-1">{tag}</div>
          <h2 className="font-heading font-bold text-2xl md:text-3xl lg:text-4xl text-charcoal tracking-tight">{title}</h2>
        </div>
        <Link to={href} className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-charcoal hover:text-terracotta">
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
        {products.slice(0, 5).map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}

const CATEGORY_TILES = [
  { slug: "tiles", name: "Tiles", img: "https://images.unsplash.com/photo-1615529162924-f8605388461d?w=600&q=80" },
  { slug: "wallpapers", name: "Wallpapers", img: "https://images.unsplash.com/photo-1618220048045-10a6dbdf83e0?w=600&q=80" },
  { slug: "paints", name: "Paints", img: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600&q=80" },
  { slug: "home-decor", name: "Home Decor", img: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80" },
  { slug: "flooring", name: "Flooring", img: "https://images.unsplash.com/photo-1595514535215-8a5b0fad470f?w=600&q=80" },
  { slug: "wall-stencils", name: "Stencils", img: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&q=80" },
  { slug: "wall-stickers", name: "Stickers", img: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&q=80" },
];

export default function HomePage() {
  const [tiles, setTiles] = useState([]);
  const [stencils, setStencils] = useState([]);
  const [deals, setDeals] = useState([]);
  const [decor, setDecor] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/products", { params: { category: "tiles", sort: "rating", limit: 8 } }),
      api.get("/products", { params: { category: "wall-stencils", sort: "popular", limit: 8 } }),
      api.get("/products", { params: { section: "deals", sort: "rating", limit: 8 } }),
      api.get("/products", { params: { category: "home-decor", sort: "popular", limit: 8 } }),
    ]).then(([a, b, c, d]) => {
      setTiles(a.data); setStencils(b.data); setDeals(c.data); setDecor(d.data);
    });
  }, []);

  return (
    <div>
      <BannerCarousel />

      {/* Category quick shop */}
      <section className="container-x py-8" data-testid="quick-categories">
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3 md:gap-4">
          {CATEGORY_TILES.map((c) => (
            <Link
              key={c.slug}
              to={`/category/${c.slug}`}
              data-testid={`quick-cat-${c.slug}`}
              className="group flex flex-col items-center text-center gap-2"
            >
              <div className="aspect-square w-full bg-white border border-border overflow-hidden group-hover:border-terracotta transition-colors">
                <img src={c.img} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <span className="text-xs md:text-sm font-medium text-charcoal group-hover:text-terracotta">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <Section title="Best of Tiles" tag="Editor's picks" href="/category/tiles" products={tiles} />

      {/* Split promo band */}
      <section className="container-x py-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="relative overflow-hidden aspect-[16/7] group">
            <img src="https://images.unsplash.com/photo-1615873968403-89e068629265?w=1200&q=80" alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-charcoal/80 to-transparent" />
            <div className="relative h-full flex flex-col justify-end p-6 md:p-8 text-off-white">
              <div className="text-xs uppercase tracking-[0.3em] text-terracotta-light font-semibold mb-2">Wallpapers</div>
              <h3 className="font-heading font-bold text-2xl md:text-3xl mb-3">Statement walls, made simple</h3>
              <Link to="/category/wallpapers" className="btn-terracotta w-fit" data-testid="promo-wallpapers">Shop now</Link>
            </div>
          </div>
          <div className="relative overflow-hidden aspect-[16/7] group">
            <img src="https://images.unsplash.com/photo-1724026502211-ff953e813194?w=1200&q=80" alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-terracotta/80 to-transparent" />
            <div className="relative h-full flex flex-col justify-end p-6 md:p-8 text-off-white">
              <div className="text-xs uppercase tracking-[0.3em] text-off-white font-semibold mb-2">Flooring</div>
              <h3 className="font-heading font-bold text-2xl md:text-3xl mb-3">Underfoot warmth, all year</h3>
              <Link to="/category/flooring" className="btn-terracotta bg-off-white text-charcoal hover:bg-charcoal hover:text-off-white w-fit" data-testid="promo-flooring">Shop now</Link>
            </div>
          </div>
        </div>
      </section>

      <Section title="Trending Stencils" tag="What's hot" href="/category/wall-stencils" products={stencils} />
      <Section title="Deals of the Day" tag="Up to 45% off" href="/category/all" products={deals} />
      <Section title="Curated Home Decor" tag="Handpicked" href="/category/home-decor" products={decor} />
    </div>
  );
}
