"use client";

/**
 * Raporlar v1.1 (R5): 13-haftalık nakit-akış tahmin grafiği — SALT SUNUM.
 *
 * <p>Pure SVG (chart lib YOK). Haftalık kapanış bakiyesi çizgisi + sıfır
 * baseline (nakit açığı görünür) + son nokta vurgusu. Renk eşiğe göre:
 * bakiye sıfırın altına düşüyorsa rose, değilse emerald. Veriyi prop alır;
 * hesaplama yapmaz (forecast servisi hesaplar).</p>
 */

interface ForecastChartProps {
  /** Haftalık kapanış bakiyeleri (TL, işaretli). */
  balances: number[];
  /** Açılış bakiyesi (ilk noktadan önce — çizginin başlangıcı). */
  opening: number;
  /** En düşük bakiyenin hafta indeksi (1-based, vurgu için); 0 = yok. */
  minWeek?: number;
  className?: string;
}

const W = 600;
const H = 180;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

export function ForecastChart({
  balances,
  opening,
  minWeek = 0,
  className = "w-full h-44",
}: ForecastChartProps) {
  // opening dahil tüm seri (n+1 nokta).
  const series = [opening, ...balances];
  const n = series.length;

  if (n < 2) {
    return (
      <div className={className} aria-hidden="true" />
    );
  }

  const max = Math.max(...series, 0);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const usableH = H - PAD_TOP - PAD_BOTTOM;
  const step = W / (n - 1);

  const toY = (v: number) => PAD_TOP + (max - v) / range * usableH;
  const zeroY = toY(0);

  const coords = series.map((v, i) => [i * step, toY(v)] as const);
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W},${zeroY.toFixed(1)} L0,${zeroY.toFixed(1)} Z`;

  const hasShortfall = min < 0;
  const stroke = hasShortfall ? "#fb7185" : "#34d399"; // rose-400 / emerald-400
  const gradId = "forecast-area";

  // Son nokta + min nokta vurgusu.
  const last = coords[coords.length - 1];
  const minIdx = minWeek > 0 ? minWeek : -1; // series index = minWeek (opening shift +1 dengelenir)
  const minCoord = minIdx >= 0 && minIdx < coords.length ? coords[minIdx] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* sıfır baseline (nakit açığı sınırı) */}
      <line
        x1="0"
        y1={zeroY}
        x2={W}
        y2={zeroY}
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* min bakiye vurgusu (varsa, sadece açık riskinde anlamlı) */}
      {minCoord && hasShortfall && (
        <circle cx={minCoord[0]} cy={minCoord[1]} r="4" fill="#fb7185" />
      )}

      {/* son nokta */}
      <circle cx={last[0]} cy={last[1]} r="4" fill={stroke} />
    </svg>
  );
}
