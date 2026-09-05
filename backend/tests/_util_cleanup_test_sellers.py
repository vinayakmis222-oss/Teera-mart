"""Utility: remove leftover TEST_/UI test sellers (and their products) created by testing agents."""
import os

import requests
from dotenv import dotenv_values

base = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
API = base.rstrip("/") + "/api"

tok = requests.post(f"{API}/auth/login", json={"email": "admin@terramart.com", "password": "Admin@123"}, timeout=30).json()["token"]
h = {"Authorization": f"Bearer {tok}"}
sellers = requests.get(f"{API}/admin/sellers", headers=h, timeout=30).json()
for s in sellers:
    name = s.get("business_name") or ""
    email = s.get("owner_email") or ""
    if name.startswith("TEST_") or email.startswith("TEST_") or name == "UI Biz":
        r = requests.delete(f"{API}/admin/sellers/{s['id']}", headers=h, timeout=60)
        print("deleted", name, email, r.status_code, r.text[:80])
print("remaining:", [s["business_name"] for s in requests.get(f"{API}/admin/sellers", headers=h, timeout=30).json()])
