"use client";

// ───────────────────────── 1. KONSOLİDE POZİSYON ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)
// UI v2 (Daxa) geçiş: eski mor/indigo gradient → Widget primitive `hero`
// varyantı (solid koyu ink zemin + lime accent). Kabuk/yüzey global'den gelir;
// bu dosya yalnız İÇERİĞİ (body) tanımlar.

import { useEffect, useState } from "react";
import { formatCurrency, maskAmount, cn } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { Widget } from "@/components/v2";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { DetailRow } from "./shared";

export function ConsolidatedPositionCard({ d }: { d: ConsolidatedDashboard }) {
  const c = d.consolidated;
  // fix(debt): Borç sansürü tutarlılığı — Verecekler/Alacaklar sayfalarındaki
  // "göz" toggle'ı (localStorage "cati-verecekler-censor" / "cati-alacaklar-censor")
  // burada da uygulanır. Bu kasa detayı kartı borç/verecek tutarlarını gösterdiği
  // için, debt sayfalarında sansür açıkken aynı tutarlar burada da blur'lanmalı —
  // aksi halde sansür atlanmış oluyordu. SSR/CSR uyumu için flag mount sonrası okunur
  // (default sansürsüz → hydration mismatch yok).
  const [payableCensor, setPayableCensor] = useState(false);
  useEffect(() => {
    try {
      setPayableCensor(localStorage.getItem("cati-verecekler-censor") === "1");
    } catch { /* ignore */ }
  }, []);
  // v1.6.23.9 (TODO 8c7ffaac): bekleyen POS tahsilatı (settle olunca eklenecek).
  const pendingPos = c.pending_pos_receivables ?? 0;
  // v1.6.23.15 (TODO d0ccb7f0): widget tıklanabilir → detay modal
  // v1.6.23.24: 50% width layout için kompakt versiyon. Genel Kasa
  // (= toplam nakit + bank bakiyesi) öne çıkar; KK/Kredi sub-stat'leri detay
  // modal'a taşındı.
  const [showDetail, setShowDetail] = useState(false);
  const genelKasa = (c.total_cash ?? 0) + (c.total_bank_balance ?? 0);
  return (
    <>
      <Widget
        title="Konsolide DGR"
        variant="hero"
        flush
        onClick={() => setShowDetail(true)}
        ariaLabel="Konsolide pozisyon detayını aç"
        className="h-full"
      >
        <div className="p-5 flex flex-col h-full">
          {/* Genel Kasa — tek primary metric (nakit + banka). */}
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-0.5 text-[rgb(var(--v2-card))]/55">
              Genel Kasa
            </p>
            <p
              className="v2-metric text-3xl truncate text-[rgb(var(--v2-card))]"
              title={formatCurrency(genelKasa, "TRY")}
            >
              {formatCurrency(genelKasa, "TRY")}
            </p>
            <p className="mt-1 text-[10px] text-[rgb(var(--v2-card))]/45">nakit + banka</p>
          </div>

          {/* Sub-stat row: 2 küçük metric. Kullanıcı isteği: ALACAKLAR kalemi
              widget yüzünden KALDIRILDI (detay modal'ında kalır). VERECEKLER +
              BEKLEYEN POS (yoksa KK+Kredi) kalır → grid-cols-2. */}
          <div className="mt-3 pt-3 border-t border-[rgb(var(--v2-card))]/12 grid grid-cols-2 gap-2 text-[10px]">
            <HeroStat label="Verecekler" value={-Math.abs(c.payables)} tone="negative" censor={payableCensor} />
            {pendingPos > 0 ? (
              <div>
                <p className="uppercase tracking-wider text-[rgb(var(--accent-bright))]/90">Bekleyen POS</p>
                <p className="text-sm font-bold mt-0.5 text-[rgb(var(--accent-bright))]">
                  +{formatCurrency(pendingPos, "TRY")}
                </p>
              </div>
            ) : (
              <HeroStat
                label="KK + Kredi"
                value={-(Math.abs(c.credit_card_debt) + Math.abs(c.loan_principal))}
                tone="negative"
                censor={payableCensor}
              />
            )}
          </div>
        </div>
      </Widget>
      <WidgetDetailModal
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title="Konsolide Pozisyon — Detay"
        subtitle="DGR'nin tüm finansal pozisyonu"
        size="md"
      >
        <div className="space-y-3 text-sm text-surface-200">
          <DetailRow label="Toplam Nakit (kasa + cebde)" value={c.total_cash} tone="pos" />
          <DetailRow label="Banka Bakiyeleri (CHECKING+SAVINGS)" value={c.total_bank_balance ?? 0} tone="neutral" />
          <DetailRow label="Bekleyen POS Tahsilatı (settle bekliyor)" value={pendingPos} tone={pendingPos > 0 ? "warn" : "neutral"} />
          <DetailRow label="Verecekler (DGR'den gidecek)" value={-Math.abs(c.payables)} tone="neg" censor={payableCensor} />
          <DetailRow label="KK Borcu" value={-Math.abs(c.credit_card_debt)} tone="neg" censor={payableCensor} />
          <DetailRow label="Kredi Anapara" value={-Math.abs(c.loan_principal)} tone="neg" censor={payableCensor} />
          {/* Beta v1.1: komisyon kaldırıldı — formül sadeleşti. */}
          <p className="text-[11px] text-surface-400 pt-2">
            <strong>Genel Kasa</strong> = nakit + banka bakiyeleri (fiziksel para).
            Bekleyen POS settle olunca Genel Kasa'ya geçer.
          </p>
        </div>
      </WidgetDetailModal>
    </>
  );
}

/**
 * Hero (koyu ink zemin) kart içi alt-metrik. {@link PositionStat}'ın hero
 * zeminine uyarlanmış versiyonu — pozitif=lime accent, negatif=kırmızı, koyu
 * zeminde okunur. Borç sansürü {@link DetailRow} censor mantığıyla aynı.
 */
function HeroStat({ label, value, tone, censor }: {
  label: string; value: number; tone: "positive" | "negative"; censor?: boolean;
}) {
  // value < 0 ise formatCurrency zaten "-" prefix verir; defensive minus.
  const displayValue = tone === "negative" && value > 0 ? -value : value;
  return (
    <div>
      <p className="uppercase tracking-wider text-[rgb(var(--v2-card))]/50">{label}</p>
      <p className={cn(
        "text-sm font-bold mt-0.5",
        tone === "negative" ? "text-red-300" : "text-[rgb(var(--accent-bright))]",
        censor && "select-none",
      )}>
        {maskAmount(displayValue, !!censor, "TRY")}
      </p>
    </div>
  );
}
