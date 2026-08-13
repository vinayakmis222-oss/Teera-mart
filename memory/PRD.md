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

## Implemented (Phase 2 — 2026-02): Buyer Checkout & Account
- Cart Page: line items with variant/qty/remove, price breakdown (subtotal/delivery/discount/total), coupon apply/remove with quick-pick chips, free-delivery meter, sticky mobile "Proceed to Checkout" bar
- Multi-step Checkout (Address → Payment → Review): saved address selection, inline new-address form, payment method selection (UPI/Card/Netbanking/COD - UI only), review, place order
- Order Confirmation screen: TM-prefixed order ID, estimated delivery date, item list, total paid, Track Order & Continue Shopping actions
- Buyer Login/Signup: email/password AND mobile+OTP (MOCKED — any 6-digit code) tabs
- Buyer Account section: sidebar (Profile/My Orders/Addresses/Logout), Profile edit (name, phone), Addresses CRUD (home/work/other, default), My Orders list with status pills, Order Detail with 4-stage progress tracker (Placed → Shipped → Out for Delivery → Delivered), items grouped by seller with verified badge
- Backend: Address CRUD, Coupons (WELCOME10/TERRA200/FIRSTBUY) with validation, Orders (create with snapshot per item incl. seller_id, list, get with seller enrichment, admin/seller status update), OTP mock endpoints

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
