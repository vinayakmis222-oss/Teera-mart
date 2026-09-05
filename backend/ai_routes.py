"""AI routes for TerraMart — chat assistant, room designer, seller description generator, natural-language search."""
import os
import json
import re
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

logger = logging.getLogger("terramart.ai")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AI_MODEL = ("openai", "gpt-5.4")  # provider, model

CATEGORY_SLUGS = ["tiles", "wall-stencils", "wall-stickers", "wallpapers", "paints", "home-decor", "flooring"]

BUYER_SYSTEM = (
    "You are TerraBot, the friendly shopping concierge for TerraMart — a marketplace for tiles, "
    "wall stencils, wall stickers, wallpapers, paints, home decor, and flooring. "
    "Help buyers find products, compare finishes/materials, and pick items for their room, budget, and style. "
    "Keep replies short (max 4-5 sentences), warm, and specific. If a user asks about anything outside "
    "home materials or decor, gently steer them back. Never invent product prices or SKUs — describe categories "
    "and traits instead, and encourage the user to browse the matching category on TerraMart."
)

DESIGNER_SYSTEM = (
    "You are TerraDesign, an interior stylist for TerraMart (categories: tiles, wall-stencils, "
    "wall-stickers, wallpapers, paints, home-decor, flooring). Given a room brief, respond ONLY with valid JSON "
    "(no markdown, no backticks) matching this schema: "
    '{"summary": str, "palette": [str], "picks": [{"category": one of ["tiles","wall-stencils","wall-stickers","wallpapers","paints","home-decor","flooring"], '
    '"keyword": str, "why": str}]}. Provide 4-6 picks. Keyword should be a 1-3 word search term that would find matching products.'
)

DESCRIPTION_SYSTEM = (
    "You write crisp, high-converting Indian e-commerce product listings for a home-decor / building-materials "
    "marketplace. Respond ONLY with valid JSON (no markdown fences) matching: "
    '{"title": str (max 70 chars, catchy), "description": str (120-200 words, benefit-led, 3-5 sentences, no emojis), '
    '"bullets": [str] (5 short benefit bullets), "keywords": [str] (5 search keywords)}. '
    "Use neutral tone. Never invent certifications or brand claims."
)

SEARCH_SYSTEM = (
    "You convert shopper queries into TerraMart search filters. "
    'Respond ONLY with valid JSON: {"category": one of ["tiles","wall-stencils","wall-stickers","wallpapers","paints","home-decor","flooring","all"], '
    '"q": str (2-4 keyword search text), "min_price": number|null, "max_price": number|null, "material": str|null}. '
    "Infer INR budget when user mentions rupees or 'under X'. Use 'all' when unclear."
)


class ChatIn(BaseModel):
    session_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=2000)


class RoomBriefIn(BaseModel):
    room_type: str = Field(..., min_length=1, max_length=60)
    style: Optional[str] = Field(None, max_length=60)
    budget: Optional[int] = Field(None, ge=0)
    description: Optional[str] = Field(None, max_length=800)


class DescribeIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    category: str
    keywords: Optional[str] = Field(None, max_length=200)
    material: Optional[str] = Field(None, max_length=100)


class SearchIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)


def _strip_json_fences(text: str) -> str:
    t = text.strip()
    # remove ```json ... ``` fences if present
    m = re.search(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", t, re.S)
    if m:
        return m.group(1)
    # else find first {...} block
    m = re.search(r"\{.*\}", t, re.S)
    return m.group(0) if m else t


def _new_chat(session_id: str, system_message: str) -> LlmChat:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "AI service not configured")
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model(*AI_MODEL)


