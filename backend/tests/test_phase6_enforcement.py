"""Phase 6 enforcement tests requiring direct DB manipulation:
 - expired subscription hides seller products from buyer listing (restored via subscription verify)
 - auto-pause when pending dues >= threshold beyond grace period
Runs serially (single class => one xdist worker via loadscope).
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
backend_env = dotenv_values("/app/backend/.env")
mongo_url = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
db_name = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")
if not base_url or not mongo_url or not db_name:
    raise RuntimeError("Missing REACT_APP_BACKEND_URL / MONGO_URL / DB_NAME")
API = base_url.rstrip("/") + "/api"

ADMIN = {"email": "admin@terramart.com", "password": "Admin@123"}
SELLER1 = {"email": "seller1@terramart.com", "password": "Seller@123"}
PIN = "226013"
T = 30


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _token(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=T)
    if r.status_code != 200:
        pytest.fail(f"login failed {creds['email']}: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def mdb():
    c = MongoClient(mongo_url)
    yield c[db_name]
    c.close()


@pytest.fixture(scope="module")
def admin_token():
    return _token(ADMIN)


@pytest.fixture(scope="module")
def seller_token():
    return _token(SELLER1)


@pytest.fixture(scope="module")
def seller_id(seller_token):
    r = requests.get(f"{API}/seller/me", headers=_hdr(seller_token), timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _listing_seller_ids():
    r = requests.get(f"{API}/products", params={"limit": 60}, timeout=T)
    assert r.status_code == 200, r.text
    items = r.json()
    items = items.get("items") if isinstance(items, dict) else items
    return {i["seller_id"] for i in items}


class TestEnforcement:
    def test_expired_subscription_hides_products_then_restores(self, mdb, seller_token, seller_id):
        original = mdb.sellers.find_one({"id": seller_id}, {"_id": 0}).get("subscription_expires_at")
        past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        mdb.sellers.update_one({"id": seller_id}, {"$set": {"subscription_expires_at": past}})
        try:
            info = requests.get(f"{API}/seller/subscription", headers=_hdr(seller_token), timeout=T).json()
            assert info["subscription_status"] == "expired", info
            assert seller_id not in _listing_seller_ids(), "expired seller products still listed to buyers"

            # bulk upload blocked while expired
            b = requests.post(f"{API}/seller/products/bulk", headers=_hdr(seller_token), json={"products": [{
                "name": f"TEST_P6 Expired {uuid.uuid4().hex[:6]}", "category": "tiles", "price": 400,
                "stock": 2, "images": ["https://example.com/a.jpg"], "description": "x"}]}, timeout=T)
            assert b.status_code == 403, f"{b.status_code} {b.text[:200]}"

            # renew via demo payment restores listing
            c = requests.post(f"{API}/seller/subscription/create", headers=_hdr(seller_token), timeout=T)
            assert c.status_code == 200, c.text
            v = requests.post(f"{API}/seller/subscription/verify", headers=_hdr(seller_token), json={
                "razorpay_order_id": c.json()["razorpay_order_id"],
                "razorpay_payment_id": f"demo_pay_{uuid.uuid4().hex[:8]}", "demo_mode": True}, timeout=T)
            assert v.status_code == 200, v.text
            info2 = requests.get(f"{API}/seller/subscription", headers=_hdr(seller_token), timeout=T).json()
            assert info2["subscription_status"] == "active", info2
            assert seller_id in _listing_seller_ids(), "products did not reappear after renewal"
        finally:
            if original:
                mdb.sellers.update_one({"id": seller_id}, {"$set": {"subscription_expires_at": original}})

    def test_auto_pause_on_dues_over_threshold_beyond_grace(self, mdb, admin_token, seller_token, seller_id):
        settings = requests.get(f"{API}/admin/settings", headers=_hdr(admin_token), timeout=T).json()
        due_id = str(uuid.uuid4())
        old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        mdb.commission_dues.insert_one({
            "id": due_id, "seller_id": seller_id, "order_id": f"TEST_P6_{due_id[:8]}",
            "short_id": "TESTP6", "order_value": 100000.0, "commission_rate": 10.0,
            "commission_amount": 10000.0, "status": "pending", "delivered_at": old,
            "cleared_at": None, "cleared_payment_id": None, "cleared_note": None,
        })
        try:
            rows = requests.get(f"{API}/admin/dues", headers=_hdr(admin_token), timeout=T).json()["sellers"]
            row = next(s for s in rows if s["id"] == seller_id)
            assert row["pending_dues"] >= 10000, row
            assert row["over_threshold"] is True, row
            assert row["auto_paused"] is True, f"auto-pause not applied: {row}"
            assert row["effective_paused"] is True

            # enforcement: products hidden, status update blocked
            assert seller_id not in _listing_seller_ids(), "auto-paused seller still listed"
            dues = requests.get(f"{API}/seller/dues", headers=_hdr(seller_token), timeout=T).json()
            assert dues["seller"]["auto_paused"] is True
        finally:
            mdb.commission_dues.delete_one({"id": due_id})
            requests.patch(f"{API}/admin/settings", headers=_hdr(admin_token), json={
                "dues_threshold": settings["dues_threshold"],
                "dues_grace_days": settings["dues_grace_days"]}, timeout=T)
        # restored
        rows = requests.get(f"{API}/admin/dues", headers=_hdr(admin_token), timeout=T).json()["sellers"]
        row = next(s for s in rows if s["id"] == seller_id)
        assert row["auto_paused"] is False
        assert seller_id in _listing_seller_ids()
