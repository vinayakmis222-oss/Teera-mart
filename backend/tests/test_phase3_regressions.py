"""Phase-3 regression re-test (iteration 4).

Covers:
- GET /api/coupons must expose exactly the 3 active non-expired coupons (EXPIRED10 hidden
  but still rejected with 400 'expired' by /api/coupons/apply)
- POST /api/auth/login brute-force lockout (5 failures -> 6th returns 423) + counter reset
  after a successful login
- POST /api/seller/products/bulk must denormalise seller_verified (unverified seller -> false)
- Sanity: buyer checkout with WELCOME10 + demo Razorpay -> confirmed/paid
"""
import os
import uuid
import asyncio

import pytest
import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing from env and /app/frontend/.env")
API = base_url.rstrip("/") + "/api"

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")

SELLER_VERIFIED = {"email": "seller1@terramart.com", "password": "Seller@123"}
SELLER_UNVERIFIED = {"email": "seller3@terramart.com", "password": "Seller@123"}

ACTIVE_COUPONS = {"WELCOME10", "TERRA200", "FIRSTBUY"}


# ---------- db helpers (cleanup only, never used for assertions on API behaviour) ----------
def _db_op(coro_fn):
    async def _run():
        cl = AsyncIOMotorClient(MONGO_URL)
        try:
            return await coro_fn(cl[DB_NAME])
        finally:
            cl.close()
    return asyncio.run(_run())


def clear_lockout(email: str):
    _db_op(lambda db: db.login_attempts.delete_many({"email": email.lower()}))


def delete_products(ids):
    if not ids:
        return
    _db_op(lambda db: db.products.delete_many({"id": {"$in": list(ids)}}))


def login(creds):
    r = requests.post(f"{API}/auth/login", json=creds)
    if r.status_code != 200:
        pytest.fail(f"login failed for {creds['email']}: {r.status_code} {r.text[:300]}")
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    return tok


