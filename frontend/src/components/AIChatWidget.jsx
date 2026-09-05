import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles, Loader2 } from "lucide-react";
import { useLocation, Link } from "react-router-dom";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STORAGE_KEY = "terramart_ai_session";

const HIDE_ON = ["/admin", "/seller", "/login", "/signup", "/checkout"];

export default function AIChatWidget() {
  const { pathname } = useLocation();
  const shouldHide = HIDE_ON.some((p) => pathname.startsWith(p));

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Hi! I'm TerraBot. Tell me about your project — a room, a mood, a category — and I'll help you find the right tiles, paints, wallpaper, or decor." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ session_id: sessionId, message: text }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error("AI unavailable");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // read stream and parse SSE lines
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const raw of parts) {
          const line = raw.trim().replace(/^data:\s*/, "");
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === "session" && ev.session_id) {
              setSessionId(ev.session_id);
              localStorage.setItem(STORAGE_KEY, ev.session_id);
            } else if (ev.type === "delta") {
              setMsgs((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + ev.content };
                return copy;
              });
            } else if (ev.type === "error") {
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: `Sorry, something went wrong: ${ev.message}` };
                return copy;
              });
            }
          } catch { /* ignore malformed line */ }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setMsgs((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: "Sorry, I couldn't reach the AI right now. Please try again in a moment." };
          return copy;
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const resetSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSessionId(null);
    setMsgs([{ role: "assistant", content: "Fresh start — what are we planning today?" }]);
  };

  if (shouldHide) return null;

  return (
    <>
      {!open && (
        <button
          data-testid="ai-chat-open"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 bg-terracotta text-off-white px-4 py-3 rounded-full shadow-lg hover:bg-terracotta-hover transition-colors"
          aria-label="Open AI assistant"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden md:inline text-sm font-semibold">Ask TerraBot</span>
        </button>
      )}
      {open && (
        <div data-testid="ai-chat-panel" className="fixed inset-x-2 bottom-2 md:inset-auto md:bottom-6 md:right-6 md:w-[380px] z-50 bg-white border-2 border-charcoal shadow-2xl flex flex-col" style={{ maxHeight: "78vh" }}>
          <div className="flex items-center justify-between px-4 py-3 bg-charcoal text-off-white">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 grid place-items-center bg-terracotta rounded-full"><Sparkles className="w-4 h-4" /></span>
              <div className="leading-tight">
                <div className="font-heading font-bold text-sm">TerraBot</div>
                <div className="text-[10px] uppercase tracking-widest text-off-white/60">AI concierge</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button data-testid="ai-chat-reset" onClick={resetSession} className="text-[10px] uppercase tracking-widest text-off-white/70 hover:text-off-white px-2">New</button>
              <button data-testid="ai-chat-close" onClick={() => setOpen(false)} className="p-1 hover:bg-white/10" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-off-white" style={{ minHeight: "300px" }} data-testid="ai-chat-messages">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-terracotta text-off-white" : "bg-white border border-border text-charcoal"}`}>
                  {m.content || (busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : null)}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-2 bg-white">
            <div className="flex items-center gap-2 text-[11px] text-charcoal-muted px-1 pb-1">
              <Link to="/ai-designer" onClick={() => setOpen(false)} className="text-terracotta hover:underline font-semibold">Try Design My Room →</Link>
            </div>
            <div className="flex gap-2">
              <textarea
                data-testid="ai-chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="e.g. matte tiles for a small bathroom under ₹1000…"
                className="flex-1 resize-none border-2 border-border focus:border-terracotta px-3 py-2 text-sm outline-none"
              />
              <button
                data-testid="ai-chat-send"
                onClick={send}
                disabled={busy || !input.trim()}
                className="bg-terracotta text-off-white px-3 grid place-items-center hover:bg-terracotta-hover disabled:opacity-50"
                aria-label="Send"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
