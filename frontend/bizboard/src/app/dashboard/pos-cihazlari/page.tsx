"use client";

/**
 * v1.6.4: POS Cihazları sayfası.
 *
 * Veriler:
 *   GET /api/pos/businesses          — POS işlemi olan işletmelerin özeti
 *   GET /api/pos/transactions/daily  — son N gün için günlük POS işlemleri
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  TrendingUp,
  Percent,
  Receipt,
  Loader2,
  Building2,
  Plus,
  Settings,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { Donut, type DonutSegment } from "@/components/shared/charts/Donut";
import { logger } from "@/lib/logger";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import type { PosBusinessSummary, PosTransactionRow, PosDeviceListItem } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

/** v1.6.21 (WP-4): /pos-devices/analytics cevap tipi */
interface PosAnalytics {
  from: string;
  to: string;
  device_id: string | null;
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

export default function PosCihazlariPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";
  const [summaries, setSummaries] = useState<PosBusinessSummary[]>([]);
  const [daily, setDaily] = useState<PosTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBiz, setSelectedBiz] = useState<string | "all">("all");

  // v1.6.21 (WP-4): per-device analytics
  const [devices, setDevices] = useState<PosDeviceListItem[]>([]);
  const [analytics, setAnalytics] = useState<PosAnalytics | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const [s, d, devs, an] = await Promise.all([
          api.get<PosBusinessSummary[]>("/pos/businesses").catch(() => []),
          api.get<PosTransactionRow[]>("/pos/transactions/daily?days=30").catch(() => []),
          api.get<PosDeviceListItem[]>("/pos-devices").catch(() => []),
          api.get<PosAnalytics>("/pos-devices/analytics").catch(() => null),
        ]);
        setSummaries(s || []);
        setDaily(d || []);
        setDevices(devs || []);
        setAnalytics(an);
      } catch (err) {
        logger.error("api", "POS data fetch failed", undefined, err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // v1.6.21 (WP-4): cihaz seçimine göre analytics yeniden çek
  useEffect(() => {
    if (loading) return;
    const url = selectedDevice
      ? `/pos-devices/analytics?deviceId=${selectedDevice}`
      : "/pos-devices/analytics";
    api.get<PosAnalytics>(url).then(setAnalytics).catch(() => {});
  }, [selectedDevice, loading]);

  const totalGross = summaries.reduce((a, b) => a + (b.total_gross || 0), 0);
  const totalCommission = summaries.reduce((a, b) => a + (b.total_commission || 0), 0);
  const totalNet = summaries.reduce((a, b) => a + (b.total_net || 0), 0);

  const filteredDaily = selectedBiz === "all"
    ? daily
    : daily.filter((d) => d.business_id === selectedBiz);

  // Group daily by date for display
  const dailyByDate = filteredDaily.reduce<Record<string, PosTransactionRow[]>>((acc, row) => {
    (acc[row.date] = acc[row.date] || []).push(row);
    return acc;
  }, {});
  const sortedDates = Object.keys(dailyByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="POS Cihazları"
        subtitle="Tüm POS cihaz işlemleri + komisyon + trend"
        icon={CreditCard}
        actions={
          isAdmin ? (
            <Link
              href="/dashboard/pos-cihazlari/yonetim"
              className="v2-btn v2-btn--ink v2-press text-sm"
            >
              <Settings size={14} />
              Cihaz Yönetimi
            </Link>
          ) : undefined
        }
      />

      {/* v1.6.21 (WP-4): Analytics trend chart (30 gün) */}
      {analytics && analytics.series.length > 0 && (
        <PosTrendChart
          analytics={analytics}
          devices={devices}
          selectedDevice={selectedDevice}
          onDeviceChange={setSelectedDevice}
        />
      )}

      {/* v1.6.23.13 (TODO 06ae8217): POS cihazları (kayıtlı) listesi */}
      <RegisteredDevicesCard devices={devices} />

      {/* v1.6.23.9 (TODO ddda6029): Bekleyen POS tahsilatları + toplu settle */}
      <PendingSettlementsCard />


      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-[rgb(var(--accent-bright))]" />
        </div>
      ) : summaries.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Henüz POS işlemi yok"
          description='İşlem eklerken "Ödeme Yöntemi" olarak POS seçiniz.'
          action={
            <Link
              href="/dashboard/add-transaction?payment_method=POS&type=income"
              className="v2-btn v2-btn--ink v2-press text-sm"
            >
              <Plus size={16} />
              POS İşlemi Ekle
            </Link>
          }
        />
      ) : (
        <>
          {/* Toplamlar */}
          <section className="grid grid-cols-3 gap-3">
            <div className="v2-card rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-500 dark:text-surface-400 uppercase tracking-wider">
                <TrendingUp size={12} /> Toplam
              </div>
              <p className="mt-1 text-lg font-bold text-[rgb(var(--v2-ink))]">
                {formatCurrency(totalGross, "TRY")}
              </p>
            </div>
            <div className="v2-card rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-500 dark:text-surface-400 uppercase tracking-wider">
                <Percent size={12} /> Komisyon
              </div>
              <p className="mt-1 text-lg font-bold text-status-danger">
                -{formatCurrency(totalCommission, "TRY")}
              </p>
            </div>
            <div className="v2-card rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-500 dark:text-surface-400 uppercase tracking-wider">
                <Receipt size={12} /> Net
              </div>
              <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(totalNet, "TRY")}
              </p>
            </div>
          </section>

          {/* v1.1 small-win: POS hacim dağılımı (pasta/donut) */}
          <PosDistributionCard summaries={summaries} totalGross={totalGross} />

          {/* İşletme filtre chip'leri */}
          <section>
            <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))] mb-2">İşletme</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedBiz("all")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  selectedBiz === "all"
                    ? "bg-accent/20 border-[rgb(var(--accent))] text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent-bright))]"
                    : "bg-surface-700 border-surface-600 text-surface-300"
                }`}
              >
                Tümü ({summaries.length})
              </button>
              {summaries.map((s) => (
                <button
                  key={s.business_id}
                  onClick={() => setSelectedBiz(s.business_id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                    selectedBiz === s.business_id
                      ? "bg-accent/20 border-[rgb(var(--accent))] text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent-bright))]"
                      : "bg-surface-700 border-surface-600 text-surface-300"
                  }`}
                >
                  <Building2 size={12} />
                  {s.business_name}
                </button>
              ))}
            </div>
          </section>

          {/* İşletme bazlı özet */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">İşletme Bazlı Özet</h2>
            <div className="v2-card rounded-2xl divide-y divide-[rgb(var(--v2-border))]">
              {summaries.map((s) => (
                <Link
                  key={s.business_id}
                  href={`/business/${s.business_id}`}
                  className="block p-4 hover:bg-[rgb(var(--v2-sunken))] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[rgb(var(--v2-ink))]">{s.business_name}</p>
                      <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">
                        {s.transaction_count} işlem · ort. %{s.weighted_avg_rate.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
                        {formatCurrency(s.total_gross, s.currency)}
                      </p>
                      <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                        Net: <span className="text-emerald-700 dark:text-emerald-300">{formatCurrency(s.total_net, s.currency)}</span>
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Günlük POS işlemleri */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
              Günlük POS İşlemleri
              <span className="ml-2 text-xs font-normal text-[rgb(var(--v2-muted))]">son 30 gün</span>
            </h2>
            {sortedDates.length === 0 ? (
              <div className="v2-card rounded-2xl p-6 text-center">
                <p className="text-[rgb(var(--v2-muted))] text-sm">Bu filtre için işlem yok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedDates.map((date) => {
                  const rows = dailyByDate[date];
                  const dayGross = rows.reduce((a, r) => a + r.amount, 0);
                  const dayNet = rows.reduce((a, r) => a + r.net, 0);
                  return (
                    <div key={date} className="v2-card rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-[rgb(var(--v2-border))] flex items-center justify-between">
                        <p className="text-sm font-medium text-[rgb(var(--v2-ink))]">
                          {new Date(date).toLocaleDateString("tr-TR", {
                            day: "numeric", month: "long", weekday: "short",
                          })}
                        </p>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
                            {formatCurrency(dayGross, rows[0]?.currency || "TRY")}
                          </p>
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                            Net {formatCurrency(dayNet, rows[0]?.currency || "TRY")}
                          </p>
                        </div>
                      </div>
                      <div className="divide-y divide-[rgb(var(--v2-border))]">
                        {rows.map((r) => (
                          <div key={r.transaction_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-[rgb(var(--v2-ink))] truncate">
                                {r.description || r.business_name}
                              </p>
                              <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                                {r.business_name} · %{r.pos_rate}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
                                {formatCurrency(r.amount, r.currency)}
                              </p>
                              <p className="text-[10px] text-[rgb(var(--v2-muted))]">
                                <span className="text-status-danger">-{formatCurrency(r.commission, r.currency)}</span>
                                {" · "}
                                <span className="text-emerald-700 dark:text-emerald-300">{formatCurrency(r.net, r.currency)}</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─── v1.1 small-win: POS hacim dağılımı (donut/pasta) ───────────────
const POS_PIE_COLORS = [
  "#65a30d", // accent lime
  "#22c55e", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#a78bfa", // violet
  "#8b5cf6", // violet-alt
  "#f97316", // orange
  "#64748b", // slate (kalan/diğer)
];

function PosDistributionCard({
  summaries,
  totalGross,
}: {
  summaries: PosBusinessSummary[];
  totalGross: number;
}) {
  if (summaries.length < 2 || totalGross <= 0) return null;

  const sorted = [...summaries]
    .filter((s) => (s.total_gross || 0) > 0)
    .sort((a, b) => (b.total_gross || 0) - (a.total_gross || 0));
  if (sorted.length < 2) return null;

  const MAX_SLICES = 7;
  const head = sorted.slice(0, MAX_SLICES);
  const tail = sorted.slice(MAX_SLICES);
  const tailGross = tail.reduce((a, s) => a + (s.total_gross || 0), 0);

  type Slice = { label: string; gross: number; color: string };
  const slices: Slice[] = head.map((s, i) => ({
    label: s.business_name,
    gross: s.total_gross || 0,
    color: POS_PIE_COLORS[i % POS_PIE_COLORS.length],
  }));
  if (tailGross > 0) {
    slices.push({
      label: `Diğer (${tail.length})`,
      gross: tailGross,
      color: POS_PIE_COLORS[POS_PIE_COLORS.length - 1],
    });
  }

  const segments: DonutSegment[] = slices.map((s) => ({
    color: s.color,
    pct: (s.gross / totalGross) * 100,
  }));

  const topPct = segments.length > 0 ? Math.round(segments[0].pct) : 0;

  return (
    <section className="v2-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard size={14} className="text-[rgb(var(--accent-bright))]" />
        <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">POS Hacim Dağılımı</h2>
        <span className="text-[10px] text-[rgb(var(--v2-muted))]">işletme bazlı brüt</span>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <Donut
          segments={segments}
          centerBig={`%${topPct}`}
          centerSmall={slices[0]?.label}
          centerColorClass="text-[rgb(var(--accent-bright))]"
          className="w-36 h-36 shrink-0"
        />
        <ul className="flex-1 w-full space-y-1.5">
          {slices.map((s) => {
            const pct = (s.gross / totalGross) * 100;
            return (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="text-[rgb(var(--v2-ink))] truncate flex-1 min-w-0">{s.label}</span>
                <span className="text-[rgb(var(--v2-ink))] font-medium tabular-nums shrink-0">
                  {formatCurrency(s.gross, "TRY")}
                </span>
                <span className="text-[rgb(var(--v2-muted))] text-[11px] tabular-nums shrink-0 w-10 text-right">
                  %{pct.toFixed(1)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ─── v1.6.21 (WP-4): POS Trend Chart ────────────────────────────────
function PosTrendChart({
  analytics, devices, selectedDevice, onDeviceChange,
}: {
  analytics: PosAnalytics;
  devices: PosDeviceListItem[];
  selectedDevice: string;
  onDeviceChange: (id: string) => void;
}) {
  const series = analytics.series;
  const maxNet = Math.max(...series.map((s) => Math.max(s.gross, s.net)), 1);
  const t = analytics.totals;

  return (
    <section className="v2-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))]">POS Hacmi (30 gün)</h2>
          <p className="text-[11px] text-[rgb(var(--v2-muted))]">
            Brüt <span className="text-emerald-700 dark:text-emerald-300">{formatCurrency(t.gross, "TRY")}</span>
            {" · "}
            <span className="text-[rgb(var(--v2-muted))] text-[10px]">
              Beta v1.1: komisyon hesabı kaldırıldı — hacim = SUM(amount).
            </span>
          </p>
        </div>
        {devices.length > 0 && (
          <div className="min-w-[160px]">
            <DarkSelect
              value={selectedDevice}
              onChange={onDeviceChange}
              placeholder="Tüm cihazlar"
              searchable={devices.length > 6}
              options={devices.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
        )}
      </div>

      <div className="flex items-end gap-0.5 h-32">
        {series.map((s, i) => {
          const grossH = (s.gross / maxNet) * 100;
          const netH = (s.net / maxNet) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative min-w-0">
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 pointer-events-none">
                <div className="bg-surface-800 text-surface-100 rounded-lg p-2 text-[10px] shadow-xl whitespace-nowrap border border-surface-700">
                  <p className="font-bold mb-0.5">
                    {new Date(s.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  </p>
                  <p>{s.tx_count} çekim</p>
                  <p>Brüt: {formatCurrency(s.gross, "TRY")}</p>
                  <p className="text-status-danger">Komisyon: -{formatCurrency(s.commission, "TRY")}</p>
                  <p className="text-emerald-300">Net: {formatCurrency(s.net, "TRY")}</p>
                  {s.unsettled_count > 0 && (
                    <p className="text-amber-300">{s.unsettled_count} bekleyen</p>
                  )}
                </div>
              </div>
              <div className="w-full flex gap-px items-end h-28">
                <div
                  className="flex-1 bg-accent/40 rounded-t-sm transition-all min-h-[1px]"
                  style={{ height: `${Math.max(grossH, 1)}%` }}
                  title="Brüt"
                />
                <div
                  className="flex-1 bg-emerald-500 rounded-t-sm transition-all min-h-[1px]"
                  style={{ height: `${Math.max(netH, 1)}%` }}
                  title="Net"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-[rgb(var(--v2-muted))]">
        <span>{series.length > 0 ? new Date(series[0].date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : ""}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent/40" /> Brüt</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Net</span>
        </span>
        <span>{series.length > 0 ? new Date(series[series.length - 1].date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : ""}</span>
      </div>
    </section>
  );
}


// ─── v1.6.23.9 (TODO ddda6029): Bekleyen POS tahsilatları + toplu settle ──
type UnsettledTx = {
  id: string;
  amount: number;
  pos_net?: number | null;
  pos_commission?: number | null;
  applied_pos_rate?: number | null;
  pos_rate?: number | null;
  pos_device_name?: string | null;
  pos_device_owner_my_company_id?: string | null;
  business_id: string;
  date: string;
  description?: string | null;
};
type BankRow = {
  id: string;
  name: string;
  type: string;
  bank_name?: string | null;
  owner_my_company_id?: string | null;
  owner_my_company_name?: string | null;
};

function PendingSettlementsCard() {
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [items, setItems] = useState<UnsettledTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await api.get<UnsettledTx[]>("/pos/unsettled");
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (loading) {
    return (
      <section className="v2-card rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm text-[rgb(var(--v2-muted))]">
          <Loader2 size={14} className="animate-spin" />
          Bekleyen tahsilatlar yükleniyor…
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  const totalNet = items.reduce((a, t) => a + (t.pos_net ?? 0), 0);
  const selectedItems = items.filter((t) => selectedIds.has(t.id));
  const selectedNetTotal = selectedItems.reduce((a, t) => a + (t.pos_net ?? 0), 0);

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }
  function toggleAll() {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((t) => t.id)));
  }

  return (
    <section className="v2-card rounded-2xl overflow-hidden border-amber-500/30">
      <div className="px-4 py-3 border-b border-[rgb(var(--v2-border))] flex items-center justify-between bg-amber-500/5">
        <div className="flex items-center gap-2">
          <Receipt size={14} className="text-amber-600 dark:text-amber-400" />
          <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">Bekleyen POS Tahsilatları</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            {items.length} işlem · {formatCurrency(totalNet, "TRY")} net
          </span>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
          >
            Seçilenleri hesaba düştü işaretle ({selectedIds.size})
          </button>
        )}
      </div>
      <div className="px-4 py-2 border-b border-[rgb(var(--v2-border))] flex items-center gap-2 text-[11px] text-[rgb(var(--v2-muted))]">
        <input
          type="checkbox"
          checked={selectedIds.size === items.length}
          onChange={toggleAll}
          className="cursor-pointer"
        />
        <span>Hepsini seç</span>
        {selectedIds.size > 0 && (
          <span className="ml-auto text-amber-700 dark:text-amber-300">
            Seçili net: {formatCurrency(selectedNetTotal, "TRY")}
          </span>
        )}
      </div>
      <div className="divide-y divide-[rgb(var(--v2-border))] max-h-96 overflow-y-auto">
        {items.map((t) => {
          const checked = selectedIds.has(t.id);
          return (
            <div
              key={t.id}
              className={cn(
                "px-4 py-2.5 flex items-center gap-3",
                checked && "bg-amber-500/10"
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSelect(t.id)}
                className="cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[rgb(var(--v2-ink))] truncate">
                  {t.description || "POS çekim"}
                  {t.pos_device_name && (
                    <span className="ml-2 text-[rgb(var(--v2-muted))] text-xs">· {t.pos_device_name}</span>
                  )}
                </p>
                <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                  {new Date(t.date).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  +{formatCurrency(t.pos_net ?? t.amount, "TRY")}
                </p>
                <p className="text-[10px] text-[rgb(var(--v2-muted))]">
                  brüt {formatCurrency(t.amount, "TRY")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {showBulkModal && (
        <BulkSettleModal
          txIds={Array.from(selectedIds)}
          selectedTxs={selectedItems}
          totalNet={selectedNetTotal}
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => {
            setShowBulkModal(false);
            setSelectedIds(new Set());
            refresh();
            triggerRefresh();
          }}
        />
      )}
    </section>
  );
}

function BulkSettleModal({
  txIds,
  selectedTxs,
  totalNet,
  onClose,
  onSuccess,
}: {
  txIds: string[];
  selectedTxs: UnsettledTx[];
  totalNet: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [settledAt, setSettledAt] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commonFirmId = (() => {
    const ids = selectedTxs.map((t) => t.pos_device_owner_my_company_id || null);
    const uniq = Array.from(new Set(ids));
    if (uniq.length === 1) return uniq[0];
    return null;
  })();
  const mixedFirms = (() => {
    const ids = selectedTxs
      .map((t) => t.pos_device_owner_my_company_id)
      .filter(Boolean);
    return new Set(ids).size > 1;
  })();

  useEffect(() => {
    api
      .get<BankRow[]>("/bank-accounts")
      .then((rows) => {
        let eligible = rows.filter((b) => b.type === "CHECKING" || b.type === "SAVINGS");
        if (commonFirmId) {
          const firmFiltered = eligible.filter(
            (b) => b.owner_my_company_id === commonFirmId,
          );
          if (firmFiltered.length > 0) eligible = firmFiltered;
        }
        setBanks(eligible);
        if (eligible.length === 1) setSelectedBank(eligible[0].id);
      })
      .catch(() => setError("Banka hesapları yüklenemedi"));
  }, [commonFirmId]);

  async function submit() {
    if (!selectedBank) {
      setError("Banka hesabı seç");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/pos/bulk-settle", {
        transaction_ids: txIds,
        bank_account_id: selectedBank,
        settled_at: settledAt.length > 0 ? `${settledAt}:00` : undefined,
      });
      toast.success("Toplu settle tamamlandı");
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "İşlem başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="modal-surface rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-4 border-b border-[rgb(var(--v2-border))]">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">
            Toplu Settle ({txIds.length} işlem · {formatCurrency(totalNet, "TRY")} net)
          </h3>
          <p className="text-xs text-[rgb(var(--v2-muted))] mt-1">
            Tüm seçili işlemler aynı banka hesabına aynı zamanda işaretlenecek.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-status-danger bg-status-danger/10 border border-status-danger/30 rounded-lg">
              {error}
            </div>
          )}
          {mixedFirms && (
            <div className="p-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              Seçili işlemler farklı firmalara ait POS cihazlarından — banka hesabı dropdown'unda hepsi gösteriliyor. Önerilen: aynı firma'nın işlemlerini ayrı ayrı settle et.
            </div>
          )}
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Banka hesabı</label>
            <DarkSelect
              value={selectedBank}
              onChange={setSelectedBank}
              placeholder="— seç —"
              searchable={banks.length > 6}
              options={banks.map((b) => ({
                value: b.id,
                label: b.name + (b.bank_name ? ` (${b.bank_name})` : ""),
              }))}
              addOption={{
                label: "+ Yeni Banka Hesabı Ekle",
                onClick: () => { window.location.href = "/dashboard/hesaplar"; },
              }}
            />
          </div>
          <div>
            <label className="text-xs text-[rgb(var(--v2-muted))] mb-1 block">Düşme tarihi</label>
            <input
              type="datetime-local"
              value={settledAt}
              onChange={(e) => setSettledAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
            />
          </div>
        </div>
        <div className="p-4 border-t border-[rgb(var(--v2-border))] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm bg-surface-700 text-surface-300 hover:bg-surface-600 disabled:opacity-60"
          >
            İptal
          </button>
          <button
            onClick={submit}
            disabled={submitting || !selectedBank}
            className="px-4 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Kaydediliyor…" : "Onayla"}
          </button>
        </div>
      </div>
    </div>
  );
}

// v1.6.23.13 (TODO 06ae8217 + 5cee5f99): Kayıtlı POS cihazları listesi.
function RegisteredDevicesCard({ devices }: { devices: PosDeviceListItem[] }) {
  if (!devices || devices.length === 0) return null;
  const active = devices.filter((d) => d.is_active);
  const inactive = devices.filter((d) => !d.is_active);
  return (
    <section className="v2-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[rgb(var(--v2-border))] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard size={14} className="text-[rgb(var(--accent-bright))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">Kayıtlı POS Cihazları</h2>
          <span className="v2-chip-accent text-[10px] px-1.5 py-0.5 rounded-full">
            {active.length} aktif{inactive.length > 0 ? ` · ${inactive.length} pasif` : ""}
          </span>
        </div>
      </div>
      <div className="divide-y divide-[rgb(var(--v2-border))]">
        {devices.map((d) => (
          <Link
            key={d.id}
            href={`/dashboard/pos-cihazlari/${d.id}`}
            className={cn(
              "px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[rgb(var(--v2-sunken))] transition-colors",
              !d.is_active && "opacity-60"
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate">
                {d.name}
                {!d.is_active && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]">
                    pasif
                  </span>
                )}
              </p>
              <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                {d.owner_counterpart_name || "—"}
                {d.bank_name && ` · ${d.bank_name}`}
                {d.default_rate != null && ` · varsayılan %${d.default_rate}`}
                {d.last_used_rate != null && ` · son %${d.last_used_rate}`}
              </p>
            </div>
            <ChevronRight size={14} className="text-[rgb(var(--v2-muted))] shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  );
}
