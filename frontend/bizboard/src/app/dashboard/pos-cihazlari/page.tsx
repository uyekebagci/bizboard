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
  ArrowLeft,
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
import { logger } from "@/lib/logger";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import type { PosBusinessSummary, PosTransactionRow, PosDeviceListItem } from "@/types";

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
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <CreditCard size={20} className="text-indigo-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-surface-100">POS Cihazlari</h1>
              <p className="text-xs text-surface-400">
                Tum POS cihaz islemleri + komisyon + trend
              </p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Link
            href="/dashboard/pos-cihazlari/yonetim"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-xs font-medium"
          >
            <Settings size={14} />
            Cihaz Yonetimi
          </Link>
        )}
      </div>

      {/* v1.6.21 (WP-4): Analytics trend chart (30 gün) */}
      {analytics && analytics.series.length > 0 && (
        <PosTrendChart
          analytics={analytics}
          devices={devices}
          selectedDevice={selectedDevice}
          onDeviceChange={setSelectedDevice}
        />
      )}

      {/* v1.6.23.13 (TODO 06ae8217): POS cihazları (kayıtlı) listesi —
          önceki sürümde sayfada hiç gösterilmiyordu. */}
      <RegisteredDevicesCard devices={devices} />

      {/* v1.6.23.9 (TODO ddda6029): Bekleyen POS tahsilatları + toplu settle */}
      <PendingSettlementsCard />


      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-indigo-400" />
        </div>
      ) : summaries.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CreditCard size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Henuz POS islemi yok</p>
          <p className="text-surface-400 text-sm mt-1">
            Islem eklerken &quot;Odeme Yontemi&quot; olarak POS seciniz.
          </p>
          <Link
            href="/dashboard/add-transaction?payment_method=POS&type=income"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            POS Islemi Ekle
          </Link>
        </div>
      ) : (
        <>
          {/* Totals */}
          <section className="grid grid-cols-3 gap-3">
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-400 uppercase tracking-wider">
                <TrendingUp size={12} /> Toplam
              </div>
              <p className="mt-1 text-lg font-bold text-surface-100">
                {formatCurrency(totalGross, "TRY")}
              </p>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-400 uppercase tracking-wider">
                <Percent size={12} /> Komisyon
              </div>
              <p className="mt-1 text-lg font-bold text-red-300">
                -{formatCurrency(totalCommission, "TRY")}
              </p>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-400 uppercase tracking-wider">
                <Receipt size={12} /> Net
              </div>
              <p className="mt-1 text-lg font-bold text-emerald-300">
                {formatCurrency(totalNet, "TRY")}
              </p>
            </div>
          </section>

          {/* Business filter chips */}
          <section>
            <h2 className="text-sm font-semibold text-surface-200 mb-2">Isletme</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedBiz("all")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  selectedBiz === "all"
                    ? "bg-indigo-500/20 border-indigo-400 text-indigo-200"
                    : "bg-surface-700 border-surface-600 text-surface-300"
                }`}
              >
                Tumu ({summaries.length})
              </button>
              {summaries.map((s) => (
                <button
                  key={s.business_id}
                  onClick={() => setSelectedBiz(s.business_id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                    selectedBiz === s.business_id
                      ? "bg-indigo-500/20 border-indigo-400 text-indigo-200"
                      : "bg-surface-700 border-surface-600 text-surface-300"
                  }`}
                >
                  <Building2 size={12} />
                  {s.business_name}
                </button>
              ))}
            </div>
          </section>

          {/* Per-business cards */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-surface-200">Isletme Bazli Ozet</h2>
            <div className="glass-card divide-y divide-surface-700">
              {summaries.map((s) => (
                <Link
                  key={s.business_id}
                  href={`/business/${s.business_id}`}
                  className="block p-4 hover:bg-surface-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-surface-100">{s.business_name}</p>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {s.transaction_count} islem · ort. %{s.weighted_avg_rate.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-surface-100">
                        {formatCurrency(s.total_gross, s.currency)}
                      </p>
                      <p className="text-[11px] text-surface-400">
                        Net: <span className="text-emerald-300">{formatCurrency(s.total_net, s.currency)}</span>
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Daily transactions */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-surface-200">
              Gunluk POS Islemleri
              <span className="ml-2 text-xs font-normal text-surface-400">son 30 gun</span>
            </h2>
            {sortedDates.length === 0 ? (
              <div className="glass-card p-6 text-center">
                <p className="text-surface-400 text-sm">Bu filtre icin islem yok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedDates.map((date) => {
                  const rows = dailyByDate[date];
                  const dayGross = rows.reduce((a, r) => a + r.amount, 0);
                  const dayNet = rows.reduce((a, r) => a + r.net, 0);
                  return (
                    <div key={date} className="card">
                      <div className="px-4 py-2.5 border-b border-surface-700 flex items-center justify-between">
                        <p className="text-sm font-medium text-surface-200">
                          {new Date(date).toLocaleDateString("tr-TR", {
                            day: "numeric", month: "long", weekday: "short",
                          })}
                        </p>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-surface-100">
                            {formatCurrency(dayGross, rows[0]?.currency || "TRY")}
                          </p>
                          <p className="text-[10px] text-emerald-300">
                            Net {formatCurrency(dayNet, rows[0]?.currency || "TRY")}
                          </p>
                        </div>
                      </div>
                      <div className="divide-y divide-surface-700">
                        {rows.map((r) => (
                          <div key={r.transaction_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-surface-100 truncate">
                                {r.description || r.business_name}
                              </p>
                              <p className="text-[11px] text-surface-400">
                                {r.business_name} · %{r.pos_rate}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-surface-100">
                                {formatCurrency(r.amount, r.currency)}
                              </p>
                              <p className="text-[10px] text-surface-400">
                                <span className="text-red-300">-{formatCurrency(r.commission, r.currency)}</span>
                                {" · "}
                                <span className="text-emerald-300">{formatCurrency(r.net, r.currency)}</span>
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
    <section className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-surface-100">POS Hacmi (30 gün)</h2>
          <p className="text-[11px] text-surface-400">
            Brüt <span className="text-emerald-300">{formatCurrency(t.gross, "TRY")}</span>
            {" · "}
            <span className="text-surface-500 text-[10px]">
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
                  <p className="text-red-300">Komisyon: -{formatCurrency(s.commission, "TRY")}</p>
                  <p className="text-emerald-300">Net: {formatCurrency(s.net, "TRY")}</p>
                  {s.unsettled_count > 0 && (
                    <p className="text-amber-300">{s.unsettled_count} bekleyen</p>
                  )}
                </div>
              </div>
              <div className="w-full flex gap-px items-end h-28">
                <div
                  className="flex-1 bg-indigo-500/50 rounded-t-sm transition-all min-h-[1px]"
                  style={{ height: `${Math.max(grossH, 1)}%` }}
                  title="Brut"
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

      <div className="flex items-center justify-between text-[10px] text-surface-400">
        <span>{series.length > 0 ? new Date(series[0].date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : ""}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500/50" /> Brut</span>
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
  /** v1.7.0.x: POS cihazının firması — bulk-settle bank filter için. */
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
  /** v1.7.0.x: banka hesabının firması — filter için. */
  owner_my_company_id?: string | null;
  owner_my_company_name?: string | null;
};

function PendingSettlementsCard() {
  // v1.6.23.10: bulk-settle sonrası global refresh — dashboard'daki diğer
  // sayfalar (konsolide widget vs.) bir sonraki açılışta güncel olsun.
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

  // refreshKey global trigger'a tepki ver — başka sayfadan settle olduysa
  // bu listeyi de senkron tut.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (loading) {
    return (
      <section className="glass-card p-4">
        <div className="flex items-center gap-2 text-sm text-surface-400">
          <Loader2 size={14} className="animate-spin" />
          Bekleyen tahsilatlar yükleniyor…
        </div>
      </section>
    );
  }
  if (items.length === 0) return null; // hiç bekleyen yoksa widget gizli

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
    <section className="glass-card overflow-hidden border-amber-500/30">
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between bg-amber-500/5">
        <div className="flex items-center gap-2">
          <Receipt size={14} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-surface-100">Bekleyen POS Tahsilatları</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
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
      <div className="px-4 py-2 border-b border-surface-700 flex items-center gap-2 text-[11px] text-surface-400">
        <input
          type="checkbox"
          checked={selectedIds.size === items.length}
          onChange={toggleAll}
          className="cursor-pointer"
        />
        <span>Hepsini seç</span>
        {selectedIds.size > 0 && (
          <span className="ml-auto text-amber-300">
            Seçili net: {formatCurrency(selectedNetTotal, "TRY")}
          </span>
        )}
      </div>
      <div className="divide-y divide-surface-700 max-h-96 overflow-y-auto">
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
                <p className="text-sm text-surface-100 truncate">
                  {t.description || "POS çekim"}
                  {t.pos_device_name && (
                    <span className="ml-2 text-surface-400 text-xs">· {t.pos_device_name}</span>
                  )}
                </p>
                <p className="text-[11px] text-surface-400">
                  {new Date(t.date).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-emerald-300">
                  +{formatCurrency(t.pos_net ?? t.amount, "TRY")}
                </p>
                <p className="text-[10px] text-surface-400">
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
            // v1.6.23.10: global trigger — başka sayfalardaki konsolide
            // widget refreshKey değişimiyle yeniden çekecek.
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

  // v1.7.0.x: seçili POS tx'lerin firma'ları — ortak ise bank filtreliyoruz.
  // Tüm tx'ler aynı firmadan ise common, farklı ise null (hepsi gösterilir + uyarı).
  const commonFirmId = (() => {
    const ids = selectedTxs.map((t) => t.pos_device_owner_my_company_id || null);
    const uniq = Array.from(new Set(ids));
    if (uniq.length === 1) return uniq[0];
    return null; // karışık veya hepsi null
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
        // v1.7.0.x: aynı firmadan POS tx'ler için sadece o firmanın banka
        // hesaplarını göster. Karışıksa veya firma yoksa hepsi görünür.
        if (commonFirmId) {
          const firmFiltered = eligible.filter(
            (b) => b.owner_my_company_id === commonFirmId,
          );
          // Hiç eşleşen yoksa boş dropdown'a düşmemek için tüm hesapları
          // bırak (kullanıcı manuel seçebilsin).
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
      <div className="glass-card shadow-xl w-full max-w-md">
        <div className="p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-surface-100">
            Toplu Settle ({txIds.length} işlem · {formatCurrency(totalNet, "TRY")} net)
          </h3>
          <p className="text-xs text-surface-400 mt-1">
            Tüm seçili işlemler aynı banka hesabına aynı zamanda işaretlenecek.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg">
              {error}
            </div>
          )}
          {mixedFirms && (
            <div className="p-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              ⚠ Seçili işlemler farklı firmalara ait POS cihazlarından — banka hesabı dropdown'unda hepsi gösteriliyor. Önerilen: aynı firma'nın işlemlerini ayrı ayrı settle et.
            </div>
          )}
          <div>
            <label className="text-xs text-surface-300 mb-1 block">Banka hesabı</label>
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
            <label className="text-xs text-surface-300 mb-1 block">Düşme tarihi</label>
            <input
              type="datetime-local"
              value={settledAt}
              onChange={(e) => setSettledAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-surface-100 text-sm"
            />
          </div>
        </div>
        <div className="p-4 border-t border-surface-700 flex justify-end gap-2">
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
// Her satır tıklanabilir → /pos-cihazlari/{id} detay sayfası.
function RegisteredDevicesCard({ devices }: { devices: PosDeviceListItem[] }) {
  if (!devices || devices.length === 0) return null;
  const active = devices.filter((d) => d.is_active);
  const inactive = devices.filter((d) => !d.is_active);
  return (
    <section className="glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard size={14} className="text-indigo-300" />
          <h2 className="text-sm font-semibold text-surface-100">Kayıtlı POS Cihazları</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            {active.length} aktif{inactive.length > 0 ? ` · ${inactive.length} pasif` : ""}
          </span>
        </div>
      </div>
      <div className="divide-y divide-surface-700">
        {devices.map((d) => (
          <Link
            key={d.id}
            href={`/dashboard/pos-cihazlari/${d.id}`}
            className={cn(
              "px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-700/50 transition-colors",
              !d.is_active && "opacity-60"
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-100 truncate">
                {d.name}
                {!d.is_active && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-400">
                    pasif
                  </span>
                )}
              </p>
              <p className="text-[11px] text-surface-400">
                {d.owner_counterpart_name || "—"}
                {d.bank_name && ` · ${d.bank_name}`}
                {d.default_rate != null && ` · varsayılan %${d.default_rate}`}
                {d.last_used_rate != null && ` · son %${d.last_used_rate}`}
              </p>
            </div>
            <ChevronRight size={14} className="text-surface-400 shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  );
}
