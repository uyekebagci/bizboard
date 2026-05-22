"use client";

/**
 * v1.6.20 (WP-3): İşletme detay sayfasının tüm consolidated widget'ları.
 *
 * Tek bir GET /businesses/{id}/consolidated cevabını alıp 10+ widget'ı render eder.
 * Her widget kendi card'ı; footer'da "Toplam: X kalem | Y TL" pattern'i.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, Wallet, CreditCard, Banknote, Building2,
  HandCoins, AlertCircle, CalendarClock, Bell, Lock, ChevronRight,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { WidgetDetailModal } from "./WidgetDetailModal";
import { BankAccountDetailContent } from "@/components/bank/BankAccountDetailContent";
import { SubCashDetailContent } from "@/components/bank/SubCashDetailContent";
import { BankAccountCreateForm } from "@/components/bank/BankAccountCreateForm";

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

      {/* Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        {recentTransactionsSlot ?? <div />}
        <CashOutflowsTodayCard d={data} />
      </div>

      {/* Row 3 — Alt Kasalar + Çek/Hatırlatma combined */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <SubCashesCard d={data} onChange={onChange} />
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

// ───────────────────────── 1. KONSOLİDE POZİSYON ─────────────────────────

function ConsolidatedPositionCard({ d }: { d: ConsolidatedDashboard }) {
  const c = d.consolidated;
  // v1.6.23.13 (TODO bb3fceb5): net=0 nötr, 0'ı yeşil sayma.
  const sign: "pos" | "neg" | "zero" = c.net > 0 ? "pos" : c.net < 0 ? "neg" : "zero";
  // v1.6.23.9 (TODO 8c7ffaac): bekleyen POS tahsilatı (settle olunca eklenecek).
  const pendingPos = c.pending_pos_receivables ?? 0;
  const expectedNet = c.expected_net ?? c.net;
  // v1.6.23.15 (TODO d0ccb7f0): widget tıklanabilir → detay modal
  // v1.6.23.24: 50% width layout için kompakt versiyon. Net + Genel Kasa
  // (= toplam nakit + bank bakiyesi) öne çıkar; KK/Kredi sub-stat'leri detay
  // modal'a taşındı.
  const [showDetail, setShowDetail] = useState(false);
  const genelKasa = (c.total_cash ?? 0) + (c.total_bank_balance ?? 0);
  return (
    <>
    <section
      onClick={() => setShowDetail(true)}
      className="card p-4 bg-gradient-to-br from-brand-700 to-brand-900 text-white cursor-pointer hover:ring-1 hover:ring-brand-400 transition-all flex flex-col h-full"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowDetail(true); } }}
    >
      <p className="text-brand-200 text-[10px] uppercase tracking-wider mb-2">Konsolide DGR</p>

      {/* Net + Genel Kasa — yan yana iki primary metric */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-brand-200 text-[10px] uppercase tracking-wider mb-0.5">Net</p>
          <p className="text-2xl font-bold truncate" title={formatCurrency(c.net, "TRY")}>
            {formatCurrency(c.net, "TRY")}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-brand-200">
            {sign === "pos" && <><TrendingUp size={10} /> pozitif</>}
            {sign === "neg" && <><TrendingDown size={10} /> negatif</>}
            {sign === "zero" && <>— sıfır</>}
          </div>
        </div>
        <div>
          <p className="text-brand-200 text-[10px] uppercase tracking-wider mb-0.5">Genel Kasa</p>
          <p className="text-2xl font-bold truncate" title={formatCurrency(genelKasa, "TRY")}>
            {formatCurrency(genelKasa, "TRY")}
          </p>
          <p className="mt-1 text-[10px] text-brand-200">nakit + banka</p>
        </div>
      </div>

      {/* Sub-stat row: 3 küçük metric */}
      <div className="mt-3 pt-3 border-t border-brand-600/50 grid grid-cols-3 gap-2 text-[10px]">
        <PositionStat label="Alacaklar" value={c.receivables} tone="positive" />
        <PositionStat label="Verecekler" value={-Math.abs(c.payables)} tone="negative" />
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
        <DetailRow label="Alacaklar (DGR'ye gelecek)" value={c.receivables} tone="pos" />
        <DetailRow label="Verecekler (DGR'den gidecek)" value={-Math.abs(c.payables)} tone="neg" />
        <DetailRow label="KK Borcu" value={-Math.abs(c.credit_card_debt)} tone="neg" />
        <DetailRow label="Kredi Anapara" value={-Math.abs(c.loan_principal)} tone="neg" />
        <div className="pt-2 border-t border-surface-700">
          <DetailRow label="Şimdiki Net" value={c.net} tone={sign === "pos" ? "pos" : sign === "neg" ? "neg" : "neutral"} bold />
          {pendingPos > 0 && (
            <DetailRow label="Beklenen Net (settle sonrası)" value={expectedNet} tone="pos" bold />
          )}
        </div>
        <p className="text-[11px] text-surface-400 pt-2">
          Formül: total_cash + bank_balance + receivables − payables − cc − loan
        </p>
      </div>
    </WidgetDetailModal>
    </>
  );
}

function DetailRow({
  label, value, tone, bold,
}: {
  label: string; value: number;
  tone: "pos" | "neg" | "warn" | "neutral";
  bold?: boolean;
}) {
  const colorClass = {
    pos: "text-emerald-300",
    neg: "text-red-300",
    warn: "text-amber-300",
    neutral: "text-white",
  }[tone];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-surface-300 text-xs">{label}</span>
      <span className={cn("font-mono", bold && "font-bold text-base", !bold && "text-sm", colorClass)}>
        {formatCurrency(value, "TRY")}
      </span>
    </div>
  );
}

