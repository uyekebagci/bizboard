"use client";

/**
 * v2.2.0 — Üst bar global arama kutusu (spec §10.1, §10.5).
 *
 * - `/` kısayolu input'a focus (global).
 * - Debounced (200ms) autocomplete dropdown; type'a göre gruplu.
 * - `↑ ↓` gezinme, `Enter` aç, `Esc` kapat.
 * - "Tüm sonuçlar" → /dashboard/search?q=...
 *
 * Çift tema: glass-card / popover-surface / surface-* token'ları (dark+light).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import {
  searchApi,
  ENTITY_LABELS,
  type Suggestion,
} from "@/lib/api/search";

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

export function GlobalSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  // `/` global shortcut → focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Dışarı tıklanınca dropdown kapan.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const res = await searchApi.suggest(q, 10);
      if (seq === reqSeq.current) {
        setSuggestions(res);
        setActiveIdx(-1);
      }
    } catch {
      if (seq === reqSeq.current) setSuggestions([]);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, []);

  function onChange(value: string) {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(value.trim()), DEBOUNCE_MS);
  }

  function goToResults() {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/dashboard/search?q=${encodeURIComponent(query.trim())}`);
  }

  function goTo(s: Suggestion) {
    setOpen(false);
    setQuery("");
    router.push(s.url);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        goTo(suggestions[activeIdx]);
      } else {
        goToResults();
      }
    }
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Ara... (/)"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Global arama"
          className="field !pl-9 !pr-3 !py-2 w-full text-sm"
        />
        {loading && (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 animate-spin"
          />
        )}
      </div>

      {open && query.trim().length >= MIN_CHARS && (
        <div className="popover-surface absolute right-0 mt-2 w-full md:w-[28rem] !rounded-xl py-1.5 animate-fade-in z-50 max-h-[70vh] overflow-y-auto">
          {suggestions.length === 0 && !loading ? (
            <p className="px-4 py-3 text-sm text-surface-400">Sonuç bulunamadı.</p>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={`${s.type}-${s.id}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => goTo(s)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                  i === activeIdx ? "bg-surface-700/50" : "hover:bg-surface-700/30"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-400 shrink-0 w-20">
                  {ENTITY_LABELS[s.type] ?? s.type}
                </span>
                <span className="text-sm text-surface-100 truncate flex-1">
                  {s.label}
                </span>
                {s.businessName && (
                  <span className="text-[11px] text-surface-500 truncate max-w-[8rem]">
                    {s.businessName}
                  </span>
                )}
              </button>
            ))
          )}
          <button
            onClick={goToResults}
            className="w-full mt-1 px-4 py-2 text-sm font-medium text-brand-400 hover:bg-surface-700/30 border-t border-surface-700/60 text-left transition-colors"
          >
            Tüm sonuçlar →
          </button>
        </div>
      )}
    </div>
  );
}
