from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ------------------ CONFIG ------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGO = "HS256"
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@terramart.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@123")

app = FastAPI(title="TerraMart API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("terramart")

# ------------------ HELPERS ------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_token(uid: str, email: str, role: str, kind: str = "access") -> str:
    exp = datetime.now(timezone.utc) + (timedelta(days=7) if kind == "refresh" else timedelta(hours=12))
    return jwt.encode({"sub": uid, "email": email, "role": role, "type": kind, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGO)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"password_hash": 0, "_id": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

async def require_seller(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "seller":
        raise HTTPException(403, "Seller access required")
    return user

# ------------------ MODELS ------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Literal["buyer", "seller"] = "buyer"
    business_name: Optional[str] = None
    gst_number: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    role: Optional[Literal["buyer", "seller", "admin"]] = None

class Variant(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str  # e.g. "Size" or "Finish"
    value: str  # e.g. "600x600mm"
    price_delta: float = 0.0

class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str
    author_name: Optional[str] = None

# ------------------ AUTH ROUTES ------------------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    user_doc = {
        "id": uid,
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    if body.role == "seller":
        await db.sellers.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "business_name": body.business_name or body.name,
            "gst_number": body.gst_number or "",
            "verified": False,
            "rating": 0.0,
            "total_sales": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    access = create_token(uid, email, body.role, "access")
    refresh = create_token(uid, email, body.role, "refresh")
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": body.name, "role": body.role, "token": access}

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if body.role and user["role"] != body.role and user["role"] != "admin":
        raise HTTPException(403, f"This account is not a {body.role} account")
    access = create_token(user["id"], email, user["role"], "access")
    refresh = create_token(user["id"], email, user["role"], "refresh")
    set_auth_cookies(response, access, refresh)
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"], "token": access}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ------------------ CATEGORY ROUTES ------------------
CATEGORIES = [
    {"slug": "tiles", "name": "Tiles", "icon": "grid-2x2"},
    {"slug": "wall-stencils", "name": "Wall Stencils", "icon": "shapes"},
    {"slug": "wall-stickers", "name": "Wall Stickers", "icon": "sticker"},
    {"slug": "wallpapers", "name": "Wallpapers", "icon": "wallpaper"},
    {"slug": "paints", "name": "Paints", "icon": "paint-bucket"},
    {"slug": "home-decor", "name": "Home Decor", "icon": "lamp"},
    {"slug": "flooring", "name": "Flooring", "icon": "layers"},
]

@api.get("/categories")
async def get_categories():
    return CATEGORIES

# ------------------ PRODUCT ROUTES ------------------
@api.get("/products")
async def list_products(
    category: Optional[str] = None,
    q: Optional[str] = None,
    seller_id: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_rating: Optional[float] = None,
    material: Optional[str] = None,
    sort: Optional[str] = Query(None, description="price_asc|price_desc|rating|newest|popular"),
    limit: int = 60,
    section: Optional[str] = None,  # deals|trending|best_tiles
):
    query = {}
    if category:
        query["category"] = category
    if q:
        query["$or"] = [{"title": {"$regex": q, "$options": "i"}}, {"description": {"$regex": q, "$options": "i"}}]
    if seller_id:
        query["seller_id"] = seller_id
    if material:
        query["material"] = {"$regex": material, "$options": "i"}
    if min_price is not None or max_price is not None:
        pf = {}
        if min_price is not None:
            pf["$gte"] = min_price
        if max_price is not None:
            pf["$lte"] = max_price
        query["price"] = pf
    if min_rating is not None:
        query["rating"] = {"$gte": min_rating}
    if section == "deals":
        query["discount"] = {"$gte": 20}
    elif section == "trending":
        query["trending"] = True
    elif section == "best_tiles":
        query["category"] = "tiles"

    sort_spec = None
    if sort == "price_asc":
        sort_spec = [("price", 1)]
    elif sort == "price_desc":
        sort_spec = [("price", -1)]
    elif sort == "rating":
        sort_spec = [("rating", -1)]
    elif sort == "newest":
        sort_spec = [("created_at", -1)]
    elif sort == "popular":
        sort_spec = [("reviews_count", -1)]

    cursor = db.products.find(query, {"_id": 0})
    if sort_spec:
        cursor = cursor.sort(sort_spec)
    return await cursor.to_list(limit)

@api.get("/products/{product_id}")
async def get_product(product_id: str):
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    seller = await db.sellers.find_one({"id": p.get("seller_id")}, {"_id": 0})
    p["seller"] = seller
    return p

@api.get("/products/{product_id}/reviews")
async def get_reviews(product_id: str):
    return await db.reviews.find({"product_id": product_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api.post("/products/{product_id}/reviews")
async def add_review(product_id: str, body: ReviewIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "product_id": product_id,
        "user_id": user["id"],
        "author_name": body.author_name or user["name"],
        "rating": body.rating,
        "comment": body.comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(doc)
    # recompute
    all_r = await db.reviews.find({"product_id": product_id}).to_list(1000)
    avg = round(sum(r["rating"] for r in all_r) / len(all_r), 1)
    await db.products.update_one({"id": product_id}, {"$set": {"rating": avg, "reviews_count": len(all_r)}})
    doc.pop("_id", None)
    return doc

# ------------------ SELLER ROUTES ------------------
@api.get("/seller/me")
async def seller_me(user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    return seller

@api.get("/seller/dashboard")
async def seller_dashboard(user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller profile not found")
    products_count = await db.products.count_documents({"seller_id": seller["id"]})
    orders_count = await db.orders.count_documents({"seller_ids": seller["id"]})
    return {
        "seller": seller,
        "stats": {
            "products": products_count,
            "orders": orders_count,
            "revenue": seller.get("total_sales", 0) * 1000,
            "rating": seller.get("rating", 0.0),
        },
    }

# ------------------ SEED ------------------
SEED_SELLERS = [
    {"business_name": "TerraStone Ceramics", "gst": "27ABCDE1234F1Z5", "email": "seller1@terramart.com", "password": "Seller@123", "verified": True, "rating": 4.5},
    {"business_name": "Kaleidoscope Studios", "gst": "29XYZDE1234K2A9", "email": "seller2@terramart.com", "password": "Seller@123", "verified": True, "rating": 4.7},
    {"business_name": "Rustic Home Co.", "gst": "07QRSTE1234M3B7", "email": "seller3@terramart.com", "password": "Seller@123", "verified": False, "rating": 4.2},
    {"business_name": "Colorwerks Paints", "gst": "33LMNPE1234N4C6", "email": "seller4@terramart.com", "password": "Seller@123", "verified": True, "rating": 4.6},
    {"business_name": "Meraki Wallcraft", "gst": "06RSTUE1234P5D8", "email": "seller5@terramart.com", "password": "Seller@123", "verified": True, "rating": 4.4},
]

IMG = {
    "tiles": [
        "https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80",
        "https://images.unsplash.com/photo-1615873968403-89e068629265?w=800&q=80",
        "https://images.unsplash.com/photo-1600607686527-6fb886090705?w=800&q=80",
        "https://images.unsplash.com/photo-1615529182904-14819c35db37?w=800&q=80",
    ],
    "wall-stencils": [
        "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&q=80",
        "https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&q=80",
        "https://images.unsplash.com/photo-1616627562587-a75dbe1ad6e6?w=800&q=80",
    ],
    "wall-stickers": [
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80",
        "https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800&q=80",
        "https://images.unsplash.com/photo-1615529162924-f8605388461d?w=800&q=80",
    ],
    "wallpapers": [
        "https://images.unsplash.com/photo-1618220048045-10a6dbdf83e0?w=800&q=80",
        "https://images.unsplash.com/photo-1615873968403-89e068629265?w=800&q=80",
        "https://images.unsplash.com/photo-1616627451515-4b9b76ce6f79?w=800&q=80",
    ],
    "paints": [
        "https://images.unsplash.com/photo-1525909002-1b05e0c869d8?w=800&q=80",
        "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800&q=80",
        "https://images.unsplash.com/photo-1580462611434-fdba9a252193?w=800&q=80",
    ],
    "home-decor": [
        "https://images.unsplash.com/photo-1580064141068-f42c18d153f5?w=800&q=80",
        "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&q=80",
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80",
        "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800&q=80",
    ],
    "flooring": [
        "https://images.unsplash.com/photo-1724026502211-ff953e813194?w=800&q=80",
        "https://images.unsplash.com/photo-1595514535215-8a5b0fad470f?w=800&q=80",
        "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=80",
    ],
}

def _prod(seller_id, cat, title, price, mrp, material, imgs, variants, desc, rating, reviews_count, trending=False, discount=0):
    return {
        "id": str(uuid.uuid4()),
        "seller_id": seller_id,
        "category": cat,
        "title": title,
        "description": desc,
        "price": price,
        "mrp": mrp,
        "discount": discount,
        "stock": 120,
        "material": material,
        "images": imgs,
        "variants": variants,
        "rating": rating,
        "reviews_count": reviews_count,
        "trending": trending,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

async def seed_data():
    # admin
    if not await db.users.find_one({"email": ADMIN_EMAIL}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    if await db.products.count_documents({}) > 0:
        return

    # sellers
    seller_ids = []
    for s in SEED_SELLERS:
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid, "email": s["email"], "password_hash": hash_password(s["password"]),
            "name": s["business_name"], "role": "seller",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        sid = str(uuid.uuid4())
        await db.sellers.insert_one({
            "id": sid, "user_id": uid, "business_name": s["business_name"],
            "gst_number": s["gst"], "verified": s["verified"], "rating": s["rating"],
            "total_sales": 45, "created_at": datetime.now(timezone.utc).isoformat(),
        })
        seller_ids.append(sid)

    # products
    def s(i): return seller_ids[i % len(seller_ids)]
    products = [
        # Tiles
        _prod(s(0), "tiles", "Carrara Marble Effect Tile 600x600", 899, 1499, "Vitrified", IMG["tiles"], [{"name":"Size","value":"600x600mm","price_delta":0},{"name":"Size","value":"800x800mm","price_delta":250},{"name":"Finish","value":"Matte","price_delta":0},{"name":"Finish","value":"Glossy","price_delta":80}], "Premium Italian-look vitrified tiles for luxurious floors.", 4.6, 128, True, 40),
        _prod(s(1), "tiles", "Terracotta Hexagon Floor Tile", 549, 799, "Ceramic", IMG["tiles"], [{"name":"Color","value":"Burnt Orange","price_delta":0},{"name":"Color","value":"Sand","price_delta":0}], "Hexagon terracotta tiles with a warm rustic finish.", 4.4, 76, False, 31),
        _prod(s(2), "tiles", "Slate Grey Stone Look Tile", 720, 1200, "Porcelain", IMG["tiles"], [{"name":"Size","value":"600x1200mm","price_delta":0}], "Natural slate look, anti-skid porcelain.", 4.3, 54, True, 40),
        _prod(s(0), "tiles", "Mosaic Blue Wave Tile", 1099, 1499, "Glass Mosaic", IMG["tiles"], [{"name":"Sheet","value":"300x300mm","price_delta":0}], "Elegant blue mosaic tiles for kitchen backsplashes.", 4.7, 92, False, 26),
        # Stencils
        _prod(s(4), "wall-stencils", "Moroccan Damask Wall Stencil", 349, 599, "Mylar", IMG["wall-stencils"], [{"name":"Size","value":"A3","price_delta":0},{"name":"Size","value":"A2","price_delta":100}], "Reusable Moroccan pattern stencil for walls.", 4.5, 214, True, 41),
        _prod(s(4), "wall-stencils", "Botanical Leaf Trail Stencil", 289, 499, "PET Plastic", IMG["wall-stencils"], [{"name":"Size","value":"A3","price_delta":0}], "Delicate botanical leaves for accent walls.", 4.6, 187, True, 42),
        _prod(s(1), "wall-stencils", "Geometric Diamond Stencil", 259, 399, "Mylar", IMG["wall-stencils"], [{"name":"Size","value":"A4","price_delta":0}], "Modern geometric diamond repeat.", 4.2, 63, False, 35),
        # Stickers
        _prod(s(2), "wall-stickers", "Kids Space Adventure Sticker Set", 499, 899, "Vinyl", IMG["wall-stickers"], [{"name":"Size","value":"Large","price_delta":0}], "Peel & stick decals for kids rooms.", 4.7, 341, True, 44),
        _prod(s(1), "wall-stickers", "Minimal Sun & Moon Decal", 299, 499, "Vinyl", IMG["wall-stickers"], [{"name":"Color","value":"Terracotta","price_delta":0},{"name":"Color","value":"Charcoal","price_delta":0}], "Modern boho minimalist sun and moon.", 4.5, 189, False, 40),
        _prod(s(2), "wall-stickers", "3D Brick Foam Wall Sticker", 799, 1299, "Foam", IMG["wall-stickers"], [{"name":"Pack","value":"10 sheets","price_delta":0}], "Self-adhesive 3D brick tiles.", 4.4, 128, True, 38),
        # Wallpapers
        _prod(s(4), "wallpapers", "Vintage Floral Non-Woven Wallpaper", 1299, 1999, "Non-Woven", IMG["wallpapers"], [{"name":"Roll","value":"53cm x 10m","price_delta":0}], "Timeless floral wallpaper for classic interiors.", 4.6, 156, True, 35),
        _prod(s(2), "wallpapers", "Textured Linen Beige Wallpaper", 999, 1499, "Vinyl", IMG["wallpapers"], [{"name":"Roll","value":"53cm x 10m","price_delta":0}], "Warm neutral textured wallpaper.", 4.5, 89, False, 33),
        _prod(s(1), "wallpapers", "Deep Green Palm Leaf Wallpaper", 1499, 2299, "Non-Woven", IMG["wallpapers"], [{"name":"Roll","value":"53cm x 10m","price_delta":0}], "Tropical palm print, deep sage tones.", 4.7, 203, True, 34),
        # Paints
        _prod(s(3), "paints", "Terracotta Warmth Interior Emulsion 4L", 1299, 1799, "Emulsion", IMG["paints"], [{"name":"Finish","value":"Matte","price_delta":0},{"name":"Finish","value":"Satin","price_delta":150}], "Signature warm terracotta wall emulsion.", 4.6, 421, True, 27),
        _prod(s(3), "paints", "Charcoal Dusk Premium Emulsion 4L", 1399, 1999, "Emulsion", IMG["paints"], [{"name":"Finish","value":"Matte","price_delta":0}], "Deep charcoal for accent walls.", 4.5, 218, False, 30),
        _prod(s(3), "paints", "Off-White Linen Interior Paint 10L", 2499, 3499, "Emulsion", IMG["paints"], [{"name":"Finish","value":"Matte","price_delta":0}], "Warm off-white for airy rooms.", 4.4, 174, True, 28),
        # Home Decor
        _prod(s(2), "home-decor", "Handcrafted Ceramic Vase - Sand", 899, 1499, "Ceramic", IMG["home-decor"], [{"name":"Size","value":"Medium","price_delta":0},{"name":"Size","value":"Large","price_delta":300}], "Artisan-made ceramic vase, sand glaze.", 4.7, 134, True, 40),
        _prod(s(2), "home-decor", "Rattan Pendant Lamp Shade", 1499, 2299, "Rattan", IMG["home-decor"], [{"name":"Color","value":"Natural","price_delta":0}], "Handwoven rattan pendant lamp.", 4.6, 87, False, 34),
        _prod(s(4), "home-decor", "Boho Macrame Wall Hanging", 649, 999, "Cotton", IMG["home-decor"], [{"name":"Size","value":"Small","price_delta":0}], "Handmade macrame with wooden dowel.", 4.5, 216, True, 35),
        _prod(s(1), "home-decor", "Brass Table Lamp with Linen Shade", 2199, 3299, "Brass", IMG["home-decor"], [{"name":"Color","value":"Antique Brass","price_delta":0}], "Warm brass table lamp with linen shade.", 4.7, 92, False, 33),
        # Flooring
        _prod(s(0), "flooring", "Oak Engineered Wood Flooring", 3499, 4999, "Engineered Wood", IMG["flooring"], [{"name":"Plank","value":"1200x190mm","price_delta":0}], "European oak, click-lock installation.", 4.6, 65, True, 30),
        _prod(s(2), "flooring", "Vinyl Herringbone Flooring", 1299, 1899, "SPC Vinyl", IMG["flooring"], [{"name":"Color","value":"Warm Walnut","price_delta":0},{"name":"Color","value":"Grey Oak","price_delta":0}], "Waterproof herringbone vinyl planks.", 4.4, 108, False, 31),
        _prod(s(0), "flooring", "Bamboo Natural Flooring", 2299, 3199, "Bamboo", IMG["flooring"], [{"name":"Plank","value":"960x96mm","price_delta":0}], "Sustainable bamboo, natural tone.", 4.5, 47, True, 28),
    ]
    for p in products:
        await db.products.insert_one(p)
    logger.info(f"Seeded {len(products)} products across {len(seller_ids)} sellers")

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("category")
    await db.products.create_index("seller_id")
    await seed_data()

@app.on_event("shutdown")
async def shutdown():
    client.close()

@api.get("/")
async def root():
    return {"service": "TerraMart", "status": "ok"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_origin_regex=r"https://.*\.preview\.emergentagent\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)
