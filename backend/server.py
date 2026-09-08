from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
import hmac
import hashlib
import razorpay
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Any
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, UploadFile, File
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
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_ENABLED = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if RAZORPAY_ENABLED else None

# --- Object Storage (Emergent) ---
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "").strip()
APP_NAME = "terramart"
_storage_key: Optional[str] = None

def init_storage(force: bool = False) -> Optional[str]:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_LLM_KEY:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=15)
        r.raise_for_status()
        _storage_key = r.json().get("storage_key")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        _storage_key = None
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(503, "Object storage unavailable")
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=60)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=60)
    r.raise_for_status()
    return r.json()

def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise HTTPException(503, "Object storage unavailable")
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=30)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=30)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

LOW_STOCK_THRESHOLD = int(os.environ.get("LOW_STOCK_THRESHOLD", "5"))
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB

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

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
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

class AddressIn(BaseModel):
    name: str
    phone: str
    pincode: str
    line1: str
    line2: Optional[str] = ""
    city: str
    state: str
    type: Literal["home", "work", "other"] = "home"
    is_default: bool = False

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

class OtpSendIn(BaseModel):
    phone: str

class OtpVerifyIn(BaseModel):
    phone: str
    otp: str
    name: Optional[str] = None

class CouponApplyIn(BaseModel):
    code: str
    subtotal: float

class OrderItemIn(BaseModel):
    product_id: str
    variant: Optional[str] = None
    qty: int = Field(ge=1)

class OrderCreateIn(BaseModel):
    items: List[OrderItemIn]
    address_id: str
    payment_method: Literal["upi", "card", "netbanking", "cod", "online"]
    coupon_code: Optional[str] = None

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
        settings = await get_settings()
        trial_exp = datetime.now(timezone.utc) + timedelta(days=settings["subscription_period_days"])
        await db.sellers.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "business_name": body.business_name or body.name,
            "gst_number": body.gst_number or "",
            "verified": False,
            "rating": 0.0,
            "total_sales": 0,
            "subscription_expires_at": trial_exp.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    access = create_token(uid, email, body.role, "access")
    refresh = create_token(uid, email, body.role, "refresh")
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": body.name, "role": body.role, "token": access}

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

DEFAULT_SETTINGS = {
    "subscription_price": 1.0,          # ₹ per month
    "subscription_period_days": 30,
    "default_commission_rate": 10.0,    # percent
    "dues_threshold": 5000.0,           # ₹
    "dues_grace_days": 15,
    "payment_methods": {
        "cod": True,                     # Cash on Delivery
        "online": True,                  # Payment Link / Online Payment
    },
}

async def get_settings() -> dict:
    doc = await db.settings.find_one({"key": "platform"}, {"_id": 0})
    if not doc:
        doc = {"key": "platform", **DEFAULT_SETTINGS}
        await db.settings.insert_one(doc)
        doc.pop("_id", None)
    for k, v in DEFAULT_SETTINGS.items():
        doc.setdefault(k, v)
    # ensure nested payment_methods dict has all default keys
    pm = doc.get("payment_methods") or {}
    for k, v in DEFAULT_SETTINGS["payment_methods"].items():
        pm.setdefault(k, v)
    doc["payment_methods"] = pm
    return doc

async def _seller_pending_dues(seller_id: str) -> tuple[float, Optional[str]]:
    """Return (total_pending, oldest_pending_iso) for a seller."""
    cursor = db.commission_dues.find({"seller_id": seller_id, "status": "pending"}, {"_id": 0})
    total = 0.0
    oldest = None
    async for d in cursor:
        total += d.get("commission_amount", 0.0)
        cat = d.get("delivered_at")
        if cat and (oldest is None or cat < oldest):
            oldest = cat
    return round(total, 2), oldest

async def _enrich_seller_status(seller: dict) -> dict:
    """Attach subscription_status + effective_paused + pending_dues."""
    settings = await get_settings()
    now = datetime.now(timezone.utc)
    exp = seller.get("subscription_expires_at")
    sub_active = False
    if exp:
        try:
            expdt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            sub_active = expdt > now
        except Exception:
            sub_active = False
    days_left = 0
    if sub_active:
        try:
            days_left = max(0, (datetime.fromisoformat(exp.replace("Z", "+00:00")) - now).days)
        except Exception:
            days_left = 0
    seller["subscription_status"] = "active" if sub_active else ("expired" if exp else "due")
    seller["subscription_days_left"] = days_left

    total_dues, oldest = await _seller_pending_dues(seller["id"])
    seller["pending_dues"] = total_dues
    over_threshold = total_dues >= settings["dues_threshold"]
    over_grace = False
    if oldest and total_dues > 0:
        try:
            oldest_dt = datetime.fromisoformat(oldest.replace("Z", "+00:00"))
            over_grace = (now - oldest_dt).days > settings["dues_grace_days"]
        except Exception:
            pass
    auto_paused = over_threshold and over_grace
    seller["auto_paused"] = auto_paused
    seller["dues_over_threshold"] = over_threshold
    seller["effective_paused"] = bool(seller.get("paused_by_admin")) or auto_paused
    seller["is_active"] = sub_active and not seller["effective_paused"]
    return seller

async def _active_seller_ids() -> list:
    sellers = await db.sellers.find({}, {"_id": 0}).to_list(1000)
    ids = []
    for s in sellers:
        await _enrich_seller_status(s)
        if s["is_active"]:
            ids.append(s["id"])
    return ids

async def _record_failed_login(email: str):
    now = datetime.now(timezone.utc)
    await db.login_attempts.update_one(
        {"email": email},
        {"$inc": {"failures": 1}, "$set": {"last_at": now.isoformat()}},
        upsert=True,
    )

async def _clear_login_attempts(email: str):
    await db.login_attempts.delete_one({"email": email})