@pytest.fixture(scope="module")
def buyer():
    email = f"TEST_reg_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Buyer@123", "name": "TEST Reg Buyer", "role": "buyer"})
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("token") or r.json().get("access_token")
    return {"email": email, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def buyer_address(buyer):
    r = requests.post(f"{API}/addresses", headers=buyer["headers"], json={
        "name": "TEST Reg Buyer", "phone": "9876543211", "pincode": "560001",
        "line1": "2 Test Street", "city": "Bengaluru", "state": "Karnataka", "type": "home"})
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return body if "id" in body else requests.get(f"{API}/addresses", headers=buyer["headers"]).json()[0]


# ---------- REGRESSION 1: coupon listing vs expiry ----------
class TestCouponListingRegression:
    def test_list_returns_only_three_active_coupons(self):
        r = requests.get(f"{API}/coupons")
        assert r.status_code == 200, r.text
        coupons = r.json()
        codes = {c["code"] for c in coupons}
        assert codes == ACTIVE_COUPONS, f"unexpected coupon set: {sorted(codes)}"
        assert len(coupons) == 3, coupons
        for c in coupons:
            assert "_id" not in c
            assert c["is_active"] is True
            assert c.get("expires_at")

    def test_expired_coupon_hidden_but_still_rejected(self):
        listed = {c["code"] for c in requests.get(f"{API}/coupons").json()}
        assert "EXPIRED10" not in listed
        r = requests.post(f"{API}/coupons/apply", json={"code": "EXPIRED10", "subtotal": 2000})
        assert r.status_code == 400, r.text
        assert "expired" in r.json()["detail"].lower(), r.text


# ---------- REGRESSION 2: brute-force lockout ----------
class TestLoginLockoutRegression:
    def test_lockout_on_sixth_attempt(self):
        email = f"TEST_lock_{uuid.uuid4().hex[:8]}@example.com"
        password = "Buyer@123"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": password, "name": "TEST Lock", "role": "buyer"})
        assert reg.status_code in (200, 201), reg.text
        try:
            codes = []
            for _ in range(5):
                codes.append(requests.post(f"{API}/auth/login",
                                           json={"email": email, "password": "wrong-pass"}).status_code)
            assert codes == [401] * 5, codes

            sixth = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-pass"})
            assert sixth.status_code == 423, f"expected 423, got {sixth.status_code}: {sixth.text[:200]}"
            assert "lock" in sixth.json()["detail"].lower()

            # even the CORRECT password is refused while locked
            good = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
            assert good.status_code == 423, good.status_code
        finally:
            clear_lockout(email)

    def test_successful_login_resets_counter(self):
        email = f"TEST_reset_{uuid.uuid4().hex[:8]}@example.com"
        password = "Buyer@123"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": password, "name": "TEST Reset", "role": "buyer"})
        assert reg.status_code in (200, 201), reg.text
        try:
            for _ in range(4):
                assert requests.post(f"{API}/auth/login",
                                     json={"email": email, "password": "wrong-pass"}).status_code == 401
            assert requests.post(f"{API}/auth/login",
                                 json={"email": email, "password": password}).status_code == 200
            # counter was reset: next 5 wrong attempts are still 401 (not 423)
            codes = [requests.post(f"{API}/auth/login",
                                   json={"email": email, "password": "wrong-pass"}).status_code
                     for _ in range(5)]
            assert codes == [401] * 5, codes
            assert requests.post(f"{API}/auth/login",
                                 json={"email": email, "password": "wrong-pass"}).status_code == 423
        finally:
            clear_lockout(email)

    def test_lockout_does_not_affect_other_accounts(self):
        email = f"TEST_iso_{uuid.uuid4().hex[:8]}@example.com"
        requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Buyer@123", "name": "TEST Iso", "role": "buyer"})
        try:
            for _ in range(6):
                requests.post(f"{API}/auth/login", json={"email": email, "password": "nope"})
            assert requests.post(f"{API}/auth/login", json=SELLER_VERIFIED).status_code == 200
        finally:
            clear_lockout(email)


# ---------- REGRESSION 3: bulk upload denormalises seller_verified ----------
class TestBulkUploadSellerVerifiedRegression:
    created = []

    @classmethod
    def teardown_class(cls):
        delete_products(cls.created)

    def test_unverified_seller_bulk_product_has_seller_verified_false(self):
        tok = login(SELLER_UNVERIFIED)
        headers = {"Authorization": f"Bearer {tok}"}
        me = requests.get(f"{API}/seller/me", headers=headers)
        assert me.status_code == 200, me.text
        seller = me.json()
        seller_id = seller.get("id") or seller.get("seller", {}).get("id")
        assert seller_id, seller
        assert seller.get("verified") is False, f"seller3 expected unverified: {seller}"

        payload = {"products": [{
            "name": "TEST_Reg Unverified Tile", "category": "tiles", "price": 1234, "mrp": 1999,
            "stock": 7, "description": "regression product", "material": "Ceramic",
            "images": ["https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80"],
        }]}
        r = requests.post(f"{API}/seller/products/bulk", headers=headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 1, d
        assert not d["errors"], d["errors"]
        new_id = d["products"][0]["id"]
        TestBulkUploadSellerVerifiedRegression.created.append(new_id)

        listing = requests.get(f"{API}/products?seller_id={seller_id}&limit=100")
        assert listing.status_code == 200, listing.text
        prod = next((p for p in listing.json() if p["id"] == new_id), None)
        assert prod, "bulk product missing from /api/products?seller_id="
        assert "seller_verified" in prod, prod
        assert prod["seller_verified"] is False, prod["seller_verified"]

        detail = requests.get(f"{API}/products/{new_id}")
        assert detail.status_code == 200
        assert detail.json()["seller_verified"] is False

    def test_verified_seller_bulk_product_has_seller_verified_true(self):
        tok = login(SELLER_VERIFIED)
        headers = {"Authorization": f"Bearer {tok}"}
        seller_id = requests.get(f"{API}/seller/me", headers=headers).json()["id"]
        payload = {"products": [{
            "name": "TEST_Reg Verified Tile", "category": "tiles", "price": 555, "stock": 3,
            "images": ["https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80"],
        }]}
        r = requests.post(f"{API}/seller/products/bulk", headers=headers, json=payload)
        assert r.status_code == 200, r.text
        new_id = r.json()["products"][0]["id"]
        TestBulkUploadSellerVerifiedRegression.created.append(new_id)
        prod = requests.get(f"{API}/products/{new_id}").json()
        assert prod["seller_verified"] is True, prod
        assert prod["seller_id"] == seller_id


# ---------- SANITY: checkout with coupon + demo payment ----------
class TestCheckoutSanity:
    def test_welcome10_checkout_demo_payment_confirms_order(self, buyer, buyer_address):
        prods = requests.get(f"{API}/products?limit=20").json()
        items = [{"product_id": p["id"], "qty": 1} for p in prods[:2]]
        r = requests.post(f"{API}/orders", headers=buyer["headers"], json={
            "items": items, "address_id": buyer_address["id"],
            "payment_method": "upi", "coupon_code": "WELCOME10"})
        assert r.status_code in (200, 201), r.text
        order = r.json()
        assert order["status"] == "placed"
        assert order["discount"] > 0, order
        assert order["coupon_code"] == "WELCOME10"
        assert round(order["total"], 2) == round(
            order["subtotal"] - order["discount"] + order.get("shipping", 0), 2), order

        pay = requests.post(f"{API}/payments/create/{order['id']}", headers=buyer["headers"])
        assert pay.status_code == 200, pay.text
        pd = pay.json()
        assert pd["demo_mode"] is True
        v = requests.post(f"{API}/payments/verify", headers=buyer["headers"], json={
            "order_id": order["id"], "razorpay_order_id": pd["razorpay_order_id"],
            "razorpay_payment_id": "demo_pay_reg", "demo_mode": True})
        assert v.status_code == 200, v.text

        o = requests.get(f"{API}/orders/{order['id']}", headers=buyer["headers"]).json()
        assert o["status"] == "confirmed"
        assert o["payment_status"] == "paid"

    def test_cod_order_stays_unpaid_and_cancellable(self, buyer, buyer_address):
        prods = requests.get(f"{API}/products?limit=5").json()
        r = requests.post(f"{API}/orders", headers=buyer["headers"], json={
            "items": [{"product_id": prods[0]["id"], "qty": 1}],
            "address_id": buyer_address["id"], "payment_method": "cod"})
        assert r.status_code in (200, 201), r.text
        o = r.json()
        assert o["payment_method"] == "cod"
        # NOTE: create_order never sets payment_status (field is absent until /payments/verify).
        # Frontend relies on falsy check, so treat missing as unpaid but flag the data-model gap.
        assert o.get("payment_status") != "paid", o.get("payment_status")
        c = requests.post(f"{API}/orders/{o['id']}/cancel", headers=buyer["headers"])
        assert c.status_code == 200, c.text
        assert c.json()["status"] == "cancelled"
