"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props {
  /** Hedef değer (sayısal). */
  value: number;
  /**
   * Değeri string'e çeviren formatter. Örn:
   *   (n) => formatCurrency(n)        — para
   *   (n) => `%${n.toFixed(1)}`        — yüzde
   *   (n) => Math.round(n).toString() — tam sayı
   */
  format?: (n: number) => string;
  /** Animasyon süresi (ms). Varsayılan 900. */
  durationMs?: number;
  className?: string;
  /** Görünür olunca başlat (varsayılan true) — liste/kaydırma performansı. */
  startOnView?: boolean;
}

// easeOutCubic — yumuşak yavaşlayan count-up.
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * UI v2 — sayı/para count-up bileşeni.
 *
 * <p>rAF tabanlı, 0 (veya önceki değer) → hedef değere easeOutCubic ile sayar.
 * `formatCurrency` gibi mevcut formatter'larla uyumlu (format prop). Değer
 * her değiştiğinde önceki değerden yenisine geçiş yapar (akıcı güncelleme).</p>
 *
 * <p>Erişilebilirlik: `prefers-reduced-motion` → animasyon yok, son değer
 * doğrudan gösterilir.</p>
 */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("tr-TR"),
  durationMs = 900,
  className,
  startOnView = true,
}: Props) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState<number>(reduced ? value : 0);
  const fromRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const elRef = useRef<HTMLSpanElement | null>(null);
  const [inView, setInView] = useState(!startOnView);

  // Viewport'a girince tetikle (startOnView).
  useEffect(() => {
    if (!startOnView || inView) return;
    const el = elRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [startOnView, inView]);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    if (!inView) return;

    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutCubic(t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs, reduced, inView]);

  return (
    <span ref={elRef} className={className}>
      {format(display)}
    </span>
  );
}
