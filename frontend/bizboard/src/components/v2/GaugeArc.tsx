"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** İlerleme 0..1 (0..100% için 0.0..1.0). */
  progress: number;
  /** Merkez büyük değer (ör. "%72" veya formatlanmış tutar). */
  value?: string;
  /** Merkez alt etiket. */
  label?: string;
  /** Piksel boyutu (kare kutu; gauge yarım-daire). Varsayılan 180. */
  size?: number;
  className?: string;
  /** Çizim animasyonu. Varsayılan true. */
  animate?: boolean;
}

/**
 * UI v2 — Daxa yarım-daire gauge.
 *
 * <p>Nötr arka ark + accent (lime) ilerleme arkı + uç noktada knob. Merkezde
 * dev bold değer. SVG; renkler token-bazlı (currentColor/CSS var). Çizim
 * animasyonu stroke-dashoffset ile (reduced-motion saygılı — CSS .v2-draw).</p>
 */
export function GaugeArc({
  progress,
  value,
  label,
  size = 180,
  className,
  animate = true,
}: Props) {
  const clamped = Math.max(0, Math.min(1, progress));
  const uid = useId();

  // Yarım-daire geometrisi: 180° yay (sol→sağ), merkez altta.
  const stroke = Math.max(8, Math.round(size * 0.075));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Yarı çevre uzunluğu (180°).
  const arcLen = Math.PI * r;
  const dashOffset = arcLen * (1 - clamped);

  // Uç nokta (knob) açısı: 180° (sol) → 0° (sağ), progress ile.
  const angle = Math.PI * (1 - clamped); // radian
  const knobX = cx + r * Math.cos(angle);
  const knobY = cy - r * Math.sin(angle);

  // Yarım-daire path: sol uçtan sağ uca üstten yay.
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const height = size / 2 + stroke;

  return (
    <div
      className={cn("relative inline-flex flex-col items-center", className)}
      style={{ width: size }}
    >
      <svg
        width={size}
        height={height}
        viewBox={`0 0 ${size} ${height}`}
        role="img"
        aria-label={value ? `${value} ${label ?? ""}`.trim() : undefined}
      >
        {/* Arka ark — nötr. */}
        <path
          d={arcPath}
          fill="none"
          stroke="rgb(var(--v2-border))"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* İlerleme arkı — accent (lime) gradient. */}
        <defs>
          <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--accent-strong))" />
            <stop offset="100%" stopColor="rgb(var(--accent-bright))" />
          </linearGradient>
        </defs>
        <path
          d={arcPath}
          fill="none"
          stroke={`url(#g-${uid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={dashOffset}
          className={animate ? "v2-draw" : undefined}
          style={
            animate
              ? ({ ["--draw-len" as string]: `${arcLen}` } as React.CSSProperties)
              : undefined
          }
        />
        {/* Uç nokta knob. */}
        <circle
          cx={knobX}
          cy={knobY}
          r={stroke * 0.55}
          fill="rgb(var(--v2-card))"
          stroke="rgb(var(--accent))"
          strokeWidth={Math.max(2, stroke * 0.28)}
        />
      </svg>

      {/* Merkez değer — gauge'ın içine bindirme. */}
      {(value || label) && (
        <div
          className="absolute left-0 right-0 flex flex-col items-center"
          style={{ top: size * 0.32 }}
        >
          {value && (
            <span className="v2-metric text-2xl sm:text-3xl">{value}</span>
          )}
          {label && <span className="v2-eyebrow mt-1">{label}</span>}
        </div>
      )}
    </div>
  );
}
