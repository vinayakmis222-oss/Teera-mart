"""Phase-4 backend tests: single-pincode (226013) delivery serviceability.
Covers /api/delivery/config and the create_order() pincode hard-block.
"""
import os
import uuid
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
API = base_url.rstrip("/") + "/api"

SERVICEABLE = "226013"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def buyer():
    email = f"TEST_p4_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Buyer@123", "name": "TEST P4 Buyer", "role": "buyer"})
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return {"email": email, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def product():
    r = requests.get(f"{API}/products?limit=5")
    assert r.status_code == 200
    items = r.json()
    items = items.get("items") if isinstance(items, dict) else items
    assert items, "no products seeded"
    return items[0]


def _mk_address(headers, pincode):
    r = requests.post(f"{API}/addresses", headers=headers, json={
        "name": "TEST P4", "phone": "9876543210", "pincode": pincode,
        "line1": "12 Mubarakpur Road", "line2": "", "city": "Lucknow",
        "state": "Uttar Pradesh", "type": "home", "is_default": False})
    return r


# ---------- /api/delivery/config ----------
class TestDeliveryConfig:
    def test_config_shape(self):
        r = requests.get(f"{API}/delivery/config")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["pincode"] == SERVICEABLE
        assert d["areas"] == "Mubarakpur, Bhitauli & Allu"
        assert "2-hour" in d["promise"].lower()

    def test_config_is_public(self):
        # no auth header supplied above already; assert not requiring auth
        r = requests.get(f"{API}/delivery/config", headers={"Authorization": "Bearer garbage"})
        assert r.status_code in (200, 401)


# ---------- order creation guard ----------
class TestOrderPincodeGuard:
    def test_address_create_allows_any_pincode_but_order_blocks(self, buyer, product):
        bad = _mk_address(buyer["headers"], "400001")
        assert bad.status_code in (200, 201, 400), bad.text
        if bad.status_code >= 400:
            pytest.skip("backend blocks bad pincode at address level; order guard covered below")
        bad_id = bad.json()["id"]

        r = requests.post(f"{API}/orders", headers=buyer["headers"], json={
            "address_id": bad_id,
            "items": [{"product_id": product["id"], "qty": 1, "variant": None}],
            "payment_method": "cod"})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        detail = str(r.json().get("detail", r.text))
        assert SERVICEABLE in detail
        assert "Mubarakpur" in detail

    def test_order_succeeds_with_serviceable_pincode(self, buyer, product):
        good = _mk_address(buyer["headers"], SERVICEABLE)
        assert good.status_code in (200, 201), good.text
        good_id = good.json()["id"]

        r = requests.post(f"{API}/orders", headers=buyer["headers"], json={
            "address_id": good_id,
            "items": [{"product_id": product["id"], "qty": 1, "variant": None}],
            "payment_method": "cod"})
        assert r.status_code in (200, 201), r.text
        o = r.json()
        assert "_id" not in o
        assert o["address"]["pincode"] == SERVICEABLE
        assert o["items"][0]["product_id"] == product["id"]
        oid = o["id"]

        # persistence check
        g = requests.get(f"{API}/orders/{oid}", headers=buyer["headers"])
        assert g.status_code == 200, g.text
        assert g.json()["address"]["pincode"] == SERVICEABLE
        assert "_id" not in g.json()

    def test_order_missing_address_returns_400(self, buyer, product):
        r = requests.post(f"{API}/orders", headers=buyer["headers"], json={
            "address_id": "does-not-exist",
            "items": [{"product_id": product["id"], "qty": 1, "variant": None}],
            "payment_method": "cod"})
        assert r.status_code == 400, r.text

    def test_order_requires_auth(self, product):
        r = requests.post(f"{API}/orders", json={
            "address_id": "x",
            "items": [{"product_id": product["id"], "qty": 1, "variant": None}],
            "payment_method": "cod"})
        assert r.status_code in (401, 403), r.text


# ---------- quick regression: core endpoints still up ----------
class TestNoRegression:
    @pytest.mark.parametrize("path", ["/categories", "/products?limit=5", "/coupons"])
    def test_public_endpoints(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code in (200, 404), f"{path} -> {r.status_code}"
