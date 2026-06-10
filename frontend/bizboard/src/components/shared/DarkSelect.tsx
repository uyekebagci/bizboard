"use client";

/**
 * v1.7.x: Modern dark theme dropdown — native <select> yerine custom popover.
 *
 * <h3>Özellikler</h3>
 * <ul>
 *   <li>Tailwind dark theme — surface palet'ine uyumlu</li>
 *   <li>Açılış animasyonu: cubic-bezier(0.16,1,0.3,1) 180ms slide-down + fade</li>
 *   <li>Opsiyonel <code>addOption</code> — listenin EN ÜSTÜNDE sticky, vurgulu
 *       (yeşil/brand border). Tıklanınca <code>onClick</code> tetiklenir,
 *       dropdown kapanır, value değişmez.</li>
 *   <li>Klavye: ↑↓ ile navigate, Enter seç, Esc kapat. Trigger Space/Enter ile
 *       aç-kapa.</li>
 *   <li>Click-outside ile kapan</li>
 *   <li>Aksesibilite: combobox role, aria-expanded, aria-activedescendant</li>
 *   <li>Opsiyonel <code>searchable</code> — başlık altında arama input'u</li>
 * </ul>
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DarkSelectOption {
  value: string;
  label: string;
  /** Sağda küçük puntoyla görünen ikincil etiket (örn. bakiye, vergi no). */
  meta?: string;
  disabled?: boolean;
}

export interface DarkSelectAddOption {
  /** Buton metni, örn. "+ Yeni Firma Ekle". */
  label: string;
  onClick: () => void;
  /** İkon override; default Plus. */
  icon?: React.ReactNode;
}

export interface DarkSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Form kontrolü için — visual zorunluluk işaretleyici parent label'ında. */
  required?: boolean;
  /** Sticky-top vurgulu opsiyon — örn. "+ Yeni Banka Hesabı Ekle". */
  addOption?: DarkSelectAddOption;
  /** Search input içeren mod — 5'ten fazla seçenek varken faydalı. */
  searchable?: boolean;
  /** Custom CSS class (genelde w-full default). */
  className?: string;
  /** ARIA label — visible label yoksa zorunlu. */
  "aria-label"?: string;
  /** Form'da <input> ile birlikte kullanmak için form id. */
  id?: string;
}

