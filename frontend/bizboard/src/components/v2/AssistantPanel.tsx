"use client";

import { Sparkles, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AssistantMessage {
  from: "assistant" | "user";
  text: string;
}

interface Props {
  title?: string;
  messages?: AssistantMessage[];
  placeholder?: string;
  className?: string;
  /** Salt görsel motif (input devre dışı) — referans/showcase için. */
  preview?: boolean;
}

const DEFAULT_MESSAGES: AssistantMessage[] = [
  {
    from: "assistant",
    text: "Bu ay net kar gecen aya gore %12 arti. POS kar payi en cok katki sagladi.",
  },
];

/**
 * UI v2 — Daxa AI-asistan paneli motifi.
 *
 * <p>Avatar + mesaj balonları + input satırı. `preview` modunda salt görsel
 * (showcase). Gerçek AI bağlanışı ileride (mevcut /dashboard/ai ile). Çift
 * tema, accent (lime) vurgu.</p>
 */
export function AssistantPanel({
  title = "Çatı Asistan",
  messages = DEFAULT_MESSAGES,
  placeholder = "Bir soru sor…",
  className,
  preview = true,
}: Props) {
  return (
    <div className={cn("v2-card p-5 sm:p-6 flex flex-col h-full", className)}>
      <div className="flex items-center gap-3 mb-4">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-accent to-accent-bright text-[rgb(var(--accent-ink))]">
          <Sparkles size={20} />
        </span>
        <div>
          <p className="font-bold text-[rgb(var(--v2-ink))]">{title}</p>
          <p className="text-xs text-accent-strong dark:text-accent font-medium">
            Çevrimiçi
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm",
              m.from === "assistant"
                ? "v2-sunken rounded-tl-sm text-[rgb(var(--body-text))]"
                : "ml-auto bg-[rgb(var(--v2-ink))] text-[rgb(var(--v2-card))] rounded-tr-sm"
            )}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          placeholder={placeholder}
          disabled={preview}
          aria-label={placeholder}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm v2-sunken text-[rgb(var(--body-text))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          disabled={preview}
          aria-label="Gönder"
          className="v2-btn v2-btn--accent v2-press !px-3 !py-2.5"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
