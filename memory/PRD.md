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

## Implemented (Phase 3 — 2026-02): Payments, Bundles & Seller Tools
- **Razorpay integration**: Real gateway wired for UPI/Card/Netbanking via Razorpay checkout modal + HMAC-SHA256 signature verify on backend. DEMO MODE runs automatically when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are absent from `/app/backend/.env` (auto-verifies for local testing). COD stays outside the gateway. Successful payment moves order.status → `confirmed` and payment_status → `paid`. Payment failure keeps cart intact and offers retry.
- **Verified vs Pending Seller badge**: Product detail shows green `Verified` chip or neutral `Pending Verification` chip; product cards for unverified sellers show a small "Pending verification" note. `seller_verified` denormalised onto product docs (including bulk-uploaded products).
- **Similar Products + Frequently Bought Together**: Backend `/api/products/{id}/similar` (same category, excluding self) and `/bought-together` (complementary category map). New UI section under product description with checkboxes and "Add all to cart".
- **Coupon logic (DB-backed)**: `db.coupons` collection with expiry_date, min_order, max_off, type (percent/flat), is_active. Public list filters `expires_at > now`. Order creation revalidates coupon.
- **Image lazy-loading & skeletons**: `loading="lazy"` on all product images plus `data-testid=img-skeleton` pulse placeholder that fades out on load. `ProductCardSkeleton` helper for grid loading.
- **Bulk product CSV upload** (new seller tool): Sample CSV download, drag/drop parse (papaparse), preview table with per-row Ready/Error status, confirm import. Backend validates category, price, images; supports `Size:600x600@0;Size:800x800@250` variant syntax OR JSON.
- **Seller Orders queue**: `/seller/orders` list + status filter pills; expandable rows with items, ship-to address, payment; "Mark Shipped → Out for Delivery → Delivered" advance button per order (per-seller ownership enforced).
- **Buyer order cancellation**: On order detail page while status is `placed`/`confirmed`, buyer sees a Cancel Order button that moves the order to `cancelled`.
- **Security hardening**: Login lockout — 5 failed attempts trigger 15-min account lockout (returns 423). Auth attempts tracked in `db.login_attempts` and cleared on successful login.

## Implemented (Phase 4 — 2026-02): AI Assistant Suite (ChatGPT integration)
- **TerraBot buyer chatbot** (floating widget, streaming SSE): `POST /api/ai/chat` — GPT-5.4 via Emergent Universal Key + `emergentintegrations`. Multi-turn history persisted in `db.ai_sessions` (session_id in localStorage). Widget auto-hides on /admin, /seller/*, /login, /signup, /checkout.
- **AI Room Designer**: `POST /api/ai/design-room` at `/ai-designer`. Returns `{summary, palette, picks[]}` with each pick joined against real MongoDB products by category + keyword. Nav-bar CTA "Design my room".
- **Seller AI Description Generator**: `POST /api/ai/generate-description` (seller-auth). "AI generate title + description" button inside AddEditProductModal — fills title + long-form description + bullets in one click.
- **AI Search**: `POST /api/ai/search` — sparkle button in header search bar converts natural language ("matte tiles under ₹800 for bathroom") into filter params (category / q / min_price / max_price / material) and navigates.
- New collection: `ai_sessions {session_id, user_id, messages[], created_at, updated_at}`.
- Model: `openai/gpt-5.4`. Key: `EMERGENT_LLM_KEY`.

## Backlog / Next
### P0 — Code Quality Report (pending from previous session)
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
