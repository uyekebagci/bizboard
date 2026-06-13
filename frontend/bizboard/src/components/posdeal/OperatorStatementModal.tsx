"use client";

/**
 * Ledger v2 (Faz C, §3.11 / TODO 7): operatör kâr-merkezi READ-ONLY statement
 * detay modal'ı — satır satır kâr girişleri + ödemeler. CRUD yok (sadece görüntü).
 *
 * <p>Portal'lı, çift tema.</p>
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Lock, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import type { OperatorStatement } from "@/types";

interface Props {
  /** null = kapalı. Özet (satırsız) operatör; tıklayınca tam statement yüklenir. */
  account: OperatorStatement | null;
  load: (accountId: string) => Promise<OperatorStatement>;
  onClose: () => void;
}

export function OperatorStatementModal({ account, load, onClose }: Props) {
  const open = !!account;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [data, setData] = useState<OperatorStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) { setData(null); return; }
    setLoading(true);
    setError(null);
    load(account.account_id)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, "Statement yüklenemedi")))
      .finally(() => setLoading(false));
  }, [account, load]);

  if (!open || !mounted || !account) return null;
  const s = data ?? account;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="v2-card relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4
                        bg-[rgb(var(--v2-card))]/95 backdrop-blur border-b border-[rgb(var(--v2-border))]">
          <div className="flex items-center gap-2 min-w-0">
            <Lock size={16} className="text-[rgb(var(--v2-muted))] shrink-0" />
            <h2 className="text-base font-bold text-[rgb(var(--v2-ink))] truncate">{s.account_name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Özet */}
          <div className="grid grid-cols-3 gap-2">
            <SummaryCard label="Kâr" value={s.total_earned} className="text-emerald-700 dark:text-emerald-400" />
            <SummaryCard label="Ödeme" value={s.total_paid_out} className="text-[rgb(var(--v2-muted))]" />
            <SummaryCard label="Bakiye" value={s.balance}
              className={s.balance >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"} />
          </div>
          {s.provisional_pending > 0.005 && (
            <div className="rounded-xl p-2.5 bg-amber-500/10 border border-amber-500/25 text-xs text-amber-700 dark:text-amber-300
                            flex items-center gap-1.5">
              <Clock size={12} /> T+1 bekleyen (provisional): {formatCurrency(s.provisional_pending, "TRY")}
            </div>
          )}

          {/* Satırlar */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-[rgb(var(--v2-muted))]" />
            </div>
          ) : error ? (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">{error}</div>
          ) : (s.lines ?? []).length === 0 ? (
            <p className="text-sm text-[rgb(var(--v2-muted))] text-center py-6">Henüz hareket yok.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-[rgb(var(--v2-muted))] uppercase tracking-wider">Hareketler</p>
              {(s.lines ?? []).map((l) => {
                const inflow = l.amount >= 0;
                return (
                  <div key={l.posting_id}
                    className="flex items-center gap-2 p-2.5 rounded-xl v2-sunken border border-[rgb(var(--v2-border))]">
                    {inflow
                      ? <ArrowUpRight size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                      : <ArrowDownRight size={14} className="text-red-700 dark:text-red-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgb(var(--v2-ink))] truncate">
                        {l.description ?? l.source_type ?? "—"}
                        {l.provisional && (
                          <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300
                                           border border-amber-500/25">T+1</span>
                        )}
                      </p>
                      <p className="text-[10px] text-[rgb(var(--v2-muted))]">
                        {l.date ? new Date(l.date).toLocaleDateString("tr-TR") : ""}
                      </p>
                    </div>
                    <span className={cn("text-sm font-semibold num shrink-0",
                      inflow ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                      {inflow ? "+" : ""}{formatCurrency(l.amount, "TRY")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-[rgb(var(--v2-muted))] flex items-center gap-1">
            <Lock size={9} /> Read-only: manuel giriş yok. Bakiye = Σ kâr-payı − Σ ödeme.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SummaryCard({ label, value, className }: {
  label: string; value: number; className?: string;
}) {
  return (
    <div className="rounded-xl p-2.5 v2-sunken border border-[rgb(var(--v2-border))] text-center">
      <p className="text-[10px] text-[rgb(var(--v2-muted))] uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-bold num mt-0.5", className)}>{formatCurrency(value, "TRY")}</p>
    </div>
  );
}
