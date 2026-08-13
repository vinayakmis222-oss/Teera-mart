"""Phase 2 backend tests for TerraMart: coupons, OTP, addresses, orders."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://buildmat-bazaar.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def buyer_token():
    email = f"TEST_buyer_{uuid.uuid4().hex[:8]}@terramart.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Buyer@123", "name": "Test Buyer", "role": "buyer"
    })
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def buyer_headers(buyer_token):
    return {"Authorization": f"Bearer {buyer_token}", "Content-Type": "application/json"}


# -------- Coupons --------
class TestCoupons:
    def test_list_coupons(self):
        r = requests.get(f"{API}/coupons")
        assert r.status_code == 200
        data = r.json()
        codes = {c["code"] for c in data}
        assert {"WELCOME10", "TERRA200", "FIRSTBUY"}.issubset(codes)
        assert len(data) == 3

    def test_apply_welcome10(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "WELCOME10", "subtotal": 2000})
        assert r.status_code == 200
        d = r.json()
        assert d["discount"] == 200
        assert d["code"] == "WELCOME10"

    def test_apply_invalid(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "NOTREAL", "subtotal": 2000})
        assert r.status_code == 400

    def test_terra200_min_order(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "TERRA200", "subtotal": 1000})
        assert r.status_code == 400

    def test_terra200_valid(self):
        r = requests.post(f"{API}/coupons/apply", json={"code": "TERRA200", "subtotal": 1500})
        assert r.status_code == 200
        assert r.json()["discount"] == 200


# -------- OTP --------
class TestOtp:
    def test_send_otp(self):
        r = requests.post(f"{API}/auth/otp/send", json={"phone": "9876500001"})
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert "demo_otp" in d

    def test_verify_creates_user(self):
        phone = f"98765{int(time.time()) % 100000:05d}"
        r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": "123456", "name": "OTP User"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "buyer"
        assert d["token"]
        assert d["phone"] == phone
        uid1 = d["id"]
        # second verify reuses account
        r2 = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": "654321"})
        assert r2.status_code == 200
        assert r2.json()["id"] == uid1

    def test_invalid_otp_length(self):
        r = requests.post(f"{API}/auth/otp/verify", json={"phone": "9999999999", "otp": "12345"})
        assert r.status_code == 400


# -------- Addresses --------
class TestAddresses:
    def test_address_crud(self, buyer_headers):
        # create first -> becomes default
        payload = {
            "name": "Test User", "phone": "9876543210", "pincode": "560001",
            "line1": "1 Main St", "line2": "Apt 2", "city": "Bengaluru",
            "state": "KA", "type": "home", "is_default": False
        }
        r = requests.post(f"{API}/addresses", json=payload, headers=buyer_headers)
        assert r.status_code == 200, r.text
        addr = r.json()
        assert addr["is_default"] is True  # first becomes default
        aid = addr["id"]

        # list
        r = requests.get(f"{API}/addresses", headers=buyer_headers)
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json())

        # update
        upd = {**payload, "city": "Mumbai", "is_default": True}
        r = requests.patch(f"{API}/addresses/{aid}", json=upd, headers=buyer_headers)
        assert r.status_code == 200
        assert r.json()["city"] == "Mumbai"

        # delete
        r = requests.delete(f"{API}/addresses/{aid}", headers=buyer_headers)
        assert r.status_code == 200


# -------- Orders --------
class TestOrders:
    def test_order_flow(self, buyer_headers, buyer_token):
        # Create an address
        r = requests.post(f"{API}/addresses", json={
            "name": "OB", "phone": "9876543210", "pincode": "560001",
            "line1": "1 St", "city": "BLR", "state": "KA", "type": "home"
        }, headers=buyer_headers)
        assert r.status_code == 200
        aid = r.json()["id"]

        # Fetch a product
        r = requests.get(f"{API}/products?limit=2")
        assert r.status_code == 200
        prods = r.json()
        assert len(prods) >= 1
        p = prods[0]

        # Create order
        body = {
            "items": [{"product_id": p["id"], "qty": 2}],
            "address_id": aid,
            "payment_method": "cod",
            "coupon_code": "WELCOME10",
        }
        r = requests.post(f"{API}/orders", json=body, headers=buyer_headers)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["short_id"].startswith("TM")
        assert o["status"] == "placed"
        assert all("seller_id" in it for it in o["items"])
        oid = o["id"]

        # List orders
        r = requests.get(f"{API}/orders", headers=buyer_headers)
        assert r.status_code == 200
        assert any(x["id"] == oid for x in r.json())

        # Get order enriches seller
        r = requests.get(f"{API}/orders/{oid}", headers=buyer_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["items"][0].get("seller") is not None

        # buyer PATCH status -> 403
        r = requests.patch(f"{API}/orders/{oid}/status?status=shipped", headers=buyer_headers)
        assert r.status_code == 403
