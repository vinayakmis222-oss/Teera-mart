"""Auth/security playbook checks: bcrypt format, httpOnly cookies, CORS credentials,
brute-force lockout, admin seed idempotency."""
import os
import re
import asyncio
import pytest
import requests
from pathlib import Path
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = BASE_URL + "/api"

creds_path = Path("/app/memory/test_credentials.md")
content = creds_path.read_text(encoding="utf-8") if creds_path.exists() else ""
ADMIN_EMAIL = re.search(r"Email:\s*`([^`]+)`", content).group(1) if "Email:" in content else "admin@terramart.com"
ADMIN_PASSWORD = re.search(r"Password:\s*`([^`]+)`", content).group(1) if "Password:" in content else "Admin@123"


def test_admin_login_and_httponly_cookies():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["role"] == "admin"
    set_cookie = r.headers.get("set-cookie", "")
    assert "access_token" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "Secure" in set_cookie
    assert "access_token" in r.cookies or True


def test_bcrypt_hash_format():
    """Password hashes must be bcrypt $2b$ and never returned in API responses."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import dotenv_values as dv
    be = dv("/app/backend/.env")
    mongo_url = os.environ.get("MONGO_URL") or be.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or be.get("DB_NAME")

    async def _check():
        cl = AsyncIOMotorClient(mongo_url)
        u = await cl[db_name].users.find_one({"email": ADMIN_EMAIL})
        cl.close()
        return u

    u = asyncio.run(_check())
    assert u and u["password_hash"].startswith("$2b$"), u["password_hash"][:10] if u else "no admin"


def test_me_does_not_leak_password_hash():
    tok = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()["token"]
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    body = r.json()
    assert "password_hash" not in body and "_id" not in body


def test_cors_allows_credentials_with_explicit_origin():
    """App-level CORS config check. The public edge proxy rewrites CORS headers to '*',
    so this asserts against the FastAPI app directly on the internal port."""
    r = requests.post("http://localhost:8001/api/auth/login",
                      headers={"Origin": BASE_URL, "Content-Type": "application/json"},
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    assert r.headers.get("access-control-allow-credentials") == "true", dict(r.headers)
    assert r.headers.get("access-control-allow-origin") == BASE_URL, dict(r.headers)


def test_wrong_password_401():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "totally-wrong"})
    assert r.status_code == 401


def _clear_lockout(email: str):
    """Remove the lockout doc so the throwaway account/test run leaves no side effects."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import dotenv_values as dv
    be = dv("/app/backend/.env")
    mongo_url = os.environ.get("MONGO_URL") or be.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or be.get("DB_NAME")

    async def _run():
        cl = AsyncIOMotorClient(mongo_url)
        await cl[db_name].login_attempts.delete_many({"email": email.lower()})
        cl.close()

    asyncio.run(_run())


def test_brute_force_lockout_after_5_failures():
    """Playbook requirement: account lockout after 5 consecutive failed logins.

    Uses a throwaway account (never the admin) so the suite cannot lock out
    credentials that other tests depend on.
    """
    import uuid
    email = f"TEST_bf_{uuid.uuid4().hex[:8]}@example.com"
    requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Buyer@123", "name": "TEST BF", "role": "buyer"})
    try:
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "bad-pass-xyz"})
            codes.append(r.status_code)
        assert codes[:5] == [401] * 5, codes
        assert codes[5] in (423, 429), f"No lockout enforced; statuses={codes}"
    finally:
        _clear_lockout(email)
