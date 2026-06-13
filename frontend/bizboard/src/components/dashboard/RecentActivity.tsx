"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, X, ExternalLink, CreditCard } from "lucide-react";
import { formatCurrency, formatRelativeDate, cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
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
        logger.error("api", "Failed to fetch recent transactions", undefined, err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRecent();
  }, [refreshKey]);

  if (isLoading) {
    return (
      <div className="v2-card divide-y divide-[rgb(var(--v2-border))] rounded-2xl animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-xl bg-[rgb(var(--v2-sunken))]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[rgb(var(--v2-sunken))] rounded w-3/4" />
              <div className="h-3 bg-[rgb(var(--v2-sunken))] rounded w-1/2" />
            </div>
            <div className="h-4 bg-[rgb(var(--v2-sunken))] rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="v2-card p-8 rounded-2xl text-center">
        <p className="text-[rgb(var(--v2-muted))]">Henüz işlem yok</p>
        <p className="text-[rgb(var(--v2-muted))] text-sm mt-1">
          Burada aktivite görmek için ilk gelir veya giderinizi ekleyin
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Clickable card — Redesign PR-2: glass */}
      <div className="v2-card divide-y divide-[rgb(var(--v2-border))] w-full text-left overflow-hidden rounded-2xl">
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
            className="p-3 text-center w-full hover:bg-[rgb(var(--v2-sunken))] transition-colors"
          >
            <span className="text-sm text-brand-300 font-medium flex items-center justify-center gap-1">
              Tümünü Gör ({transactions.length} işlem)
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
          <div className="relative modal-surface w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up z-10">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-[rgb(var(--v2-ink))]">Son İşlemler</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl hover:bg-[rgb(var(--v2-sunken))] transition-colors"
              >
                <X size={20} className="text-surface-400" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-[rgb(var(--v2-border))]">
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
  // v1.7.x (POS Komisyon WP TODO e718df3d): POS satırı özel format
  const isPos = (tx.payment_method || "").toUpperCase().startsWith("POS");

  return (
    <div
      onClick={onClick}
      className="row-hover flex items-center gap-3 p-4 transition-colors cursor-pointer"
    >
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
          isPos ? "bg-[rgb(var(--accent))]/15" : isIncome ? "bg-green-500/15" : "bg-red-500/15"
        )}
      >
        {isPos ? (
          <CreditCard size={18} className="text-[rgb(var(--accent))]" />
        ) : isIncome ? (
          <ArrowDownLeft size={18} className="text-green-300" />
        ) : (
          <ArrowUpRight size={18} className="text-red-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate">
          {/* Beta v1.1: POS komisyon UI kaldırıldı — POS satırı da normal
              description/kategori formatı kullanır. */}
          {tx.description || tx.category?.name || (isPos ? "POS İşlemi" : "İşlem")}
        </p>
        <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">
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
          "text-sm font-bold flex-shrink-0",
          isIncome ? "text-green-300" : "text-red-300",
        )}
      >
        {/* Beta v1.1: POS Hacmi mantığı — sağdaki tutar her zaman tx.amount. */}
        {isIncome ? "+" : "-"}{formatCurrency(tx.amount, tx.currency)}
      </span>
    </div>
  );
}
