"use client";

/**
 * v1.6.23.19 (UI Fix WP 8b961444): Banka hesabı detay modalı.
 *
 * <p>Tek endpoint ({@code GET /bank-accounts/{id}}) çağrısı ile dört widget:
 * hesap info + son 10 tx + bekleyen POS + 30 günlük bakiye trendi.</p>
 *
 * <p>UI ana panel ({@code /dashboard/hesaplar/havuz}) hesap satırına tıklandığında
 * bu modal açılır. Modal-in-modal pattern: kapanma backdrop + Esc + X.</p>
 */

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, TrendingUp, Receipt, Hourglass } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { WidgetDetailModal } from "@/components/business/dashboard/WidgetDetailModal";
import type { BankAccountDetail, BankAccountListItem } from "@/types";

interface Props {
  account: BankAccountListItem | null;
  onClose: () => void;
}

export function BankAccountDetailModal({ account, onClose }: Props) {
  const open = !!account;
  const [data, setData] = useState<BankAccountDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<BankAccountDetail>(`/bank-accounts/${account.id}?recent_limit=10&trend_days=30`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("Hesap bulunamadi veya erişim yok");
        } else {
          setError("Detay yuklenemedi");
        }
        logger.error("api", "bank-account detail fetch failed", { id: account.id }, err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  return (
    <WidgetDetailModal
      open={open}
      onClose={onClose}
      title={account?.name || "Hesap Detayı"}
      subtitle={
        account
          ? `${account.business_name ?? "?"} · ${account.type}`
          : undefined
      }
      size="lg"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      )}
      {error && !loading && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {data && !loading && !error && (
        <div className="space-y-5">
          <AccountSummary account={data.account} />
          <BalanceTrendChart trend={data.balance_trend} currency={data.account.currency} />
          <PendingPosList items={data.pending_pos_transactions} />
          <RecentTxList items={data.recent_transactions} />
        </div>
      )}
    </WidgetDetailModal>
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
        accent ? "text-emerald-300" : "text-white",
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
