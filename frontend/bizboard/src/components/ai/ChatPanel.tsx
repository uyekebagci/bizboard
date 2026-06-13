"use client";

/**
 * AI modülü (v1.1): RAG sohbet paneli (yeniden-kullanılabilir).
 *
 * Glass desenleri + çift tema (surface token'ları otomatik dark/light) uyumlu.
 * Mesajları yerel tutar; her gönderimde {@code aiApi.chat} çağrılır. Backend
 * graceful olduğundan AI kapalıyken kibar bir cevap gösterilir.
 */

import { useEffect, useRef, useState } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { aiApi } from "@/lib/api/ai";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** assistant mesajları için: cevap gerçekten AI'dan mı geldi (graceful flag). */
  aiUsed?: boolean;
  contextCount?: number;
}

interface ChatPanelProps {
  businessId: string;
  /** Üstte gösterilecek işletme adı (bağlam ipucu). */
  businessName?: string;
}

const SUGGESTIONS = [
  "Param nerede?",
  "Kâr-zarar durumum nedir?",
  "Geçen aya göre giderim neden arttı?",
  "En büyük gider kategorim hangisi?",
];

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPanel({ businessId, businessName }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // İşletme değişince sohbeti sıfırla (cross-tenant karışma olmasın).
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [businessId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;

    const userMsg: ChatMessage = { id: makeId(), role: "user", content: q };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await aiApi.chat(businessId, q);
      setMessages((m) => [
        ...m,
        {
          id: makeId(),
          role: "assistant",
          content: res.answer,
          aiUsed: res.ai_used,
          contextCount: res.context_count,
        },
      ]);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Beklenmeyen bir hata oluştu.";
      setMessages((m) => [
        ...m,
        { id: makeId(), role: "assistant", content: `Hata: ${msg}`, aiUsed: false },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="v2-card flex flex-col h-[70vh] min-h-[480px] overflow-hidden rounded-2xl">
      {/* Başlık */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgb(var(--v2-border))]">
        <div className="w-8 h-8 rounded-xl bg-[rgb(var(--v2-sunken))] flex items-center justify-center text-brand">
          <Bot size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[rgb(var(--v2-ink))] truncate">AI Asistan</p>
          {businessName && (
            <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate">{businessName}</p>
          )}
        </div>
      </div>

      {/* Mesaj akışı */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="text-center py-8">
            <Bot size={32} className="mx-auto mb-3 text-[rgb(var(--v2-muted))]" />
            <p className="text-[rgb(var(--v2-muted))] text-sm mb-4">
              İşletmenizin finansal verisi hakkında soru sorun.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] border border-[rgb(var(--v2-border))] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}
          >
            {m.role === "assistant" && (
              <div className="w-7 h-7 shrink-0 rounded-lg bg-[rgb(var(--v2-sunken))] flex items-center justify-center text-brand">
                <Bot size={15} />
              </div>
            )}
            <div
              className={cn(
                "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
                m.role === "user"
                  ? "bg-brand text-white rounded-br-sm"
                  : "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] rounded-bl-sm border border-[rgb(var(--v2-border))]"
              )}
            >
              {m.content}
              {m.role === "assistant" && m.aiUsed === false && (
                <p className="mt-1 text-[10px] text-[rgb(var(--v2-muted))] italic">
                  (AI kullanılamadı)
                </p>
              )}
            </div>
            {m.role === "user" && (
              <div className="w-7 h-7 shrink-0 rounded-lg bg-[rgb(var(--v2-sunken))] flex items-center justify-center text-[rgb(var(--v2-muted))]">
                <User size={15} />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 shrink-0 rounded-lg bg-[rgb(var(--v2-sunken))] flex items-center justify-center text-brand">
              <Bot size={15} />
            </div>
            <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-[rgb(var(--v2-sunken))] border border-[rgb(var(--v2-border))]">
              <Loader2 size={16} className="animate-spin text-surface-400" />
            </div>
          </div>
        )}
      </div>

      {/* Giriş */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 px-3 py-3 border-t border-[rgb(var(--v2-border))]"
      >
        <input
          className="input flex-1"
          placeholder="Sorunuzu yazın..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          className="btn-primary !px-3.5 shrink-0"
          disabled={sending || !input.trim()}
          aria-label="Gönder"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
