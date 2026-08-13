import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-16 bg-charcoal text-off-white">
      <div className="container-x py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-9 h-9 bg-terracotta text-off-white grid place-items-center font-heading font-bold text-lg">T</span>
            <div className="font-heading font-bold text-xl">TerraMart</div>
          </div>
          <p className="text-sm text-off-white/70 max-w-xs">
            India&apos;s marketplace for construction materials & home decor — sourced from trusted sellers.
          </p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold mb-3">Shop</div>
          <ul className="space-y-2 text-sm text-off-white/80">
            <li><Link to="/category/tiles" className="hover:text-terracotta">Tiles</Link></li>
            <li><Link to="/category/paints" className="hover:text-terracotta">Paints</Link></li>
            <li><Link to="/category/wallpapers" className="hover:text-terracotta">Wallpapers</Link></li>
            <li><Link to="/category/home-decor" className="hover:text-terracotta">Home Decor</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold mb-3">Sellers</div>
          <ul className="space-y-2 text-sm text-off-white/80">
            <li><Link to="/seller/signup" className="hover:text-terracotta">Become a Seller</Link></li>
            <li><Link to="/seller/login" className="hover:text-terracotta">Seller Login</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-terracotta font-semibold mb-3">Support</div>
          <ul className="space-y-2 text-sm text-off-white/80">
            <li>Help Centre</li>
            <li>Contact Us</li>
            <li>Returns & Refunds</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-off-white/10">
        <div className="container-x py-4 text-xs text-off-white/60 flex flex-col md:flex-row justify-between gap-2">
          <span>© {new Date().getFullYear()} TerraMart. All rights reserved.</span>
          <span>Made with warmth in India.</span>
        </div>
      </div>
    </footer>
  );
}
