"use client";

/**
 * v1.6.23.23 (UI Fix WP 8b961444): Banka hesabı detay içeriği — reusable.
 *
 * <p>Hem standalone modal ({@link BankAccountDetailModal}) hem de
 * "Para Bulunan Hesaplar" widget'ın açtığı modalın içinde inline kullanılır
 * (POS modal-in-modal pattern ile aynı: tek modal, seçilen hesap için
 * detay endpoint'ten yüklenen full panel).</p>
 *
 * <p>Endpoint: {@code GET /bank-accounts/{id}?recent_limit=10&trend_days=30}.</p>
 */

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, TrendingUp, Receipt, Hourglass } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import type { BankAccountDetail, BankAccountListItem } from "@/types";

interface Props {
  /** Hesap meta'sı — fetch sürerken header/skeleton için minimal info. */
  accountId: string;
  /** Opsiyonel — fetch öncesi gösterilecek hesap (anında subtitle/title için). */
  accountStub?: { name?: string; type?: string; business_name?: string } | null;
  recentLimit?: number;
  trendDays?: number;
}

export function BankAccountDetailContent({
  accountId, recentLimit = 10, trendDays = 30,
}: Props) {
  const [data, setData] = useState<BankAccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .get<BankAccountDetail>(
        `/bank-accounts/${accountId}?recent_limit=${recentLimit}&trend_days=${trendDays}`,
      )
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("Hesap bulunamadı veya erişim yok");
        } else {
          setError("Detay yüklenemedi");
        }
        logger.error("api", "bank-account detail fetch failed", { id: accountId }, err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accountId, recentLimit, trendDays]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={28} className="animate-spin text-surface-400" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      <AccountSummary account={data.account} />
      <BalanceTrendChart trend={data.balance_trend} currency={data.account.currency} />
      <PendingPosList items={data.pending_pos_transactions} />
      <RecentTxList items={data.recent_transactions} />
    </div>
  );
}

function AccountSummary({ account }: { account: BankAccountListItem }) {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat label="Bakiye" value={formatCurrency(account.current_balance, account.currency || "TRY")} accent />
      <Stat label="Tip" value={account.type} />
      <Stat label="Banka" value={account.bank_name || "—"} />
      <Stat label="IBAN" value={account.iban || "—"} mono />
    </section>
  );
}

function Stat({
  label, value, accent, mono,
}: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div className="bg-surface-900 border border-surface-700 rounded-xl p-3">
      <p className="text-[10px] uppercase text-surface-400">{label}</p>
      <p className={cn(
        "mt-1 text-sm font-semibold truncate",
        accent ? "text-emerald-300" : "text-surface-100",
        mono && "font-mono text-[12px]",
      )}>
        {value}
      </p>
    </div>
  );
}

function BalanceTrendChart({
  trend, currency,
}: { trend: { date: string; balance: number }[]; currency: string }) {
  if (!trend.length) return null;
  const values = trend.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const last = values[values.length - 1];
  const first = values[0];
  const delta = last - first;
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider flex items-center gap-1">
          <TrendingUp size={12} /> Son 30 gün
        </h4>
        <span className={cn(
          "text-[11px] font-medium",
          delta >= 0 ? "text-emerald-300" : "text-red-300",
        )}>
          {delta >= 0 ? "+" : ""}{formatCurrency(delta, currency || "TRY")}
        </span>
      </div>
      <div className="h-24 w-full flex items-end gap-px">
        {trend.map((p, i) => {
          const h = ((p.balance - min) / range) * 100;
          return (
            <div
              key={p.date + i}
              className="flex-1 bg-brand-500/40 hover:bg-brand-400 transition-colors rounded-t-sm"
              style={{ height: `${Math.max(2, h)}%` }}
              title={`${p.date}: ${formatCurrency(p.balance, currency || "TRY")}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-surface-500 mt-1">
        <span>{trend[0]?.date}</span>
        <span>{trend[trend.length - 1]?.date}</span>
      </div>
    </section>
  );
}

function PendingPosList({ items }: { items: BankAccountDetail["pending_pos_transactions"] }) {
  if (!items.length) return null;
  const total = items.reduce((s, t) => s + (t.amount || 0), 0);
  return (
    <section>
      <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider mb-2 flex items-center gap-1">
        <Hourglass size={12} /> Bekleyen POS ({items.length}) · {formatCurrency(total, "TRY")}
      </h4>
      <div className="rounded-xl border border-surface-700 divide-y divide-surface-700 max-h-48 overflow-y-auto">
        {items.map((t) => (
          <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <p className="text-surface-200 truncate">
                {t.description || t.pos_device_name || "POS"}
              </p>
              <p className="text-[10px] text-surface-500">{t.date}</p>
            </div>
            <p className="text-amber-300 font-medium shrink-0">
              {formatCurrency(t.amount, t.currency || "TRY")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentTxList({ items }: { items: BankAccountDetail["recent_transactions"] }) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider mb-2 flex items-center gap-1">
        <Receipt size={12} /> Son İşlemler ({items.length})
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-surface-500 italic">Bu hesaba bağlı işlem yok.</p>
      ) : (
        <div className="rounded-xl border border-surface-700 divide-y divide-surface-700">
          {items.map((t) => (
            <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="text-surface-200 truncate">{t.description || "—"}</p>
                <p className="text-[10px] text-surface-500">
                  {t.date} · {t.payment_method}
                </p>
              </div>
              <p className={cn(
                "font-medium shrink-0",
                t.direction === "INCOME" ? "text-emerald-300" : "text-red-300",
              )}>
                {t.direction === "INCOME" ? "+" : "−"}
                {formatCurrency(t.amount, t.currency || "TRY")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
