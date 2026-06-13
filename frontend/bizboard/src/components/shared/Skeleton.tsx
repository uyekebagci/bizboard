"use client";

/**
 * UX-08 — Paylaşılan skeleton varyantları (list / card / stat).
 *
 * İlk-yükleme deneyimini tutarlı kılar (rapor: 50 dosya spinner ↔ 11 skeleton).
 * İlk yükleme = skeleton (layout-shift'i azaltır); refresh/loadMore = inline spinner.
 *
 * S-4: skeleton zemini token yerine yarı-saydam (`--v2-border`) → dark temada
 * `--surface-200` parlaklığı sorununu yaşamaz; çift temada yumuşak görünür.
 */

import { cn } from "@/lib/utils";

/** Tek skeleton bloğu — yarı-saydam, çift-tema güvenli. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-lg bg-[rgb(var(--v2-border))]/60",
        className,
      )}
    />
  );
}

/** Liste skeleton'u — n satır (varsayılan 6). */
export function ListSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Yükleniyor"
      className={cn("v2-card divide-y divide-[rgb(var(--v2-border))]", className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <SkeletonBlock className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <SkeletonBlock className="h-3.5 w-2/5" />
            <SkeletonBlock className="h-3 w-3/5" />
          </div>
          <SkeletonBlock className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Kart-grid skeleton'u — n kart (varsayılan 4). */
export function CardSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Yükleniyor"
      className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="v2-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="w-10 h-10 rounded-xl shrink-0" />
            <SkeletonBlock className="h-3.5 w-1/2" />
          </div>
          <SkeletonBlock className="h-3 w-3/4" />
          <SkeletonBlock className="h-5 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** Stat/özet kartları skeleton'u — n sütun (varsayılan 3). */
export function StatSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Yükleniyor"
      className={cn(`grid grid-cols-${count} gap-2`, className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="v2-card p-3 space-y-2">
          <SkeletonBlock className="h-2.5 w-1/2" />
          <SkeletonBlock className="h-5 w-3/4" />
        </div>
      ))}
    </div>
  );
}
