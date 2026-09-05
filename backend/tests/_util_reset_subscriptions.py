"""Utility: reset seller1 subscription_expires_at back to now+30d (seed baseline) after tests."""
import os
from datetime import datetime, timedelta, timezone

from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
mc = MongoClient(os.environ.get("MONGO_URL") or env["MONGO_URL"])
db = mc[os.environ.get("DB_NAME") or env["DB_NAME"]]
exp = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
res = db.sellers.update_many({}, {"$set": {"subscription_expires_at": exp}})
print("sellers reset:", res.modified_count, "exp:", exp)
print("paused sellers:", [s["business_name"] for s in db.sellers.find({"paused_by_admin": True}, {"_id": 0})])
print("pending dues rows:", db.commission_dues.count_documents({"status": "pending"}))
mc.close()