async def _check_lockout(email: str):
    rec = await db.login_attempts.find_one({"email": email})
    if not rec:
        return
    if rec.get("failures", 0) < MAX_LOGIN_ATTEMPTS:
        return
    try:
        last = datetime.fromisoformat(rec["last_at"].replace("Z", "+00:00"))
    except Exception:
        return
    if datetime.now(timezone.utc) - last < timedelta(minutes=LOCKOUT_MINUTES):
        raise HTTPException(423, f"Account temporarily locked. Try again in {LOCKOUT_MINUTES} minutes.")
    # window expired — reset
    await _clear_login_attempts(email)

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    await _check_lockout(email)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await _record_failed_login(email)
        raise HTTPException(401, "Invalid email or password")
    if body.role and user["role"] != body.role and user["role"] != "admin":
        raise HTTPException(403, f"This account is not a {body.role} account")
    await _clear_login_attempts(email)
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
    else:
        # Buyer-facing listing hides paused/expired sellers
        active_ids = await _active_seller_ids()
        query["seller_id"] = {"$in": active_ids}
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
    await _enrich_seller_status(seller)
    products_count = await db.products.count_documents({"seller_id": seller["id"]})
    orders_count = await db.orders.count_documents({"seller_ids": seller["id"]})
    settings = await get_settings()
    # Real revenue from delivered orders (this seller's share)
    revenue = 0.0
    delivered_orders = 0
    async for o in db.orders.find({"seller_ids": seller["id"], "status": "delivered"}, {"_id": 0}):
        seller_items = [it for it in o.get("items", []) if it.get("seller_id") == seller["id"]]
        revenue += sum(it.get("line_total", 0.0) for it in seller_items)
        delivered_orders += 1
    return {
        "seller": seller,
        "stats": {
            "products": products_count,
            "orders": orders_count,
            "delivered_orders": delivered_orders,
            "revenue": round(revenue, 2),
            "rating": seller.get("rating", 0.0),
            "pending_dues": seller["pending_dues"],
            "subscription_status": seller["subscription_status"],
            "subscription_days_left": seller["subscription_days_left"],
        },
        "settings": {
            "subscription_price": settings["subscription_price"],
            "commission_rate": seller.get("commission_rate", settings["default_commission_rate"]),
            "dues_threshold": settings["dues_threshold"],
        },
    }

# ------------------ SELLER PRODUCT CRUD ------------------
class SellerProductIn(BaseModel):
    title: str
    category: str
    price: float = Field(gt=0)
    mrp: Optional[float] = None
    stock: int = 0
    description: Optional[str] = ""
    material: Optional[str] = ""
    images: List[str] = []
    variants: List[dict] = []

