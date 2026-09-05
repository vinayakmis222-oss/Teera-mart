"""Iteration 9 regression: new seller registration must grant a trial subscription window
(subscription_expires_at = now + settings.subscription_period_days), unblocking
POST /api/seller/products and /api/seller/products/bulk.
Also covers admin pause/unpause effect on effective_paused and forced-expiry -> 'expired'.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

base_url = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
API = base_url.rstrip("/") + "/api"
T = 30


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@terramart.com", "password": "Admin@123"}, timeout=T)
    assert r.status_code == 200, r.text[:300]
    return r.json()["token"]


@pytest.fixture(scope="module")
def fresh_seller(admin_token):
    email = f"TEST_p8trial_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Seller@123", "name": "TEST P8 Trial Seller",
        "role": "seller", "business_name": "TEST_P8 Trial Co", "gst_number": "09TESTP81234Z9"}, timeout=T)
    assert r.status_code == 200, r.text[:300]
    tok = r.json()["token"]
    sid = requests.get(f"{API}/seller/me", headers=_hdr(tok), timeout=T).json()["id"]
    yield {"token": tok, "id": sid, "email": email}
    requests.delete(f"{API}/admin/sellers/{sid}", headers=_hdr(admin_token), timeout=T)


# ---------------- trial subscription on registration ----------------
class TestFreshSellerTrial:
    def test_subscription_active_with_days_left(self, fresh_seller):
        r = requests.get(f"{API}/seller/subscription", headers=_hdr(fresh_seller["token"]), timeout=T)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["subscription_status"] == "active", d
        assert 28 <= d["subscription_days_left"] <= 30, d
        exp = datetime.fromisoformat(d["subscription_expires_at"].replace("Z", "+00:00"))
        delta = exp - datetime.now(timezone.utc)
        assert timedelta(days=29) < delta <= timedelta(days=30, hours=1), delta

    def test_dashboard_reports_active(self, fresh_seller):
        r = requests.get(f"{API}/seller/dashboard", headers=_hdr(fresh_seller["token"]), timeout=T)
        assert r.status_code == 200, r.text
        s = r.json()["stats"]
        assert s["subscription_status"] == "active"
        assert s["products"] == 0

    def test_can_create_single_product(self, fresh_seller):
        payload = {"title": f"TEST_P8 Single {uuid.uuid4().hex[:6]}", "category": "tiles", "price": 499.0,
                   "stock": 4, "images": ["https://example.com/a.jpg"], "description": "regression",
                   "material": "ceramic"}
        r = requests.post(f"{API}/seller/products", headers=_hdr(fresh_seller["token"]), json=payload, timeout=T)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        pid = r.json()["id"]
        # GET verification
        lst = requests.get(f"{API}/seller/products", headers=_hdr(fresh_seller["token"]), timeout=T).json()
        found = [p for p in lst if p["id"] == pid]
        assert found, "created product not returned by GET /seller/products"
        assert (found[0].get("title") or found[0].get("name")) == payload["title"]
        assert found[0]["price"] == 499.0
        assert "_id" not in found[0]

    def test_can_bulk_upload(self, fresh_seller):
        r = requests.post(f"{API}/seller/products/bulk", headers=_hdr(fresh_seller["token"]), json={"products": [{
            "name": f"TEST_P8 Bulk {uuid.uuid4().hex[:6]}", "category": "paints", "price": 1200,
            "stock": 3, "images": ["https://example.com/b.jpg"], "description": "bulk regression"}]}, timeout=T)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert r.json().get("inserted", r.json().get("created", 1)) >= 1, r.json()


# ---------------- existing seeded sellers unaffected ----------------
class TestExistingSeller:
    def test_seeded_seller_still_active(self):
        tok = requests.post(f"{API}/auth/login", json={"email": "seller1@terramart.com", "password": "Seller@123"}, timeout=T).json()["token"]
        r = requests.get(f"{API}/seller/subscription", headers=_hdr(tok), timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["subscription_status"] == "active", r.json()


# ---------------- pause / expiry enforcement ----------------
class TestPauseAndExpiry:
    def test_pause_blocks_product_create(self, admin_token, fresh_seller):
        sid = fresh_seller["id"]
        r = requests.patch(f"{API}/admin/sellers/{sid}/pause", headers=_hdr(admin_token), json={"paused": True}, timeout=T)
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/seller/dashboard", headers=_hdr(fresh_seller["token"]), timeout=T).json()["seller"]
        assert me.get("effective_paused") is True, me
        assert me.get("subscription_status") == "active", "pause must not change subscription_status"
        cr = requests.post(f"{API}/seller/products", headers=_hdr(fresh_seller["token"]), json={
            "title": "TEST_P8 Paused", "category": "tiles", "price": 100, "stock": 1,
            "images": ["https://example.com/c.jpg"], "description": "x"}, timeout=T)
        assert cr.status_code == 403, f"paused seller should be blocked, got {cr.status_code}"
        # unpause
        r = requests.patch(f"{API}/admin/sellers/{sid}/pause", headers=_hdr(admin_token), json={"paused": False}, timeout=T)
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/seller/dashboard", headers=_hdr(fresh_seller["token"]), timeout=T).json()["seller"]
        assert me.get("effective_paused") is False, me

    def test_forced_expiry_reports_expired_and_blocks(self, fresh_seller):
        import asyncio

        from motor.motor_asyncio import AsyncIOMotorClient
        mongo = os.environ.get("MONGO_URL") or dotenv_values("/app/backend/.env")["MONGO_URL"]
        dbname = os.environ.get("DB_NAME") or dotenv_values("/app/backend/.env")["DB_NAME"]
        past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        orig = None

        async def _set(val):
            cl = AsyncIOMotorClient(mongo)
            d = cl[dbname]
            doc = await d.sellers.find_one({"id": fresh_seller["id"]}, {"_id": 0})
            prev = doc.get("subscription_expires_at")
            await d.sellers.update_one({"id": fresh_seller["id"]}, {"$set": {"subscription_expires_at": val}})
            cl.close()
            return prev

        orig = asyncio.run(_set(past))
        try:
            sub = requests.get(f"{API}/seller/subscription", headers=_hdr(fresh_seller["token"]), timeout=T).json()
            assert sub["subscription_status"] == "expired", sub
            cr = requests.post(f"{API}/seller/products", headers=_hdr(fresh_seller["token"]), json={
                "title": "TEST_P8 Expired", "category": "tiles", "price": 100, "stock": 1,
                "images": ["https://example.com/d.jpg"], "description": "x"}, timeout=T)
            assert cr.status_code == 403, f"expired seller should be blocked, got {cr.status_code}"
        finally:
            asyncio.run(_set(orig))
