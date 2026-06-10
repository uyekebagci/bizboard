"use client";

/**
 * v1.6.20 (WP-3): İşletme detay sayfasının tüm consolidated widget'ları.
 *
 * Tek bir GET /businesses/{id}/consolidated cevabını alıp 10+ widget'ı render eder.
 * Her widget kendi card'ı; footer'da "Toplam: X kalem | Y TL" pattern'i.
 *
 * R3 god-component bolme: her widget kendi dosyasina cikarildi
 * (./widgets/*). Bu dosya artik sadece layout orkestratoru.
 */

import type { ConsolidatedDashboard } from "@/types";
import { CashHoldersWidget } from "@/components/business/dashboard/CashHoldersWidget";
import { ConsolidatedPositionCard } from "./widgets/ConsolidatedPositionCard";
import { TodayClosingCard } from "./widgets/TodayClosingCard";
import { CashOutflowsTodayCard } from "./widgets/CashOutflowsTodayCard";
import { SubCashesCard } from "./widgets/SubCashesCard";
import { UpcomingChequesCard } from "./widgets/UpcomingChequesCard";
import { UpcomingRemindersCard } from "./widgets/UpcomingRemindersCard";
import { BankAccountsCard } from "./widgets/BankAccountsCard";
import { PosDevicesCard } from "./widgets/PosDevicesCard";

interface Props {
  data: ConsolidatedDashboard;
  onCloseDay?: () => void;
  /**
   * v1.6.23.13 (TODO 0adbee2a): "Son İşlemler" slot — Bugünün Kasa Durumu
   * widget'ının hemen altına yerleştirilir. /business/[id]/page.tsx
   * TransactionList'i prop olarak geçer.
   */
  recentTransactionsSlot?: React.ReactNode;
  /**
   * v1.6.23.26 (UI Fix WP TODO b12c1dce): parent'ta refresh callback —
   * BankAccountsCard yeni hesap yaratınca consolidated cache'i invalidate
   * etmek için kullanılır.
   */
  onChange?: () => void;
}

export function ConsolidatedWidgets({ data, onCloseDay, recentTransactionsSlot, onChange }: Props) {
  // v1.6.23.29 (UI Fix WP): Layout reorg.
  //
  // Yeni sıra:
  //   Row 1: [Konsolide DGR (Net + Genel Kasa) | Bugünün Kasa Durumu]    50/50
  //   Row 2: [Son İşlemler + Yeni İşlem (vurgulu) | Hesaptan Harcama]    50/50
  //   Row 3: [Alt Kasalar (Sub-Cash aggregator) | Çek + Hatırlatma]      50/50
  //   Row 4 (en altta): [Para Bulunan Hesaplar | POS Cihazları]          50/50
  //
  // v1.6.23.29 kaldırılanlar:
  //   - PayablesCard (Verecekler): Konsolide DGR widget'ında zaten sub-stat
  //     olarak gösteriliyor.
  //   - ReceivablesSummaryCard (Alacaklar): aynı, Konsolide DGR'da var.
  //   - UpcomingChequesCard + UpcomingRemindersCard ayrı satır → Row 3 col 2'de
  //     birleşik panel.
  return (
    <div className="space-y-4">
      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ConsolidatedPositionCard d={data} />
        <TodayClosingCard d={data} onCloseDay={onCloseDay} />
      </div>

      {/* v1.7.x (dashboard reorg): Hızlı İşlemler widget'ı buradan KALDIRILDI;
          artık page.tsx'te ModuleTabs'in altında — sayfanın EN ALTINDA render
          edilir. Modüller widget'ı yukarı, Hızlı İşlemler aşağı taşındı. */}

      {/* Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        {recentTransactionsSlot ?? <div />}
        <CashOutflowsTodayCard d={data} />
      </div>

      {/* Row 3 — Alt Kasalar + Çek/Hatırlatma combined */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <div className="space-y-3">
          <SubCashesCard d={data} onChange={onChange} />
          {/* WP 2786a36e (Beta v1.1): Alt Kasalar'ın hemen altında. */}
          <CashHoldersWidget
            businessId={data.business_id}
            onChange={onChange}
          />
        </div>
        <div className="space-y-3">
          <UpcomingChequesCard d={data} />
          <UpcomingRemindersCard d={data} />
        </div>
      </div>

      {/* Row 4 — en altta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BankAccountsCard d={data} compact onChange={onChange} />
        <PosDevicesCard d={data} compact />
      </div>
    </div>
  );
}
