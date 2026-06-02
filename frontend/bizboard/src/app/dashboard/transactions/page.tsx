"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, Search, Filter,
  Calendar, Building2, Tag, Trash2, X, Loader2, AlertTriangle, Pin,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { TransactionDetailModal } from "@/components/business/TransactionList";
import { DarkSelect } from "@/components/shared/DarkSelect";
import type { Business, Transaction, FixedCostSummary } from "@/types";

export default function AllTransactionsPage() {
  const router = useRouter();
  const { triggerRefresh, refreshKey } = useAppStore();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [fixedCosts, setFixedCosts] = useState<{ businessId: string; businessName: string; summary: FixedCostSummary }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterBusiness, setFilterBusiness] = useState("");
  const [filterDirection, setFilterDirection] = useState<"" | "income" | "expense">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  // Modals
  const [detailTarget, setDetailTarget] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterBusiness) params.set("business_id", filterBusiness);
      if (filterDirection) params.set("direction", filterDirection);

      const [txData, bizData] = await Promise.all([
        api.get<Transaction[]>(`/portfolio/transactions/all?${params.toString()}`),
        api.get<Business[]>("/businesses"),
      ]);
      setTransactions(txData || []);
      setBusinesses(bizData || []);

      // Sabit giderleri her işletme için fetch et
      const bizList = bizData || [];
      const fcPromises = bizList.map(async (b) => {
        try {
          const summary = await api.get<FixedCostSummary>(`/businesses/${b.id}/fixed-costs/summary`);
          return { businessId: b.id, businessName: b.name, summary };
        } catch { return null; }
      });
      const fcResults = (await Promise.all(fcPromises)).filter(Boolean) as typeof fixedCosts;
      setFixedCosts(fcResults);
    } catch (err) {
      logger.error("api", "Transactions fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  // Refetch when filters change
  useEffect(() => {
    if (!loading) fetchData();
  }, [filterBusiness, filterDirection]);

  // Client-side filtering (search + month)
  const filtered = transactions.filter((tx) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const descMatch = tx.description?.toLowerCase().includes(q);
      const catMatch = tx.category?.name?.toLowerCase().includes(q);
      const bizMatch = tx.business_name?.toLowerCase().includes(q);
      const tagMatch = tx.tags?.some((t) => t.toLowerCase().includes(q));
      if (!descMatch && !catMatch && !bizMatch && !tagMatch) return false;
    }
    if (filterMonth) {
      const txMonth = tx.date.substring(0, 7); // YYYY-MM
      if (txMonth !== filterMonth) return false;
    }
    return true;
  });

  // Stats
  const totalIncome = filtered
    .filter((t) => t.direction === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered
    .filter((t) => t.direction === "expense")
    .reduce((s, t) => s + t.amount, 0);

  // Sabit gider toplamı (aylık)
  const totalFixedCostMonthly = fixedCosts
    .filter((fc) => !filterBusiness || fc.businessId === filterBusiness)
    .reduce((s, fc) => s + (fc.summary?.total_monthly_cost || 0), 0);
  const totalWithFixed = totalExpense + totalFixedCostMonthly;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl mx-auto">
        <div className="h-8 bg-surface-600 rounded-lg w-48" />
        <div className="h-10 bg-surface-600 rounded-xl" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 bg-surface-600 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Tum Islemler</h1>
            <p className="text-xs text-surface-400">{filtered.length} islem</p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-center">
          <p className="text-[10px] text-green-600 uppercase tracking-wider font-medium">Gelir</p>
          <p className="text-sm font-bold text-green-700 mt-0.5">
            {formatCurrency(totalIncome)}
          </p>
        </div>
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
          <p className="text-[10px] text-red-600 uppercase tracking-wider font-medium">Gider</p>
          <p className="text-sm font-bold text-red-400 mt-0.5">
            {formatCurrency(totalWithFixed)}
          </p>
          {totalFixedCostMonthly > 0 && (
            <p className="text-[9px] text-red-400 mt-0.5">
              Islem: {formatCurrency(totalExpense)}
            </p>
          )}
        </div>
        <div className={cn(
          "p-3 border rounded-xl text-center",
          totalIncome - totalWithFixed >= 0
            ? "bg-emerald-50 border-emerald-200"
            : "bg-orange-50 border-orange-200"
        )}>
          <p className={cn(
            "text-[10px] uppercase tracking-wider font-medium",
            totalIncome - totalWithFixed >= 0 ? "text-emerald-600" : "text-orange-600"
          )}>Net</p>
          <p className={cn(
            "text-sm font-bold mt-0.5",
            totalIncome - totalWithFixed >= 0 ? "text-emerald-700" : "text-orange-700"
          )}>
            {formatCurrency(totalIncome - totalWithFixed)}
          </p>
        </div>
      </div>

      {/* Sabit Giderler Özet Kartı */}
      {totalFixedCostMonthly > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Pin size={14} className="text-amber-600" />
            <p className="text-xs font-bold text-amber-400">Aylik Sabit Giderler</p>
            <span className="ml-auto text-sm font-bold text-amber-400">
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
                <span key={i} className="text-[10px] text-amber-600">
                  {c.name}
                  {!filterBusiness && <span className="text-amber-400"> ({c.bizName})</span>}
                  : <span className="font-medium">{formatCurrency(c.amount)}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Islem ara... (aciklama, kategori, etiket)"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-sm text-white
                     placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
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

        {/* Direction filter */}
        <div className="flex rounded-xl border border-surface-600 overflow-hidden">
          {([
            { key: "", label: "Tumu" },
            { key: "income", label: "Gelir" },
            { key: "expense", label: "Gider" },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilterDirection(opt.key as "" | "income" | "expense")}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                filterDirection === opt.key
                  ? "bg-brand-600 text-white"
                  : "bg-surface-800 text-surface-300 hover:bg-surface-700"
              }`}
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
          className="px-3 py-2 rounded-xl border border-surface-600 bg-surface-800 text-xs text-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {filterMonth && (
          <button
            onClick={() => setFilterMonth("")}
            className="px-2 py-2 text-xs text-red-500 hover:text-red-700"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Transaction List */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-surface-400 text-sm">
            {transactions.length === 0
              ? "Henuz islem yok"
              : "Filtreye uygun islem bulunamadi"}
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-700">
          {filtered.map((tx) => {
            const isIncome = tx.direction === "income";
            return (
              <div
                key={tx.id}
                onClick={() => setDetailTarget(tx)}
                className="flex items-center gap-3 p-4 hover:bg-surface-700 transition-colors cursor-pointer group"
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                    isIncome ? "bg-green-500/10" : "bg-red-500/10"
                  )}
                >
                  {isIncome ? (
                    <ArrowDownLeft size={18} className="text-green-600" />
                  ) : (
                    <ArrowUpRight size={18} className="text-red-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {tx.description || tx.category?.name || "Islem"}
                  </p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    {tx.business_name && (
                      <span className="text-brand-500">{tx.business_name} · </span>
                    )}
                    {tx.category?.name || "Kategorisiz"} ·{" "}
                    {new Date(tx.date).toLocaleDateString("tr-TR", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                </div>

                <span
                  className={cn(
                    "text-sm font-semibold flex-shrink-0 text-right",
                    isIncome ? "text-green-600" : "text-red-600"
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
                    <span className="block text-[10px] font-normal text-surface-400 mt-0.5">
                      brüt {formatCurrency(tx.amount, tx.currency)}
                    </span>
                  )}
                </span>

                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(tx); }}
                  className="p-1.5 rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-500/10
                             opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex-shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
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
      <div className="bg-surface-800 rounded-2xl shadow-card-hover border border-surface-600 w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-white">Islemi Sil</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-600">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-surface-700 rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">
                  {transaction.description || transaction.category?.name || "Islem"}
                </p>
                <p className="text-xs text-surface-400 mt-0.5">
                  {new Date(transaction.date).toLocaleDateString("tr-TR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </div>
              <span className={cn("text-base font-bold text-right", isIncome ? "text-green-600" : "text-red-600")}>
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
                  <span className="block text-[10px] font-normal text-surface-400 mt-0.5">
                    brüt {formatCurrency(transaction.amount, transaction.currency)}
                  </span>
                )}
              </span>
            </div>
          </div>

          <label className="block text-sm font-medium text-surface-200 mb-1.5">
            Silme Sebebi <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Bu islemi neden siliyorsunuz? (zorunlu)"
            rows={3}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                       placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-red-500
                       focus:border-transparent transition-all resize-none"
          />

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mt-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors">
              Vazgec
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting || !reason.trim()}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 transition-colors flex items-center justify-center gap-2"
            >
              {isDeleting ? <><Loader2 size={18} className="animate-spin" /> Siliniyor...</> : <><Trash2 size={18} /> Sil</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
