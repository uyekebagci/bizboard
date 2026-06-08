"use client";

/**
 * Modern UI Redesign / PR-0: Mini bar grafiği (KPI sparkline) — SALT SUNUM.
 *
 * <p>Mockup'taki KPI bar dizisinin React hali. heights (0..100 yükseklik %)
 * prop alır; hesaplama yapmaz. Giriş animasyonu .chart-bar ile.</p>
 */

interface Props {
  /** Her barın yüksekliği (0..100). */
  heights: number[];
  /** Bar dolgu rengi (Tailwind class, örn. "bg-emerald-500/40"). */
  barClass?: string;
  className?: string;
}

export function MiniBars({ heights, barClass = "bg-emerald-500/40", className = "mt-3 h-8" }: Props) {
  return (
    <div className={`flex items-end gap-1 ${className}`} aria-hidden="true">
      {heights.map((h, i) => (
        <div
          key={i}
          className={`chart-bar flex-1 rounded-sm ${barClass}`}
          style={{ height: `${Math.max(0, Math.min(100, h))}%`, animationDelay: `${i * 0.05}s` }}
        />
      ))}
    </div>
  );
}
