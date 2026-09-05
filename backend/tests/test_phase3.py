"""Phase-3 backend tests: coupons(DB), similar/bought-together, payments(demo), cancel,
seller bulk upload, seller orders queue."""
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
API = BASE_URL + "/api"

SELLER1 = {"email": "seller1@terramart.com", "password": "Seller@123"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def buyer(client):
    email = f"TEST_buyer_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Buyer@123", "name": "TEST Buyer", "role": "buyer"})
    assert r.status_code in (200, 201), r.text
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in register response: {data}"
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def seller_token():
    r = requests.post(f"{API}/auth/login", json=SELLER1)
    if r.status_code != 200:
        pytest.fail(f"seller1 login failed {r.status_code}: {r.text[:300]}")
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def seller_headers(seller_token):
    return {"Authorization": f"Bearer {seller_token}"}


@pytest.fixture(scope="session")
def products():
    r = requests.get(f"{API}/products?limit=100")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def buyer_address(buyer):
    r = requests.post(f"{API}/addresses", headers=buyer["headers"], json={
        "name": "TEST Buyer", "phone": "9876543210", "pincode": "226013",
        "line1": "1 Test Street", "city": "Bengaluru", "state": "Karnataka", "type": "home"})
    assert r.status_code in (200, 201), r.text
    body = r.json()
    addr = body if isinstance(body, dict) and "id" in body else None
    if addr is None:
        lst = requests.get(f"{API}/addresses", headers=buyer["headers"]).json()
        addr = lst[0]
    return addr


def make_order(buyer, addr, prods, payment_method="upi", coupon=None, qty=1, count=2):
    items = [{"product_id": p["id"], "qty": qty} for p in prods[:count]]
    payload = {"items": items, "address_id": addr["id"], "payment_method": payment_method}
    if coupon:
        payload["coupon_code"] = coupon
    r = requests.post(f"{API}/orders", headers=buyer["headers"], json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ---------- coupons ----------
class TestCoupons:
    def test_list_coupons(self):
        r = requests.get(f"{API}/coupons")
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()]
        for expected in ("WELCOME10", "TERRA200", "FIRSTBUY"):
            assert expected in codes
        for c in r.json():
            assert "_id" not in c
            assert c["is_active"] is True

    def test_expired_coupon_rejected(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "EXPIRED10", "subtotal": 2000})
        assert r.status_code == 400, r.text
        assert "expired" in r.json()["detail"].lower()

    def test_invalid_coupon(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "INVALIDCODE", "subtotal": 2000})
        assert r.status_code == 400
        assert "invalid" in r.json()["detail"].lower()

    def test_welcome10_discount(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "WELCOME10", "subtotal": 2000})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["code"] == "WELCOME10"
        assert d["discount"] == 200

    def test_welcome10_max_off_cap(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "WELCOME10", "subtotal": 20000})
        assert r.status_code == 200
        assert r.json()["discount"] == 500

    def test_terra200_min_order(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "TERRA200", "subtotal": 1000})
        assert r.status_code == 400
        assert "Minimum" in r.json()["detail"]

    def test_terra200_ok(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "TERRA200", "subtotal": 1600})
        assert r.status_code == 200
        assert r.json()["discount"] == 200

    def test_coupon_lowercase_accepted(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "welcome10", "subtotal": 1000})
        assert r.status_code == 200
        assert r.json()["code"] == "WELCOME10"


# ---------- similar / bought-together ----------
class TestSimilarBundles:
    def test_similar(self, products):
        p = products[0]
        r = requests.get(f"{API}/products/{p['id']}/similar")
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        for it in items:
            assert it["id"] != p["id"]
            assert it["category"] == p["category"]
            assert "_id" not in it

    def test_similar_404(self):
        r = requests.get(f"{API}/products/{uuid.uuid4()}/similar")
        assert r.status_code == 404

    def test_bought_together(self, products):
        p = next(x for x in products if x["category"] == "tiles")
        r = requests.get(f"{API}/products/{p['id']}/bought-together")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["anchor"]["id"] == p["id"]
        assert isinstance(d["items"], list) and 0 < len(d["items"]) <= 3
        for it in d["items"]:
            assert it["id"] != p["id"]
            assert it["category"] != p["category"]

    def test_bought_together_404(self):
        r = requests.get(f"{API}/products/{uuid.uuid4()}/bought-together")
        assert r.status_code == 404


