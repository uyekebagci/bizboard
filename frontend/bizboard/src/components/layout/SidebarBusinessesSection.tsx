"use client";

/**
 * Sidebar'ın "İşletmeler" collapsible bölümü + pin (localStorage).
 * Sidebar.tsx'ten ayrıldı (500 satır sınırı). İşlevsellik birebir korundu:
 * pin/üste-taşıma, açık/kapalı persist, "Yeni İşletme" kısayolu.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, Pin, Plus } from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import { cn } from "@/lib/utils";

const PIN_STORAGE_KEY = "bb_pinned_businesses_v1";

function loadPins(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePins(pins: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
  } catch {
    /* ignore quota */
  }
}

export function SidebarBusinessesSection({
  currentPath,
  onItemClick,
}: {
  currentPath: string;
  onItemClick: () => void;
}) {
  const { businesses } = useBusinesses();
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("bb_sidebar_biz_open") !== "false";
  });
  const [pins, setPins] = useState<Record<string, number>>({});

  useEffect(() => {
    setPins(loadPins());
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("bb_sidebar_biz_open", next ? "true" : "false");
    }
  }

  function togglePin(id: string) {
    setPins((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = Date.now();
      }
      savePins(next);
      return next;
    });
  }

  const sorted = useMemo(() => {
    const collator = new Intl.Collator("tr", { sensitivity: "base" });
    const items = [...(businesses || [])];
    items.sort((a, b) => {
      const ap = pins[a.id];
      const bp = pins[b.id];
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      if (ap && bp) return ap - bp; // ilk pinlenen üstte
      return collator.compare(a.name, b.name);
    });
    return items;
  }, [businesses, pins]);

  if (!businesses || businesses.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-[.14em] text-surface-400 hover:text-white"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1 text-left">İşletmeler</span>
        <span className="text-surface-500 normal-case tracking-normal text-[10px]">
          {sorted.length}
        </span>
      </button>
      {open && (
        <ul className="space-y-0.5 mt-1">
          {sorted.map((b) => {
            const active = currentPath === `/business/${b.id}`;
            const pinned = !!pins[b.id];
            return (
              <li key={b.id} className="relative flex items-stretch">
                <Link
                  href={`/business/${b.id}`}
                  onClick={onItemClick}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-1.5 rounded-l-lg text-sm transition-colors flex-1 min-w-0",
                    active
                      ? "bg-brand-700/30 text-white"
                      : "text-surface-300 hover:bg-surface-800 hover:text-white",
                    pinned && "border-l-2 border-brand-500 -ml-[2px] pl-[10px]"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Building2 size={14} className={active ? "text-brand-300" : "text-surface-400"} />
                  <span className="flex-1 truncate text-[13px]">{b.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(b.id); }}
                  className={cn(
                    "shrink-0 px-2 rounded-r-lg flex items-center justify-center transition-colors",
                    pinned
                      ? "text-brand-400 hover:text-brand-300 hover:bg-surface-700"
                      : "text-surface-500 hover:text-white hover:bg-surface-700"
                  )}
                  aria-label={pinned ? "Unpin" : "Pin"}
                  title={pinned ? "Sabitlemeyi kaldır" : "Sabitle (üste taşı)"}
                >
                  {pinned ? <Pin size={12} fill="currentColor" /> : <Pin size={12} />}
                </button>
              </li>
            );
          })}
          <li className="mt-1 pt-1 border-t border-surface-700/50">
            <Link
              href="/dashboard/add"
              onClick={onItemClick}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-brand-300 hover:bg-brand-700/20 hover:text-brand-200 transition-colors"
            >
              <Plus size={14} />
              <span className="flex-1 truncate text-[13px]">Yeni İşletme</span>
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
