"use client";

import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { SegmentBar, type Segment } from "./SegmentBar";

interface Props {
  /** Üst küçük etiket (uppercase). */
  label: string;
  /** Sayısal değer (count-up). */
  value: number;
  /** Değer formatter (ör. formatCurrency). */
  format?: (n: number) => string;
  /** Opsiyonel ikon (lucide). */
  icon?: LucideIcon;
  /** Yüzde delta (ör. +12.4 / -3.1). null → gösterilmez. */
  delta?: number | null;
  /**
   * Hangi yön "iyi" sayılır — delta tonunu (yeşil/kırmızı) belirler.
   *
   * <p>{@code "up"} (default): artış iyi/yeşil — Gelir, Net Kâr gibi.
   * {@code "down"}: AZALIŞ iyi/yeşil, ARTIŞ kötü/kırmızı — Gider gibi
   * (artan gider finansal olarak kötüdür). Ok yönü her zaman değerin
   * gerçek işaretini gösterir (↑ artış / ↓ azalış); yalnız renk/ton ters döner.</p>
   */
  goodDirection?: "up" | "down";
  /** Kart alt segment-bar dağılımı. */
  segments?: Segment[];
  /** Kart vurgu varyantı. */
  variant?: "default" | "accent" | "ink";
  className?: string;
  /** Tıklanabilir kart (hover lift). */
  onClick?: () => void;
}

/**
 * UI v2 — Daxa metrik kartı.
 *
 * <p>Solid v2-card + eyebrow etiket + dev bold count-up değer + delta chip
 * + opsiyonel alt segment mini-bar. Çift tema, reduced-motion saygılı.
 * variant="ink" → koyu hero kart (Daxa).</p>
 *
 * <p>Delta chip: ok yönü değerin gerçek işaretini gösterir (↑ artış / ↓ azalış);
 * renk/ton {@code goodDirection}'a bağlı — default "up" (artış=yeşil/iyi:
 * gelir, net), "down" ise ters (gider: artış=kırmızı/kötü, azalış=yeşil).</p>
 */
export function MetricCard({
  label,
  value,
  format = (n) => Math.round(n).toLocaleString("tr-TR"),
  icon: Icon,
  delta,
  goodDirection = "up",
  segments,
  variant = "default",
  className,
  onClick,
}: Props) {
  const isInk = variant === "ink";
  // Ok yönü: değerin gerçek işareti (↑ artış / ↓ azalış).
  const deltaUp = (delta ?? 0) >= 0;
  // Ton: yön "iyi mi" — goodDirection="down" ise mantık tersine döner
  // (gider gibi: artış kötü/kırmızı, azalış iyi/yeşil).
  const deltaGood = goodDirection === "down" ? !deltaUp : deltaUp;

  return (
    <div
      className={cn(
        "v2-card v2-lift p-5 sm:p-6 flex flex-col gap-4",
        variant === "accent" && "v2-card--accent",
        isInk && "v2-card--ink",
        onClick && "cursor-pointer v2-press",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "v2-eyebrow",
            isInk && "text-[rgb(var(--v2-card))]/60"
          )}
        >
          {label}
        </span>
        {Icon && (
          <span
            className={cn(
              "inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0",
              isInk
                ? "bg-[rgb(var(--v2-card))]/10 text-[rgb(var(--v2-card))]"
                : "bg-accent/15 text-accent-strong dark:text-accent"
            )}
          >
            <Icon size={18} />
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <AnimatedNumber
          value={value}
          format={format}
          className={cn(
            "v2-metric text-3xl sm:text-4xl",
            isInk && "text-[rgb(var(--v2-card))]"
          )}
        />
        {delta != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold",
              deltaGood
                ? "bg-accent/16 text-accent-strong dark:text-accent"
                : "bg-status-danger/16 text-status-danger"
            )}
          >
            {deltaUp ? (
              <ArrowUpRight size={13} />
            ) : (
              <ArrowDownRight size={13} />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>

      {segments && segments.length > 0 && (
        <SegmentBar segments={segments} className="mt-auto" />
      )}
    </div>
  );
}