# ---------- payments (demo mode) ----------
class TestPayments:
    def test_config_disabled(self):
        r = requests.get(f"{API}/payments/config")
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is False
        assert d["key_id"] == ""

    def test_upi_order_demo_payment_flow(self, buyer, buyer_address, products):
        order = make_order(buyer, buyer_address, products, payment_method="upi")
        assert order["status"] == "placed"
        oid = order["id"]

        r = requests.post(f"{API}/payments/create/{oid}", headers=buyer["headers"])
        assert r.status_code == 200, r.text
        pay = r.json()
        assert pay["demo_mode"] is True
        assert pay["razorpay_order_id"].startswith("demo_rzp_")
        assert pay["key_id"] == ""
        assert pay["amount"] == int(round(order["total"] * 100))

        v = requests.post(f"{API}/payments/verify", headers=buyer["headers"], json={
            "order_id": oid, "razorpay_order_id": pay["razorpay_order_id"],
            "razorpay_payment_id": "demo_pay_123", "demo_mode": True})
        assert v.status_code == 200, v.text
        assert v.json()["status"] == "confirmed"

        g = requests.get(f"{API}/orders/{oid}", headers=buyer["headers"])
        assert g.status_code == 200
        o = g.json()
        assert o["status"] == "confirmed"
        assert o["payment_status"] == "paid"
        assert o["razorpay_payment_id"] == "demo_pay_123"
        assert all(it.get("seller_id") for it in o["items"])
        assert "confirmed" in [h["status"] for h in o["status_history"]]

    def test_cod_order_rejects_payment(self, buyer, buyer_address, products):
        order = make_order(buyer, buyer_address, products, payment_method="cod")
        r = requests.post(f"{API}/payments/create/{order['id']}", headers=buyer["headers"])
        assert r.status_code == 400, r.text
        assert "COD" in r.json()["detail"]

    def test_payment_requires_auth(self, buyer, buyer_address, products):
        order = make_order(buyer, buyer_address, products, payment_method="upi")
        r = requests.post(f"{API}/payments/create/{order['id']}")
        assert r.status_code == 401

    def test_already_paid_rejected(self, buyer, buyer_address, products):
        order = make_order(buyer, buyer_address, products, payment_method="card")
        oid = order["id"]
        pay = requests.post(f"{API}/payments/create/{oid}", headers=buyer["headers"]).json()
        requests.post(f"{API}/payments/verify", headers=buyer["headers"], json={
            "order_id": oid, "razorpay_order_id": pay["razorpay_order_id"],
            "razorpay_payment_id": "demo_pay_456", "demo_mode": True})
        r = requests.post(f"{API}/payments/create/{oid}", headers=buyer["headers"])
        assert r.status_code == 400
        assert "already paid" in r.json()["detail"].lower()


