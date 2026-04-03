"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, X, ExternalLink } from "lucide-react";
import { formatCurrency, formatRelativeDate, cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { TransactionDetailModal } from "@/components/business/TransactionList";
import type { Transaction } from "@/types";

export function RecentActivity() {
  const { refreshKey } = useAppStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Transaction | null>(null);

  useEffect(() => {
    async function fetchRecent() {
      try {
        const data = await api.get<Transaction[]>("/portfolio/transactions/recent?limit=10");
        setTransactions(data || []);
      } catch (err) {
        console.error("Failed to fetch recent transactions:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRecent();
  }, [refreshKey]);

  if (isLoading) {
    return (
      <div className="card divide-y divide-surface-700 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-xl bg-surface-600" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface-600 rounded w-3/4" />
              <div className="h-3 bg-surface-600 rounded w-1/2" />
            </div>
            <div className="h-4 bg-surface-600 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-surface-400">Henuz islem yok</p>
        <p className="text-surface-400 text-sm mt-1">
          Burada aktivite gormek icin ilk gelir veya giderinizi ekleyin
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Clickable card */}
      <div className="card divide-y divide-surface-700 w-full text-left">
        {transactions.slice(0, 5).map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            onClick={() => setDetailTarget(tx)}
          />
        ))}
        {transactions.length > 5 && (
          <button
            onClick={() => setShowModal(true)}
            className="p-3 text-center w-full hover:bg-surface-700 transition-colors"
          >
            <span className="text-sm text-brand-600 font-medium flex items-center justify-center gap-1">
              Tumunu Gor ({transactions.length} islem)
              <ExternalLink size={14} />
            </span>
          </button>
        )}
      </div>

      {/* Detail Modal */}
      {detailTarget && (
        <TransactionDetailModal
          transaction={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {/* All Transactions Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-surface-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up z-10">
            <div className="flex items-center justify-between p-4 border-b border-surface-700">
              <h3 className="text-lg font-bold text-white">Son Islemler</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl hover:bg-surface-600 transition-colors"
              >
                <X size={20} className="text-surface-400" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-surface-700">
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  showDate
                  onClick={() => { setShowModal(false); setDetailTarget(tx); }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TransactionRow({
  tx,
  showDate,
  onClick,
}: {
  tx: Transaction;
  showDate?: boolean;
  onClick?: () => void;
}) {
  const isIncome = tx.direction === "income";

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-4 hover:bg-surface-700 transition-colors cursor-pointer"
    >
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
          isIncome ? "bg-green-50" : "bg-red-50"
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
          {tx.business_name && <span>{tx.business_name} · </span>}
          {showDate
            ? new Date(tx.date).toLocaleDateString("tr-TR", {
                day: "numeric", month: "long", year: "numeric",
              })
            : formatRelativeDate(tx.date)}
        </p>
      </div>

      <span
        className={cn(
          "text-sm font-semibold flex-shrink-0",
          isIncome ? "text-green-600" : "text-red-600"
        )}
      >
        {isIncome ? "+" : "-"}
        {formatCurrency(tx.amount, tx.currency)}
      </span>
    </div>
  );
}