function PositionStat({ label, value, tone }: { label: string; value: number; tone: "positive" | "negative" }) {
  // v1.6.23.8 (DGR perspective hotfix): negative tone'da minus sign explicit.
  // value < 0 ise formatCurrency zaten "-" prefix verir. Pozitif değerlerde
  // tone=negative ise (defensive — caller -Math.abs zaten veriyor) yine minus göster.
  const displayValue = tone === "negative" && value > 0 ? -value : value;
  return (
    <div>
      <p className="text-brand-200 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-bold mt-0.5", tone === "negative" ? "text-red-200" : "text-white")}>
        {formatCurrency(displayValue, "TRY")}
      </p>
    </div>
  );
}

// ───────────────────────── 2. BUGÜNÜN KASA DURUMU ─────────────────────────

function TodayClosingCard({ d, onCloseDay }: { d: ConsolidatedDashboard; onCloseDay?: () => void }) {
  const t = d.today_closing;
  // v1.6.23.15 (TODO d0ccb7f0): tıklanabilir → detay modal
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
    <section
      onClick={(e) => {
        // "Günü Kapat" butonuna tıklanmışsa modal açma
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        setShowDetail(true);
      }}
      className={cn(
      "card p-4 border cursor-pointer hover:ring-1 transition-all",
      t.closed
        ? "border-emerald-500/20 bg-emerald-500/5 hover:ring-emerald-500/40"
        : "border-amber-500/30 bg-amber-500/5 hover:ring-amber-500/40",
    )}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
          {t.closed ? <Lock size={14} className="text-emerald-400" /> : <CalendarClock size={14} className="text-amber-400" />}
          Bugünün Kasa Durumu
        </h3>
        {t.is_auto && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-300 border border-surface-600">OTO</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Açılış" value={t.opening_balance} />
        <Stat label="Hesaplanan" value={t.computed_closing} bold />
        <Stat label="Gelen" value={t.incoming} tone="positive" />
        <Stat label="Giden" value={-t.outgoing} tone="negative" />
        {t.actual_balance != null && (
          <>
            <Stat label="Sayım" value={t.actual_balance} />
            {t.difference != null && t.difference !== 0 && (
              <Stat
                label="Fark"
                value={t.difference}
                tone={t.difference < 0 ? "negative" : "positive"}
              />
            )}
          </>
        )}
      </div>

      {!t.closed && onCloseDay && (
        // v1.6.23.13 (TODO ca443172): yanlış basılma riskini azaltmak için
        // küçük + secondary stil — modal zaten confirm görevi görüyor.
        <div className="mt-3 flex justify-end">
          <button
            onClick={onCloseDay}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
            title="Günü kapat — fiziksel sayım modal'ı açılır"
          >
            Günü Kapat
          </button>
        </div>
      )}
    </section>
    {/* v1.6.23.15 (TODO d0ccb7f0): Bugünün kasa detayı modal */}
    <WidgetDetailModal
      open={showDetail}
      onClose={() => setShowDetail(false)}
      title="Bugünün Kasa Durumu — Detay"
      subtitle={t.closed ? "Kapanmış (final)" : "Açık (gün içi)"}
      size="md"
    >
      <div className="space-y-3 text-sm text-surface-200">
        <DetailRow label="Açılış Bakiyesi" value={t.opening_balance} tone="neutral" />
        <DetailRow label="Bugün Gelen (NAKIT in)" value={t.incoming} tone="pos" />
        <DetailRow label="Bugün Giden (NAKIT out)" value={-Math.abs(t.outgoing)} tone="neg" />
        <div className="pt-2 border-t border-surface-700">
          <DetailRow
            label="Hesaplanan Kapanış"
            value={t.computed_closing}
            tone="neutral"
            bold
          />
          {t.actual_balance != null && (
            <>
              <DetailRow label="Fiziksel Sayım" value={t.actual_balance} tone="neutral" bold />
              {t.difference != null && t.difference !== 0 && (
                <DetailRow
                  label="Fark (sayım − hesap)"
                  value={t.difference}
                  tone={t.difference < 0 ? "neg" : "pos"}
                />
              )}
            </>
          )}
        </div>
        <p className="text-[11px] text-surface-400 pt-2">
          Formül: opening_balance + NAKIT income − NAKIT expense = computed_closing.
          Fiziksel sayım girilince fark hesaplanır.
        </p>
      </div>
    </WidgetDetailModal>
    </>
  );
}

// ───────────────────────── 3. POS CİHAZLARI ─────────────────────────

