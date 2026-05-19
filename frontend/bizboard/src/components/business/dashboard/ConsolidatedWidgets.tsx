"use client";

/**
 * v1.6.20 (WP-3): İşletme detay sayfasının tüm consolidated widget'ları.
 *
 * Tek bir GET /businesses/{id}/consolidated cevabını alıp 10+ widget'ı render eder.
 * Her widget kendi card'ı; footer'da "Toplam: X kalem | Y TL" pattern'i.
 */

import Link from "next/link";
import {
  TrendingUp, TrendingDown, Wallet, CreditCard, Banknote, Building2,
  HandCoins, AlertCircle, CalendarClock, Bell, Lock, ChevronRight,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";

interface Props {
  data: ConsolidatedDashboard;
  onCloseDay?: () => void;
}

export function ConsolidatedWidgets({ data, onCloseDay }: Props) {
  return (
    <div className="space-y-4">
      <ConsolidatedPositionCard d={data} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TodayClosingCard d={data} onCloseDay={onCloseDay} />
        <NetPositionCard d={data} />
      </div>

      <PosDevicesCard d={data} />

      <BankAccountsCard d={data} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PayablesCard d={data} />
        <ReceivablesSummaryCard d={data} />
      </div>

      <CashOutflowsTodayCard d={data} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UpcomingChequesCard d={data} />
        <UpcomingRemindersCard d={data} />
      </div>
    </div>
  );
}

// ───────────────────────── 1. KONSOLİDE POZİSYON ─────────────────────────

function ConsolidatedPositionCard({ d }: { d: ConsolidatedDashboard }) {
  const c = d.consolidated;
  const positive = c.net >= 0;
  return (
    <section className="card p-5 bg-gradient-to-br from-brand-700 to-brand-900 text-white">
      <p className="text-brand-200 text-xs uppercase tracking-wider mb-1">Konsolide Net</p>
      <p className="text-4xl font-bold">{formatCurrency(c.net, "TRY")}</p>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
        <PositionStat label="Toplam Nakit" value={c.total_cash} tone="positive" />
        <PositionStat label="KK Borcu" value={-Math.abs(c.credit_card_debt)} tone="negative" />
        <PositionStat label="Kredi Anapara" value={-Math.abs(c.loan_principal)} tone="negative" />
        <PositionStat label="Alacaklar" value={c.receivables} tone="positive" />
        <PositionStat label="Verecekler" value={-Math.abs(c.payables)} tone="negative" />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-brand-200">
        {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {positive ? "Net pozitif" : "Net negatif"}
      </div>
    </section>
  );
}

function PositionStat({ label, value, tone }: { label: string; value: number; tone: "positive" | "negative" }) {
  return (
    <div>
      <p className="text-brand-200 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-bold mt-0.5", tone === "negative" ? "text-red-200" : "text-white")}>
        {value >= 0 ? formatCurrency(value, "TRY") : formatCurrency(value, "TRY")}
      </p>
    </div>
  );
}

// ───────────────────────── 2. BUGÜNÜN KASA DURUMU ─────────────────────────

function TodayClosingCard({ d, onCloseDay }: { d: ConsolidatedDashboard; onCloseDay?: () => void }) {
  const t = d.today_closing;
  return (
    <section className={cn(
      "card p-4 border",
      t.closed ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5",
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
        <button
          onClick={onCloseDay}
          className="mt-3 w-full px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors"
        >
          Günü Kapat
        </button>
      )}
    </section>
  );
}

// ───────────────────────── 3. POS CİHAZLARI ─────────────────────────

function PosDevicesCard({ d }: { d: ConsolidatedDashboard }) {
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
    <section className="card overflow-hidden">
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
  );
}

// ───────────────────────── 4. PARA BULUNAN HESAPLAR ─────────────────────────

function BankAccountsCard({ d }: { d: ConsolidatedDashboard }) {
  const accounts = d.bank_accounts;
  if (accounts.length === 0) {
    return (
      <section className="card p-4">
        <SectionTitle icon={Wallet} label="Para Bulunan Hesaplar" />
        <p className="text-xs text-surface-400 py-2">Henüz hesap eklenmemiş.</p>
      </section>
    );
  }
  const total = accounts.reduce((a, x) => a + x.balance, 0);
  return (
    <section className="card overflow-hidden">
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
  );
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string; icon: typeof Wallet }> = {
    CHECKING:    { label: "Banka",         cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",   icon: Building2 },
    SAVINGS:     { label: "Vadeli",        cls: "bg-purple-500/15 text-purple-300 border-purple-500/30", icon: Building2 },
    CASH:        { label: "Kasa",          cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: Banknote },
    CASH_HOLDER: { label: "Kişide",        cls: "bg-orange-500/15 text-orange-300 border-orange-500/30", icon: HandCoins },
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

// ───────────────────────── 5. VERECEKLER (PAYABLES) ─────────────────────────

function PayablesCard({ d }: { d: ConsolidatedDashboard }) {
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
  return (
    <section className="card overflow-hidden">
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
                {formatCurrency(p.amount, p.currency || "TRY")}
              </p>
            </div>
          );
        })}
      </div>
      <Footer
        left={`${list.length} verecek`}
        right={
          <span>
            Toplam {formatCurrency(total, "TRY")}
            {within7d.length > 0 && (
              <span className="ml-1.5 text-amber-300">· 7 gün: {formatCurrency(within7dTotal, "TRY")}</span>
            )}
          </span>
        }
      />
    </section>
  );
}

// ───────────────────────── 6. ALACAKLAR ÖZETİ ─────────────────────────

function ReceivablesSummaryCard({ d }: { d: ConsolidatedDashboard }) {
  const r = d.receivables;
  if (r.total_count === 0) {
    return (
      <section className="card p-4">
        <SectionTitle icon={HandCoins} label="Alacaklar" />
        <p className="text-xs text-surface-400 py-2">Açık alacak yok.</p>
      </section>
    );
  }
  return (
    <Link href="/dashboard/alacaklar" className="card overflow-hidden hover:ring-1 hover:ring-amber-500/30 transition-all">
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
    </Link>
  );
}

// ───────────────────────── 7. NET ALACAK/VERECEK ─────────────────────────

function NetPositionCard({ d }: { d: ConsolidatedDashboard }) {
  const n = d.net_position;
  const pos = n.net_positive;
  return (
    <section className={cn(
      "card p-4 border",
      pos ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5",
    )}>
      <SectionTitle icon={pos ? TrendingUp : TrendingDown} label="Net Pozisyon" />
      <p className={cn("mt-2 text-2xl font-bold", pos ? "text-emerald-300" : "text-red-300")}>
        {pos ? "Net Alacaklı" : "Net Borçlu"}: {formatCurrency(Math.abs(n.net), "TRY")}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Alacaklar" value={n.receivables} tone="positive" />
        <Stat label="Verecekler" value={-n.payables} tone="negative" />
      </div>
    </section>
  );
}

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