# ---------- cancel ----------
class TestCancel:
    def test_cancel_placed_order(self, buyer, buyer_address, products):
        order = make_order(buyer, buyer_address, products, payment_method="cod")
        r = requests.post(f"{API}/orders/{order['id']}/cancel", headers=buyer["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "cancelled"
        o = requests.get(f"{API}/orders/{order['id']}", headers=buyer["headers"]).json()
        assert o["status"] == "cancelled"
        assert o.get("cancelled_at")

    def test_cancel_confirmed_order(self, buyer, buyer_address, products):
        order = make_order(buyer, buyer_address, products, payment_method="upi")
        oid = order["id"]
        pay = requests.post(f"{API}/payments/create/{oid}", headers=buyer["headers"]).json()
        requests.post(f"{API}/payments/verify", headers=buyer["headers"], json={
            "order_id": oid, "razorpay_order_id": pay["razorpay_order_id"],
            "razorpay_payment_id": "demo_pay_789", "demo_mode": True})
        r = requests.post(f"{API}/orders/{oid}/cancel", headers=buyer["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "cancelled"

    def test_cancel_shipped_order_rejected(self, buyer, buyer_address, seller_headers):
        # order containing seller1 products only so seller1 can advance it
        sellers = requests.get(f"{API}/products?limit=100").json()
        r = requests.post(f"{API}/auth/login", json=SELLER1)
        me = requests.get(f"{API}/seller/me", headers=seller_headers).json()
        seller_id = me.get("id") or me.get("seller", {}).get("id")
        assert seller_id, me
        s_prods = [p for p in sellers if p["seller_id"] == seller_id]
        assert s_prods, "no products for seller1"
        order = make_order(buyer, buyer_address, s_prods, payment_method="cod", count=1)
        # forward-only flow: placed -> confirmed -> packed -> shipped
        for st in ("confirmed", "packed", "shipped"):
            up = requests.patch(f"{API}/seller/orders/{order['id']}/status?status={st}", headers=seller_headers)
            assert up.status_code == 200, up.text
        c = requests.post(f"{API}/orders/{order['id']}/cancel", headers=buyer["headers"])
        assert c.status_code == 400, c.text

    def test_cancel_other_users_order_404(self, buyer_address, products, buyer, seller_headers):
        order = make_order(buyer, buyer_address, products, payment_method="cod")
        r = requests.post(f"{API}/orders/{order['id']}/cancel", headers=seller_headers)
        assert r.status_code == 404


# ---------- seller bulk upload ----------
class TestBulkUpload:
    created = []

    @classmethod
    def teardown_class(cls):
        """Remove TEST_ products created by bulk upload so the catalogue stays clean."""
        if not cls.created:
            return
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        be = dotenv_values("/app/backend/.env")
        mongo_url = os.environ.get("MONGO_URL") or be.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME") or be.get("DB_NAME")

        async def _run():
            cl = AsyncIOMotorClient(mongo_url)
            await cl[db_name].products.delete_many({"id": {"$in": list(cls.created)}})
            cl.close()

        asyncio.run(_run())

    def test_bulk_upload_valid_and_invalid(self, seller_headers):
        payload = {"products": [
            {"name": "TEST_Bulk Tile A", "category": "tiles", "price": 999, "mrp": 1499,
             "stock": 10, "description": "test", "material": "Ceramic",
             "images": ["https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80"],
             "variants": [{"name": "Size", "value": "600x600", "price_delta": 0}]},
            {"name": "TEST_Bulk Paint B", "category": "paints", "price": 599, "stock": 5,
             "images": ["https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80"]},
            {"name": "TEST_Bad Cat", "category": "not-a-category", "price": 100,
             "images": ["https://x/y.jpg"]},
            {"name": "TEST_No Image", "category": "tiles", "price": 100, "images": []},
            {"name": "TEST_Bad Price", "category": "tiles", "price": 0, "images": ["https://x/y.jpg"]},
        ]}
        r = requests.post(f"{API}/seller/products/bulk", headers=seller_headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 2, d
        assert len(d["errors"]) == 3, d["errors"]
        errs = " ".join(e["error"] for e in d["errors"])
        assert "category" in errs and "image" in errs.lower() and "Price" in errs
        new_id = d["products"][0]["id"]
        g = requests.get(f"{API}/products/{new_id}")
        assert g.status_code == 200
        prod = g.json()
        assert prod["title"] == "TEST_Bulk Tile A"
        assert prod["price"] == 999
        assert prod["category"] == "tiles"
        # cleanup marker (teardown_class deletes these)
        TestBulkUpload.created.extend(p["id"] for p in d["products"])

    def test_bulk_upload_buyer_forbidden(self, buyer):
        r = requests.post(f"{API}/seller/products/bulk", headers=buyer["headers"],
                          json={"products": [{"name": "x", "category": "tiles", "price": 1, "images": ["a"]}]})
        assert r.status_code == 403, r.text

    def test_bulk_upload_unauth(self):
        r = requests.post(f"{API}/seller/products/bulk", json={"products": []})
        assert r.status_code == 401


# ---------- seller orders queue ----------
class TestSellerOrders:
    def test_seller_orders_scoped(self, seller_headers, buyer, buyer_address, products):
        me = requests.get(f"{API}/seller/me", headers=seller_headers).json()
        seller_id = me.get("id") or me.get("seller", {}).get("id")
        s_prods = [p for p in products if p["seller_id"] == seller_id]
        other = [p for p in products if p["seller_id"] != seller_id]
        assert s_prods and other
        order = make_order(buyer, buyer_address, [s_prods[0], other[0]], payment_method="cod", count=2)

        r = requests.get(f"{API}/seller/orders", headers=seller_headers)
        assert r.status_code == 200, r.text
        orders = r.json()
        mine = next((o for o in orders if o["id"] == order["id"]), None)
        assert mine, "mixed order missing from seller queue"
        assert all(it["seller_id"] == seller_id for it in mine["items"])
        assert len(mine["items"]) == 1
        assert mine["seller_total"] == mine["items"][0]["line_total"]
        for o in orders:
            assert "_id" not in o

    def test_seller_advance_status(self, seller_headers, buyer, buyer_address, products):
        me = requests.get(f"{API}/seller/me", headers=seller_headers).json()
        seller_id = me.get("id") or me.get("seller", {}).get("id")
        s_prods = [p for p in products if p["seller_id"] == seller_id]
        order = make_order(buyer, buyer_address, s_prods, payment_method="cod", count=1)
        for st in ("confirmed", "packed", "shipped", "delivered"):
            r = requests.patch(f"{API}/seller/orders/{order['id']}/status?status={st}", headers=seller_headers)
            assert r.status_code == 200, r.text
            assert r.json()["status"] == st
            o = requests.get(f"{API}/orders/{order['id']}", headers=buyer["headers"]).json()
            assert o["status"] == st

    def test_seller_invalid_status_rejected(self, seller_headers, buyer, buyer_address, products):
        order = make_order(buyer, buyer_address, products, payment_method="cod", count=1)
        for st in ("cancelled", "placed", "bogus", "out_for_delivery"):
            r = requests.patch(f"{API}/seller/orders/{order['id']}/status?status={st}", headers=seller_headers)
            assert r.status_code == 400, f"{st} -> {r.status_code}"

    def test_seller_orders_buyer_forbidden(self, buyer):
        r = requests.get(f"{API}/seller/orders", headers=buyer["headers"])
        assert r.status_code == 403

    def test_seller_cannot_update_foreign_order(self, seller_headers, buyer, buyer_address, products):
        me = requests.get(f"{API}/seller/me", headers=seller_headers).json()
        seller_id = me.get("id") or me.get("seller", {}).get("id")
        other = [p for p in products if p["seller_id"] != seller_id]
        order = make_order(buyer, buyer_address, other, payment_method="cod", count=1)
        r = requests.patch(f"{API}/seller/orders/{order['id']}/status?status=shipped", headers=seller_headers)
        assert r.status_code == 404, r.text
