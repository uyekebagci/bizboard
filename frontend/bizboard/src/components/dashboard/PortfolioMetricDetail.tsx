"use client";

/**
 * Dashboard metrik kartı (MetricCard) DETAY TABLOSU içeriği.
 *
 * <p>Net Kar / Toplam Gelir / Toplam Gider / İşletme kartlarına tıklanınca
 * {@link WidgetDetailModal} (v2 primitive modal kabuğu) içinde gösterilen
 * işletme-bazlı kırılım tablosu. Salt görsel/okunur — portföy verisinden
 * türetilir (yeni fetch yok), her satır ilgili işletme detayına deep-link.</p>
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { PortfolioSummary } from "@/types";

export type MetricKind = "net" | "income" | "expense" | "business";

interface Row {
  business_id: string;
  income: number;
  expense: number;
  profit: number;
  fixed_cost: number;
}

const tl = (n: number) => formatCurrency(n, "TRY");

const META: Record<MetricKind, { title: string; subtitle: string; col: string }> = {
  net: { title: "Net Kar — İşletme Kırılımı", subtitle: "Gelir − Gider (sabit dahil), işletme bazında", col: "Net" },
  income: { title: "Toplam Gelir — İşletme Kırılımı", subtitle: "Dönem gelirleri, işletme bazında", col: "Gelir" },
  expense: { title: "Toplam Gider — İşletme Kırılımı", subtitle: "Dönem giderleri (sabit dahil), işletme bazında", col: "Gider" },
  business: { title: "İşletmeler", subtitle: "Portföydeki aktif işletmeler ve net katkı", col: "Net" },
};

export function metricDetailTitle(kind: MetricKind) { return META[kind].title; }
export function metricDetailSubtitle(kind: MetricKind) { return META[kind].subtitle; }

export function PortfolioMetricDetail({
  kind, rows, nameOf, total,
}: {
  kind: MetricKind;
  rows: Row[];
  /** business_id → görünen ad. */
  nameOf: (id: string) => string;
  /** Üst-toplam (kartla aynı sayı) — tutarlılık için. */
  total: number;
}) {
  // Metriğe göre değer seçimi + büyük→küçük sıralama.
  const valueOf = (r: Row) => {
    switch (kind) {
      case "income": return r.income;
      case "expense": return r.expense + (r.fixed_cost || 0);
      case "net":
      case "business":
      default: return r.profit;
    }
  };
  const sorted = [...rows].sort((a, b) => Math.abs(valueOf(b)) - Math.abs(valueOf(a)));
  const colLabel = META[kind].col;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[rgb(var(--v2-muted))] py-4 text-center">
        Bu dönemde işletme verisi yok.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Üst-toplam — kartla aynı rakam (tutarlılık). */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-[rgb(var(--v2-muted))]">Toplam ({rows.length} işletme)</span>
        <span className={cn("text-base font-bold num", toneClass(kind, total))}>{tl(total)}</span>
      </div>

      <ul className="space-y-1.5">
        {sorted.map((r) => {
          const v = valueOf(r);
          return (
            <li key={r.business_id}>
              <Link
                href={`/business/${r.business_id}`}
                className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl no-underline transition-colors hover:bg-[rgb(var(--v2-sunken))]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate">
                    {nameOf(r.business_id)}
                  </p>
                  <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                    Gelir {tl(r.income)} · Gider {tl(r.expense + (r.fixed_cost || 0))}
                  </p>
                </div>
                <span className={cn("text-sm font-bold shrink-0 num", toneClass(kind, v))}>
                  {colLabel}: {tl(v)}
                </span>
                <ChevronRight size={15} className="shrink-0 text-[rgb(var(--v2-muted))]" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function toneClass(kind: MetricKind, v: number): string {
  if (kind === "expense") return "text-status-danger";
  if (kind === "income") return "text-status-success";
  // net / business → işarete göre
  return v >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger";
}
