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
        className="w-full flex items-center gap-2 px-3 py-1.5 v2-eyebrow hover:text-[rgb(var(--v2-ink))] transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1 text-left">İşletmeler</span>
        <span className="normal-case tracking-normal text-[10px] font-semibold px-1.5 py-0.5 rounded-md v2-sunken text-[rgb(var(--v2-muted))]">
          {sorted.length}
        </span>
      </button>
      {open && (
        <ul className="space-y-0.5 mt-1">
          {sorted.map((b) => {
            const active = currentPath === `/business/${b.id}`;
            const pinned = !!pins[b.id];
            return (
              <li key={b.id} className={cn("v2-nav-item group relative flex items-stretch", active && "v2-nav-active")}>
                <span
                  className="v2-nav-rail absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full"
                  aria-hidden="true"
                />
                <Link
                  href={`/business/${b.id}`}
                  onClick={onItemClick}
                  className={cn(
                    "v2-nav-link flex items-center gap-2.5 px-3 py-2 rounded-l-xl text-sm transition-colors flex-1 min-w-0",
                    !active && "v2-nav-hover",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Building2 size={15} className={cn("shrink-0", active ? "text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent))]" : "text-[rgb(var(--v2-muted))]")} />
                  <span className="flex-1 truncate text-[13px]">{b.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(b.id); }}
                  className={cn(
                    "shrink-0 px-2 rounded-r-xl flex items-center justify-center transition-all",
                    pinned
                      ? "text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent))]"
                      : "text-[rgb(var(--v2-muted))] opacity-0 group-hover:opacity-100 hover:text-[rgb(var(--v2-ink))]",
                  )}
                  aria-label={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
                  title={pinned ? "Sabitlemeyi kaldır" : "Sabitle (üste taşı)"}
                >
                  {pinned ? <Pin size={12} fill="currentColor" /> : <Pin size={12} />}
                </button>
              </li>
            );
          })}
          <li className="mt-1.5 pt-1.5 v2-sidebar-divider border-t-0 border-b">
            <Link
              href="/dashboard/add"
              onClick={onItemClick}
              className="flex items-center gap-2.5 px-3 py-2 mt-1.5 rounded-xl text-sm font-medium text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent))] border border-[rgb(var(--accent)/0.3)] bg-[rgb(var(--accent)/0.08)] hover:bg-[rgb(var(--accent)/0.16)] hover:border-[rgb(var(--accent)/0.5)] transition-colors"
            >
              <span className="w-5 h-5 rounded-full bg-[rgb(var(--accent)/0.2)] inline-flex items-center justify-center shrink-0">
                <Plus size={12} />
              </span>
              <span className="flex-1 truncate text-[13px]">Yeni İşletme</span>
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
