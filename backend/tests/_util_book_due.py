"""Utility: book a fresh commission due for seller1 (place buyer order -> deliver)."""
import os
import uuid

import requests
from dotenv import dotenv_values

base = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
API = base.rstrip("/") + "/api"
T = 30


def h(t):
    return {"Authorization": f"Bearer {t}"}


st = requests.post(f"{API}/auth/login", json={"email": "seller1@terramart.com", "password": "Seller@123"}, timeout=T).json()["token"]
sid = requests.get(f"{API}/seller/me", headers=h(st), timeout=T).json()["id"]
prods = requests.get(f"{API}/products", params={"seller_id": sid, "limit": 3}, timeout=T).json()
prod = prods[0] if isinstance(prods, list) else prods["items"][0]

email = f"TEST_dues_{uuid.uuid4().hex[:6]}@example.com"
bt = requests.post(f"{API}/auth/register", json={"email": email, "password": "Buyer@123", "name": "TEST Dues Buyer", "role": "buyer"}, timeout=T).json()["token"]
addr = requests.post(f"{API}/addresses", headers=h(bt), json={
    "name": "TEST Dues", "phone": "9876543210", "pincode": "226013", "line1": "1 Rd",
    "city": "Lucknow", "state": "UP", "is_default": True}, timeout=T).json()["id"]
order = requests.post(f"{API}/orders", headers=h(bt), json={
    "items": [{"product_id": prod["id"], "qty": 2}], "address_id": addr, "payment_method": "cod"}, timeout=T).json()
for s in ("shipped", "out_for_delivery", "delivered"):
    r = requests.patch(f"{API}/seller/orders/{order['id']}/status", headers=h(st), params={"status": s}, timeout=T)
    r.raise_for_status()
dues = requests.get(f"{API}/seller/dues", headers=h(st), timeout=T).json()
print("SELLER_ID", sid)
print("PENDING_DUES", dues["seller"]["pending_dues"])
print("ROWS", [(d["short_id"], d["commission_amount"]) for d in dues["pending"]])
