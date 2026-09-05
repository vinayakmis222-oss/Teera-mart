"""Helper: clear db.login_attempts lockout docs (used to unstick accounts after brute-force tests)."""
import os
import sys
import asyncio
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

be = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or be.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or be.get("DB_NAME")


async def main(emails):
    cl = AsyncIOMotorClient(MONGO_URL)
    db = cl[DB_NAME]
    if emails:
        res = await db.login_attempts.delete_many({"email": {"$in": emails}})
    else:
        res = await db.login_attempts.delete_many({})
    print("deleted", res.deleted_count)
    cl.close()


if __name__ == "__main__":
    asyncio.run(main([e.lower() for e in sys.argv[1:]]))
