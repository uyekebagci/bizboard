"use client";

/**
 * UX-10 — Kart / Tablo görünüm değiştirici (segment kontrol).
 *
 * Daxa v2 segment deseni (sunken zemin + accent aktif). Yoğun "Excel-vari"
 * tablo görünümü için liste sayfalarına eklenir. Tercih `useViewMode` ile kalıcı.
 */

import { LayoutGrid, Table2 } from "lucide-react";
import type { ViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";

export function ViewModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  className?: string;
}) {
  const items: { value: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { value: "card", label: "Kart", icon: LayoutGrid },
    { value: "table", label: "Tablo", icon: Table2 },
  ];
  return (
    <div
      role="group"
      aria-label="Görünüm modu"
      className={cn("flex items-center gap-1 v2-sunken p-1 rounded-xl", className)}
    >
      {items.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          aria-label={`${label} görünümü`}
          title={`${label} görünümü`}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            mode === value
              ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
              : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
          )}
        >
          <Icon size={14} aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export default ViewModeToggle;
