"""Tests for AI features: chat SSE, room designer, seller description generator, NL search."""
import json
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://buildmat-bazaar.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

VALID_CATS = {"tiles", "wall-stencils", "wall-stickers", "wallpapers", "paints", "home-decor", "flooring", "all"}


@pytest.fixture(scope="module")
def seller_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "seller1@terramart.com", "password": "Seller@123"})
    assert r.status_code == 200, f"seller login failed: {r.status_code} {r.text}"
    return s


def _consume_sse(resp, timeout=60):
    """Return list of parsed SSE frame dicts."""
    frames = []
    start = time.time()
    for line in resp.iter_lines(decode_unicode=True):
        if time.time() - start > timeout:
            break
        if not line:
            continue
        if line.startswith("data:"):
            payload = line[5:].strip()
            try:
                frames.append(json.loads(payload))
            except Exception:
                pass
            if frames and frames[-1].get("type") == "done":
                break
    return frames


# ---------- /api/ai/chat ----------
class TestAIChat:
    def test_chat_stream_and_session_persistence(self):
        # first message
        r1 = requests.post(f"{API}/ai/chat", json={"message": "Suggest matte white tiles for my bathroom"}, stream=True, timeout=90)
        assert r1.status_code == 200
        assert "text/event-stream" in r1.headers.get("content-type", "")
        frames1 = _consume_sse(r1)
        assert frames1, "no SSE frames received"
        assert frames1[0]["type"] == "session"
        session_id = frames1[0]["session_id"]
        assert session_id.startswith("chat-")
        deltas = [f for f in frames1 if f["type"] == "delta"]
        assert len(deltas) > 0, "no delta events"
        assert any(f["type"] == "done" for f in frames1)
        full1 = "".join(f.get("content", "") for f in deltas)
        assert len(full1) > 10

        # follow-up referencing prior turn (multi-turn history)
        r2 = requests.post(f"{API}/ai/chat", json={"session_id": session_id, "message": "What size should I pick?"}, stream=True, timeout=90)
        assert r2.status_code == 200
        frames2 = _consume_sse(r2)
        assert frames2[0]["type"] == "session"
        assert frames2[0]["session_id"] == session_id
        full2 = "".join(f.get("content", "") for f in frames2 if f["type"] == "delta")
        assert len(full2) > 5

    def test_chat_validation_empty_message(self):
        r = requests.post(f"{API}/ai/chat", json={"message": ""})
        assert r.status_code == 422


# ---------- /api/ai/design-room ----------
class TestDesignRoom:
    def test_design_room_returns_plan_with_products(self):
        r = requests.post(f"{API}/ai/design-room", json={
            "room_type": "bathroom", "style": "modern minimalist",
            "budget": 30000, "description": "small guest bathroom, matte finish"
        }, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "summary" in data and isinstance(data["summary"], str)
        assert isinstance(data.get("palette"), list)
        picks = data.get("picks")
        assert isinstance(picks, list) and len(picks) >= 1
        # verify each pick shape
        for p in picks:
            assert "category" in p and "keyword" in p and "why" in p
            assert "products" in p and isinstance(p["products"], list)
        # at least one pick should have real products from DB
        any_products = [p for p in picks if p["products"]]
        assert any_products, "no picks had matching products from DB"
        prod = any_products[0]["products"][0]
        assert "id" in prod and "title" in prod and "price" in prod


# ---------- /api/ai/generate-description ----------
class TestGenerateDescription:
    def test_requires_seller_auth(self):
        r = requests.post(f"{API}/ai/generate-description", json={
            "title": "ceramic tile", "category": "tiles",
        })
        assert r.status_code in (401, 403)

    def test_generate_description_authenticated(self, seller_session):
        r = seller_session.post(f"{API}/ai/generate-description", json={
            "title": "matte white ceramic bathroom tile",
            "category": "tiles",
            "keywords": "modern minimalist",
            "material": "ceramic",
        }, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("title") and isinstance(data["title"], str)
        assert data.get("description") and len(data["description"]) > 40
        assert isinstance(data.get("bullets"), list) and len(data["bullets"]) >= 1
        assert isinstance(data.get("keywords"), list) and len(data["keywords"]) >= 1


# ---------- /api/ai/search ----------
class TestAISearch:
    def test_search_returns_valid_filters(self):
        r = requests.post(f"{API}/ai/search", json={"query": "matte white bathroom tiles under 800"}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["category"] in VALID_CATS
        assert isinstance(data.get("q"), str)
        # budget "under 800" should map to max_price around 800
        if data.get("max_price") is not None:
            assert isinstance(data["max_price"], (int, float))

    def test_search_ambiguous_returns_all(self):
        r = requests.post(f"{API}/ai/search", json={"query": "something nice for my home"}, timeout=90)
        assert r.status_code == 200
        data = r.json()
        assert data["category"] in VALID_CATS
