"use client";

// ───────────────────────── 1. KONSOLİDE POZİSYON ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { DetailRow, PositionStat } from "./shared";

export function ConsolidatedPositionCard({ d }: { d: ConsolidatedDashboard }) {
  const c = d.consolidated;
  // fix(debt): Borç sansürü tutarlılığı — Verecekler/Alacaklar sayfalarındaki
  // "göz" toggle'ı (localStorage "cati-verecekler-censor" / "cati-alacaklar-censor")
  // burada da uygulanır. Bu kasa detayı kartı borç/verecek tutarlarını gösterdiği
  // için, debt sayfalarında sansür açıkken aynı tutarlar burada da blur'lanmalı —
  // aksi halde sansür atlanmış oluyordu. SSR/CSR uyumu için flag mount sonrası okunur
  // (default sansürsüz → hydration mismatch yok).
  const [payableCensor, setPayableCensor] = useState(false);
  const [receivableCensor, setReceivableCensor] = useState(false);
  useEffect(() => {
    try {
      setPayableCensor(localStorage.getItem("cati-verecekler-censor") === "1");
      setReceivableCensor(localStorage.getItem("cati-alacaklar-censor") === "1");
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
    <section
      onClick={() => setShowDetail(true)}
      className="sheen rounded-2xl p-5 text-white cursor-pointer hover:ring-1 hover:ring-brand-400 transition-all flex flex-col h-full relative overflow-hidden"
      style={{ background: "linear-gradient(135deg,#4263eb 0%,#4c6ef5 42%,#6741d9 100%)" }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowDetail(true); } }}
    >
      <p className="text-brand-200 text-[10px] uppercase tracking-wider mb-2">Konsolide DGR</p>

      {/* Genel Kasa — tek primary metric (nakit + banka). */}
      <div>
        <p className="text-brand-200 text-[10px] uppercase tracking-wider mb-0.5">Genel Kasa</p>
        <p className="num text-2xl font-bold truncate" title={formatCurrency(genelKasa, "TRY")}>
          {formatCurrency(genelKasa, "TRY")}
        </p>
        <p className="mt-1 text-[10px] text-brand-200">nakit + banka</p>
      </div>

      {/* Sub-stat row: 3 küçük metric */}
      <div className="mt-3 pt-3 border-t border-brand-600/50 grid grid-cols-3 gap-2 text-[10px]">
        <PositionStat label="Alacaklar" value={c.receivables} tone="positive" censor={receivableCensor} />
        <PositionStat label="Verecekler" value={-Math.abs(c.payables)} tone="negative" censor={payableCensor} />
        {pendingPos > 0 ? (
          <div>
            <p className="text-amber-200 uppercase tracking-wider">Bekleyen POS</p>
            <p className="text-sm font-bold text-amber-200 mt-0.5">
              +{formatCurrency(pendingPos, "TRY")}
            </p>
          </div>
        ) : (
          <PositionStat
            label="KK + Kredi"
            value={-(Math.abs(c.credit_card_debt) + Math.abs(c.loan_principal))}
            tone="negative"
            censor={payableCensor}
          />
        )}
      </div>
    </section>
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
        <DetailRow label="Alacaklar (DGR'ye gelecek)" value={c.receivables} tone="pos" censor={receivableCensor} />
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
