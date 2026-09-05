"""Cleanup helper: remove QA-created TEST_ products from the catalogue."""
import os
import asyncio
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

be = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or be.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or be.get("DB_NAME")


async def main():
    cl = AsyncIOMotorClient(MONGO_URL)
    db = cl[DB_NAME]
    docs = await db.products.find({"title": {"$regex": "^TEST_"}}, {"_id": 0, "id": 1, "title": 1}).to_list(500)
    print("found:", [d["title"] for d in docs])
    res = await db.products.delete_many({"title": {"$regex": "^TEST_"}})
    print("deleted products:", res.deleted_count)
    la = await db.login_attempts.delete_many({})
    print("cleared login_attempts:", la.deleted_count)
    cl.close()


asyncio.run(main())
