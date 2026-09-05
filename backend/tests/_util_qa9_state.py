"""Iteration-9 helper: toggle pause / force expiry / restore for the QA fresh seller.
Usage: python _util_qa9_state.py <email> pause|unpause|expire|restore|delete
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

base = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = base + "/api"
env = dotenv_values("/app/backend/.env")
MONGO = os.environ.get("MONGO_URL") or env["MONGO_URL"]
DBN = os.environ.get("DB_NAME") or env["DB_NAME"]


async def main(email, action):
    cl = AsyncIOMotorClient(MONGO)
    db = cl[DBN]
    u = await db.users.find_one({"email": email.lower()}, {"_id": 0})
    if not u:
        print("user not found", email)
        return
    s = await db.sellers.find_one({"user_id": u["id"]}, {"_id": 0})
    print("seller_id", s["id"], "exp", s.get("subscription_expires_at"))
    at = requests.post(f"{API}/auth/login", json={"email": "admin@terramart.com", "password": "Admin@123"}, timeout=30).json()["token"]
    H = {"Authorization": f"Bearer {at}"}
    if action in ("pause", "unpause"):
        r = requests.patch(f"{API}/admin/sellers/{s['id']}/pause", headers=H, json={"paused": action == "pause"}, timeout=30)
        print(action, r.status_code, r.text[:200])
    elif action == "expire":
        past = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        await db.sellers.update_one({"id": s["id"]}, {"$set": {"subscription_expires_at": past}})
        print("expired ->", past)
    elif action == "restore":
        fut = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        await db.sellers.update_one({"id": s["id"]}, {"$set": {"subscription_expires_at": fut}})
        print("restored ->", fut)
    elif action == "delete":
        r = requests.delete(f"{API}/admin/sellers/{s['id']}", headers=H, timeout=30)
        print("delete", r.status_code, r.text[:200])
        await db.users.delete_one({"id": u["id"]})
    cl.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
