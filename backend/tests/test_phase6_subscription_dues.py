"""Phase 6 backend tests — seller subscription, commission dues, admin settings/dues,
pause enforcement (status updates, bulk upload, buyer product hiding)."""
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
PIN = "226013"
T = 30


def _login(email, password):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=T)


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    r = _login(**ADMIN)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def seller_token():
    r = _login(**SELLER1)
    if r.status_code != 200:
        pytest.fail(f"Seller1 login failed: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def seller_id(seller_token):
    r = requests.get(f"{API}/seller/me", headers=_hdr(seller_token), timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def buyer_token():
    email = f"TEST_p6_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Buyer@123", "name": "TEST P6 Buyer", "role": "buyer"}, timeout=T)
    assert r.status_code in (200, 201), r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def buyer_address(buyer_token):
    r = requests.post(f"{API}/addresses", headers=_hdr(buyer_token), json={
        "name": "TEST P6", "phone": "9876543210", "pincode": PIN,
        "line1": "1 Test Road", "city": "Lucknow", "state": "UP", "is_default": True}, timeout=T)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _seller1_product(seller_id):
    r = requests.get(f"{API}/products", params={"seller_id": seller_id, "limit": 5}, timeout=T)
    assert r.status_code == 200, r.text
    items = r.json()
    items = items.get("items") if isinstance(items, dict) else items
    assert items, "seller1 has no products"
    return items[0]


def _place_order(buyer_token, address_id, product, qty=1):
    r = requests.post(f"{API}/orders", headers=_hdr(buyer_token), json={
        "items": [{"product_id": product["id"], "qty": qty}],
        "address_id": address_id, "payment_method": "cod"}, timeout=T)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _set_status(seller_token, order_id, status):
    return requests.patch(f"{API}/seller/orders/{order_id}/status",
                          headers=_hdr(seller_token), json={"status": status}, timeout=T)


FLOW = ["placed", "confirmed", "packed", "shipped", "delivered"]


def _advance_to(seller_token, order_id, target, start="placed"):
    """Walk the forward-only seller flow up to `target`; returns last response."""
    r = None
    for st in FLOW[FLOW.index(start) + 1:FLOW.index(target) + 1]:
        r = _set_status(seller_token, order_id, st)
        if r.status_code != 200:
            return r
    return r


