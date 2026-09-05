"""Phase 7 backend tests — seller single-product CRUD, live dashboard counters,
forward-only seller order status flow (placed->confirmed->packed->shipped->delivered)."""
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
SELLER1 = {"email": "seller1@terramart.com", "password": "Seller@123"}
IMG = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c"
PIN = "226013"
T = 30


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _login(email, password):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=T)


@pytest.fixture(scope="module")
def seller_token():
    r = _login(**SELLER1)
    if r.status_code != 200:
        pytest.fail(f"seller1 login failed: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = _login(**ADMIN)
    if r.status_code != 200:
        pytest.fail(f"admin login failed: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def seller_id(seller_token):
    r = requests.get(f"{API}/seller/me", headers=_hdr(seller_token), timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def buyer_token():
    email = f"TEST_p7_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Buyer@123", "name": "TEST P7 Buyer", "role": "buyer"}, timeout=T)
    assert r.status_code in (200, 201), r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def buyer_address(buyer_token):
    r = requests.post(f"{API}/addresses", headers=_hdr(buyer_token), json={
        "name": "TEST P7", "phone": "9876543210", "pincode": PIN,
        "line1": "1 Test Road", "city": "Lucknow", "state": "UP", "is_default": True}, timeout=T)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def created_ids():
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(seller_token, created_ids):
    yield
    for pid in created_ids:
        requests.delete(f"{API}/seller/products/{pid}", headers=_hdr(seller_token), timeout=T)


def _payload(**over):
    p = {"title": f"TEST_QA Tile {uuid.uuid4().hex[:6]}", "category": "tiles", "price": 499.0,
         "stock": 10, "images": [IMG], "description": "TEST desc", "material": "Ceramic",
         "variants": [{"name": "Size", "value": "600x600mm", "price_delta": 0}]}
    p.update(over)
    return p


# ---------------- seller product CRUD ----------------
class TestSellerProductCRUD:
    def test_list_own_products(self, seller_token, seller_id):
        r = requests.get(f"{API}/seller/products", headers=_hdr(seller_token), timeout=T)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and items, "seller1 should have seeded listings"
        for p in items:
            assert p["seller_id"] == seller_id
            assert "_id" not in p

    def test_create_and_persist(self, seller_token, seller_id, created_ids):
        body = _payload()
        r = requests.post(f"{API}/seller/products", headers=_hdr(seller_token), json=body, timeout=T)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        created_ids.append(d["id"])
        assert isinstance(d["id"], str) and "_id" not in d
        assert d["title"] == body["title"]
        assert d["category"] == "tiles"
        assert d["price"] == 499.0
        assert d["stock"] == 10
        assert d["images"] == [IMG]
        assert d["seller_id"] == seller_id
        assert d["mrp"] > d["price"] and d["discount"] > 0
        assert d["variants"][0]["value"] == "600x600mm"
        # verify via GET list
        lst = requests.get(f"{API}/seller/products", headers=_hdr(seller_token), timeout=T).json()
        got = next((p for p in lst if p["id"] == d["id"]), None)
        assert got, "created product not in seller listings"
        assert got["title"] == body["title"]
        # public product endpoint sees it too
        pub = requests.get(f"{API}/products/{d['id']}", timeout=T)
        assert pub.status_code == 200, pub.text
        assert pub.json()["title"] == body["title"]

    def test_create_missing_images_400(self, seller_token):
        r = requests.post(f"{API}/seller/products", headers=_hdr(seller_token),
                          json=_payload(images=[]), timeout=T)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"
        r2 = requests.post(f"{API}/seller/products", headers=_hdr(seller_token),
                           json=_payload(images=["   "]), timeout=T)
        assert r2.status_code == 400, f"{r2.status_code} {r2.text[:200]}"

    def test_create_unknown_category_400(self, seller_token):
        r = requests.post(f"{API}/seller/products", headers=_hdr(seller_token),
                          json=_payload(category="rockets"), timeout=T)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_create_invalid_price_422(self, seller_token):
        r = requests.post(f"{API}/seller/products", headers=_hdr(seller_token),
                          json=_payload(price=0), timeout=T)
        assert r.status_code == 422, f"{r.status_code} {r.text[:200]}"

    def test_patch_updates_and_persists(self, seller_token, created_ids):
        create = requests.post(f"{API}/seller/products", headers=_hdr(seller_token),
                               json=_payload(), timeout=T).json()
        pid = create["id"]
        created_ids.append(pid)
        upd = _payload(title="TEST_QA Renamed", price=899.0, stock=3)
        r = requests.patch(f"{API}/seller/products/{pid}", headers=_hdr(seller_token), json=upd, timeout=T)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "_id" not in d
        assert d["title"] == "TEST_QA Renamed"
        assert d["price"] == 899.0
        assert d["stock"] == 3
        # GET verification
        lst = requests.get(f"{API}/seller/products", headers=_hdr(seller_token), timeout=T).json()
        got = next(p for p in lst if p["id"] == pid)
        assert got["price"] == 899.0 and got["stock"] == 3 and got["title"] == "TEST_QA Renamed"

    def test_patch_other_seller_product_404(self, seller_token):
        # a product not owned by seller1
        allp = requests.get(f"{API}/products", params={"limit": 100}, timeout=T).json()
        items = allp.get("items") if isinstance(allp, dict) else allp
        mine = {p["id"] for p in requests.get(f"{API}/seller/products", headers=_hdr(seller_token), timeout=T).json()}
        other = next((p for p in items if p["id"] not in mine), None)
        assert other, "no foreign product found to test ownership"
        r = requests.patch(f"{API}/seller/products/{other['id']}", headers=_hdr(seller_token),
                           json=_payload(), timeout=T)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"
        rd = requests.delete(f"{API}/seller/products/{other['id']}", headers=_hdr(seller_token), timeout=T)
        assert rd.status_code == 404, f"{rd.status_code} {rd.text[:200]}"

    def test_delete_and_verify_removal(self, seller_token):
        create = requests.post(f"{API}/seller/products", headers=_hdr(seller_token),
                               json=_payload(), timeout=T).json()
        pid = create["id"]
        r = requests.delete(f"{API}/seller/products/{pid}", headers=_hdr(seller_token), timeout=T)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        lst = requests.get(f"{API}/seller/products", headers=_hdr(seller_token), timeout=T).json()
        assert not any(p["id"] == pid for p in lst)
        assert requests.get(f"{API}/products/{pid}", timeout=T).status_code == 404
        assert requests.delete(f"{API}/seller/products/{pid}", headers=_hdr(seller_token), timeout=T).status_code == 404

    def test_rbac(self, buyer_token, admin_token):
        for tok in (buyer_token, admin_token):
            assert requests.get(f"{API}/seller/products", headers=_hdr(tok), timeout=T).status_code == 403
            assert requests.post(f"{API}/seller/products", headers=_hdr(tok),
                                 json=_payload(), timeout=T).status_code == 403
        assert requests.get(f"{API}/seller/products", timeout=T).status_code == 401


# ---------------- live dashboard counters ----------------
class TestDashboardStats:
    def test_stats_shape_and_real_values(self, seller_token, seller_id):
        r = requests.get(f"{API}/seller/dashboard", headers=_hdr(seller_token), timeout=T)
        assert r.status_code == 200, r.text
        s = r.json()["stats"]
        for k in ("products", "orders", "delivered_orders", "revenue", "rating",
                  "pending_dues", "subscription_status", "subscription_days_left"):
            assert k in s, f"missing stat {k}"
        prods = requests.get(f"{API}/seller/products", headers=_hdr(seller_token), timeout=T).json()
        assert s["products"] == len(prods)
        orders = requests.get(f"{API}/seller/orders", headers=_hdr(seller_token), timeout=T).json()
        # /seller/orders is hard-capped at 200 docs (no pagination), stats.orders counts all
        capped = len(orders) >= 200
        assert s["orders"] == len(orders) or capped, (s["orders"], len(orders))
        delivered = [o for o in orders if o["status"] == "delivered"]
        if not capped:
            assert s["delivered_orders"] == len(delivered)
            expected_rev = round(sum(o["seller_total"] for o in delivered), 2)
            assert abs(s["revenue"] - expected_rev) < 1.0, (s["revenue"], expected_rev)
        else:
            assert s["delivered_orders"] >= len(delivered)

    def test_adding_product_bumps_count(self, seller_token, created_ids):
        before = requests.get(f"{API}/seller/dashboard", headers=_hdr(seller_token),
                              timeout=T).json()["stats"]["products"]
        d = requests.post(f"{API}/seller/products", headers=_hdr(seller_token),
                          json=_payload(), timeout=T).json()
        created_ids.append(d["id"])
        after = requests.get(f"{API}/seller/dashboard", headers=_hdr(seller_token),
                             timeout=T).json()["stats"]["products"]
        assert after == before + 1, (before, after)


# ---------------- forward-only status flow ----------------
class TestForwardOnlyStatus:
    def _order(self, buyer_token, buyer_address, seller_token):
        prods = requests.get(f"{API}/seller/products", headers=_hdr(seller_token), timeout=T).json()
        product = next(p for p in prods if p.get("stock", 0) > 0)
        r = requests.post(f"{API}/orders", headers=_hdr(buyer_token), json={
            "items": [{"product_id": product["id"], "qty": 1}],
            "address_id": buyer_address, "payment_method": "cod"}, timeout=T)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def _set(self, seller_token, oid, status, location_link=None):
        body = {"status": status}
        if location_link is not None:
            body["location_link"] = location_link
        return requests.patch(f"{API}/seller/orders/{oid}/status", headers=_hdr(seller_token),
                              json=body, timeout=T)

    def test_full_forward_flow_and_violations(self, seller_token, buyer_token, buyer_address):
        o = self._order(buyer_token, buyer_address, seller_token)
        oid = o["id"]
        assert o["status"] == "placed"
        # skipping a step must fail
        r = self._set(seller_token, oid, "packed")
        assert r.status_code == 400, f"skip allowed! {r.status_code} {r.text[:200]}"
        # invalid status
        assert self._set(seller_token, oid, "placed").status_code == 400
        assert self._set(seller_token, oid, "out_for_delivery").status_code == 400
        # correct advance
        assert self._set(seller_token, oid, "confirmed").status_code == 200
        # backward must fail
        rb = self._set(seller_token, oid, "placed")
        assert rb.status_code == 400, f"backward allowed! {rb.text[:200]}"
        assert self._set(seller_token, oid, "packed").status_code == 200
        # shipped with location link stored
        link = "https://maps.google.com/?q=26.8,80.9"
        rs = self._set(seller_token, oid, "shipped", link)
        assert rs.status_code == 200, rs.text
        assert rs.json()["location_link"] == link
        row = next(x for x in requests.get(f"{API}/seller/orders", headers=_hdr(seller_token),
                                           timeout=T).json() if x["id"] == oid)
        assert row["status"] == "shipped"
        assert row.get("location_link") == link
        # delivered books commission once (idempotent)
        assert self._set(seller_token, oid, "delivered").status_code == 200
        dues = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()
        rows = [d for d in dues["pending"] if d["order_id"] == oid]
        assert len(rows) == 1, f"expected 1 dues row, got {len(rows)}"
        r2 = self._set(seller_token, oid, "delivered")
        assert r2.status_code == 400, "re-delivering should be rejected by forward-only rule"
        dues2 = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()
        assert len([d for d in dues2["pending"] if d["order_id"] == oid]) == 1

    def test_shipped_without_link_ok(self, seller_token, buyer_token, buyer_address):
        o = self._order(buyer_token, buyer_address, seller_token)
        oid = o["id"]
        for st in ("confirmed", "packed"):
            assert self._set(seller_token, oid, st).status_code == 200
        r = self._set(seller_token, oid, "shipped", None)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "shipped"
        assert r.json().get("location_link") in (None, "")

    def test_status_rbac(self, buyer_token, admin_token, seller_token, buyer_address):
        o = self._order(buyer_token, buyer_address, seller_token)
        for tok in (buyer_token, admin_token):
            r = requests.patch(f"{API}/seller/orders/{o['id']}/status", headers=_hdr(tok),
                               json={"status": "confirmed"}, timeout=T)
            assert r.status_code == 403, f"{r.status_code} {r.text[:150]}"
