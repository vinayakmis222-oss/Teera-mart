"""Phase 5 — Admin Panel backend tests (RBAC, sellers, verify, delete, products, orders)."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@terramart.com", "password": "Admin@123"}
SELLER = {"email": "seller1@terramart.com", "password": "Seller@123"}


def _login(email, password, role=None):
    payload = {"email": email, "password": password}
    if role:
        payload["role"] = role
    r = requests.post(f"{API}/auth/login", json=payload, timeout=30)
    return r


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_token():
    r = _login(**ADMIN)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed: {r.status_code} {r.text[:300]}")
    data = r.json()
    assert data["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def seller_token():
    r = _login(**SELLER)
    if r.status_code != 200:
        pytest.fail(f"Seller login failed: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def buyer_token():
    email = f"TEST_admin_rbac_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Buyer@123", "name": "TEST Buyer", "role": "buyer"
    }, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Buyer register failed: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


# ---------------- RBAC ----------------
class TestAdminRBAC:
    ENDPOINTS = ["/admin/stats", "/admin/sellers", "/admin/products", "/admin/orders"]

    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_unauthenticated_401(self, path):
        r = requests.get(f"{API}{path}", timeout=30)
        assert r.status_code == 401, f"{path} -> {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_buyer_403(self, path, buyer_token):
        r = requests.get(f"{API}{path}", headers=_hdr(buyer_token), timeout=30)
        assert r.status_code == 403, f"{path} -> {r.status_code}"

    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_seller_403(self, path, seller_token):
        r = requests.get(f"{API}{path}", headers=_hdr(seller_token), timeout=30)
        assert r.status_code == 403, f"{path} -> {r.status_code}"

    def test_seller_cannot_login_as_admin_role(self):
        r = _login(SELLER["email"], SELLER["password"], role="admin")
        assert r.status_code == 403, r.text[:300]

    def test_admin_wrong_password(self):
        r = _login(ADMIN["email"], "WrongPass@999")
        assert r.status_code in (401, 423), r.text[:300]
        # restore lockout counter by a valid login
        _login(**ADMIN)

    def test_mutating_admin_endpoints_reject_non_admin(self, buyer_token):
        r = requests.delete(f"{API}/admin/products/{uuid.uuid4()}", headers=_hdr(buyer_token), timeout=30)
        assert r.status_code == 403
        r = requests.delete(f"{API}/admin/sellers/{uuid.uuid4()}", headers=_hdr(buyer_token), timeout=30)
        assert r.status_code == 403
        r = requests.patch(f"{API}/admin/sellers/{uuid.uuid4()}/verify?verified=true",
                           headers=_hdr(buyer_token), timeout=30)
        assert r.status_code == 403


# ---------------- STATS ----------------
class TestAdminStats:
    def test_stats_shape(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["sellers", "sellers_verified", "sellers_pending", "products", "orders", "buyers", "revenue"]:
            assert k in d, f"missing key {k}"
        assert isinstance(d["sellers"], int) and d["sellers"] > 0
        assert d["sellers_verified"] + d["sellers_pending"] == d["sellers"]
        assert d["products"] > 0
        assert isinstance(d["revenue"], (int, float))
        assert "_id" not in d


# ---------------- SELLERS LIST ----------------
class TestAdminSellers:
    def test_list_sellers_fields(self, admin_token):
        r = requests.get(f"{API}/admin/sellers", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 5
        for s in rows:
            assert "_id" not in s
            for k in ["id", "business_name", "gst_number", "verified", "products_count",
                      "orders_count", "owner_email", "owner_name"]:
                assert k in s, f"seller row missing {k}: {s}"
            assert isinstance(s["products_count"], int)
            assert isinstance(s["orders_count"], int)
        names = {s["business_name"] for s in rows}
        assert "Rustic Home Co." in names
        assert "TerraStone Ceramics" in names

    def test_verify_toggle_propagates_to_products(self, admin_token):
        rows = requests.get(f"{API}/admin/sellers", headers=_hdr(admin_token), timeout=30).json()
        target = next(s for s in rows if s["business_name"] == "Rustic Home Co.")
        sid = target["id"]
        original = bool(target["verified"])
        try:
            # verify = true
            r = requests.patch(f"{API}/admin/sellers/{sid}/verify?verified=true",
                               headers=_hdr(admin_token), timeout=30)
            assert r.status_code == 200 and r.json()["verified"] is True
            rows2 = requests.get(f"{API}/admin/sellers", headers=_hdr(admin_token), timeout=30).json()
            assert next(s for s in rows2 if s["id"] == sid)["verified"] is True
            prods = requests.get(f"{API}/admin/products?seller_id={sid}",
                                 headers=_hdr(admin_token), timeout=30).json()
            assert len(prods) > 0
            assert all(p["seller_verified"] is True for p in prods), "seller_verified not propagated on products"

            # verify = false
            r = requests.patch(f"{API}/admin/sellers/{sid}/verify?verified=false",
                               headers=_hdr(admin_token), timeout=30)
            assert r.status_code == 200 and r.json()["verified"] is False
            prods = requests.get(f"{API}/admin/products?seller_id={sid}",
                                 headers=_hdr(admin_token), timeout=30).json()
            assert all(p["seller_verified"] is False for p in prods), "revoke not propagated on products"
        finally:
            requests.patch(f"{API}/admin/sellers/{sid}/verify?verified={str(original).lower()}",
                           headers=_hdr(admin_token), timeout=30)

    def test_verify_unknown_seller_404(self, admin_token):
        r = requests.patch(f"{API}/admin/sellers/{uuid.uuid4()}/verify?verified=true",
                           headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 404

    def test_delete_seller_cascades(self, admin_token):
        # create a throwaway TEST_ seller with products (non-destructive to seed data)
        email = f"TEST_delseller_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Seller@123", "name": "TEST Del Seller",
            "role": "seller", "business_name": "TEST_DeleteMe Traders", "gst_number": "09TESTE1234Z9Z9",
        }, timeout=30)
        assert reg.status_code == 200, reg.text[:300]
        stoken = reg.json()["token"]
        up = requests.post(f"{API}/seller/products/bulk", headers=_hdr(stoken), json={"products": [
            {"name": "TEST_AdminDel Tile A", "category": "tiles", "price": 500, "stock": 5,
             "images": ["https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80"]},
            {"name": "TEST_AdminDel Tile B", "category": "tiles", "price": 600, "stock": 5,
             "images": ["https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80"]},
        ]}, timeout=60)
        assert up.status_code == 200, up.text[:300]
        assert up.json()["inserted"] == 2

        sid = requests.get(f"{API}/seller/me", headers=_hdr(stoken), timeout=30).json()["id"]

        r = requests.delete(f"{API}/admin/sellers/{sid}", headers=_hdr(admin_token), timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["products_removed"] == 2

        # products gone from public catalog
        pub = requests.get(f"{API}/products?seller_id={sid}", timeout=30)
        assert pub.status_code == 200
        assert pub.json() == [] or len(pub.json()) == 0

        # seller gone from admin list
        rows = requests.get(f"{API}/admin/sellers", headers=_hdr(admin_token), timeout=30).json()
        assert sid not in [s["id"] for s in rows]

        # linked user removed -> cannot login
        assert _login(email, "Seller@123").status_code == 401

        # deleting again -> 404
        assert requests.delete(f"{API}/admin/sellers/{sid}", headers=_hdr(admin_token), timeout=30).status_code == 404

    def test_delete_unknown_seller_404(self, admin_token):
        r = requests.delete(f"{API}/admin/sellers/{uuid.uuid4()}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 404


# ---------------- PRODUCTS ----------------
class TestAdminProducts:
    def test_list_products_enriched(self, admin_token):
        r = requests.get(f"{API}/admin/products", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0
        for p in rows[:20]:
            assert "_id" not in p
            assert "seller_name" in p and p["seller_name"], f"missing seller_name: {p.get('title')}"
            assert "seller_verified_flag" in p
            assert isinstance(p["seller_verified_flag"], bool)

    def test_search_filter(self, admin_token):
        r = requests.get(f"{API}/admin/products?q=carrara", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0, "expected at least one 'carrara' product"
        assert all("carrara" in p["title"].lower() for p in rows)

    def test_category_filter(self, admin_token):
        r = requests.get(f"{API}/admin/products?category=tiles", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        assert all(p["category"] == "tiles" for p in rows)

    def test_delete_product(self, admin_token):
        # create a TEST_ product via a throwaway seller, delete via admin
        email = f"TEST_delprod_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Seller@123", "name": "TEST Prod Seller",
            "role": "seller", "business_name": "TEST_ProdDel Co", "gst_number": "09TESTE9999Z9Z9",
        }, timeout=30)
        assert reg.status_code == 200
        stoken = reg.json()["token"]
        up = requests.post(f"{API}/seller/products/bulk", headers=_hdr(stoken), json={"products": [
            {"name": "TEST_AdminDeleteProduct", "category": "paints", "price": 999, "stock": 3,
             "images": ["https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80"]},
        ]}, timeout=60)
        pid = up.json()["products"][0]["id"]
        assert requests.get(f"{API}/products/{pid}", timeout=30).status_code == 200

        r = requests.delete(f"{API}/admin/products/{pid}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200 and r.json()["ok"] is True
        assert requests.get(f"{API}/products/{pid}", timeout=30).status_code == 404
        assert requests.delete(f"{API}/admin/products/{pid}", headers=_hdr(admin_token), timeout=30).status_code == 404

        # cleanup throwaway seller
        sid = requests.get(f"{API}/admin/sellers", headers=_hdr(admin_token), timeout=30).json()
        for s in sid:
            if s["business_name"] == "TEST_ProdDel Co":
                requests.delete(f"{API}/admin/sellers/{s['id']}", headers=_hdr(admin_token), timeout=30)

    def test_delete_unknown_product_404(self, admin_token):
        r = requests.delete(f"{API}/admin/products/{uuid.uuid4()}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 404


# ---------------- ORDERS ----------------
class TestAdminOrders:
    def test_list_all_orders(self, admin_token):
        r = requests.get(f"{API}/admin/orders", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        orders = r.json()
        assert isinstance(orders, list)
        if not orders:
            pytest.skip("No orders on platform to validate shape")
        for o in orders[:10]:
            assert "_id" not in o
            for k in ["id", "status", "total", "payment_method", "items", "address"]:
                assert k in o, f"order missing {k}"
            assert isinstance(o["items"], list) and len(o["items"]) > 0
            assert "seller_id" in o["items"][0], "order item missing seller_id"
            assert isinstance(o["total"], (int, float))

    def test_status_filter(self, admin_token):
        all_orders = requests.get(f"{API}/admin/orders", headers=_hdr(admin_token), timeout=30).json()
        if not all_orders:
            pytest.skip("no orders")
        statuses = {o["status"] for o in all_orders}
        target = "placed" if "placed" in statuses else sorted(statuses)[0]
        r = requests.get(f"{API}/admin/orders?status={target}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        assert all(o["status"] == target for o in rows)
        assert len(rows) <= len(all_orders)

    def test_status_all_returns_everything(self, admin_token):
        a = requests.get(f"{API}/admin/orders", headers=_hdr(admin_token), timeout=30).json()
        b = requests.get(f"{API}/admin/orders?status=all", headers=_hdr(admin_token), timeout=30).json()
        assert len(a) == len(b)

    def test_admin_sees_more_than_single_buyer(self, admin_token, buyer_token):
        admin_orders = requests.get(f"{API}/admin/orders", headers=_hdr(admin_token), timeout=30).json()
        buyer_orders = requests.get(f"{API}/orders", headers=_hdr(buyer_token), timeout=30).json()
        assert len(admin_orders) >= len(buyer_orders)


# ---------------- SECURITY / PLAYBOOK ----------------
class TestAuthPlaybook:
    def test_login_sets_httponly_cookies(self):
        r = _login(**ADMIN)
        assert r.status_code == 200
        raw = r.headers.get("set-cookie", "")
        assert "access_token" in raw, raw[:300]
        assert "HttpOnly" in raw or "httponly" in raw
        assert "access_token" in r.cookies

    def test_bcrypt_hash_format(self):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL") or dotenv_values("/app/backend/.env").get("MONGO_URL")
        db_name = os.environ.get("DB_NAME") or dotenv_values("/app/backend/.env").get("DB_NAME")

        async def _check():
            client = AsyncIOMotorClient(mongo_url)
            u = await client[db_name].users.find_one({"email": ADMIN["email"]})
            client.close()
            return u

        u = asyncio.get_event_loop().run_until_complete(_check()) if False else asyncio.run(_check())
        assert u is not None, "admin user not seeded"
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:10]

    def test_cors_allows_credentials_explicit_origin(self):
        # NOTE: the public edge proxy rewrites CORS headers to ACAO:* on both
        # preflight and actual requests, so the app's own CORS policy is asserted
        # by inspecting the FastAPI CORSMiddleware configuration in source.
        src = open("/app/backend/server.py", encoding="utf-8").read()
        assert "allow_credentials=True" in src
        assert 'allow_origins=[FRONTEND_URL, "http://localhost:3000"]' in src
        assert 'allow_origin_regex' in src
        assert 'allow_origins=["*"]' not in src

    def test_brute_force_lockout_after_5_failures(self):
        email = f"TEST_lockout_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Buyer@123", "name": "TEST Lockout", "role": "buyer"
        }, timeout=30)
        assert reg.status_code == 200
        codes = [_login(email, "Nope@12345").status_code for _ in range(5)]
        assert codes[:5] == [401, 401, 401, 401, 401], codes
        # 6th attempt (even with the CORRECT password) must be locked
        locked = _login(email, "Buyer@123")
        assert locked.status_code == 423, f"expected 423 lockout, got {locked.status_code} {locked.text[:200]}"
