"use client";

/**
 * Modern UI Redesign / PR-0: Donut grafiği — SALT SUNUM.
 *
 * <p>Mockup donutSvg()'in React hali. segments (renk + yüzde) prop alır;
 * ortada büyük + küçük etiket gösterir. Hesaplama yapmaz.</p>
 */

export interface DonutSegment {
  color: string;
  /** 0..100 yüzde. */
  pct: number;
}

interface Props {
  segments: DonutSegment[];
  /** Ortadaki büyük değer (örn. "%32"). */
  centerBig?: string;
  /** Ortadaki küçük açıklama (örn. "net kar"). */
  centerSmall?: string;
  /** Büyük değerin rengi (Tailwind class). */
  centerColorClass?: string;
  className?: string;
}

const CIRC = 314.16; // 2πr, r=50

export function Donut({
  segments,
  centerBig,
  centerSmall,
  centerColorClass = "text-emerald-300",
  className = "w-40 h-40",
}: Props) {
  let rot = 0;
  const arcs = segments.map((s, i) => {
    const off = CIRC - (CIRC * s.pct) / 100;
    const el = (
      <circle
        key={i}
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke={s.color}
        strokeWidth="16"
        strokeLinecap={i === 0 ? "round" : "butt"}
        strokeDasharray={CIRC}
        strokeDashoffset={off}
        transform={`rotate(${rot} 60 60)`}
        style={{ ["--len" as string]: `${CIRC}`, ["--off" as string]: `${off}`, animation: `dash 1s ${i * 0.15}s ease both` }}
      />
    );
    rot += s.pct * 3.6;
    return el;
  });

  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 120 120" className={`${className} -rotate-90`} aria-hidden="true">
        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(124,134,159,.18)" strokeWidth="16" />
        {arcs}
      </svg>
      {(centerBig || centerSmall) && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            {centerBig && <p className={`num text-2xl font-extrabold ${centerColorClass}`}>{centerBig}</p>}
            {centerSmall && <p className="text-[10px] text-surface-400 -mt-0.5">{centerSmall}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
