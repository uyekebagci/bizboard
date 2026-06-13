"use client";

import { cn } from "@/lib/utils";

type RevealVariant = "rise" | "fade-up";

interface RevealProps {
  children: React.ReactNode;
  /** Giriş varyantı. rise = 16px + scale; fade-up = hafif 8px. */
  variant?: RevealVariant;
  /** Stagger sırası (0-bazlı) — delay = index × stepMs. */
  index?: number;
  /** Stagger adımı (ms). Varsayılan 60. */
  stepMs?: number;
  /** Ek gecikme (ms) — grup başlangıcı kaydırmak için. */
  delayMs?: number;
  className?: string;
  /** Sarmalayıcı eleman (varsayılan div). */
  as?: "div" | "section" | "li" | "article";
}

/**
 * UI v2 — stagger giriş animasyonu sarmalayıcısı.
 *
 * <p>CSS-tabanlı (`v2-rise` / `v2-fade-up` + `--rd` delay değişkeni). Hareket
 * azaltma tercihi globals.css `@media (prefers-reduced-motion)` ile otomatik
 * kapanır (JS gerekmez). Liste/grid'lerde `index` vererek dalgalı giriş.</p>
 *
 * @example
 * {items.map((it, i) => (
 *   <Reveal key={it.id} index={i}><MetricCard .../></Reveal>
 * ))}
 */
export function Reveal({
  children,
  variant = "rise",
  index = 0,
  stepMs = 60,
  delayMs = 0,
  className,
  as: Tag = "div",
}: RevealProps) {
  const delay = delayMs + index * stepMs;
  const cls = variant === "fade-up" ? "v2-fade-up" : "v2-rise";

  return (
    <Tag
      className={cn(cls, className)}
      style={{ ["--rd" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
