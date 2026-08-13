# TerraMart — Product Requirements Doc

## Original Problem Statement
Full-stack multi-vendor e-commerce marketplace for construction materials & home decor products (categories: Tiles, Wall Stencils, Wall Stickers, Wallpapers, Paints, Home Decor, Flooring). Flipkart-inspired UI with terracotta/charcoal/off-white palette. Two user types: buyers and sellers.

## User Personas
- **Buyer** — Homeowner / interior designer searching for verified materials & décor.
- **Seller** — SMB or artisan brand listing tiles, paints, wallpapers, décor.
- **Admin** — Marketplace operator (verification, moderation).

## Architecture
- **Backend**: FastAPI + Motor (MongoDB). JWT (httpOnly cookies + Bearer). bcrypt password hashing. Auto-seeds admin, 5 sellers, 23 products on startup.
- **Frontend**: React 19 + React Router 7 + Tailwind + shadcn UI. Custom terracotta theme, Cabinet Grotesk + Manrope fonts from Fontshare.
- **DB collections**: `users`, `sellers`, `products`, `orders`, `reviews`, `login_attempts`.

## Implemented (Phase 1 — 2026-02)
- Terracotta/charcoal/off-white theme + custom Cabinet Grotesk/Manrope typography
- Homepage with sticky header (logo, search, cart, login), category nav, rotating banner carousel, quick-shop category tiles, split promos, sections (Best of Tiles, Trending Stencils, Deals of the Day, Curated Home Decor)
- Category/listing page with filter sidebar (price, seller, rating, material) and sort dropdown
- Product detail page — image gallery, price + variant selector (grouped by Size/Finish/Color), verified-seller badge, add-to-cart, reviews list + submit
- Buyer auth (login/signup) + separate Seller auth (login/signup)
- Seller dashboard with verified badge, stats (products/orders/revenue/rating), business details, Phase-2 placeholder cards
- Local-storage cart with sticky floating cart button + full cart page (qty controls, subtotal)
- Sonner toasts, mobile-first responsive, data-testid attributes on interactive elements

## Backlog / Next
### P0
- Product management (seller CRUD) with image uploads (object storage)
- Checkout & payments (Stripe/Razorpay)
- Order tracking (buyer + seller views)

### P1
- Wishlist / saved for later
- Admin panel (seller verification, product moderation)
- Search autocomplete + facet counts
- Address book & multiple addresses

### P2
- Reviews with photos
- Bulk order / trade pricing tier
- AI-powered "design your room" recommendation
