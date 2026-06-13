"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Insight {
  icon?: LucideIcon;
  title: string;
  detail?: string;
  /** Sağda değer (ör. tutar / sayı). */
  value?: string;
  tone?: "accent" | "positive" | "negative" | "neutral";
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
 */
export function StackInsightCard({ title, insights, className }: Props) {
  return (
    <div className={cn("v2-stack", className)}>
      <div className="v2-card v2-lift p-5 sm:p-6">
        <h3 className="v2-display text-lg sm:text-xl mb-4">{title}</h3>
        <ul className="space-y-3">
          {insights.map((it, i) => {
            const Icon = it.icon;
            return (
              <li key={i} className="flex items-start gap-3">
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
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
