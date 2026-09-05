import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Grid2x2, Shapes, Sticker, Wallpaper, PaintBucket, Lamp, Layers } from "lucide-react";
import { api } from "../lib/api";

const ICONS = { "grid-2x2": Grid2x2, shapes: Shapes, sticker: Sticker, wallpaper: Wallpaper, "paint-bucket": PaintBucket, lamp: Lamp, layers: Layers };

export default function CategoryNav() {
  const [cats, setCats] = useState([]);
  useEffect(() => { api.get("/categories").then((r) => setCats(r.data)); }, []);

  return (
    <nav className="bg-white border-b border-border sticky top-[64px] z-40" data-testid="category-nav">
      <div className="container-x">
        <ul className="flex items-center gap-1 overflow-x-auto py-2 no-scrollbar font-heading">
          {cats.map((c) => {
            const Icon = ICONS[c.icon] || Grid2x2;
            return (
              <li key={c.slug}>
                <Link
                  data-testid={`cat-nav-${c.slug}`}
                  to={`/category/${c.slug}`}
                  className="flex items-center gap-2 px-4 py-2 whitespace-nowrap text-sm font-medium text-charcoal hover:text-terracotta border-b-2 border-transparent hover:border-terracotta transition-all"
                >
                  <Icon className="w-4 h-4" />
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
