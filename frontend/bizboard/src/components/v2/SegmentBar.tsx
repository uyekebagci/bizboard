"use client";

import { cn } from "@/lib/utils";

export interface Segment {
  /** Oransal değer (genlik). Toplama göre normalize edilir. */
  value: number;
  /** Renk tonu — accent (lime) / ink (siyah) / muted (gri) / pozitif / negatif. */
  tone?: "accent" | "ink" | "muted" | "positive" | "negative";
  label?: string;
}

interface Props {
  segments: Segment[];
  className?: string;
  /** Giriş animasyonu (büyüme). Varsayılan true. */
  animate?: boolean;
}

const toneClass: Record<NonNullable<Segment["tone"]>, string> = {
  accent: "bg-accent",
  ink: "bg-[rgb(var(--v2-ink))]",
  muted: "bg-[rgb(var(--v2-muted))]/40",
  positive: "bg-status-success",
  negative: "bg-status-danger",
};

/**
 * UI v2 — Daxa kart-altı segmentli mini-bar.
 *
 * <p>Birden çok segmenti yatay tek şeritte oransal gösterir (yeşil/siyah/gri).
 * Metrik kartlarının altında dağılım/ilerleme özeti için. Animate=true ile
 * sahneye yumuşak girer (reduced-motion saygılı — CSS).</p>
 */
export function SegmentBar({ segments, className, animate = true }: Props) {
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0) || 1;

  return (
    <div className={cn("v2-segbar", className)} role="img" aria-hidden="true">
      {segments.map((seg, i) => {
        const pct = (Math.max(0, seg.value) / total) * 100;
        if (pct <= 0) return null;
        return (
          <span
            key={i}
            className={cn(
              "block h-full first:rounded-l-full last:rounded-r-full",
              toneClass[seg.tone ?? "muted"],
              animate && "origin-left"
            )}
            style={{
              width: `${pct}%`,
              ...(animate
                ? {
                    animation: "v2Grow 0.7s cubic-bezier(0.2,0.7,0.2,1) both",
                    animationDelay: `${i * 80}ms`,
                    transformOrigin: "left",
                  }
                : {}),
            }}
            title={seg.label}
          />
        );
      })}
    </div>
  );
}
