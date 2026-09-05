"""Phase 8 seller polish backend tests: uploads, partial PATCH, low_stock."""
import base64
import io
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

_frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _frontend_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

SELLER_EMAIL = "seller1@terramart.com"
SELLER_PASSWORD = "Seller@123"
ADMIN_EMAIL = "admin@terramart.com"
ADMIN_PASSWORD = "Admin@123"

# 1x1 red PNG
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
)


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def seller_token():
    return _login(SELLER_EMAIL, SELLER_PASSWORD)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def buyer_token():
    # register a fresh buyer
    email = f"TEST_buyer_p8u_{int(time.time())}@example.com"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "Buyer@123", "name": "P8 Buyer", "role": "buyer"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- UPLOAD TESTS ----------------

class TestUploads:
    def test_upload_unauth_returns_401(self):
        files = {"file": ("t.png", TINY_PNG, "image/png")}
        r = requests.post(f"{BASE_URL}/api/uploads/image", files=files, timeout=30)
        assert r.status_code == 401, r.text

    def test_upload_non_image_returns_400(self, seller_token):
        files = {"file": ("hello.txt", b"hello world", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/uploads/image", files=files, headers=_auth(seller_token), timeout=30)
        assert r.status_code == 400, r.text

    def test_upload_empty_returns_400(self, seller_token):
        files = {"file": ("empty.png", b"", "image/png")}
        r = requests.post(f"{BASE_URL}/api/uploads/image", files=files, headers=_auth(seller_token), timeout=30)
        assert r.status_code == 400, r.text

    def test_upload_too_large_returns_400(self, seller_token):
        big = b"\x00" * (8 * 1024 * 1024 + 100)
        files = {"file": ("big.png", big, "image/png")}
        r = requests.post(f"{BASE_URL}/api/uploads/image", files=files, headers=_auth(seller_token), timeout=60)
        assert r.status_code == 400, r.text

    def test_upload_valid_png_and_public_get(self, seller_token):
        files = {"file": ("tiny.png", TINY_PNG, "image/png")}
        r = requests.post(f"{BASE_URL}/api/uploads/image", files=files, headers=_auth(seller_token), timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("/api/uploads/"), data
        assert data["path"]
        assert data["size"] == len(TINY_PNG)
        # public GET
        r2 = requests.get(f"{BASE_URL}{data['url']}", timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.headers.get("Content-Type", "").startswith("image/"), r2.headers
        assert r2.content == TINY_PNG
        pytest.uploaded_url = data["url"]


# ---------------- PARTIAL PATCH & LOW STOCK ----------------

@pytest.fixture(scope="module")
def created_product(seller_token):
    payload = {
        "title": f"TEST_P8U Tile {uuid.uuid4().hex[:6]}",
        "category": "tiles",
        "price": 500,
        "stock": 10,
        "images": ["https://example.com/x.png"],
    }
    r = requests.post(f"{BASE_URL}/api/seller/products", json=payload, headers=_auth(seller_token), timeout=15)
    assert r.status_code == 200, r.text
    prod = r.json()
    yield prod
    # cleanup
    requests.delete(f"{BASE_URL}/api/seller/products/{prod['id']}", headers=_auth(seller_token), timeout=15)


class TestPartialPatch:
    def test_patch_only_price(self, seller_token, created_product):
        pid = created_product["id"]
        r = requests.patch(f"{BASE_URL}/api/seller/products/{pid}", json={"price": 299}, headers=_auth(seller_token), timeout=15)
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["price"] == 299
        assert got["title"] == created_product["title"]
        assert got["category"] == created_product["category"]
        assert got["images"] == created_product["images"]
        assert got["stock"] == created_product["stock"]
        assert got.get("seller_verified") is True

    def test_patch_only_stock(self, seller_token, created_product):
        pid = created_product["id"]
        r = requests.patch(f"{BASE_URL}/api/seller/products/{pid}", json={"stock": 12}, headers=_auth(seller_token), timeout=15)
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["stock"] == 12
        assert got["price"] == 299  # from prior patch
        assert got["title"] == created_product["title"]

    def test_patch_empty_images_400(self, seller_token, created_product):
        pid = created_product["id"]
        r = requests.patch(f"{BASE_URL}/api/seller/products/{pid}", json={"images": []}, headers=_auth(seller_token), timeout=15)
        assert r.status_code == 400, r.text

    def test_patch_unknown_category_400(self, seller_token, created_product):
        pid = created_product["id"]
        r = requests.patch(f"{BASE_URL}/api/seller/products/{pid}", json={"category": "moon-rocks"}, headers=_auth(seller_token), timeout=15)
        assert r.status_code == 400, r.text

    def test_patch_by_other_seller_404(self, created_product):
        # login seller2
        tok2 = _login("seller2@terramart.com", "Seller@123")
        pid = created_product["id"]
        r = requests.patch(f"{BASE_URL}/api/seller/products/{pid}", json={"price": 1}, headers=_auth(tok2), timeout=15)
        assert r.status_code == 404, r.text


class TestLowStockFlag:
    def test_low_stock_true_and_false(self, seller_token, created_product):
        pid = created_product["id"]
        # set to 2 -> low_stock True
        r = requests.patch(f"{BASE_URL}/api/seller/products/{pid}", json={"stock": 2}, headers=_auth(seller_token), timeout=15)
        assert r.status_code == 200
        rows = requests.get(f"{BASE_URL}/api/seller/products", headers=_auth(seller_token), timeout=15).json()
        row = next(p for p in rows if p["id"] == pid)
        assert "low_stock" in row
        assert row["low_stock"] is True
        assert row["stock"] == 2

        # set to 20 -> low_stock False
        r = requests.patch(f"{BASE_URL}/api/seller/products/{pid}", json={"stock": 20}, headers=_auth(seller_token), timeout=15)
        assert r.status_code == 200
        rows = requests.get(f"{BASE_URL}/api/seller/products", headers=_auth(seller_token), timeout=15).json()
        row = next(p for p in rows if p["id"] == pid)
        assert row["low_stock"] is False
        assert row["stock"] == 20


class TestDenyPaths:
    def test_seller_products_denied_for_buyer(self, buyer_token):
        r = requests.get(f"{BASE_URL}/api/seller/products", headers=_auth(buyer_token), timeout=15)
        assert r.status_code == 403, r.text

    def test_seller_products_denied_for_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/seller/products", headers=_auth(admin_token), timeout=15)
        assert r.status_code == 403, r.text