function PosDevicesCard({ d, compact }: { d: ConsolidatedDashboard; compact?: boolean }) {
  // v1.6.23.16 (TODO d0ccb7f0 expansion): tıkla → modal
  const [showDetail, setShowDetail] = useState(false);
  // v1.6.23.17: modal içinde cihaz seçilince in-place detay (geri = liste).
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const selectedDevice = selectedDeviceId
    ? d.pos_devices.find((dev) => dev.device_id === selectedDeviceId) || null
    : null;
  const devs = d.pos_devices;
  if (devs.length === 0) {
    return (
      <section className="card p-4">
        <SectionTitle icon={CreditCard} label="POS Cihazları" />
        <p className="text-xs text-surface-400 py-2">Aktif POS cihazı yok.</p>
      </section>
    );
  }
  const totalGross = devs.reduce((a, x) => a + x.today_gross, 0);
  const totalNet = devs.reduce((a, x) => a + x.today_net, 0);
  const unsettled = devs.reduce((a, x) => a + x.unsettled_count, 0);
  const totalTx = devs.reduce((a, x) => a + x.tx_count, 0);

  return (
    <>
    <section
      onClick={() => setShowDetail(true)}
      className="card overflow-hidden cursor-pointer hover:ring-1 hover:ring-indigo-500/40 transition-all"
    >
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <SectionTitle icon={CreditCard} label="POS Cihazları (Bugün)" inline />
        {unsettled > 0 && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {unsettled} bekliyor
          </span>
        )}
      </div>
      <div className="divide-y divide-surface-700">
        {devs.map((dev) => (
          <div key={dev.device_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{dev.device_name}</p>
              <p className="text-[11px] text-surface-400">{dev.tx_count} çekim
                {dev.unsettled_count > 0 && (
                  <span className="ml-1.5 text-amber-300">· {dev.unsettled_count} hesaba düşmedi</span>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-white">{formatCurrency(dev.today_gross, "TRY")}</p>
              <p className="text-[10px]">
                <span className="text-red-300">-{formatCurrency(dev.today_commission, "TRY")}</span>
                {" · "}
                <span className="text-emerald-300">{formatCurrency(dev.today_net, "TRY")}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
      <Footer
        left={`${totalTx} çekim`}
        right={
          <span>
            Brüt {formatCurrency(totalGross, "TRY")}
            {" · Net "}
            <span className="text-emerald-300">{formatCurrency(totalNet, "TRY")}</span>
          </span>
        }
      />
    </section>
    <WidgetDetailModal
      open={showDetail}
      onClose={() => { setShowDetail(false); setSelectedDeviceId(null); }}
      title={selectedDevice ? selectedDevice.device_name : "POS Cihazları — Detay"}
      subtitle={
        selectedDevice
          ? `${selectedDevice.tx_count} bugünkü çekim · ${selectedDevice.unsettled_count} bekleyen`
          : `${devs.length} cihaz · ${totalTx} bugünkü çekim · ${unsettled} bekleyen`
      }
      size="lg"
      headerAction={
        selectedDevice ? (
          <button
            type="button"
            onClick={() => setSelectedDeviceId(null)}
            className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 flex items-center gap-1"
          >
            ← Cihaz Listesi
          </button>
        ) : (
          <Link
            href="/dashboard/pos-cihazlari"
            onClick={() => { setShowDetail(false); setSelectedDeviceId(null); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Tüm POS Sayfası →
          </Link>
        )
      }
    >
      {selectedDevice ? (
        // v1.6.23.17: cihaz detay görünümü — modal içinde inline
        <PosDeviceModalDetail
          device={selectedDevice}
          onClose={() => { setShowDetail(false); setSelectedDeviceId(null); }}
        />
      ) : (
        <>
          <p className="text-xs text-surface-400 mb-3">
            Her cihaza tıklayarak detayını bu modal üzerinde görebilirsin (sayfa değişimi yok).
          </p>
          <div className="space-y-2">
            {devs.map((dev) => (
              <button
                key={dev.device_id}
                type="button"
                onClick={() => setSelectedDeviceId(dev.device_id)}
                className="w-full text-left block p-3 rounded-lg border border-surface-700 hover:border-indigo-500/40 hover:bg-surface-700/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{dev.device_name}</p>
                    <p className="text-[11px] text-surface-400 mt-0.5">
                      {dev.tx_count} bugünkü çekim
                      {dev.unsettled_count > 0 && (
                        <span className="ml-1.5 text-amber-300">· {dev.unsettled_count} hesaba düşmedi</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-white">{formatCurrency(dev.today_gross, "TRY")} brüt</p>
                    <p className="text-[10px] text-emerald-300">{formatCurrency(dev.today_net, "TRY")} net</p>
                  </div>
                  <ChevronRight size={14} className="text-surface-400" />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </WidgetDetailModal>
    </>
  );
}

// ───────────────────────── 4. PARA BULUNAN HESAPLAR ─────────────────────────

function BankAccountsCard({
  d, compact, onChange,
}: { d: ConsolidatedDashboard; compact?: boolean; onChange?: () => void }) {
  // v1.6.23.16 (TODO d0ccb7f0): tıkla → modal
  // v1.6.23.23: POS modal-in-modal pattern (detay inline).
  // v1.6.23.26 (TODO b12c1dce): "+ Hesap Ekle" + "+ Kasa Oluştur" nested
  // create form — modal dışına çıkmadan inline hesap/kasa ekleme; submit
  // sonrası ana liste refresh + parent consolidated cache invalidate.
  type View = "LIST" | "DETAIL" | "CREATE_ANY" | "CREATE_SUB_CASH";
  const [showDetail, setShowDetail] = useState(false);
  const [view, setView] = useState<View>("LIST");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const accounts = d.bank_accounts;
  const selectedAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId) || null
    : null;
  const businessId = d.business_id;

  function resetModal() {
    setShowDetail(false);
    setView("LIST");
    setSelectedAccountId(null);
  }
  function handleCreated() {
    setView("LIST");
    onChange?.();
  }

  if (accounts.length === 0) {
    // v1.6.23.26: boş durumda bile widget tıklanabilir → CREATE_ANY ile aç
    return (
      <>
      <section
        onClick={() => { setShowDetail(true); setView("CREATE_ANY"); }}
        className="card p-4 cursor-pointer hover:ring-1 hover:ring-blue-500/40 transition-all"
      >
        <SectionTitle icon={Wallet} label="Para Bulunan Hesaplar" />
        <p className="text-xs text-surface-400 py-2">Henüz hesap eklenmemiş. + ekle</p>
      </section>
      <WidgetDetailModal
        open={showDetail}
        onClose={resetModal}
        title="Yeni Hesap"
        size="lg"
      >
        <BankAccountCreateForm
          mode="ANY"
          preselectedBusinessId={businessId}
          businesses={businessId ? [{ id: businessId, name: "" }] : []}
          onCancel={resetModal}
          onCreated={() => { resetModal(); onChange?.(); }}
        />
      </WidgetDetailModal>
      </>
    );
  }

  const total = accounts.reduce((a, x) => a + x.balance, 0);

  // Modal başlığı + headerAction view'a göre değişir
  const modalTitle =
    view === "DETAIL" && selectedAccount ? selectedAccount.name :
    view === "CREATE_ANY" ? "Yeni Hesap" :
    view === "CREATE_SUB_CASH" ? "Yeni Kasa" :
    "Para Bulunan Hesaplar — Detay";

  const modalSubtitle =
    view === "DETAIL" && selectedAccount
      ? `${selectedAccount.type}${selectedAccount.bank_name ? " · " + selectedAccount.bank_name : ""}`
      : view === "CREATE_ANY"
        ? "Hesap tipi seç ve detay gir — modal kapanmadan kaydedilir"
        : view === "CREATE_SUB_CASH"
        ? "Alt kasa oluştur — Ana Kasa dışı ek nakit havuzu"
        : `${accounts.length} hesap · toplam ${formatCurrency(total, "TRY")}`;

  const headerAction =
    view === "LIST" ? (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setView("CREATE_ANY")}
          className="text-[11px] px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1"
          title="Yeni banka / kişide hesap"
        >
          <Wallet size={11} />
          + Hesap Ekle
        </button>
        <button
          type="button"
          onClick={() => setView("CREATE_SUB_CASH")}
          className="text-[11px] px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
          title="Yeni alt kasa"
        >
          <Banknote size={11} />
          + Kasa Oluştur
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => { setView("LIST"); setSelectedAccountId(null); }}
        className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 flex items-center gap-1"
      >
        ← Hesap Listesi
      </button>
    );

  return (
    <>
    <section
      onClick={() => setShowDetail(true)}
      className="card overflow-hidden cursor-pointer hover:ring-1 hover:ring-blue-500/40 transition-all"
    >
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={Wallet} label="Para Bulunan Hesaplar" inline />
      </div>
      <div className="divide-y divide-surface-700">
        {accounts.map((a) => (
          <div key={a.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <TypeBadge type={a.type} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{a.name}</p>
                <p className="text-[11px] text-surface-400 truncate">
                  {a.type === "CASH_HOLDER" && a.holder_name
                    ? `Kişide: ${a.holder_name}`
                    : a.bank_name || "—"}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold text-white shrink-0">
              {formatCurrency(a.balance, a.currency || "TRY")}
            </p>
          </div>
        ))}
      </div>
      <Footer left={`${accounts.length} hesap`} right={`Toplam ${formatCurrency(total, "TRY")}`} />
    </section>
    <WidgetDetailModal
      open={showDetail}
      onClose={resetModal}
      title={modalTitle}
      subtitle={modalSubtitle}
      size="lg"
      headerAction={headerAction}
    >
      {view === "DETAIL" && selectedAccount && (
        // v1.6.23.28 (UI Fix WP TODO 635e1c91 tetikleyici fix): SUB_CASH için
        // SubCashDetailContent (aggregate + atama yönetimi). Diğer tipler için
        // BankAccountDetailContent (son tx + trend).
        selectedAccount.type === "SUB_CASH"
          ? <SubCashDetailContent subCashId={selectedAccount.id} onChange={onChange} />
          : <BankAccountDetailContent accountId={selectedAccount.id} />
      )}

      {view === "CREATE_ANY" && (
        <BankAccountCreateForm
          mode="ANY"
          preselectedBusinessId={businessId}
          businesses={businessId ? [{ id: businessId, name: "" }] : []}
          onCancel={() => setView("LIST")}
          onCreated={handleCreated}
        />
      )}

      {view === "CREATE_SUB_CASH" && (
        <BankAccountCreateForm
          mode="SUB_CASH"
          preselectedBusinessId={businessId}
          businesses={businessId ? [{ id: businessId, name: "" }] : []}
          onCancel={() => setView("LIST")}
          onCreated={handleCreated}
        />
      )}

      {view === "LIST" && (
        <>
          <p className="text-xs text-surface-400 mb-3">
            Her hesaba tıklayarak detayını bu modal üzerinde görebilirsin.
            Yukarıdan yeni hesap veya kasa ekleyebilirsin.
          </p>
          <div className="space-y-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setSelectedAccountId(a.id); setView("DETAIL"); }}
                className="w-full text-left block p-3 rounded-lg border border-surface-700 hover:border-blue-500/40 hover:bg-surface-700/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <TypeBadge type={a.type} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{a.name}</p>
                      <p className="text-[11px] text-surface-400 truncate">
                        {a.type === "CASH_HOLDER" && a.holder_name
                          ? `Kişide: ${a.holder_name}`
                          : a.bank_name || "—"}
                        {a.currency && a.currency !== "TRY" && ` · ${a.currency}`}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white shrink-0">
                    {formatCurrency(a.balance, a.currency || "TRY")}
                  </p>
                  <ChevronRight size={14} className="text-surface-400" />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-surface-700 flex items-center justify-between text-sm">
            <span className="text-surface-300">Toplam</span>
            <span className="font-bold text-white">{formatCurrency(total, "TRY")}</span>
          </div>
        </>
      )}
    </WidgetDetailModal>
    </>
  );
}

function TypeBadge({ type }: { type: string }) {
  // v1.6.23.25: MAIN_CASH (Ana Kasa, amber/locked) + SUB_CASH (Alt Kasa, emerald)
  // ayrımı. Legacy CASH (kullanılmıyor ama eski cache için fallback olarak SUB_CASH'a map'li).
  const map: Record<string, { label: string; cls: string; icon: typeof Wallet }> = {
    CHECKING:    { label: "Banka",     cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",         icon: Building2 },
    SAVINGS:     { label: "Vadeli",    cls: "bg-purple-500/15 text-purple-300 border-purple-500/30",   icon: Building2 },
    MAIN_CASH:   { label: "Ana Kasa",  cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",      icon: Banknote },
    SUB_CASH:    { label: "Alt Kasa",  cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: Banknote },
    CASH:        { label: "Kasa",      cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: Banknote },
    CASH_HOLDER: { label: "Kişide",    cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",   icon: HandCoins },
  };
  const m = map[type] || { label: type, cls: "bg-surface-700 text-surface-300 border-surface-600", icon: Wallet };
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border ${m.cls}`}>
      <Icon size={10} />
      {m.label}
    </span>
  );
}

// ───────────────────────── 4b. ALT KASALAR (SUB-CASH) ─────────────────────────

/**
 * v1.6.23.29 (UI Fix WP): Alt Kasalar widget'ı.
 *
 * <p>Konsolide panoda SUB_CASH listesi — her satır: ad + aggregate balance.
 * Tıklayınca BankAccountsCard'ın modal flow'una atlar (yeni modal-in-modal
 * değil; aynı modal'da DETAIL view → SubCashDetailContent). "+ Yeni Kasa"
 * tetikleyicisi widget üzerinde direkt CREATE_SUB_CASH view'ını açar.</p>
 *
 * <p>Boş state: "Henüz alt kasa yok" + "+ Kasa Oluştur" CTA.</p>
 */
function SubCashesCard({
  d, onChange,
}: { d: ConsolidatedDashboard; onChange?: () => void }) {
  const subCashes = d.bank_accounts.filter((a) => a.type === "SUB_CASH");
  const total = subCashes.reduce((s, a) => s + (a.balance || 0), 0);

  type View = "LIST" | "DETAIL" | "CREATE";
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState<View>("LIST");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const businessId = d.business_id;

  function reset() {
    setShowModal(false);
    setView("LIST");
    setSelectedId(null);
  }

  const headerAction =
    view === "LIST" ? (
      <button
        type="button"
        onClick={() => setView("CREATE")}
        className="text-[11px] px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
      >
        <Banknote size={11} />
        + Kasa Oluştur
      </button>
    ) : (
      <button
        type="button"
        onClick={() => { setView("LIST"); setSelectedId(null); }}
        className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 flex items-center gap-1"
      >
        ← Liste
      </button>
    );

  const modalTitle =
    view === "DETAIL" && selectedId
      ? subCashes.find((s) => s.id === selectedId)?.name || "Alt Kasa"
      : view === "CREATE" ? "Yeni Alt Kasa" : "Alt Kasalar — Detay";

  return (
    <>
    <section
      onClick={() => setShowModal(true)}
      className="card overflow-hidden cursor-pointer hover:ring-1 hover:ring-emerald-500/40 transition-all"
    >
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <SectionTitle icon={Banknote} label="Alt Kasalar" inline />
        {subCashes.length > 0 && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {subCashes.length}
          </span>
        )}
      </div>
      {subCashes.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <Banknote size={20} className="mx-auto text-surface-500 mb-1.5" />
          <p className="text-xs text-surface-400">Henüz alt kasa yok</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowModal(true); setView("CREATE"); }}
            className="mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
          >
            <Banknote size={11} />
            + İlk Kasayı Oluştur
          </button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-surface-700">
            {subCashes.map((s) => (
              <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white truncate">{s.name}</p>
                <p className="text-sm font-semibold text-emerald-300 shrink-0">
                  {formatCurrency(s.balance, s.currency || "TRY")}
                </p>
              </div>
            ))}
          </div>
          <Footer
            left={`${subCashes.length} alt kasa`}
            right={
              <span>
                Σ aggregate{" "}
                <span className="text-emerald-300">{formatCurrency(total, "TRY")}</span>
              </span>
            }
          />
        </>
      )}
    </section>

    <WidgetDetailModal
      open={showModal}
      onClose={reset}
      title={modalTitle}
      subtitle={
        view === "LIST"
          ? `${subCashes.length} alt kasa · Σ aggregate ${formatCurrency(total, "TRY")}`
          : view === "DETAIL" && selectedId
          ? subCashes.find((s) => s.id === selectedId)?.bank_name || "SUB_CASH"
          : "Yeni alt kasa (manuel CRUD)"
      }
      size="lg"
      headerAction={headerAction}
    >
      {view === "DETAIL" && selectedId && (
        <SubCashDetailContent subCashId={selectedId} onChange={onChange} />
      )}

      {view === "CREATE" && (
        <BankAccountCreateForm
          mode="SUB_CASH"
          preselectedBusinessId={businessId}
          businesses={businessId ? [{ id: businessId, name: "" }] : []}
          onCancel={() => setView("LIST")}
          onCreated={() => { setView("LIST"); onChange?.(); }}
        />
      )}

      {view === "LIST" && (
        subCashes.length === 0 ? (
          <div className="py-6 text-center">
            <Banknote size={24} className="mx-auto text-surface-500 mb-2" />
            <p className="text-sm text-surface-400 mb-3">
              Henüz alt kasa yok. Banka hesaplarını gruplamak için alt kasa oluştur.
            </p>
            <button
              type="button"
              onClick={() => setView("CREATE")}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1"
            >
              <Banknote size={12} />
              + Kasa Oluştur
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-surface-400 mb-3">
              Her alt kasaya tıklayarak detayını + atanan entity'leri burada görebilirsin.
              Aggregate = atanan BANK_ACCOUNT'ların toplam bakiyesi.
            </p>
            <div className="space-y-2">
              {subCashes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedId(s.id); setView("DETAIL"); }}
                  className="w-full text-left block p-3 rounded-lg border border-surface-700 hover:border-emerald-500/40 hover:bg-surface-700/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{s.name}</p>
                      <p className="text-[11px] text-surface-400">
                        Alt Kasa · {s.currency}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-emerald-300 shrink-0">
                      {formatCurrency(s.balance, s.currency || "TRY")}
                    </p>
                    <ChevronRight size={14} className="text-surface-400" />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-surface-700 flex items-center justify-between text-sm">
              <span className="text-surface-300">Toplam aggregate</span>
              <span className="font-bold text-emerald-300">{formatCurrency(total, "TRY")}</span>
            </div>
          </>
        )
      )}
    </WidgetDetailModal>
    </>
  );
}

// ───────────────────────── 5. VERECEKLER (PAYABLES) ─────────────────────────

function PayablesCard({ d }: { d: ConsolidatedDashboard }) {
  // v1.6.23.16 (TODO d0ccb7f0 expansion): tıkla → modal
  const [showDetail, setShowDetail] = useState(false);
  const list = d.payables;
  if (list.length === 0) {
    return (
      <section className="card p-4">
        <SectionTitle icon={TrendingDown} label="Verecekler" />
        <p className="text-xs text-surface-400 py-2">Açık veriniz yok.</p>
      </section>
    );
  }
  const total = list.reduce((a, x) => a + x.amount, 0);
  const within7d = list.filter((x) => x.days_to_due != null && x.days_to_due <= 7 && x.days_to_due >= 0);
  const within7dTotal = within7d.reduce((a, x) => a + x.amount, 0);
  // v1.6.23.8 (DGR perspective): Verecekler DGR'den gidecek para — minus sign göster.
  // Backend amount magnitude döner (positive); display layer'da negatife çeviriyoruz.
  return (
    <>
    <section
      onClick={() => setShowDetail(true)}
      className="card overflow-hidden cursor-pointer hover:ring-1 hover:ring-red-500/40 transition-all"
    >
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={TrendingDown} label="Verecekler" inline />
      </div>
      <div className="divide-y divide-surface-700 max-h-72 overflow-y-auto">
        {list.slice(0, 8).map((p) => {
          const soon = p.days_to_due != null && p.days_to_due <= 7 && p.days_to_due >= 0;
          return (
            <div key={p.debt_id} className={cn(
              "px-4 py-2.5 flex items-center justify-between gap-3",
              soon && "bg-amber-500/5",
            )}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{p.counterpart_name}</p>
                <p className="text-[11px] text-surface-400">
                  {p.instrument_type || "—"}
                  {p.due_date && (
                    <> · Vade {new Date(p.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</>
                  )}
                </p>
              </div>
              <p className={cn("text-sm font-semibold shrink-0", soon ? "text-amber-300" : "text-red-300")}>
                −{formatCurrency(p.amount, p.currency || "TRY")}
              </p>
            </div>
          );
        })}
      </div>
      <Footer
        left={`${list.length} verecek`}
        right={
          <span className="text-red-300">
            Toplam −{formatCurrency(total, "TRY")}
            {within7d.length > 0 && (
              <span className="ml-1.5 text-amber-300">· 7 gün: −{formatCurrency(within7dTotal, "TRY")}</span>
            )}
          </span>
        }
      />
    </section>
    <WidgetDetailModal
      open={showDetail}
      onClose={() => setShowDetail(false)}
      title="Verecekler — Detay"
      subtitle={`${list.length} satır · toplam −${formatCurrency(total, "TRY")}`}
      size="md"
    >
      <div className="space-y-2">
        {list.map((p) => {
          const soon = p.days_to_due != null && p.days_to_due <= 7 && p.days_to_due >= 0;
          return (
            <div
              key={p.debt_id}
              className={cn(
                "flex items-center justify-between gap-3 p-3 rounded-lg border",
                soon ? "border-amber-500/40 bg-amber-500/5" : "border-surface-700",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{p.counterpart_name}</p>
                <p className="text-[11px] text-surface-400">
                  {p.instrument_type || "—"}
                  {p.due_date && (
                    <> · Vade {new Date(p.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</>
                  )}
                  {p.days_to_due != null && (
                    <span className={soon ? "ml-1.5 text-amber-300" : "ml-1.5 text-surface-500"}>
                      ({p.days_to_due >= 0 ? `${p.days_to_due} gün` : `${Math.abs(p.days_to_due)} gün geçti`})
                    </span>
                  )}
                </p>
              </div>
              <p className={cn("text-sm font-semibold shrink-0", soon ? "text-amber-300" : "text-red-300")}>
                −{formatCurrency(p.amount, p.currency || "TRY")}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-surface-700 flex items-center justify-between text-sm">
        <span className="text-surface-300">Toplam</span>
        <span className="font-bold text-red-300">−{formatCurrency(total, "TRY")}</span>
      </div>
    </WidgetDetailModal>
    </>
  );
}

// ───────────────────────── 6. ALACAKLAR ÖZETİ ─────────────────────────

function ReceivablesSummaryCard({ d }: { d: ConsolidatedDashboard }) {
  // v1.6.23.16 (TODO d0ccb7f0 expansion): tıkla → modal
  const [showDetail, setShowDetail] = useState(false);
  const r = d.receivables;
  if (r.total_count === 0) {
    return (
      <section className="card p-4">
        <SectionTitle icon={HandCoins} label="Alacaklar" />
        <p className="text-xs text-surface-400 py-2">Açık alacak yok.</p>
      </section>
    );
  }
  // v1.6.23.16 (TODO d0ccb7f0 expansion): tıkla → modal (önce Link idi)
  return (
    <>
    <section
      onClick={() => setShowDetail(true)}
      className="card overflow-hidden cursor-pointer hover:ring-1 hover:ring-amber-500/40 transition-all"
    >
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <SectionTitle icon={HandCoins} label="Alacaklar" inline />
        <ChevronRight size={14} className="text-surface-400" />
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-2xl font-bold text-amber-300">{formatCurrency(r.total, "TRY")}</p>
        <div className="flex flex-wrap gap-1.5">
          {r.type_breakdown.map((t) => (
            <span key={t.type}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-surface-700 text-surface-300 border-surface-600">
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
      <div className="space-y-3 text-sm text-surface-200">
        <div>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-1">Toplam Alacak</p>
          <p className="text-2xl font-bold text-amber-300">{formatCurrency(r.total, "TRY")}</p>
          {r.overdue_count > 0 && (
            <p className="text-xs text-red-300 mt-1">
              {r.overdue_count} kayıt vadesi geçmiş — acil takip
            </p>
          )}
        </div>
        <div className="pt-3 border-t border-surface-700">
          <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-2">Tip Dağılımı</p>
          <div className="space-y-1.5">
            {r.type_breakdown.map((t) => (
              <div key={t.type} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-surface-300">
                  {t.type === "UNSPECIFIED" ? "Belirtilmemiş" : t.type}
                  <span className="ml-2 text-surface-500">({t.count} kayıt)</span>
                </span>
                <span className="font-mono text-white">{formatCurrency(t.amount, "TRY")}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-surface-400 pt-2">
          Tüm kayıtların satır-satır listesi için yukarıdaki "Tüm Alacaklar" butonuna tıkla.
        </p>
      </div>
    </WidgetDetailModal>
    </>
  );
}

// v1.6.23.24 (UI Fix WP): NetPositionCard kaldırıldı. Net pozisyon zaten
// ConsolidatedPositionCard'da gösteriliyor (Net + sub-stat'ler), ayrı widget
// gereksizdi.

// ───────────────────────── 8. HESAPTAN HARCAMA (BUGÜN) ─────────────────────────

function CashOutflowsTodayCard({ d }: { d: ConsolidatedDashboard }) {
  const list = d.cash_outflows_today;
  if (list.length === 0) {
    return (
      <section className="card p-4">
        <SectionTitle icon={Banknote} label="Hesaptan Harcama (Bugün)" />
        <p className="text-xs text-surface-400 py-2">Bugün nakit harcama yok.</p>
      </section>
    );
  }
  const total = list.reduce((a, x) => a + x.amount, 0);
  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={Banknote} label="Hesaptan Harcama (Bugün)" inline />
      </div>
      <div className="divide-y divide-surface-700 max-h-72 overflow-y-auto">
        {list.slice(0, 10).map((t) => (
          <div key={t.tx_id} className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white truncate">
                {t.description || t.category_name || "Harcama"}
              </p>
              <p className="text-[11px] text-surface-400 truncate">
                {t.counterpart_name || t.category_name || "—"}
              </p>
            </div>
            <p className="text-sm font-semibold text-red-300 shrink-0">
              -{formatCurrency(t.amount, "TRY")}
            </p>
          </div>
        ))}
      </div>
      <Footer left={`${list.length} harcama`} right={`Toplam -${formatCurrency(total, "TRY")}`} />
    </section>
  );
}

// ───────────────────────── 9. YAKLAŞAN ÇEKLER ─────────────────────────

function UpcomingChequesCard({ d }: { d: ConsolidatedDashboard }) {
  const list = d.upcoming_cheques;
  if (list.length === 0) {
    return (
      <section className="card p-4">
        <SectionTitle icon={CalendarClock} label="Yaklaşan Çekler" />
        <p className="text-xs text-surface-400 py-2">30 gün içinde çek yok.</p>
      </section>
    );
  }
  const total = list.reduce((a, x) => a + x.amount, 0);
  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={CalendarClock} label="Yaklaşan Çekler (30 gün)" inline />
      </div>
      <div className="divide-y divide-surface-700 max-h-72 overflow-y-auto">
        {list.slice(0, 8).map((c) => (
          <div key={c.debt_id} className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{c.counterpart_name}</p>
              <p className="text-[11px] text-surface-400">
                Vade {new Date(c.cheque_due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                {" · "}{c.days_to_due >= 0 ? `${c.days_to_due} gün` : `${Math.abs(c.days_to_due)} gün geçti`}
                {c.collector_bank && <> · {c.collector_bank}</>}
              </p>
            </div>
            <p className="text-sm font-semibold text-purple-300 shrink-0">
              {formatCurrency(c.amount, "TRY")}
            </p>
          </div>
        ))}
      </div>
      <Footer left={`${list.length} çek / 30 gün`} right={`Toplam ${formatCurrency(total, "TRY")}`} />
    </section>
  );
}

// ───────────────────────── 10. YAKLAŞAN HATIRLATMALAR ─────────────────────────

function UpcomingRemindersCard({ d }: { d: ConsolidatedDashboard }) {
  const list = d.upcoming_reminders;
  if (list.length === 0) {
    return (
      <section className="card p-4">
        <SectionTitle icon={Bell} label="Yaklaşan Hatırlatmalar" />
        <p className="text-xs text-surface-400 py-2">7 gün içinde hatırlatma yok.</p>
      </section>
    );
  }
  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={Bell} label="Yaklaşan Hatırlatmalar (7 gün)" inline />
      </div>
      <div className="divide-y divide-surface-700 max-h-72 overflow-y-auto">
        {list.slice(0, 8).map((r) => (
          <div key={r.debt_id} className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white truncate">{r.counterpart_name}</p>
              <p className="text-sm font-semibold text-amber-300 shrink-0">
                {formatCurrency(r.amount, "TRY")}
              </p>
            </div>
            <p className="text-[11px] text-surface-400 mt-0.5">
              {new Date(r.reminder_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
              {" · "}{r.days_to_remind === 0 ? "bugün" : r.days_to_remind > 0 ? `${r.days_to_remind} gün` : `${Math.abs(r.days_to_remind)} gün geçti`}
            </p>
            {r.reminder_note && (
              <p className="text-[11px] text-surface-300 mt-0.5 truncate">{r.reminder_note}</p>
            )}
          </div>
        ))}
      </div>
      <Footer left={`${list.length} hatırlatma`} right="" />
    </section>
  );
}

// ───────────────────────── SHARED ─────────────────────────

function SectionTitle({ icon: Icon, label, inline }: { icon: typeof Wallet; label: string; inline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5", !inline && "mb-2")}>
      <Icon size={14} className="text-surface-400" />
      <h3 className="text-sm font-semibold text-white">{label}</h3>
    </div>
  );
}

function Stat({
  label, value, bold, tone,
}: {
  label: string; value: number; bold?: boolean; tone?: "positive" | "negative";
}) {
  return (
    <div>
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn(
        "mt-0.5",
        bold ? "text-base font-bold text-white" : "text-sm font-medium",
        !bold && tone === "positive" && "text-emerald-300",
        !bold && tone === "negative" && "text-red-300",
        !bold && !tone && "text-white",
      )}>
        {formatCurrency(value, "TRY")}
      </p>
    </div>
  );
}

function Footer({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="px-4 py-2 border-t border-surface-700 flex items-center justify-between text-[11px] text-surface-400 bg-surface-800/50">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

// v1.6.23.17 (TODO d0ccb7f0 expansion): POS device detay — modal içinde inline.
// /pos-cihazlari/[id] sayfasının kompakt versiyonu.
function PosDeviceModalDetail({
  device,
  onClose,
}: {
  device: ConsolidatedDashboard["pos_devices"][number];
  onClose: () => void;
}) {
  type DeviceInfo = {
    id: string; name: string; is_active: boolean;
    default_rate?: number | null; last_used_rate?: number | null;
    owner_counterpart_name?: string | null; bank_name?: string | null;
  };
  type Tx = {
    id: string; date: string; amount: number;
    pos_net?: number | null; pos_settled?: boolean | null;
    settled_bank_account_name?: string | null; description?: string | null;
    currency: string;
  };
  type Analytics = {
    totals: {
      gross: number; commission: number; net: number;
      tx_count: number; settled_count: number; unsettled_count: number;
    };
  };

  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [d, an, tx] = await Promise.all([
          import("@/lib/api/client").then(({ api }) =>
            api.get<DeviceInfo>(`/pos-devices/${device.device_id}`),
          ),
          import("@/lib/api/client").then(({ api }) =>
            api.get<Analytics>(`/pos-devices/analytics?deviceId=${device.device_id}`).catch(() => null),
          ),
          import("@/lib/api/client").then(({ api }) =>
            api.get<Tx[]>(`/pos-devices/${device.device_id}/transactions`).catch(() => []),
          ),
        ]);
        if (!alive) return;
        setInfo(d);
        setAnalytics(an);
        setTxs(tx || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [device.device_id]);

  const unsettledTxs = useMemo(() => txs.filter((t) => !t.pos_settled), [txs]);

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <span className="text-sm text-surface-400">Yükleniyor...</span>
      </div>
    );
  }
  if (!info) {
    return <div className="py-8 text-center text-sm text-surface-400">Cihaz bulunamadı</div>;
  }

  const t = analytics?.totals;
  return (
    <div className="space-y-4">
      {/* Cihaz info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Info label="Sahibi" value={info.owner_counterpart_name || "—"} />
        <Info label="Banka" value={info.bank_name || "—"} />
        <Info label="Varsayılan oran" value={info.default_rate != null ? `%${info.default_rate}` : "—"} />
        <Info label="Durum" value={info.is_active ? "Aktif" : "Pasif"} tone={info.is_active ? "pos" : "neg"} />
      </div>

      {/* Analytics totals */}
      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat2 label="Brüt" value={formatCurrency(t.gross, "TRY")} />
          <Stat2 label="Komisyon" value={`−${formatCurrency(t.commission, "TRY")}`} tone="neg" />
          <Stat2 label="Net" value={formatCurrency(t.net, "TRY")} tone="pos" />
          <Stat2 label="Settled / Bekleyen" value={`${t.settled_count} / ${t.unsettled_count}`} />
        </div>
      )}

      {/* Bekleyen tahsilatlar */}
      {unsettledTxs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wider mb-2">
            Bekleyen Tahsilatlar ({unsettledTxs.length})
          </h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {unsettledTxs.slice(0, 10).map((tx) => (
              <TxMiniRow key={tx.id} tx={tx} />
            ))}
            {unsettledTxs.length > 10 && (
              <p className="text-[11px] text-surface-400 text-center pt-1">
                + {unsettledTxs.length - 10} daha (tam liste detay sayfasında)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Son tx'ler */}
      <div>
        <h4 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-2">
          Son İşlemler ({txs.length} toplam)
        </h4>
        {txs.length === 0 ? (
          <p className="text-xs text-surface-500 text-center py-4">Bu cihaz için işlem yok</p>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {txs.slice(0, 15).map((tx) => (
              <TxMiniRow key={tx.id} tx={tx} />
            ))}
            {txs.length > 15 && (
              <p className="text-[11px] text-surface-400 text-center pt-1">
                + {txs.length - 15} daha
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-surface-700 flex justify-end">
        <Link
          href={`/dashboard/pos-cihazlari/${device.device_id}`}
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Tam Detay Sayfasına Git →
        </Link>
      </div>
    </div>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-medium mt-0.5",
        tone === "pos" && "text-emerald-300",
        tone === "neg" && "text-red-300",
        !tone && "text-white"
      )}>{value}</p>
    </div>
  );
}

function Stat2({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="card p-2.5">
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-bold mt-0.5",
        tone === "pos" && "text-emerald-300",
        tone === "neg" && "text-red-300",
        !tone && "text-white"
      )}>{value}</p>
    </div>
  );
}

function TxMiniRow({ tx }: { tx: { id: string; date: string; amount: number; pos_net?: number | null; pos_settled?: boolean | null; settled_bank_account_name?: string | null; description?: string | null; currency: string } }) {
  const net = tx.pos_net ?? tx.amount;
  const settled = tx.pos_settled === true;
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-surface-700/30 text-xs">
      <div className="min-w-0 flex-1">
        <p className="text-surface-200 truncate">{tx.description || "POS çekim"}</p>
        <p className="text-[10px] text-surface-400">
          {new Date(tx.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
          {settled && tx.settled_bank_account_name && ` · ${tx.settled_bank_account_name}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-emerald-300 font-semibold">+{formatCurrency(net, tx.currency)}</p>
        <p className="text-[9px]">
          {settled ? (
            <span className="text-emerald-300">✓ düştü</span>
          ) : (
            <span className="text-amber-300">⏳ bekliyor</span>
          )}
        </p>
      </div>
    </div>
  );
}