export function DarkSelect({
  value,
  onChange,
  options,
  placeholder = "Seçin",
  disabled = false,
  required = false,
  addOption,
  searchable = false,
  className,
  "aria-label": ariaLabel,
  id,
}: DarkSelectProps) {
  const rootId = useId();
  const listboxId = id ? `${id}-listbox` : `${rootId}-listbox`;

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1); // -1 = none, 0..n-1 options
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLocaleLowerCase("tr");
    return options.filter((o) => {
      const lab = (o.label || "").toLocaleLowerCase("tr");
      const meta = (o.meta || "").toLocaleLowerCase("tr");
      return lab.includes(q) || meta.includes(q);
    });
  }, [options, searchable, query]);

  // Click outside / Esc
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Initial highlight: search input açıksa hep -1 (typing focused), aksi takdirde
  // şu anki value indexi (yoksa addOption varsa o, yoksa ilk option)
  useEffect(() => {
    if (!open) return;
    if (searchable) {
      setHighlight(-1);
      setTimeout(() => searchRef.current?.focus(), 30);
      return;
    }
    const idx = filtered.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlight(idx + (addOption ? 1 : 0));
    else setHighlight(addOption ? 0 : 0);
  }, [open, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

  // Total navigable items = (addOption ? 1 : 0) + filtered.length
  const navTotal = (addOption ? 1 : 0) + filtered.length;

  function moveHighlight(dir: 1 | -1) {
    if (navTotal === 0) return;
    setHighlight((h) => {
      const next = h + dir;
      if (next < 0) return navTotal - 1;
      if (next >= navTotal) return 0;
      return next;
    });
  }

  function pickHighlighted() {
    if (highlight < 0) return;
    if (addOption && highlight === 0) {
      setOpen(false);
      addOption.onClick();
      return;
    }
    const optIdx = addOption ? highlight - 1 : highlight;
    const opt = filtered[optIdx];
    if (opt && !opt.disabled) {
      onChange(opt.value);
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    }
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (e.key === "Enter") pickHighlighted();
      else moveHighlight(e.key === "ArrowDown" ? 1 : -1);
    }
  }

  function onListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickHighlighted();
    }
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className={cn(
          "w-full px-3 py-2.5 rounded-xl border bg-surface-800 text-sm text-left",
          "flex items-center justify-between gap-2 transition-colors",
          "focus:outline-none focus:ring-1 focus:ring-brand-500",
          disabled
            ? "border-surface-700 text-surface-500 cursor-not-allowed opacity-60"
            : open
              ? "border-brand-500/60 text-surface-100"
              : "border-surface-600 text-surface-100 hover:border-surface-500",
        )}
      >
        <span className={cn("truncate flex-1", !selected && "text-surface-400")}>
          {selected ? (
            <span className="inline-flex items-center gap-2">
              <span className="truncate">{selected.label}</span>
              {selected.meta && (
                <span className="text-[11px] text-surface-400 truncate">· {selected.meta}</span>
              )}
            </span>
          ) : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-surface-400 transition-transform duration-200",
            open && "rotate-180 text-brand-400",
          )}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          onKeyDown={onListKey}
          className={cn(
            "absolute z-50 left-0 right-0 mt-1 origin-top",
            "rounded-xl border border-surface-600 bg-surface-800 shadow-2xl",
            "ring-1 ring-brand-500/20",
            "ds-popover-enter",
          )}
          // Inline animation
          style={{
            animation: "ds-pop-in 180ms cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {searchable && (
            <div className="p-2 border-b border-surface-700 sticky top-0 bg-surface-800 rounded-t-xl">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setHighlight(addOption ? 0 : 0); }}
                  placeholder="Ara…"
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-surface-700/50 border border-surface-600 text-xs text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          )}

          {/* Sticky add option en üstte */}
          {addOption && (
            <button
              type="button"
              onMouseEnter={() => setHighlight(0)}
              onClick={() => {
                setOpen(false);
                addOption.onClick();
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 text-sm font-medium inline-flex items-center gap-2",
                "border-b border-surface-700",
                "transition-colors",
                "bg-gradient-to-r from-emerald-500/10 to-brand-500/10",
                highlight === 0
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "text-emerald-300 hover:bg-emerald-500/15",
              )}
            >
              <span className="w-5 h-5 rounded-full bg-emerald-500/30 inline-flex items-center justify-center shrink-0">
                {addOption.icon ?? <Plus size={12} className="text-emerald-200" />}
              </span>
              <span className="truncate">{addOption.label}</span>
            </button>
          )}

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-activedescendant={
              highlight >= (addOption ? 1 : 0)
                ? `${rootId}-opt-${highlight - (addOption ? 1 : 0)}`
                : undefined
            }
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-xs text-surface-400 text-center">
                {query ? "Eşleşen sonuç yok" : "Liste boş"}
              </li>
            )}
            {filtered.map((o, i) => {
              const navIdx = i + (addOption ? 1 : 0);
              const isSelected = o.value === value;
              const isHigh = highlight === navIdx;
              return (
                <li key={o.value} role="option" id={`${rootId}-opt-${i}`} aria-selected={isSelected}>
                  <button
                    type="button"
                    disabled={o.disabled}
                    onMouseEnter={() => setHighlight(navIdx)}
                    onClick={() => {
                      if (o.disabled) return;
                      onChange(o.value);
                      setOpen(false);
                      setQuery("");
                      triggerRef.current?.focus();
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm inline-flex items-center justify-between gap-2 transition-colors",
                      o.disabled && "opacity-50 cursor-not-allowed",
                      isHigh && !o.disabled
                        ? "bg-brand-500/15 text-brand-200"
                        : isSelected
                          ? "text-surface-100 bg-surface-700/40"
                          : "text-surface-200 hover:bg-surface-700/40",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {o.label}
                      {o.meta && (
                        <span className="ml-2 text-[11px] text-surface-400">· {o.meta}</span>
                      )}
                    </span>
                    {isSelected && <Check size={14} className="shrink-0 text-brand-300" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Anim keyframes — global stylesheet'e basıyoruz */}
      <style jsx global>{`
        @keyframes ds-pop-in {
          0%   { opacity: 0; transform: translateY(-6px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
