"use client";

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Insight {
  icon?: LucideIcon;
  title: string;
  detail?: string;
  /** Sağda değer (ör. tutar / sayı). */
  value?: string;
  tone?: "accent" | "positive" | "negative" | "neutral";
  /**
   * Tıklanınca gidilecek detay/filtreli sayfa (deep-link). Verilince satır
   * tıklanabilir olur (hover-cue + chevron + a11y). {@link onClick} ile
   * birlikte verilirse href öncelikli.
   */
  href?: string;
  /** Tıklanınca detay modalı açma vb. (href yoksa). */
  onClick?: () => void;
}

interface Props {
  title: string;
  insights: Insight[];
  className?: string;
}

const toneText: Record<NonNullable<Insight["tone"]>, string> = {
  accent: "text-accent-strong dark:text-accent",
  positive: "text-status-success",
  negative: "text-status-danger",
  neutral: "text-[rgb(var(--v2-muted))]",
};

/**
 * UI v2 — Daxa katmanlı (stack) insight kartı.
 *
 * <p>`.v2-stack` ile arkada peek eden iki katman → derinlik efekti. İçinde
 * insight satırları (ikon + başlık + detay + değer). Hover'da üst katman
 * hafif kayar (reduced-motion saygılı — CSS).</p>
 *
 * <p>Satır {@link Insight.href}/{@link Insight.onClick} ile tıklanabilir olur:
 * ilgili detay/filtreli görünüme deep-link veya detay modalı. Tıklanabilir
 * satırda hover-cue (yüzey vurgusu) + chevron + tam a11y eklenir.</p>
 */
export function StackInsightCard({ title, insights, className }: Props) {
  return (
    <div className={cn("v2-stack", className)}>
      <div className="v2-card v2-lift p-5 sm:p-6">
        <h3 className="v2-display text-lg sm:text-xl mb-4">{title}</h3>
        <ul className="space-y-1">
          {insights.map((it, i) => {
            const Icon = it.icon;
            const interactive = (typeof it.href === "string" && it.href.length > 0) ||
              typeof it.onClick === "function";

            const rowInner = (
              <>
                {Icon && (
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 bg-accent/12 text-accent-strong dark:text-accent">
                    <Icon size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[rgb(var(--v2-ink))] truncate">
                    {it.title}
                  </p>
                  {it.detail && (
                    <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">
                      {it.detail}
                    </p>
                  )}
                </div>
                {it.value && (
                  <span
                    className={cn(
                      "text-sm font-bold shrink-0 num",
                      toneText[it.tone ?? "neutral"]
                    )}
                  >
                    {it.value}
                  </span>
                )}
                {interactive && (
                  <ChevronRight
                    size={15}
                    className="shrink-0 text-[rgb(var(--v2-muted))]"
                    aria-hidden
                  />
                )}
              </>
            );

            const rowClass = cn(
              "flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl",
              interactive &&
                "transition-colors hover:bg-[rgb(var(--v2-sunken))] cursor-pointer no-underline focus-visible:outline-none focus-visible:bg-[rgb(var(--v2-sunken))]"
            );

            if (it.href) {
              return (
                <li key={i}>
                  <Link href={it.href} className={rowClass}>
                    {rowInner}
                  </Link>
                </li>
              );
            }
            if (it.onClick) {
              return (
                <li key={i}>
                  <button type="button" onClick={it.onClick} className={cn(rowClass, "w-full text-left")}>
                    {rowInner}
                  </button>
                </li>
              );
            }
            return (
              <li key={i} className={rowClass}>
                {rowInner}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
