"""Utility: create a throwaway TEST_ seller (unverified) with 2 products for UI admin tests."""
import os
import uuid

import requests
from dotenv import dotenv_values

base = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
API = base.rstrip("/") + "/api"

email = f"TEST_uiseller_{uuid.uuid4().hex[:6]}@example.com"
r = requests.post(f"{API}/auth/register", json={
    "email": email, "password": "Seller@123", "name": "TEST UI Seller",
    "role": "seller", "business_name": "TEST_UIDelete Traders", "gst_number": "09TESTUI1234Z9",
}, timeout=30)
r.raise_for_status()
tok = r.json()["token"]
h = {"Authorization": f"Bearer {tok}"}
up = requests.post(f"{API}/seller/products/bulk", headers=h, json={"products": [
    {"name": f"TEST_UI Delete Tile {i}", "category": "tiles", "price": 400 + i, "stock": 4,
     "images": ["https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800&q=80"]}
    for i in (1, 2)
]}, timeout=60)
up.raise_for_status()
sid = requests.get(f"{API}/seller/me", headers=h, timeout=30).json()["id"]
print("SELLER_ID", sid)
print("EMAIL", email)
print("PRODUCTS", [p["id"] for p in up.json()["products"]])