# ---------------- admin settings ----------------
class TestAdminSettings:
    def test_get_settings_defaults(self, admin_token):
        r = requests.get(f"{API}/admin/settings", headers=_hdr(admin_token), timeout=T)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("subscription_price", "subscription_period_days", "default_commission_rate",
                  "dues_threshold", "dues_grace_days"):
            assert k in d, f"missing {k}"
        assert "_id" not in d
        assert d["subscription_period_days"] == 30
        assert d["default_commission_rate"] == 10

    def test_patch_subset_and_persist(self, admin_token):
        orig = requests.get(f"{API}/admin/settings", headers=_hdr(admin_token), timeout=T).json()
        r = requests.patch(f"{API}/admin/settings", headers=_hdr(admin_token),
                           json={"dues_threshold": 4321.0}, timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["dues_threshold"] == 4321.0
        # unchanged keys intact
        assert r.json()["subscription_period_days"] == orig["subscription_period_days"]
        again = requests.get(f"{API}/admin/settings", headers=_hdr(admin_token), timeout=T).json()
        assert again["dues_threshold"] == 4321.0
        # restore
        requests.patch(f"{API}/admin/settings", headers=_hdr(admin_token),
                       json={"dues_threshold": orig["dues_threshold"]}, timeout=T)

    def test_rbac(self, seller_token, buyer_token):
        for tok in (seller_token, buyer_token):
            assert requests.get(f"{API}/admin/settings", headers=_hdr(tok), timeout=T).status_code == 403
            assert requests.patch(f"{API}/admin/settings", headers=_hdr(tok),
                                  json={"dues_threshold": 1}, timeout=T).status_code == 403
        assert requests.get(f"{API}/admin/settings", timeout=T).status_code == 401
        assert requests.get(f"{API}/admin/dues", timeout=T).status_code == 401


# ---------------- subscription ----------------
class TestSubscription:
    def test_get_subscription_active(self, seller_token):
        r = requests.get(f"{API}/seller/subscription", headers=_hdr(seller_token), timeout=T)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["subscription_status"] == "active", d
        assert d["subscription_days_left"] >= 0
        assert d["period_days"] == 30
        assert isinstance(d["price"], (int, float))

    def test_create_and_verify_extends(self, seller_token):
        before = requests.get(f"{API}/seller/subscription", headers=_hdr(seller_token), timeout=T).json()
        settings_price = before["price"]
        c = requests.post(f"{API}/seller/subscription/create", headers=_hdr(seller_token), timeout=T)
        assert c.status_code == 200, c.text
        cd = c.json()
        assert cd["demo_mode"] is True
        assert cd["razorpay_order_id"].startswith("demo_sub_"), cd
        assert cd["amount"] == int(round(settings_price * 100))
        v = requests.post(f"{API}/seller/subscription/verify", headers=_hdr(seller_token), json={
            "razorpay_order_id": cd["razorpay_order_id"],
            "razorpay_payment_id": f"demo_pay_{uuid.uuid4().hex[:8]}",
            "demo_mode": True}, timeout=T)
        assert v.status_code == 200, v.text
        assert v.json()["ok"] is True
        after = requests.get(f"{API}/seller/subscription", headers=_hdr(seller_token), timeout=T).json()
        assert after["subscription_days_left"] >= before["subscription_days_left"] + 29, (before, after)
        assert after["subscription_expires_at"] > before["subscription_expires_at"]

    def test_buyer_cannot_access_seller_subscription(self, buyer_token):
        r = requests.get(f"{API}/seller/subscription", headers=_hdr(buyer_token), timeout=T)
        assert r.status_code == 403, r.status_code


# ---------------- commission auto-book + dues pay ----------------
class TestCommissionAndDues:
    def test_delivered_books_commission_once(self, seller_token, seller_id, buyer_token, buyer_address, admin_token):
        product = _seller1_product(seller_id)
        order = _place_order(buyer_token, buyer_address, product)
        oid = order["id"]

        # seller sees it
        so = requests.get(f"{API}/seller/orders", headers=_hdr(seller_token), timeout=T)
        assert so.status_code == 200, so.text
        row = next((o for o in so.json() if o["id"] == oid), None)
        assert row, "new order not visible to seller"
        seller_total = row["seller_total"]

        r = _advance_to(seller_token, oid, "delivered")
        assert r.status_code == 200, f"advance to delivered: {r.status_code} {r.text[:200]}"

        dues = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T)
        assert dues.status_code == 200, dues.text
        dd = dues.json()
        entry = next((d for d in dd["pending"] if d["order_id"] == oid), None)
        assert entry, f"no commission_dues row booked for order {oid}"
        rate = entry["commission_rate"]
        assert entry["commission_amount"] == pytest.approx(round(seller_total * rate / 100.0, 2), abs=0.02)
        assert entry["status"] == "pending"
        assert entry["order_value"] == pytest.approx(seller_total, abs=0.02)

        # idempotency — re-delivering is rejected by forward-only rule, no double-book
        r2 = _set_status(seller_token, oid, "delivered")
        assert r2.status_code == 400, r2.text
        dd2 = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()
        matches = [d for d in dd2["pending"] if d["order_id"] == oid]
        assert len(matches) == 1, f"double-booked: {len(matches)} rows"
        assert dd2["seller"]["pending_dues"] == dd["seller"]["pending_dues"]

    def test_partial_then_full_pay(self, seller_token, seller_id, buyer_token, buyer_address):
        # ensure at least 2 pending dues
        dd = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()
        product = _seller1_product(seller_id)
        while len(dd["pending"]) < 2:
            order = _place_order(buyer_token, buyer_address, product, qty=2)
            assert _advance_to(seller_token, order["id"], "delivered").status_code == 200
            dd = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()

        total_before = dd["seller"]["pending_dues"]
        smallest = min(d["commission_amount"] for d in dd["pending"])

        # partial pay of the smallest due
        c = requests.post(f"{API}/seller/dues/pay/create", headers=_hdr(seller_token),
                          json={"amount": smallest}, timeout=T)
        assert c.status_code == 200, c.text
        cd = c.json()
        assert cd["demo_mode"] is True
        assert cd["razorpay_order_id"].startswith("demo_dues_"), cd
        assert cd["amount_rupees"] == pytest.approx(smallest, abs=0.01)
        v = requests.post(f"{API}/seller/dues/pay/verify", headers=_hdr(seller_token), json={
            "razorpay_order_id": cd["razorpay_order_id"],
            "razorpay_payment_id": f"demo_pay_{uuid.uuid4().hex[:8]}",
            "demo_mode": True, "amount": cd["amount_rupees"]}, timeout=T)
        assert v.status_code == 200, v.text
        vd = v.json()
        assert vd["cleared_count"] >= 1
        assert vd["remaining_dues"] > 0, "partial pay cleared everything"
        assert vd["remaining_dues"] < total_before

        mid = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()
        assert mid["seller"]["pending_dues"] == pytest.approx(vd["remaining_dues"], abs=0.02)
        assert len(mid["cleared"]) >= 1

        # full pay of remainder
        c2 = requests.post(f"{API}/seller/dues/pay/create", headers=_hdr(seller_token), json={}, timeout=T)
        assert c2.status_code == 200, c2.text
        cd2 = c2.json()
        assert cd2["amount_rupees"] == pytest.approx(mid["seller"]["pending_dues"], abs=0.02)
        v2 = requests.post(f"{API}/seller/dues/pay/verify", headers=_hdr(seller_token), json={
            "razorpay_order_id": cd2["razorpay_order_id"],
            "razorpay_payment_id": f"demo_pay_{uuid.uuid4().hex[:8]}",
            "demo_mode": True, "amount": cd2["amount_rupees"]}, timeout=T)
        assert v2.status_code == 200, v2.text
        assert v2.json()["remaining_dues"] == pytest.approx(0, abs=0.02), v2.json()

        after = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()
        assert after["pending"] == []
        assert after["seller"]["pending_dues"] == 0

    def test_pay_create_with_no_dues_400(self, seller_token):
        # depends on previous test having cleared everything
        r = requests.post(f"{API}/seller/dues/pay/create", headers=_hdr(seller_token), json={}, timeout=T)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"


