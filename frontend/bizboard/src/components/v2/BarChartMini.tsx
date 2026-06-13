"use client";

import { cn } from "@/lib/utils";

export interface Bar {
  value: number;
  label?: string;
  /** Bu barı accent (yeşil) ile vurgula. */
  highlight?: boolean;
}

interface Props {
  bars: Bar[];
  /** Yükseklik px. Varsayılan 120. */
  height?: number;
  className?: string;
  /** X ekseni etiketleri göster. */
  showLabels?: boolean;
  animate?: boolean;
}

/**
 * UI v2 — Daxa ince bar-chart.
 *
 * <p>Nötr (gri) barlar + işaretli barlar accent (lime). En yüksek değere göre
 * normalize. CSS flex/div tabanlı (SVG'siz, hafif). Büyüme animasyonu
 * stagger ile (reduced-motion saygılı — CSS .v2-grow).</p>
 */
export function BarChartMini({
  bars,
  height = 120,
  className,
  showLabels = false,
  animate = true,
}: Props) {
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));

  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex items-end gap-1.5 sm:gap-2"
        style={{ height }}
        role="img"
        aria-hidden="true"
      >
        {bars.map((b, i) => {
          const h = (Math.abs(b.value) / max) * 100;
          return (
            <div key={i} className="flex-1 flex items-end h-full">
              <div
                className={cn(
                  "w-full rounded-t-md",
                  b.highlight
                    ? "bg-gradient-to-t from-accent to-accent-bright"
                    : "bg-[rgb(var(--v2-muted))]/25"
                )}
                style={{
                  height: `${Math.max(4, h)}%`,
                  ...(animate
                    ? {
                        animation:
                          "v2Grow 0.7s cubic-bezier(0.2,0.7,0.2,1) both",
                        animationDelay: `${i * 50}ms`,
                        transformOrigin: "bottom",
                      }
                    : {}),
                }}
                title={b.label}
              />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="flex gap-1.5 sm:gap-2 mt-2">
          {bars.map((b, i) => (
            <span
              key={i}
              className="flex-1 text-center text-[10px] text-[rgb(var(--v2-muted))] truncate"
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