def build_ai_router(db, get_current_user, require_seller) -> APIRouter:
    router = APIRouter(prefix="/ai", tags=["ai"])

    async def _load_history(session_id: str) -> List[dict]:
        doc = await db.ai_sessions.find_one({"session_id": session_id}, {"_id": 0, "messages": 1})
        return (doc or {}).get("messages", [])

    async def _persist_turn(session_id: str, user_id: Optional[str], user_text: str, assistant_text: str):
        now = datetime.now(timezone.utc).isoformat()
        await db.ai_sessions.update_one(
            {"session_id": session_id},
            {
                "$setOnInsert": {"session_id": session_id, "user_id": user_id, "created_at": now},
                "$set": {"updated_at": now},
                "$push": {
                    "messages": {
                        "$each": [
                            {"role": "user", "content": user_text, "at": now},
                            {"role": "assistant", "content": assistant_text, "at": now},
                        ]
                    }
                },
            },
            upsert=True,
        )

    @router.post("/chat")
    async def ai_chat(body: ChatIn):
        session_id = body.session_id or f"chat-{uuid.uuid4().hex[:12]}"
        chat = _new_chat(session_id, BUYER_SYSTEM)
        # rehydrate prior turns so the model has context
        history = await _load_history(session_id)
        for m in history:
            if m.get("role") == "user":
                # feed history without streaming to rebuild context
                try:
                    await chat.send_message(UserMessage(text=m["content"]))
                except Exception as e:
                    logger.warning(f"history replay failed: {e}")
                    break

        async def event_generator():
            # emit session id first so client can save
            yield f"data: {json.dumps({'type':'session','session_id':session_id})}\n\n"
            collected: List[str] = []
            try:
                async for ev in chat.stream_message(UserMessage(text=body.message)):
                    if isinstance(ev, TextDelta):
                        collected.append(ev.content)
                        yield f"data: {json.dumps({'type':'delta','content':ev.content})}\n\n"
                    elif isinstance(ev, StreamDone):
                        break
            except Exception as e:
                logger.exception("ai_chat stream failed")
                yield f"data: {json.dumps({'type':'error','message':str(e)[:200]})}\n\n"
            final_text = "".join(collected)
            if final_text:
                try:
                    await _persist_turn(session_id, None, body.message, final_text)
                except Exception as e:
                    logger.warning(f"persist failed: {e}")
            yield f"data: {json.dumps({'type':'done'})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
        )

    @router.post("/design-room")
    async def ai_design_room(body: RoomBriefIn):
        session_id = f"design-{uuid.uuid4().hex[:12]}"
        chat = _new_chat(session_id, DESIGNER_SYSTEM)
        parts = [f"Room: {body.room_type}"]
        if body.style:
            parts.append(f"Style: {body.style}")
        if body.budget:
            parts.append(f"Budget: ₹{body.budget}")
        if body.description:
            parts.append(f"Notes: {body.description}")
        prompt = " | ".join(parts)
        try:
            raw = await chat.send_message(UserMessage(text=prompt))
        except Exception as e:
            logger.exception("design_room failed")
            raise HTTPException(502, f"AI unavailable: {str(e)[:120]}")
        try:
            plan = json.loads(_strip_json_fences(raw))
        except Exception:
            raise HTTPException(502, "AI returned malformed plan")

        picks = plan.get("picks", []) if isinstance(plan, dict) else []
        # attach real matching products from DB per pick (best-effort, first 3)
        enriched = []
        for pick in picks[:6]:
            cat = pick.get("category")
            kw = (pick.get("keyword") or "").strip()
            products = []
            if cat in CATEGORY_SLUGS:
                query = {"category": cat}
                if kw:
                    query["$or"] = [
                        {"title": {"$regex": re.escape(kw), "$options": "i"}},
                        {"description": {"$regex": re.escape(kw), "$options": "i"}},
                        {"material": {"$regex": re.escape(kw), "$options": "i"}},
                    ]
                docs = await db.products.find(query, {"_id": 0}).limit(3).to_list(3)
                if not docs and kw:
                    docs = await db.products.find({"category": cat}, {"_id": 0}).limit(3).to_list(3)
                products = docs
            enriched.append({**pick, "products": products})

        return {
            "summary": plan.get("summary", ""),
            "palette": plan.get("palette", []),
            "picks": enriched,
        }

    @router.post("/generate-description")
    async def ai_generate_description(body: DescribeIn, user: dict = Depends(require_seller)):
        session_id = f"describe-{uuid.uuid4().hex[:12]}"
        chat = _new_chat(session_id, DESCRIPTION_SYSTEM)
        prompt = (
            f"Category: {body.category}\n"
            f"Product title (rough): {body.title}\n"
            f"Material: {body.material or 'n/a'}\n"
            f"Extra keywords: {body.keywords or 'n/a'}"
        )
        try:
            raw = await chat.send_message(UserMessage(text=prompt))
        except Exception as e:
            logger.exception("generate_description failed")
            raise HTTPException(502, f"AI unavailable: {str(e)[:120]}")
        try:
            out = json.loads(_strip_json_fences(raw))
        except Exception:
            raise HTTPException(502, "AI returned malformed listing")
        return {
            "title": out.get("title", "").strip()[:120],
            "description": out.get("description", "").strip(),
            "bullets": [b for b in out.get("bullets", []) if isinstance(b, str)][:6],
            "keywords": [k for k in out.get("keywords", []) if isinstance(k, str)][:8],
        }

    @router.post("/search")
    async def ai_search(body: SearchIn):
        session_id = f"search-{uuid.uuid4().hex[:12]}"
        chat = _new_chat(session_id, SEARCH_SYSTEM)
        try:
            raw = await chat.send_message(UserMessage(text=body.query))
        except Exception as e:
            logger.exception("ai_search failed")
            raise HTTPException(502, f"AI unavailable: {str(e)[:120]}")
        try:
            out = json.loads(_strip_json_fences(raw))
        except Exception:
            raise HTTPException(502, "AI returned malformed filters")
        cat = out.get("category")
        if cat not in CATEGORY_SLUGS and cat != "all":
            cat = "all"
        return {
            "category": cat,
            "q": (out.get("q") or "").strip()[:80],
            "min_price": out.get("min_price"),
            "max_price": out.get("max_price"),
            "material": (out.get("material") or None),
        }

    return router
