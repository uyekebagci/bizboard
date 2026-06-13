"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Search,
  Trash2, X, Loader2, AlertTriangle, Pin, Receipt,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { TransactionDetailModal } from "@/components/business/TransactionList";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { InfiniteScrollSentinel } from "@/components/shared/InfiniteScrollSentinel";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { Business, Transaction, FixedCostSummary } from "@/types";

const PAGE_SIZE = 40;

export default function AllTransactionsPage() {
  const { triggerRefresh, refreshKey } = useAppStore();
  // UX-10: Kart/Tablo görünüm tercihi (localStorage'da kalıcı).
  const { mode: viewMode, setMode: setViewMode } = useViewMode("transactions", "card");

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [fixedCosts, setFixedCosts] = useState<{ businessId: string; businessName: string; summary: FixedCostSummary }[]>([]);

  // Filters
  // business_id + direction → SERVER-SIDE (BE DB'de uygular, sayfa 0'dan tazeler).
  // search + month → CLIENT-SIDE (BE bu uçta desteklemiyor) — yüklenen sayfalar
  // üzerinde filtrelenir; kullanıcı kaydırdıkça daha fazla eşleşme yüklenir.
  const [filterBusiness, setFilterBusiness] = useState("");
  const [filterDirection, setFilterDirection] = useState<"" | "income" | "expense">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  // Performans (perf/frontend-quickwins): arama debounce'u. `searchQuery` input'a
  // anlık yansır (controlled), filtreleme ise 280ms gecikmeli `debouncedQuery`
  // üzerinden çalışır → her tuş-vuruşunda tüm listeyi yeniden filtrelemekten
  // kaynaklanan jank ortadan kalkar. Sonuç davranışı aynı.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 280);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Modals
  const [detailTarget, setDetailTarget] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  // PERF (perf/frontend-pagination): işlem listesi artık server-pagination ile
  // sayfalı çekilir (eski "tüm-listeyi-çek" yerine). business_id + direction
  // server-side param; refreshKey değişince (silme/yeni işlem) liste tazelenir.
  const {
    items: transactions,
    totalElements,
    loading,
    loadingMore,
    hasNext,
    loadMore,
  } = usePaginatedList<Transaction>(
    (page, size) => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("size", String(size));
      if (filterBusiness) p.set("business_id", filterBusiness);
      if (filterDirection) p.set("direction", filterDirection);
      return `/portfolio/transactions/all?${p.toString()}`;
    },
    [filterBusiness, filterDirection, refreshKey],
    { size: PAGE_SIZE, label: "Transactions" },
  );

  // İşletme listesi + sabit giderler — tx listesinden bağımsız (tek sefer / refreshKey).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bizData = await api.get<Business[]>("/businesses");
        if (!alive) return;
        const bizList = bizData || [];
        setBusinesses(bizList);

        const fcPromises = bizList.map(async (b) => {
          try {
            const summary = await api.get<FixedCostSummary>(`/businesses/${b.id}/fixed-costs/summary`);
            return { businessId: b.id, businessName: b.name, summary };
          } catch { return null; }
        });
        const fcResults = (await Promise.all(fcPromises)).filter(Boolean) as typeof fixedCosts;
        if (alive) setFixedCosts(fcResults);
      } catch (err) {
        logger.error("api", "Transactions meta fetch error", undefined, err);
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  // Client-side filtering (search + month) — yüklenmiş sayfalar üzerinde.
  // BE bu iki filtreyi desteklemediğinden client-side kalır; infinite-scroll
  // sayesinde kullanıcı kaydırdıkça daha fazla eşleşme yüklenir.
  const hasClientFilter = Boolean(debouncedQuery || filterMonth);
  const filtered = useMemo(() => {
    if (!hasClientFilter) return transactions;
    return transactions.filter((tx) => {
      if (debouncedQuery) {
        const q = debouncedQuery.toLowerCase();
        const descMatch = tx.description?.toLowerCase().includes(q);
        const catMatch = tx.category?.name?.toLowerCase().includes(q);
        const bizMatch = tx.business_name?.toLowerCase().includes(q);
        if (!descMatch && !catMatch && !bizMatch) return false;
      }
      if (filterMonth) {
        const txMonth = tx.date.substring(0, 7); // YYYY-MM
        if (txMonth !== filterMonth) return false;
      }
      return true;
    });
  }, [transactions, debouncedQuery, filterMonth, hasClientFilter]);

  // Stats — yüklenmiş + (client-filtre uygulanmışsa) filtrelenmiş set üzerinden.
  // Server-pagination'la birlikte toplam, scroll ilerledikçe gerçek toplama yakınsar.
  const { totalIncome, totalExpense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of filtered) {
      if (t.direction === "income") income += t.amount;
      else if (t.direction === "expense") expense += t.amount;
    }
    return { totalIncome: income, totalExpense: expense };
  }, [filtered]);

  // Sabit gider toplamı (aylık) — memoized.
  const totalFixedCostMonthly = useMemo(() => {
    return fixedCosts
      .filter((fc) => !filterBusiness || fc.businessId === filterBusiness)
      .reduce((s, fc) => s + (fc.summary?.total_monthly_cost || 0), 0);
  }, [fixedCosts, filterBusiness]);
  const totalWithFixed = totalExpense + totalFixedCostMonthly;

  // "X islem" sayacı: client-filtre yokken gerçek toplam (total_elements);
  // client-filtre varken yüklenmiş eşleşme sayısı.
  const headerCount = hasClientFilter ? filtered.length : totalElements;
  // Toplam henüz tam yüklenmemişse (daha fazla sayfa var) toplamlar "yuklenen"dir.
  const partialTotals = hasNext;

  if (loading) {
    // UX-08: ilk yükleme = skeleton (spinner yerine), layout-shift'i azaltır.
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="h-8 w-48 rounded-lg bg-[rgb(var(--v2-border))]/60 animate-pulse" />
        <div className="h-10 rounded-xl bg-[rgb(var(--v2-border))]/60 animate-pulse" />
        <ListSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">
      {/* Header — UX-07 paylaşılan PageHeader. */}
      <PageHeader
        title="Tum Islemler"
        subtitle={`${headerCount} islem`}
        icon={Receipt}
      />

      {/* Summary cards — UI v2 (Daxa): solid v2-card + lime accent / danger renk. */}
      <div className="grid grid-cols-3 gap-2">
        <div className="v2-card p-3 text-center">
          <p className="v2-eyebrow text-[10px]">
            Gelir{partialTotals && <span className="text-[rgb(var(--v2-muted))]/70"> (yuklenen)</span>}
          </p>
          <p className="num text-sm font-bold text-accent-strong dark:text-accent mt-0.5">
            {formatCurrency(totalIncome)}
          </p>
        </div>
        <div className="v2-card p-3 text-center">
          <p className="v2-eyebrow text-[10px]">
            Gider{partialTotals && <span className="text-[rgb(var(--v2-muted))]/70"> (yuklenen)</span>}
          </p>
          <p className="num text-sm font-bold text-status-danger mt-0.5">
            {formatCurrency(totalWithFixed)}
          </p>
          {totalFixedCostMonthly > 0 && (
            <p className="text-[9px] text-status-danger/80 mt-0.5">
              Islem: {formatCurrency(totalExpense)}
            </p>
          )}
        </div>
        <div className="v2-card p-3 text-center">
          <p className="v2-eyebrow text-[10px]">Net</p>
          <p className={cn(
            "num text-sm font-bold mt-0.5",
            totalIncome - totalWithFixed >= 0 ? "text-accent-strong dark:text-accent" : "text-status-warning"
          )}>
            {formatCurrency(totalIncome - totalWithFixed)}
          </p>
        </div>
      </div>

      {/* Sabit Giderler Özet Kartı */}
      {totalFixedCostMonthly > 0 && (
        <div className="v2-card p-3 border-status-warning/40">
          <div className="flex items-center gap-2 mb-2">
            <Pin size={14} className="text-status-warning" />
            <p className="text-xs font-bold text-status-warning">Aylik Sabit Giderler</p>
            <span className="ml-auto text-sm font-bold text-status-warning">
              {formatCurrency(totalFixedCostMonthly)}/ay
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {fixedCosts
              .filter((fc) => !filterBusiness || fc.businessId === filterBusiness)
              .flatMap((fc) =>
                (fc.summary?.fixed_costs || []).map((c) => ({
                  ...c,
                  bizName: fc.businessName,
                }))
              )
              .filter((c) => c.amount > 0)
              .map((c, i) => (
                <span key={i} className="text-[10px] text-[rgb(var(--v2-muted))]">
                  {c.name}
                  {!filterBusiness && <span className="text-status-warning"> ({c.bizName})</span>}
                  : <span className="font-medium text-[rgb(var(--v2-ink))]">{formatCurrency(c.amount)}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Islem ara... (aciklama, kategori)"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-sm text-[rgb(var(--v2-ink))]
                     placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {/* Business filter */}
        <div className="min-w-[180px]">
          <DarkSelect
            value={filterBusiness}
            onChange={setFilterBusiness}
            placeholder="Tum Isletmeler"
            searchable={businesses.length > 6}
            options={businesses.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>

        {/* Direction filter — UI v2: sunken segment + accent aktif. */}
        <div className="flex items-center gap-1 v2-sunken p-1 rounded-xl">
          {([
            { key: "", label: "Tumu" },
            { key: "income", label: "Gelir" },
            { key: "expense", label: "Gider" },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilterDirection(opt.key as "" | "income" | "expense")}
              aria-pressed={filterDirection === opt.key}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filterDirection === opt.key
                  ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                  : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Month filter */}
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))]
                     focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
        {filterMonth && (
          <button
            onClick={() => setFilterMonth("")}
            aria-label="Ay filtresini temizle"
            className="px-2 py-2 text-xs text-status-danger hover:opacity-80"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* UX-10: Kart / Tablo görünüm değiştirici (sağa hizalı). */}
      <div className="flex items-center justify-between gap-2 -mt-1">
        {hasClientFilter && hasNext ? (
          <p className="text-[11px] text-[rgb(var(--v2-muted))] flex-1 min-w-0">
            Arama/ay filtresi yuklenmis kayitlar uzerinde calisir — devamini gormek
            icin asagi kaydirin.
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Transaction List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={transactions.length === 0 ? "Henuz islem yok" : "Filtreye uygun islem bulunamadi"}
          description={
            transactions.length === 0
              ? "Yeni bir gelir/gider eklediginizde burada listelenir."
              : "Arama veya filtre kriterlerini degistirmeyi deneyin."
          }
        />
      ) : viewMode === "table" ? (
        <>
          {/* UX-10: yoğun "Excel-vari" tablo görünümü — sağ-hizalı .num tutar. */}
          <div className="v2-card v2-table-wrap">
            <table className="v2-table">
              <thead>
                <tr>
                  <th scope="col">Aciklama</th>
                  <th scope="col">Isletme / Kategori</th>
                  <th scope="col">Tarih</th>
                  <th scope="col" className="v2-td-num">Tutar</th>
                  <th scope="col" className="v2-td-num w-10"><span className="sr-only">Islem</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const isIncome = tx.direction === "income";
                  const shown = (tx.payment_method || "NAKIT") === "POS" && tx.pos_net != null
                    ? tx.pos_net : tx.amount;
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setDetailTarget(tx)}
                      className="cursor-pointer"
                    >
                      <td className="font-medium text-[rgb(var(--v2-ink))] max-w-[220px] truncate">
                        {tx.description || tx.category?.name || "Islem"}
                      </td>
                      <td className="text-[rgb(var(--v2-muted))] text-xs max-w-[200px] truncate">
                        {tx.business_name && (
                          <span className="text-accent-strong dark:text-accent">{tx.business_name} · </span>
                        )}
                        {tx.category?.name || "Kategorisiz"}
                      </td>
                      <td className="text-[rgb(var(--v2-muted))] text-xs whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString("tr-TR", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                        })}
                      </td>
                      <td
                        className={cn(
                          "num v2-td-num font-semibold whitespace-nowrap",
                          isIncome ? "text-accent-strong dark:text-accent" : "text-status-danger",
                        )}
                      >
                        {isIncome ? "+" : "-"}{formatCurrency(shown, tx.currency)}
                      </td>
                      <td className="v2-td-num">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(tx); }}
                          aria-label="İşlemi sil"
                          title="Sil"
                          className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-status-danger hover:bg-status-danger/10 transition-all"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <InfiniteScrollSentinel
            hasNext={hasNext}
            loadingMore={loadingMore}
            loadMore={loadMore}
            loadedCount={transactions.length}
            totalCount={totalElements}
          />
        </>
      ) : (
        <>
          <div className="v2-card divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
            {filtered.map((tx) => {
              const isIncome = tx.direction === "income";
              return (
                <div
                  key={tx.id}
                  onClick={() => setDetailTarget(tx)}
                  className="flex items-center gap-3 p-4 hover:bg-[rgb(var(--v2-sunken))] transition-colors cursor-pointer group"
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                      isIncome ? "bg-accent/15" : "bg-status-danger/15"
                    )}
                  >
                    {isIncome ? (
                      <ArrowDownLeft size={18} className="text-accent-strong dark:text-accent" />
                    ) : (
                      <ArrowUpRight size={18} className="text-status-danger" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate">
                      {tx.description || tx.category?.name || "Islem"}
                    </p>
                    <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">
                      {tx.business_name && (
                        <span className="text-accent-strong dark:text-accent">{tx.business_name} · </span>
                      )}
                      {tx.category?.name || "Kategorisiz"} ·{" "}
                      {new Date(tx.date).toLocaleDateString("tr-TR", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  </div>

                  <span
                    className={cn(
                      "num text-sm font-semibold flex-shrink-0 text-right",
                      isIncome ? "text-accent-strong dark:text-accent" : "text-status-danger"
                    )}
                  >
                    {/* v1.6.23.8 (TODO ad8afc6f): POS tx için net göster. */}
                    {isIncome ? "+" : "-"}
                    {formatCurrency(
                      (tx.payment_method || "NAKIT") === "POS" && tx.pos_net != null
                        ? tx.pos_net
                        : tx.amount,
                      tx.currency
                    )}
                    {(tx.payment_method || "NAKIT") === "POS" && tx.pos_net != null
                      && tx.pos_net !== tx.amount && (
                      <span className="block text-[10px] font-normal text-[rgb(var(--v2-muted))] mt-0.5">
                        brüt {formatCurrency(tx.amount, tx.currency)}
                      </span>
                    )}
                  </span>

                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(tx); }}
                    aria-label="İşlemi sil"
                    className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-status-danger hover:bg-status-danger/10
                               opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Sonsuz kaydırma sentinel'i */}
          <InfiniteScrollSentinel
            hasNext={hasNext}
            loadingMore={loadingMore}
            loadMore={loadMore}
            loadedCount={transactions.length}
            totalCount={totalElements}
          />
        </>
      )}

      {/* Detail Modal */}
      {detailTarget && (
        <TransactionDetailModal
          transaction={detailTarget}
          onClose={() => setDetailTarget(null)}
          onDelete={() => { setDetailTarget(null); setDeleteTarget(detailTarget); }}
        />
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteModal
          transaction={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); triggerRefresh(); }}
        />
      )}
    </div>
  );
}

function DeleteModal({
  transaction,
  onClose,
  onDeleted,
}: {
  transaction: Transaction;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isIncome = transaction.direction === "income";

  async function handleDelete() {
    if (!reason.trim()) return;
    setIsDeleting(true);
    setError(null);
    try {
      await api.delete(
        `/businesses/${transaction.business_id}/transactions/${transaction.id}`,
        { reason: reason.trim() }
      );
      toast.info("İşlem silindi");
      onDeleted();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      toast.error(err);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="v2-card shadow-v2-hover w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--v2-border))]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-status-danger/15 flex items-center justify-center">
              <AlertTriangle size={16} className="text-status-danger" />
            </div>
            <h3 className="text-lg font-bold text-[rgb(var(--v2-ink))]">Islemi Sil</h3>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="v2-icon-btn v2-press">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <div className="v2-sunken rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[rgb(var(--v2-ink))]">
                  {transaction.description || transaction.category?.name || "Islem"}
                </p>
                <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">
                  {new Date(transaction.date).toLocaleDateString("tr-TR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </div>
              <span className={cn("text-base font-bold text-right", isIncome ? "text-accent-strong dark:text-accent" : "text-status-danger")}>
                {/* v1.6.23.8 (TODO ad8afc6f): POS net göster. */}
                {isIncome ? "+" : "-"}
                {formatCurrency(
                  (transaction.payment_method || "NAKIT") === "POS" && transaction.pos_net != null
                    ? transaction.pos_net
                    : transaction.amount,
                  transaction.currency
                )}
                {(transaction.payment_method || "NAKIT") === "POS" && transaction.pos_net != null
                  && transaction.pos_net !== transaction.amount && (
                  <span className="block text-[10px] font-normal text-[rgb(var(--v2-muted))] mt-0.5">
                    brüt {formatCurrency(transaction.amount, transaction.currency)}
                  </span>
                )}
              </span>
            </div>
          </div>

          <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">
            Silme Sebebi <span className="text-status-danger">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Bu islemi neden siliyorsunuz? (zorunlu)"
            rows={3}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))]
                       placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-status-danger
                       focus:border-transparent transition-all resize-none"
          />

          {error && (
            <div className="bg-status-danger/10 border border-status-danger/30 rounded-xl p-3 mt-3">
              <p className="text-status-danger text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-semibold text-[rgb(var(--v2-ink))] v2-sunken hover:border-accent/50 transition-colors v2-press"
            >
              Vazgec
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting || !reason.trim()}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-status-danger hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 v2-press"
            >
              {isDeleting ? <><Loader2 size={18} className="animate-spin" /> Siliniyor...</> : <><Trash2 size={18} /> Sil</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
