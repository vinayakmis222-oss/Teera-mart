"""Phase 6 regression: a NEWLY registered seller must be able to onboard (bulk upload)
and have an initial subscription window. Currently fails: registration never sets
subscription_expires_at, so bulk upload returns 403 until the backend restarts (startup backfill).
"""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

base_url = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
API = base_url.rstrip("/") + "/api"
T = 30


@pytest.fixture(scope="module")
def new_seller():
    email = f"TEST_p6new_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Seller@123", "name": "TEST P6 New Seller",
        "role": "seller", "business_name": "TEST_P6 New Co", "gst_number": "09TESTP61234Z9"}, timeout=T)
    assert r.status_code == 200, r.text[:300]
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    sid = requests.get(f"{API}/seller/me", headers=h, timeout=T).json()["id"]
    yield {"headers": h, "id": sid, "email": email}
    # cleanup via admin
    at = requests.post(f"{API}/auth/login", json={"email": "admin@terramart.com", "password": "Admin@123"}, timeout=T).json()["token"]
    requests.delete(f"{API}/admin/sellers/{sid}", headers={"Authorization": f"Bearer {at}"}, timeout=T)


class TestNewSellerOnboarding:
    def test_new_seller_has_subscription_window(self, new_seller):
        r = requests.get(f"{API}/seller/subscription", headers=new_seller["headers"], timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["subscription_status"] == "active", (
            f"new seller subscription_status={r.json()['subscription_status']} — registration does not "
            "grant an initial/trial subscription window")

    def test_new_seller_can_bulk_upload(self, new_seller):
        r = requests.post(f"{API}/seller/products/bulk", headers=new_seller["headers"], json={"products": [{
            "name": f"TEST_P6 Onboard {uuid.uuid4().hex[:6]}", "category": "tiles", "price": 500,
            "stock": 5, "images": ["https://example.com/a.jpg"], "description": "x"}]}, timeout=T)
        assert r.status_code == 200, f"new seller blocked from onboarding: {r.status_code} {r.text[:200]}"