class SellerProductPatch(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    mrp: Optional[float] = None
    stock: Optional[int] = None
    description: Optional[str] = None
    material: Optional[str] = None
    images: Optional[List[str]] = None
    variants: Optional[List[dict]] = None

# --- Image upload ---
@api.post("/uploads/image")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if (file.content_type or "").lower() not in ALLOWED_IMAGE_MIME:
        raise HTTPException(400, "Only jpg / png / webp / gif images are allowed")
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, f"Max size is {MAX_UPLOAD_BYTES // (1024*1024)}MB")
    ext = (file.filename or "").split(".")[-1].lower() if "." in (file.filename or "") else "bin"
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(file.content_type, "bin")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, file.content_type)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}")
    doc = {
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "user_id": user["id"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": len(data),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(doc)
    return {"url": f"/api/uploads/{result['path']}", "path": result["path"], "size": len(data)}

@api.get("/uploads/{path:path}")
async def serve_image(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    try:
        data, ct = get_object(path)
    except Exception:
        raise HTTPException(404, "File not found")
    return Response(content=data, media_type=rec.get("content_type") or ct, headers={"Cache-Control": "public, max-age=86400"})

@api.get("/seller/products")
async def seller_list_products(user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    products = await db.products.find({"seller_id": seller["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for p in products:
        p["low_stock"] = int(p.get("stock", 0)) < LOW_STOCK_THRESHOLD
    return products

@api.post("/seller/products")
async def seller_create_product(body: SellerProductIn, user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    await _enrich_seller_status(seller)
    if seller["effective_paused"]:
        raise HTTPException(403, "Account paused. Clear pending dues before adding products.")
    if seller["subscription_status"] != "active":
        raise HTTPException(403, "Renew your subscription to add products.")
    if body.category not in {c["slug"] for c in CATEGORIES}:
        raise HTTPException(400, "Unknown category")
    images = [i.strip() for i in (body.images or []) if i.strip()]
    if not images:
        raise HTTPException(400, "At least one image is required")
    mrp = body.mrp if body.mrp and body.mrp > body.price else round(body.price * 1.3, 0)
    discount = int(round((mrp - body.price) / mrp * 100)) if mrp > body.price else 0
    doc = {
        "id": str(uuid.uuid4()),
        "seller_id": seller["id"],
        "seller_verified": bool(seller.get("verified")),
        "category": body.category,
        "title": body.title,
        "description": body.description or "",
        "price": body.price,
        "mrp": mrp,
        "discount": discount,
        "stock": body.stock,
        "material": body.material or "",
        "images": images,
        "variants": body.variants or [],
        "rating": 0.0,
        "reviews_count": 0,
        "trending": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/seller/products/{product_id}")
async def seller_update_product(product_id: str, body: SellerProductPatch, user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    p = await db.products.find_one({"id": product_id, "seller_id": seller["id"]})
    if not p:
        raise HTTPException(404, "Product not found")
    payload = body.model_dump(exclude_none=True)
    if "category" in payload and payload["category"] not in {c["slug"] for c in CATEGORIES}:
        raise HTTPException(400, "Unknown category")
    if "images" in payload:
        imgs = [i.strip() for i in payload["images"] if i.strip()]
        if not imgs:
            raise HTTPException(400, "At least one image is required")
        payload["images"] = imgs
    # keep seller_verified in sync
    payload["seller_verified"] = bool(seller.get("verified"))
    # recompute discount if price/mrp touched
    new_price = payload.get("price", p["price"])
    new_mrp = payload.get("mrp", p.get("mrp") or new_price)
    if new_mrp and new_mrp > new_price:
        payload["discount"] = int(round((new_mrp - new_price) / new_mrp * 100))
    if payload:
        await db.products.update_one({"id": product_id}, {"$set": payload})
    return await db.products.find_one({"id": product_id}, {"_id": 0})

@api.delete("/seller/products/{product_id}")
async def seller_delete_product(product_id: str, user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    res = await db.products.delete_one({"id": product_id, "seller_id": seller["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Product not found")
    await db.reviews.delete_many({"product_id": product_id})
    return {"ok": True}

# ------------------ PROFILE & ADDRESSES ------------------
@api.patch("/auth/me")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"password_hash": 0, "_id": 0})
    return updated

@api.get("/addresses")
async def list_addresses(user: dict = Depends(get_current_user)):
    return await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)

@api.post("/addresses")
async def add_address(body: AddressIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    if doc["is_default"]:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    if await db.addresses.count_documents({"user_id": user["id"]}) == 0:
        doc["is_default"] = True
    await db.addresses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/addresses/{address_id}")
async def update_address(address_id: str, body: AddressIn, user: dict = Depends(get_current_user)):
    existing = await db.addresses.find_one({"id": address_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(404, "Address not found")
    updates = body.model_dump()
    if updates.get("is_default"):
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.update_one({"id": address_id}, {"$set": updates})
    updated = await db.addresses.find_one({"id": address_id}, {"_id": 0})
    return updated

@api.delete("/addresses/{address_id}")
async def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    res = await db.addresses.delete_one({"id": address_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Address not found")
    return {"ok": True}

# ------------------ OTP (MOCK) ------------------
@api.post("/auth/otp/send")
async def otp_send(body: OtpSendIn):
    if len(body.phone) < 10:
        raise HTTPException(400, "Invalid phone number")
    # MOCK: any 6-digit code works. Return a demo code for UX (not stored).
    return {"ok": True, "message": "OTP sent. Use any 6-digit code (mock).", "demo_otp": "123456"}

@api.post("/auth/otp/verify")
async def otp_verify(body: OtpVerifyIn, response: Response):
    if not body.otp or len(body.otp) != 6 or not body.otp.isdigit():
        raise HTTPException(400, "OTP must be a 6-digit number")
    phone = body.phone.strip()
    user = await db.users.find_one({"phone": phone})
    if not user:
        uid = str(uuid.uuid4())
        pseudo_email = f"user_{phone}@phone.terramart.local"
        user = {
            "id": uid,
            "email": pseudo_email,
            "phone": phone,
            "name": body.name or f"User {phone[-4:]}",
            "role": "buyer",
            "password_hash": hash_password(str(uuid.uuid4())),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
    access = create_token(user["id"], user["email"], user["role"], "access")
    refresh = create_token(user["id"], user["email"], user["role"], "refresh")
    set_auth_cookies(response, access, refresh)
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"], "phone": user.get("phone"), "token": access}

# ------------------ COUPONS (DB-backed) ------------------
DEFAULT_COUPONS = [
    {"code": "WELCOME10", "type": "percent", "value": 10, "max_off": 500, "min_order": 0, "label": "10% off up to ₹500", "expires_at": (datetime.now(timezone.utc) + timedelta(days=90)).isoformat(), "is_active": True},
    {"code": "TERRA200",  "type": "flat",    "value": 200, "min_order": 1500, "label": "Flat ₹200 off on ₹1500+", "expires_at": (datetime.now(timezone.utc) + timedelta(days=60)).isoformat(), "is_active": True},
    {"code": "FIRSTBUY",  "type": "percent", "value": 15, "max_off": 800, "min_order": 999, "label": "15% off up to ₹800 (min ₹999)", "expires_at": (datetime.now(timezone.utc) + timedelta(days=180)).isoformat(), "is_active": True},
    {"code": "EXPIRED10", "type": "percent", "value": 10, "max_off": 300, "min_order": 0, "label": "Expired demo coupon", "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(), "is_active": True},
]

async def _compute_discount(code: str, subtotal: float):
    c = await db.coupons.find_one({"code": code.strip().upper()}, {"_id": 0})
    if not c:
        raise HTTPException(400, "Invalid coupon code")
    if not c.get("is_active", True):
        raise HTTPException(400, "This coupon is no longer active")
    try:
        exp = datetime.fromisoformat(c["expires_at"].replace("Z", "+00:00"))
        if exp < datetime.now(timezone.utc):
            raise HTTPException(400, "This coupon has expired")
    except HTTPException:
        raise
    except Exception:
        pass
    if subtotal < c.get("min_order", 0):
        raise HTTPException(400, f"Minimum order ₹{c['min_order']} required for {c['code']}")
    if c["type"] == "percent":
        discount = min(subtotal * c["value"] / 100, c.get("max_off", 1e9))
    else:
        discount = c["value"]
    return c, round(discount, 2)

@api.get("/coupons")
async def list_coupons():
    now_iso = datetime.now(timezone.utc).isoformat()
    return await db.coupons.find(
        {"is_active": True, "expires_at": {"$gt": now_iso}},
        {"_id": 0},
    ).to_list(50)

@api.post("/coupons/apply")
async def apply_coupon(body: CouponApplyIn):
    c, discount = await _compute_discount(body.code, body.subtotal)
    return {"code": c["code"], "discount": discount, "label": c["label"], "expires_at": c.get("expires_at")}

# ------------------ ORDERS ------------------
STATUS_FLOW = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"]
SELLER_FLOW = ["placed", "confirmed", "packed", "shipped", "delivered"]
SERVICEABLE_PINCODE = "226013"
SERVICEABLE_AREAS = "Mubarakpur, Bhitauli & Allu"

@api.post("/orders")
async def create_order(body: OrderCreateIn, user: dict = Depends(get_current_user)):
    # payment method availability check
    settings = await get_settings()
    pm_conf = settings.get("payment_methods") or {}
    is_cod = body.payment_method == "cod"
    is_online = body.payment_method in ("online", "upi", "card", "netbanking")
    if is_cod and not pm_conf.get("cod", True):
        raise HTTPException(400, "Cash on Delivery is currently unavailable. Please choose another payment method.")
    if is_online and not pm_conf.get("online", True):
        raise HTTPException(400, "Online payment is currently unavailable. Please choose another payment method.")

    address = await db.addresses.find_one({"id": body.address_id, "user_id": user["id"]}, {"_id": 0})
    if not address:
        raise HTTPException(400, "Delivery address not found")
    if str(address.get("pincode", "")).strip() != SERVICEABLE_PINCODE:
        raise HTTPException(400, f"We currently deliver only to {SERVICEABLE_AREAS} (Pincode {SERVICEABLE_PINCODE}). Please update your address.")

    # snapshot items with product + seller info
    items = []
    seller_ids = set()
    subtotal = 0.0
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p:
            raise HTTPException(400, f"Product {it.product_id} not found")
        variant_delta = 0.0
        variant_value = it.variant
        if variant_value:
            v = next((v for v in p.get("variants", []) if v.get("value") == variant_value), None)
            variant_delta = (v or {}).get("price_delta", 0.0)
        line_price = p["price"] + variant_delta
        items.append({
            "product_id": p["id"],
            "seller_id": p["seller_id"],
            "title": p["title"],
            "image": (p.get("images") or [""])[0],
            "variant": variant_value,
            "price": line_price,
            "qty": it.qty,
            "line_total": round(line_price * it.qty, 2),
        })
        seller_ids.add(p["seller_id"])
        subtotal += line_price * it.qty

    delivery = 0 if subtotal >= 999 else 49
    discount = 0.0
    coupon_label = None
    if body.coupon_code:
        try:
            c, discount = await _compute_discount(body.coupon_code, subtotal)
            coupon_label = c["label"]
        except HTTPException:
            # Invalid/expired coupon at order time — ignore silently, don't fail order
            discount = 0.0

    total = round(subtotal + delivery - discount, 2)
    order_id = str(uuid.uuid4())
    short_id = "TM" + order_id.replace("-", "")[:8].upper()

    order = {
        "id": order_id,
        "short_id": short_id,
        "user_id": user["id"],
        "items": items,
        "seller_ids": list(seller_ids),
        "address": address,
        "payment_method": body.payment_method,
        "coupon_code": body.coupon_code,
        "coupon_label": coupon_label,
        "subtotal": round(subtotal, 2),
        "delivery_charge": delivery,
        "discount": round(discount, 2),
        "total": total,
        "status": "placed",
        "status_history": [{"status": "placed", "at": datetime.now(timezone.utc).isoformat()}],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "estimated_delivery": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
    }
    await db.orders.insert_one(order)
    order.pop("_id", None)
    return order

@api.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    # enrich with seller names
    sellers = await db.sellers.find({"id": {"$in": o.get("seller_ids", [])}}, {"_id": 0}).to_list(50)
    seller_map = {s["id"]: s for s in sellers}
    for it in o["items"]:
        it["seller"] = seller_map.get(it["seller_id"])
    return o

@api.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, user: dict = Depends(get_current_user)):
    if status not in STATUS_FLOW:
        raise HTTPException(400, "Invalid status")
    if user["role"] not in ("seller", "admin"):
        raise HTTPException(403, "Only sellers/admin can update status")
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Order not found")
    await db.orders.update_one({"id": order_id}, {
        "$set": {"status": status},
        "$push": {"status_history": {"status": status, "at": datetime.now(timezone.utc).isoformat()}},
    })
    return {"ok": True, "status": status}

@api.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": order_id, "user_id": user["id"]})
    if not o:
        raise HTTPException(404, "Order not found")
    if o.get("status") not in ("placed", "confirmed"):
        raise HTTPException(400, "Order can no longer be cancelled")
    await db.orders.update_one({"id": order_id}, {
        "$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()},
        "$push": {"status_history": {"status": "cancelled", "at": datetime.now(timezone.utc).isoformat()}},
    })
    return {"ok": True, "status": "cancelled"}

@api.get("/delivery/config")
async def delivery_config():
    return {"pincode": SERVICEABLE_PINCODE, "areas": SERVICEABLE_AREAS, "promise": "2-hour delivery"}

# ------------------ SIMILAR & BOUGHT-TOGETHER ------------------
@api.get("/products/{product_id}/similar")
async def similar_products(product_id: str, limit: int = 8):
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    cursor = db.products.find(
        {"category": p["category"], "id": {"$ne": product_id}},
        {"_id": 0},
    ).sort("rating", -1)
    return await cursor.to_list(limit)

BOUGHT_TOGETHER_MAP = {
    "tiles": ["home-decor", "flooring", "wall-stickers"],
    "wall-stencils": ["paints", "wall-stickers"],
    "wall-stickers": ["wall-stencils", "paints"],
    "wallpapers": ["home-decor", "paints"],
    "paints": ["wall-stencils", "home-decor", "wallpapers"],
    "home-decor": ["wallpapers", "paints", "tiles"],
    "flooring": ["tiles", "home-decor"],
}

@api.get("/products/{product_id}/bought-together")
async def bought_together(product_id: str):
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    complementary_cats = BOUGHT_TOGETHER_MAP.get(p["category"], [])
    picks = []
    for cat in complementary_cats:
        item = await db.products.find_one(
            {"category": cat, "id": {"$ne": product_id}},
            {"_id": 0},
            sort=[("rating", -1)],
        )
        if item:
            picks.append(item)
        if len(picks) >= 3:
            break
    return {"anchor": p, "items": picks[:3]}

# ------------------ PAYMENTS (RAZORPAY) ------------------
@api.get("/payments/config")
async def payment_config():
    return {"key_id": RAZORPAY_KEY_ID if RAZORPAY_ENABLED else "", "enabled": RAZORPAY_ENABLED}

# ------------------ PAYMENT METHOD TOGGLES ------------------
@api.get("/payment-methods/config")
async def payment_methods_config():
    """Public — returns which payment methods are enabled for buyers."""
    settings = await get_settings()
    pm = settings.get("payment_methods") or {}
    return {
        "cod": bool(pm.get("cod", True)),
        "online": bool(pm.get("online", True)),
    }

class PaymentMethodsUpdateIn(BaseModel):
    cod: Optional[bool] = None
    online: Optional[bool] = None

@api.patch("/admin/payment-methods")
async def admin_update_payment_methods(body: PaymentMethodsUpdateIn, user: dict = Depends(require_admin)):
    settings = await get_settings()
    pm = dict(settings.get("payment_methods") or {})
    if body.cod is not None:
        pm["cod"] = bool(body.cod)
    if body.online is not None:
        pm["online"] = bool(body.online)
    await db.settings.update_one(
        {"key": "platform"},
        {"$set": {"payment_methods": pm}},
        upsert=True,
    )
    return {"cod": bool(pm.get("cod", True)), "online": bool(pm.get("online", True))}

@api.post("/payments/create/{order_id}")
async def create_payment(order_id: str, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o.get("payment_status") == "paid":
        raise HTTPException(400, "Order already paid")
    if o.get("payment_method") == "cod":
        raise HTTPException(400, "COD orders do not require gateway payment")

    amount_paise = int(round(o["total"] * 100))
    receipt = ("rcpt_" + o["short_id"])[:40]

    if not RAZORPAY_ENABLED:
        # DEMO MODE — no real gateway keys configured yet
        return {
            "demo_mode": True,
            "order_id": order_id,
            "razorpay_order_id": f"demo_rzp_{uuid.uuid4().hex[:16]}",
            "amount": amount_paise,
            "currency": "INR",
            "key_id": "",
        }

    rzp_order = razorpay_client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "payment_capture": 1,
        "notes": {"internal_order_id": order_id, "short_id": o["short_id"]},
    })
    await db.orders.update_one({"id": order_id}, {"$set": {"razorpay_order_id": rzp_order["id"]}})
    return {
        "demo_mode": False,
        "order_id": order_id,
        "razorpay_order_id": rzp_order["id"],
        "amount": rzp_order["amount"],
        "currency": rzp_order["currency"],
        "key_id": RAZORPAY_KEY_ID,
    }

class PaymentVerifyIn(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: Optional[str] = None
    demo_mode: bool = False

@api.post("/payments/verify")
async def verify_payment(body: PaymentVerifyIn, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": body.order_id, "user_id": user["id"]})
    if not o:
        raise HTTPException(404, "Order not found")

    if body.demo_mode or not RAZORPAY_ENABLED:
        # accept without real signature verification (demo mode)
        pass
    else:
        expected = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        if not body.razorpay_signature or not hmac.compare_digest(expected, body.razorpay_signature):
            await db.orders.update_one({"id": body.order_id}, {
                "$set": {"payment_status": "failed"},
            })
            raise HTTPException(400, "Payment signature verification failed")

    await db.orders.update_one({"id": body.order_id}, {
        "$set": {
            "status": "confirmed",
            "payment_status": "paid",
            "razorpay_payment_id": body.razorpay_payment_id,
            "razorpay_signature": body.razorpay_signature,
            "paid_at": datetime.now(timezone.utc).isoformat(),
        },
        "$push": {"status_history": {"status": "confirmed", "at": datetime.now(timezone.utc).isoformat()}},
    })
    return {"ok": True, "status": "confirmed"}

# ------------------ SELLER: BULK UPLOAD + ORDERS ------------------
class BulkProductIn(BaseModel):
    name: str
    category: str
    price: float
    stock: int = 0
    description: Optional[str] = ""
    images: List[str] = []
    variants: List[dict] = []
    material: Optional[str] = ""
    mrp: Optional[float] = None

class BulkUploadIn(BaseModel):
    products: List[BulkProductIn]

@api.post("/seller/products/bulk")
async def bulk_upload_products(body: BulkUploadIn, user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller profile not found")
    await _enrich_seller_status(seller)
    if seller["effective_paused"]:
        raise HTTPException(403, "Account paused. Clear pending dues before uploading products.")
    if seller["subscription_status"] != "active":
        raise HTTPException(403, "Renew your subscription to upload products.")

    valid_cats = {c["slug"] for c in CATEGORIES}
    seller_verified = bool(seller.get("verified"))
    inserted = []
    errors = []
    docs_to_insert = []
    for idx, p in enumerate(body.products, start=1):
        if p.category not in valid_cats:
            errors.append({"row": idx, "name": p.name, "error": f"Unknown category '{p.category}'"})
            continue
        if p.price <= 0:
            errors.append({"row": idx, "name": p.name, "error": "Price must be > 0"})
            continue
        images = [img for img in (p.images or []) if img.strip()]
        if not images:
            errors.append({"row": idx, "name": p.name, "error": "At least one image URL required"})
            continue
        mrp = p.mrp if p.mrp and p.mrp > p.price else round(p.price * 1.3, 0)
        discount = int(round((mrp - p.price) / mrp * 100)) if mrp > p.price else 0
        doc = {
            "id": str(uuid.uuid4()),
            "seller_id": seller["id"],
            "seller_verified": seller_verified,
            "category": p.category,
            "title": p.name,
            "description": p.description or "",
            "price": p.price,
            "mrp": mrp,
            "discount": discount,
            "stock": p.stock,
            "material": p.material or "",
            "images": images,
            "variants": p.variants or [],
            "rating": 0.0,
            "reviews_count": 0,
            "trending": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        docs_to_insert.append(doc)
        inserted.append({"id": doc["id"], "title": doc["title"]})

    if docs_to_insert:
        await db.products.insert_many(docs_to_insert)

    return {"inserted": len(inserted), "errors": errors, "products": inserted}

@api.get("/seller/orders")
async def seller_orders(user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller profile not found")
    cursor = db.orders.find({"seller_ids": seller["id"]}, {"_id": 0}).sort("created_at", -1)
    orders = await cursor.to_list(200)
    # Filter items to only this seller's line items for the view
    for o in orders:
        o["items"] = [it for it in o["items"] if it.get("seller_id") == seller["id"]]
        o["seller_total"] = round(sum(it["line_total"] for it in o["items"]), 2)
    return orders

class SellerStatusIn(BaseModel):
    status: str
    location_link: Optional[str] = None

@api.patch("/seller/orders/{order_id}/status")
async def seller_update_status(order_id: str, body: SellerStatusIn = None, status: Optional[str] = None, location_link: Optional[str] = None, user: dict = Depends(require_seller)):
    # Accept either JSON body or query params (for backward compat)
    if body is None:
        body = SellerStatusIn(status=status or "", location_link=location_link)
    if body.status not in SELLER_FLOW or body.status == "placed":
        raise HTTPException(400, "Sellers can only advance to confirmed / packed / shipped / delivered")
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller profile not found")
    await _enrich_seller_status(seller)
    if seller["effective_paused"]:
        raise HTTPException(403, "Account paused. Clear pending dues before continuing.")
    o = await db.orders.find_one({"id": order_id})
    if not o or seller["id"] not in o.get("seller_ids", []):
        raise HTTPException(404, "Order not found")
    current = o.get("status", "placed")
    if current == "cancelled":
        raise HTTPException(400, "Order was cancelled")
    try:
        cur_idx = SELLER_FLOW.index(current)
    except ValueError:
        cur_idx = 0
    new_idx = SELLER_FLOW.index(body.status)
    if new_idx != cur_idx + 1:
        raise HTTPException(400, f"Status must advance one step forward (current: {current}, next allowed: {SELLER_FLOW[cur_idx+1] if cur_idx+1 < len(SELLER_FLOW) else 'end'})")
    now_iso = datetime.now(timezone.utc).isoformat()
    set_updates = {"status": body.status}
    if body.status == "shipped" and body.location_link and body.location_link.strip():
        set_updates["location_link"] = body.location_link.strip()
    await db.orders.update_one({"id": order_id}, {
        "$set": set_updates,
        "$push": {"status_history": {"status": body.status, "at": now_iso, "by": seller["id"]}},
    })
    if body.status == "delivered":
        existing = await db.commission_dues.find_one({"order_id": order_id, "seller_id": seller["id"]})
        if not existing:
            settings = await get_settings()
            rate = float(seller.get("commission_rate", settings["default_commission_rate"]))
            seller_items = [it for it in o.get("items", []) if it.get("seller_id") == seller["id"]]
            seller_total = round(sum(it.get("line_total", 0.0) for it in seller_items), 2)
            commission_amount = round(seller_total * rate / 100.0, 2)
            if commission_amount > 0:
                await db.commission_dues.insert_one({
                    "id": str(uuid.uuid4()),
                    "seller_id": seller["id"],
                    "order_id": order_id,
                    "short_id": o.get("short_id"),
                    "order_value": seller_total,
                    "commission_rate": rate,
                    "commission_amount": commission_amount,
                    "status": "pending",
                    "delivered_at": now_iso,
                    "cleared_at": None,
                    "cleared_payment_id": None,
                    "cleared_note": None,
                })
    return {"ok": True, "status": body.status, "location_link": set_updates.get("location_link")}

# ------------------ SUBSCRIPTIONS ------------------
@api.get("/seller/subscription")
async def seller_subscription_info(user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    await _enrich_seller_status(seller)
    settings = await get_settings()
    return {
        "subscription_status": seller["subscription_status"],
        "subscription_days_left": seller["subscription_days_left"],
        "subscription_expires_at": seller.get("subscription_expires_at"),
        "price": settings["subscription_price"],
        "period_days": settings["subscription_period_days"],
    }

@api.post("/seller/subscription/create")
async def seller_subscription_create(user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    settings = await get_settings()
    amount_paise = int(round(settings["subscription_price"] * 100))
    if not RAZORPAY_ENABLED:
        return {"demo_mode": True, "razorpay_order_id": f"demo_sub_{uuid.uuid4().hex[:12]}", "amount": amount_paise, "currency": "INR", "key_id": ""}
    rzp = razorpay_client.order.create({"amount": amount_paise, "currency": "INR", "receipt": ("sub_" + seller["id"])[:40], "payment_capture": 1, "notes": {"seller_id": seller["id"], "type": "subscription"}})
    return {"demo_mode": False, "razorpay_order_id": rzp["id"], "amount": rzp["amount"], "currency": rzp["currency"], "key_id": RAZORPAY_KEY_ID}

class SubVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: Optional[str] = None
    demo_mode: bool = False

@api.post("/seller/subscription/verify")
async def seller_subscription_verify(body: SubVerifyIn, user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    if not body.demo_mode and RAZORPAY_ENABLED:
        expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(), hashlib.sha256).hexdigest()
        if not body.razorpay_signature or not hmac.compare_digest(expected, body.razorpay_signature):
            raise HTTPException(400, "Signature verification failed")
    settings = await get_settings()
    now = datetime.now(timezone.utc)
    current_exp = seller.get("subscription_expires_at")
    base = now
    try:
        if current_exp:
            exp_dt = datetime.fromisoformat(current_exp.replace("Z", "+00:00"))
            if exp_dt > now:
                base = exp_dt
    except Exception:
        pass
    new_exp = base + timedelta(days=settings["subscription_period_days"])
    await db.sellers.update_one({"id": seller["id"]}, {"$set": {
        "subscription_expires_at": new_exp.isoformat(),
        "subscription_last_paid_at": now.isoformat(),
    }})
    await db.subscription_payments.insert_one({
        "id": str(uuid.uuid4()),
        "seller_id": seller["id"],
        "amount": settings["subscription_price"],
        "razorpay_order_id": body.razorpay_order_id,
        "razorpay_payment_id": body.razorpay_payment_id,
        "demo_mode": body.demo_mode,
        "paid_at": now.isoformat(),
    })
    return {"ok": True, "subscription_expires_at": new_exp.isoformat()}

# ------------------ DUES (SELLER) ------------------
@api.get("/seller/dues")
async def seller_dues(user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    await _enrich_seller_status(seller)
    pending = await db.commission_dues.find({"seller_id": seller["id"], "status": "pending"}, {"_id": 0}).sort("delivered_at", -1).to_list(500)
    cleared = await db.commission_dues.find({"seller_id": seller["id"], "status": "cleared"}, {"_id": 0}).sort("cleared_at", -1).to_list(50)
    return {
        "seller": {
            "id": seller["id"], "business_name": seller["business_name"],
            "pending_dues": seller["pending_dues"],
            "effective_paused": seller["effective_paused"],
            "auto_paused": seller["auto_paused"],
            "dues_over_threshold": seller["dues_over_threshold"],
        },
        "pending": pending, "cleared": cleared,
    }

class DuesPayCreateIn(BaseModel):
    amount: Optional[float] = None

@api.post("/seller/dues/pay/create")
async def seller_dues_pay_create(body: DuesPayCreateIn, user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    total_pending, _ = await _seller_pending_dues(seller["id"])
    if total_pending <= 0:
        raise HTTPException(400, "No pending dues")
    amount = body.amount if body.amount and 0 < body.amount <= total_pending else total_pending
    amount_paise = int(round(amount * 100))
    if not RAZORPAY_ENABLED:
        return {"demo_mode": True, "razorpay_order_id": f"demo_dues_{uuid.uuid4().hex[:12]}", "amount": amount_paise, "currency": "INR", "key_id": "", "amount_rupees": amount}
    rzp = razorpay_client.order.create({"amount": amount_paise, "currency": "INR", "receipt": f"dues_{seller['id']}"[:40], "payment_capture": 1, "notes": {"seller_id": seller["id"], "type": "dues"}})
    return {"demo_mode": False, "razorpay_order_id": rzp["id"], "amount": rzp["amount"], "currency": rzp["currency"], "key_id": RAZORPAY_KEY_ID, "amount_rupees": amount}

class DuesPayVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: Optional[str] = None
    demo_mode: bool = False
    amount: float

@api.post("/seller/dues/pay/verify")
async def seller_dues_pay_verify(body: DuesPayVerifyIn, user: dict = Depends(require_seller)):
    seller = await db.sellers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(404, "Seller not found")
    if not body.demo_mode and RAZORPAY_ENABLED:
        expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(), hashlib.sha256).hexdigest()
        if not body.razorpay_signature or not hmac.compare_digest(expected, body.razorpay_signature):
            raise HTTPException(400, "Signature verification failed")
    remaining = float(body.amount)
    now_iso = datetime.now(timezone.utc).isoformat()
    cleared = 0
    cursor = db.commission_dues.find({"seller_id": seller["id"], "status": "pending"}, {"_id": 0}).sort("delivered_at", 1)
    async for d in cursor:
        if remaining <= 0.009:
            break
        if d["commission_amount"] <= remaining + 0.01:
            await db.commission_dues.update_one({"id": d["id"]}, {"$set": {
                "status": "cleared", "cleared_at": now_iso,
                "cleared_payment_id": body.razorpay_payment_id, "cleared_note": "razorpay",
            }})
            remaining -= d["commission_amount"]
            cleared += 1
    await db.sellers.update_one({"id": seller["id"]}, {"$set": {"last_dues_paid_at": now_iso}})
    remaining_dues, _ = await _seller_pending_dues(seller["id"])
    return {"ok": True, "cleared_count": cleared, "remaining_dues": remaining_dues}

# ------------------ ADMIN: SETTINGS + DUES ------------------
class SettingsUpdate(BaseModel):
    subscription_price: Optional[float] = None
    subscription_period_days: Optional[int] = None
    default_commission_rate: Optional[float] = None
    dues_threshold: Optional[float] = None
    dues_grace_days: Optional[int] = None

@api.get("/admin/settings")
async def admin_get_settings(user: dict = Depends(require_admin)):
    return await get_settings()

@api.patch("/admin/settings")
async def admin_update_settings(body: SettingsUpdate, user: dict = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.settings.update_one({"key": "platform"}, {"$set": updates}, upsert=True)
    return await get_settings()

@api.get("/admin/dues")
async def admin_dues(user: dict = Depends(require_admin)):
    settings = await get_settings()
    sellers = await db.sellers.find({}, {"_id": 0}).to_list(500)
    rows = []
    for s in sellers:
        await _enrich_seller_status(s)
        rows.append({
            "id": s["id"], "business_name": s["business_name"],
            "verified": s.get("verified", False),
            "commission_rate": s.get("commission_rate", settings["default_commission_rate"]),
            "pending_dues": s["pending_dues"], "over_threshold": s["dues_over_threshold"],
            "auto_paused": s["auto_paused"], "paused_by_admin": bool(s.get("paused_by_admin")),
            "effective_paused": s["effective_paused"], "subscription_status": s["subscription_status"],
            "subscription_expires_at": s.get("subscription_expires_at"),
            "last_dues_paid_at": s.get("last_dues_paid_at"),
        })
    rows.sort(key=lambda r: (-r["pending_dues"], r["business_name"]))
    return {"threshold": settings["dues_threshold"], "sellers": rows}

class AdminMarkPaidIn(BaseModel):
    amount: Optional[float] = None
    note: Optional[str] = "offline"

@api.post("/admin/dues/{seller_id}/mark-paid")
async def admin_mark_paid(seller_id: str, body: AdminMarkPaidIn, user: dict = Depends(require_admin)):
    s = await db.sellers.find_one({"id": seller_id})
    if not s:
        raise HTTPException(404, "Seller not found")
    total_pending, _ = await _seller_pending_dues(seller_id)
    if total_pending <= 0:
        raise HTTPException(400, "No pending dues")
    remaining = float(body.amount) if body.amount and 0 < body.amount <= total_pending else total_pending
    now_iso = datetime.now(timezone.utc).isoformat()
    cleared = 0
    cursor = db.commission_dues.find({"seller_id": seller_id, "status": "pending"}, {"_id": 0}).sort("delivered_at", 1)
    async for d in cursor:
        if remaining <= 0.009:
            break
        if d["commission_amount"] <= remaining + 0.01:
            await db.commission_dues.update_one({"id": d["id"]}, {"$set": {
                "status": "cleared", "cleared_at": now_iso,
                "cleared_payment_id": None, "cleared_note": body.note or "offline",
            }})
            remaining -= d["commission_amount"]
            cleared += 1
    await db.sellers.update_one({"id": seller_id}, {"$set": {"last_dues_paid_at": now_iso}})
    remaining_dues, _ = await _seller_pending_dues(seller_id)
    return {"ok": True, "cleared_count": cleared, "remaining_dues": remaining_dues}

class AdminSellerPauseIn(BaseModel):
    paused: bool

@api.patch("/admin/sellers/{seller_id}/pause")
async def admin_pause_seller(seller_id: str, body: AdminSellerPauseIn, user: dict = Depends(require_admin)):
    s = await db.sellers.find_one({"id": seller_id})
    if not s:
        raise HTTPException(404, "Seller not found")
    await db.sellers.update_one({"id": seller_id}, {"$set": {"paused_by_admin": body.paused}})
    return {"ok": True, "paused_by_admin": body.paused}

class AdminSellerCommissionIn(BaseModel):
    commission_rate: float = Field(ge=0, le=100)

@api.patch("/admin/sellers/{seller_id}/commission")
async def admin_set_commission(seller_id: str, body: AdminSellerCommissionIn, user: dict = Depends(require_admin)):
    s = await db.sellers.find_one({"id": seller_id})
    if not s:
        raise HTTPException(404, "Seller not found")
    await db.sellers.update_one({"id": seller_id}, {"$set": {"commission_rate": body.commission_rate}})
    return {"ok": True, "commission_rate": body.commission_rate}

# ------------------ ADMIN ------------------
@api.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_admin)):
    return {
        "sellers": await db.sellers.count_documents({}),
        "sellers_verified": await db.sellers.count_documents({"verified": True}),
        "sellers_pending": await db.sellers.count_documents({"verified": {"$ne": True}}),
        "products": await db.products.count_documents({}),
        "orders": await db.orders.count_documents({}),
        "buyers": await db.users.count_documents({"role": "buyer"}),
        "revenue": round(sum([o["total"] async for o in db.orders.find({"payment_status": "paid"}, {"total": 1})]), 2),
    }

@api.get("/admin/sellers")
async def admin_list_sellers(user: dict = Depends(require_admin)):
    sellers = await db.sellers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for s in sellers:
        s["products_count"] = await db.products.count_documents({"seller_id": s["id"]})
        s["orders_count"] = await db.orders.count_documents({"seller_ids": s["id"]})
        u = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "password_hash": 0})
        s["owner_email"] = (u or {}).get("email")
        s["owner_name"] = (u or {}).get("name")
    return sellers

@api.patch("/admin/sellers/{seller_id}/verify")
async def admin_verify_seller(seller_id: str, verified: bool = True, user: dict = Depends(require_admin)):
    s = await db.sellers.find_one({"id": seller_id})
    if not s:
        raise HTTPException(404, "Seller not found")
    await db.sellers.update_one({"id": seller_id}, {"$set": {"verified": verified, "verified_at": datetime.now(timezone.utc).isoformat()}})
    await db.products.update_many({"seller_id": seller_id}, {"$set": {"seller_verified": verified}})
    return {"ok": True, "verified": verified}

@api.delete("/admin/sellers/{seller_id}")
async def admin_delete_seller(seller_id: str, user: dict = Depends(require_admin)):
    s = await db.sellers.find_one({"id": seller_id})
    if not s:
        raise HTTPException(404, "Seller not found")
    products_removed = (await db.products.delete_many({"seller_id": seller_id})).deleted_count
    await db.sellers.delete_one({"id": seller_id})
    await db.users.delete_one({"id": s.get("user_id")})
    return {"ok": True, "products_removed": products_removed}

@api.get("/admin/products")
async def admin_list_products(q: Optional[str] = None, category: Optional[str] = None, seller_id: Optional[str] = None, user: dict = Depends(require_admin)):
    query = {}
    if q:
        query["title"] = {"$regex": q, "$options": "i"}
    if category:
        query["category"] = category
    if seller_id:
        query["seller_id"] = seller_id
    products = await db.products.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    sellers = {s["id"]: s async for s in db.sellers.find({}, {"_id": 0})}
    for p in products:
        s = sellers.get(p.get("seller_id"))
        p["seller_name"] = (s or {}).get("business_name")
        p["seller_verified_flag"] = (s or {}).get("verified", False)
    return products

@api.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, user: dict = Depends(require_admin)):
    res = await db.products.delete_one({"id": product_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Product not found")
    await db.reviews.delete_many({"product_id": product_id})
    return {"ok": True}

@api.get("/admin/orders")
async def admin_list_orders(status: Optional[str] = None, user: dict = Depends(require_admin)):
    query = {}
    if status and status != "all":
        query["status"] = status
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders

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
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await db.users.create_index("email", unique=True)
    await db.users.create_index("phone")
    await db.products.create_index("category")
    await db.products.create_index("seller_id")
    await db.orders.create_index("user_id")
    await db.orders.create_index("seller_ids")
    await db.addresses.create_index("user_id")
    await db.coupons.create_index("code", unique=True)
    await db.commission_dues.create_index("seller_id")
    await db.commission_dues.create_index([("seller_id", 1), ("status", 1)])
    # ensure default settings
    await get_settings()
    # seed coupons if missing
    for c in DEFAULT_COUPONS:
        await db.coupons.update_one({"code": c["code"]}, {"$setOnInsert": c}, upsert=True)
    await seed_data()
    # give existing sellers an active subscription so they don't auto-hide on first boot
    now = datetime.now(timezone.utc)
    default_exp = (now + timedelta(days=30)).isoformat()
    await db.sellers.update_many({"subscription_expires_at": {"$exists": False}}, {"$set": {"subscription_expires_at": default_exp}})
    # denormalise seller.verified onto products for card display
    sellers_all = await db.sellers.find({}, {"_id": 0}).to_list(500)
    verified_ids = [s["id"] for s in sellers_all if s.get("verified")]
    unverified_ids = [s["id"] for s in sellers_all if not s.get("verified")]
    if verified_ids:
        await db.products.update_many({"seller_id": {"$in": verified_ids}}, {"$set": {"seller_verified": True}})
    if unverified_ids:
        await db.products.update_many({"seller_id": {"$in": unverified_ids}}, {"$set": {"seller_verified": False}})

@app.on_event("shutdown")
async def shutdown():
    client.close()

@api.get("/")
async def root():
    return {"service": "TerraMart", "status": "ok"}

# ------------------ AI ROUTES ------------------
from ai_routes import build_ai_router  # noqa: E402
api.include_router(build_ai_router(db, get_current_user, require_seller))

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_origin_regex=r"https://.*\.preview\.emergentagent\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)