# ---------------- admin dues / pause / commission ----------------
class TestAdminDues:
    def test_admin_dues_shape_and_sort(self, admin_token):
        r = requests.get(f"{API}/admin/dues", headers=_hdr(admin_token), timeout=T)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "threshold" in d and isinstance(d["sellers"], list) and d["sellers"]
        pend = [s["pending_dues"] for s in d["sellers"]]
        assert pend == sorted(pend, reverse=True), pend
        for s in d["sellers"]:
            for k in ("business_name", "pending_dues", "over_threshold", "effective_paused",
                      "subscription_status", "commission_rate"):
                assert k in s, f"missing {k}"
            assert "_id" not in s

    def test_mark_paid_clears_all(self, admin_token, seller_token, seller_id, buyer_token, buyer_address):
        product = _seller1_product(seller_id)
        order = _place_order(buyer_token, buyer_address, product)
        assert _advance_to(seller_token, order["id"], "delivered").status_code == 200
        before = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()
        assert before["seller"]["pending_dues"] > 0

        r = requests.post(f"{API}/admin/dues/{seller_id}/mark-paid", headers=_hdr(admin_token),
                          json={"amount": None}, timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["remaining_dues"] == pytest.approx(0, abs=0.02)

        rows = requests.get(f"{API}/admin/dues", headers=_hdr(admin_token), timeout=T).json()["sellers"]
        row = next(s for s in rows if s["id"] == seller_id)
        assert row["pending_dues"] == 0
        cleared = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()["cleared"]
        assert any(c["order_id"] == order["id"] and c["cleared_note"] == "offline" for c in cleared)

    def test_mark_paid_unknown_seller_404(self, admin_token):
        r = requests.post(f"{API}/admin/dues/{uuid.uuid4()}/mark-paid", headers=_hdr(admin_token),
                          json={"amount": None}, timeout=T)
        assert r.status_code == 404, r.status_code

    def test_commission_rate_update(self, admin_token, seller_id):
        r = requests.patch(f"{API}/admin/sellers/{seller_id}/commission", headers=_hdr(admin_token),
                           json={"commission_rate": 15}, timeout=T)
        assert r.status_code == 200, r.text
        rows = requests.get(f"{API}/admin/dues", headers=_hdr(admin_token), timeout=T).json()["sellers"]
        assert next(s for s in rows if s["id"] == seller_id)["commission_rate"] == 15
        # invalid rate rejected
        bad = requests.patch(f"{API}/admin/sellers/{seller_id}/commission", headers=_hdr(admin_token),
                             json={"commission_rate": 150}, timeout=T)
        assert bad.status_code == 422, bad.status_code
        # restore
        requests.patch(f"{API}/admin/sellers/{seller_id}/commission", headers=_hdr(admin_token),
                       json={"commission_rate": 10}, timeout=T)

    def test_pause_blocks_status_bulk_and_hides_products(self, admin_token, seller_token, seller_id, buyer_token, buyer_address):
        product = _seller1_product(seller_id)
        order = _place_order(buyer_token, buyer_address, product)
        try:
            p = requests.patch(f"{API}/admin/sellers/{seller_id}/pause", headers=_hdr(admin_token),
                               json={"paused": True}, timeout=T)
            assert p.status_code == 200 and p.json()["paused_by_admin"] is True, p.text

            # status update blocked
            s = _set_status(seller_token, order["id"], "shipped")
            assert s.status_code == 403, f"{s.status_code} {s.text[:200]}"

            # bulk upload blocked
            b = requests.post(f"{API}/seller/products/bulk", headers=_hdr(seller_token), json={"products": [{
                "name": f"TEST_P6 Paused {uuid.uuid4().hex[:6]}", "category": "tiles", "price": 500,
                "stock": 5, "images": ["https://example.com/a.jpg"], "description": "x"}]}, timeout=T)
            assert b.status_code == 403, f"{b.status_code} {b.text[:200]}"

            # buyer listing hides seller1 products
            lst = requests.get(f"{API}/products", params={"limit": 60}, timeout=T).json()
            lst = lst.get("items") if isinstance(lst, dict) else lst
            assert all(i["seller_id"] != seller_id for i in lst), "paused seller products still listed"

            # admin dues row reflects pause
            rows = requests.get(f"{API}/admin/dues", headers=_hdr(admin_token), timeout=T).json()["sellers"]
            row = next(s for s in rows if s["id"] == seller_id)
            assert row["paused_by_admin"] is True and row["effective_paused"] is True
        finally:
            u = requests.patch(f"{API}/admin/sellers/{seller_id}/pause", headers=_hdr(admin_token),
                               json={"paused": False}, timeout=T)
            assert u.status_code == 200, u.text

        # products come back after unpause
        lst2 = requests.get(f"{API}/products", params={"limit": 60}, timeout=T).json()
        lst2 = lst2.get("items") if isinstance(lst2, dict) else lst2
        assert any(i["seller_id"] == seller_id for i in lst2), "products did not reappear after unpause"

        # bulk upload works again
        b2 = requests.post(f"{API}/seller/products/bulk", headers=_hdr(seller_token), json={"products": [{
            "name": f"TEST_P6 Unpaused {uuid.uuid4().hex[:6]}", "category": "tiles", "price": 500,
            "stock": 5, "images": ["https://example.com/a.jpg"], "description": "x"}]}, timeout=T)
        assert b2.status_code == 200, f"{b2.status_code} {b2.text[:200]}"
        for pr in b2.json().get("products", []):
            requests.delete(f"{API}/admin/products/{pr['id']}", headers=_hdr(admin_token), timeout=T)

        # status update works again
        s2 = _set_status(seller_token, order["id"], "confirmed")
        assert s2.status_code == 200, s2.text

    def test_pause_unknown_seller_404(self, admin_token):
        r = requests.patch(f"{API}/admin/sellers/{uuid.uuid4()}/pause", headers=_hdr(admin_token),
                           json={"paused": True}, timeout=T)
        assert r.status_code == 404, r.status_code
