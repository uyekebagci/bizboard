"use client";

/**
 * v1.6.23.13 (TODO 5cee5f99): POS cihazı detay sayfası.
 *
 * Bölümler:
 *   - Cihaz info (name, owner, bank, rate)
 *   - Analytics özet (gross/komisyon/net/settled/unsettled)
 *   - Günlük chart (son 30 gün)
 *   - Tüm tx listesi (settled/unsettled rozetli)
 *   - Bekleyen tahsilatlar (toplu settle linki)
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CreditCard, Loader2, TrendingUp, Percent, Receipt,
  CheckCircle, Clock, Settings,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { formatCurrency, cn } from "@/lib/utils";
import type { Transaction, PosDeviceListItem } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";

interface PosAnalytics {
  from: string;
  to: string;
  device_id?: string | null;
  series: Array<{
    date: string;
    gross: number;
    commission: number;
    net: number;
    tx_count: number;
    settled_count: number;
    unsettled_count: number;
  }>;
  totals: {
    gross: number;
    commission: number;
    net: number;
    tx_count: number;
    settled_count: number;
    unsettled_count: number;
  };
}

export default function PosDeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const refreshKey = useAppStore((s) => s.refreshKey);
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [device, setDevice] = useState<PosDeviceListItem | null>(null);
  const [analytics, setAnalytics] = useState<PosAnalytics | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [d, an, tx] = await Promise.all([
          api.get<PosDeviceListItem>(`/pos-devices/${id}`),
          api.get<PosAnalytics>(`/pos-devices/analytics?deviceId=${id}`).catch(() => null),
          api.get<Transaction[]>(`/pos-devices/${id}/transactions`).catch(() => []),
        ]);
        setDevice(d);
        setAnalytics(an);
        setTxs(tx || []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Veri yüklenemedi");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, refreshKey]);

  const settled = useMemo(() => txs.filter((t) => t.pos_settled === true), [txs]);
  const unsettled = useMemo(() => txs.filter((t) => !t.pos_settled), [txs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-[rgb(var(--accent-bright))]" />
      </div>
    );
  }
  if (error || !device) {
    return (
      <div className="v2-card rounded-2xl p-8 text-center text-[rgb(var(--v2-muted))]">
        {error || "Cihaz bulunamadı"}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title={device.name}
        subtitle={[
          device.owner_counterpart_name,
          device.bank_name,
          !device.is_active ? "pasif" : undefined,
        ].filter(Boolean).join(" · ") || undefined}
        icon={CreditCard}
        actions={
          isAdmin ? (
            <Link
              href="/dashboard/pos-cihazlari/yonetim"
              className="v2-btn v2-btn--ink v2-press text-sm"
            >
              <Settings size={14} />
              Yönetim
            </Link>
          ) : undefined
        }
      />

      {/* Cihaz bilgileri */}
      <section className="v2-card rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Info label="Varsayılan oran" value={device.default_rate != null ? `%${device.default_rate}` : "—"} />
        <Info label="Son kullanılan" value={device.last_used_rate != null ? `%${device.last_used_rate}` : "—"} />
        <Info label="Durum" value={device.is_active ? "Aktif" : "Pasif"} tone={device.is_active ? "pos" : "neg"} />
        <Info label="Sahibi" value={device.owner_counterpart_name || "—"} />
      </section>

      {/* Analytics toplamlar */}
      {analytics && (
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard icon={TrendingUp} label="Brüt" value={analytics.totals.gross} />
          <StatCard icon={Percent} label="Komisyon" value={-analytics.totals.commission} tone="neg" />
          <StatCard icon={Receipt} label="Net" value={analytics.totals.net} tone="pos" />
          <StatCard icon={CheckCircle} label="Settled" value={analytics.totals.settled_count} unit="adet" tone="pos" />
          <StatCard icon={Clock} label="Bekleyen" value={analytics.totals.unsettled_count} unit="adet" tone="warn" />
        </section>
      )}

      {/* Günlük chart */}
      {analytics && analytics.series.length > 0 && (
        <section className="v2-card rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))] mb-3">Son 30 Gün</h2>
          <DailyBarChart series={analytics.series} />
        </section>
      )}

      {/* Bekleyen tahsilatlar */}
      {unsettled.length > 0 && (
        <section className="v2-card rounded-2xl overflow-hidden border-amber-500/30">
          <div className="px-4 py-3 border-b border-[rgb(var(--v2-border))] flex items-center justify-between bg-amber-500/5">
            <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
              Bekleyen Tahsilatlar
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                {unsettled.length} işlem
              </span>
            </h2>
            <Link
              href="/dashboard/pos-cihazlari"
              className="text-xs text-amber-700 dark:text-amber-300 hover:underline"
            >
              Toplu settle →
            </Link>
          </div>
          <div className="divide-y divide-[rgb(var(--v2-border))] max-h-72 overflow-y-auto">
            {unsettled.slice(0, 20).map((t) => (
              <TxRow key={t.id} tx={t} />
            ))}
          </div>
        </section>
      )}

      {/* Tüm işlemler */}
      <section className="v2-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgb(var(--v2-border))] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
            Tüm İşlemler
            <span className="ml-2 text-[10px] text-[rgb(var(--v2-muted))]">({txs.length})</span>
          </h2>
        </div>
        {txs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[rgb(var(--v2-muted))]">Bu cihaz için işlem yok.</p>
        ) : (
          <div className="divide-y divide-[rgb(var(--v2-border))] max-h-96 overflow-y-auto">
            {txs.map((t) => (
              <TxRow key={t.id} tx={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <p className="text-[10px] text-[rgb(var(--v2-muted))] uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-medium mt-0.5",
        tone === "pos" && "text-emerald-700 dark:text-emerald-300",
        tone === "neg" && "text-status-danger",
        !tone && "text-[rgb(var(--v2-ink))]",
      )}>
        {value}
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, unit, tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: number;
  unit?: string;
  tone?: "pos" | "neg" | "warn";
}) {
  const valStr = unit ? `${value} ${unit}` : formatCurrency(value, "TRY");
  return (
    <div className="v2-card rounded-2xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-[rgb(var(--v2-muted))] uppercase tracking-wider">
        <Icon size={11} /> {label}
      </div>
      <p className={cn("mt-1 text-base font-bold",
        tone === "pos" && "text-emerald-700 dark:text-emerald-300",
        tone === "neg" && "text-status-danger",
        tone === "warn" && "text-amber-700 dark:text-amber-300",
        !tone && "text-[rgb(var(--v2-ink))]",
      )}>
        {valStr}
      </p>
    </div>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const isSettled = tx.pos_settled === true;
  const net = tx.pos_net ?? tx.amount;
  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[rgb(var(--v2-ink))] truncate">{tx.description || "POS çekim"}</p>
        <p className="text-[11px] text-[rgb(var(--v2-muted))]">
          {new Date(tx.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
          {tx.pos_rate != null && ` · %${tx.pos_rate}`}
          {isSettled && tx.settled_bank_account_name && ` · ${tx.settled_bank_account_name}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">+{formatCurrency(net, tx.currency)}</p>
        <p className="text-[10px]">
          {isSettled ? (
            <span className="text-emerald-700 dark:text-emerald-300">✓ hesaba düştü</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">⏳ bekleniyor</span>
          )}
        </p>
      </div>
    </div>
  );
}

function DailyBarChart({ series }: { series: PosAnalytics["series"] }) {
  const max = Math.max(...series.map((s) => s.gross), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {series.map((s) => {
        const grossH = (s.gross / max) * 100;
        const netH = (s.net / max) * 100;
        return (
          <div key={s.date} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex gap-px items-end h-full">
              <div
                className="flex-1 bg-accent/40 rounded-t-sm min-h-[1px]"
                style={{ height: `${Math.max(grossH, 1)}%` }}
                title={`${s.date} brüt ${formatCurrency(s.gross, "TRY")}`}
              />
              <div
                className="flex-1 bg-emerald-500 rounded-t-sm min-h-[1px]"
                style={{ height: `${Math.max(netH, 1)}%` }}
                title={`${s.date} net ${formatCurrency(s.net, "TRY")}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
