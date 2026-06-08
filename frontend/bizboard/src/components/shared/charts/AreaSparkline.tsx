"use client";

/**
 * Modern UI Redesign / PR-0: Alan grafiği (sparkline) — SALT SUNUM.
 *
 * <p>Mockup areaSvg()'in React hali. Veriyi prop alır; hesaplama yapmaz.
 * points verilmezse mockup'taki örnek eğriye düşer (hero görseli için).</p>
 */

interface Props {
  /** 0..1 normalize edilmiş y değerleri (soldan sağa). Verilmezse örnek eğri. */
  points?: number[];
  /** Çizgi/dolgu rengi. Hero (brand gradient) üzerinde "#fff" kullanılır. */
  stroke?: string;
  className?: string;
}

/** points → SVG path "d" (smooth-ish polyline). viewBox 0 0 600 120. */
function buildPath(points: number[]): { line: string; area: string } {
  const W = 600;
  const H = 120;
  const n = points.length;
  if (n < 2) return { line: "", area: "" };
  const step = W / (n - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const clamped = Math.max(0, Math.min(1, p));
    const y = H - clamped * (H - 18) - 10; // 10..H-8 aralığı
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return { line, area };
}

const SAMPLE_LINE =
  "M0,90 C60,70 90,80 150,55 C210,30 250,60 310,40 C370,22 410,48 470,30 C520,16 560,28 600,18";
const SAMPLE_AREA = `${SAMPLE_LINE} L600,120 L0,120 Z`;

export function AreaSparkline({ points, stroke = "#fff", className = "w-full h-24" }: Props) {
  const gradId = "area-spark";
  let line = SAMPLE_LINE;
  let area = SAMPLE_AREA;
  if (points && points.length >= 2) {
    const built = buildPath(points);
    line = built.line;
    area = built.area;
  }
  return (
    <svg viewBox="0 0 600 120" className={className} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
