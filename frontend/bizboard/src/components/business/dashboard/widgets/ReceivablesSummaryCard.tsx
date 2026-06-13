"use client";

// ───────────────────────── 6. ALACAKLAR ÖZETİ ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)
// Not: v1.6.23.29'dan beri ana panoda render edilmiyor (Konsolide DGR'de
// alacaklar sub-stat olarak var). Kod ileride tekrar kullanim icin korunuyor.

import Link from "next/link";
import { useState } from "react";
import { HandCoins, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { SectionTitle, Footer } from "./shared";

export function ReceivablesSummaryCard({ d }: { d: ConsolidatedDashboard }) {
  // v1.6.23.16 (TODO d0ccb7f0 expansion): tıkla → modal
  const [showDetail, setShowDetail] = useState(false);
  const r = d.receivables;
  if (r.total_count === 0) {
    return (
      <section className="v2-card p-4 rounded-2xl">
        <SectionTitle icon={HandCoins} label="Alacaklar" />
        <p className="text-xs text-[rgb(var(--v2-muted))] py-2">Açık alacak yok.</p>
      </section>
    );
  }
  // v1.6.23.16 (TODO d0ccb7f0 expansion): tıkla → modal (önce Link idi)
  return (
    <>
    <section
      onClick={() => setShowDetail(true)}
      className="v2-widget v2-widget--interactive overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[rgb(var(--v2-border))] flex items-center justify-between">
        <SectionTitle icon={HandCoins} label="Alacaklar" inline />
        <ChevronRight size={14} className="text-surface-400" />
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-2xl font-bold text-amber-300">{formatCurrency(r.total, "TRY")}</p>
        <div className="flex flex-wrap gap-1.5">
          {r.type_breakdown.map((t) => (
            <span key={t.type}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium v2-chip">
              {t.type === "UNSPECIFIED" ? "Belirtilmemiş" : t.type} · {t.count} · {formatCurrency(t.amount, "TRY")}
            </span>
          ))}
        </div>
      </div>
      <Footer
        left={`${r.total_count} kayıt`}
        right={
          <span>
            {r.overdue_count > 0 && (
              <span className="text-red-300">{r.overdue_count} vadesi gelmiş</span>
            )}
          </span>
        }
      />
    </section>
    <WidgetDetailModal
      open={showDetail}
      onClose={() => setShowDetail(false)}
      title="Alacaklar — Özet"
      subtitle={`${r.total_count} kayıt · toplam ${formatCurrency(r.total, "TRY")}`}
      size="md"
      headerAction={
        <Link
          href="/dashboard/alacaklar"
          onClick={() => setShowDetail(false)}
          className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white"
        >
          Tüm Alacaklar →
        </Link>
      }
    >
      <div className="space-y-3 text-sm text-[rgb(var(--v2-ink))]">
        <div>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-1">Toplam Alacak</p>
          <p className="text-2xl font-bold text-amber-300">{formatCurrency(r.total, "TRY")}</p>
          {r.overdue_count > 0 && (
            <p className="text-xs text-red-300 mt-1">
              {r.overdue_count} kayıt vadesi geçmiş — acil takip
            </p>
          )}
        </div>
        <div className="pt-3 border-t border-[rgb(var(--v2-border))]">
          <p className="text-[10px] text-[rgb(var(--v2-muted))] uppercase tracking-wider mb-2">Tip Dağılımı</p>
          <div className="space-y-1.5">
            {r.type_breakdown.map((t) => (
              <div key={t.type} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-[rgb(var(--v2-muted))]">
                  {t.type === "UNSPECIFIED" ? "Belirtilmemiş" : t.type}
                  <span className="ml-2 text-[rgb(var(--v2-muted))]/60">({t.count} kayıt)</span>
                </span>
                <span className="font-mono text-[rgb(var(--v2-ink))]">{formatCurrency(t.amount, "TRY")}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-[rgb(var(--v2-muted))] pt-2">
          Tüm kayıtların satır-satır listesi için yukarıdaki "Tüm Alacaklar" butonuna tıkla.
        </p>
      </div>
    </WidgetDetailModal>
    </>
  );
}
