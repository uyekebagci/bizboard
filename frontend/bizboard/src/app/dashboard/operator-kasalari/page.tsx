"use client";

/**
 * Ledger v2 (Faz C, §3.11 / TODO 7): Operatör Kasaları — READ-ONLY kâr-merkezi
 * statement.
 *
 * - Operatör listesi: biriken kâr / ödeme / bakiye + provisional (T+1 bekleyen).
 * - Operatöre tıklayınca: satır satır statement (kâr girişleri + ödemeler).
 * - MANUEL GİRİŞ YOK — sadece görüntü (bakiye = Σ kâr − Σ ödeme).
 *
 * Çift tema (dark default + light); detay modal portal'lı.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Users, Lock, Clock, ChevronRight,
} from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useOperatorStatements } from "@/hooks/useOperatorStatements";
import { OperatorStatementModal } from "@/components/posdeal/OperatorStatementModal";
import { formatCurrency, cn } from "@/lib/utils";
import type { OperatorStatement } from "@/types";

export default function OperatorKasalariPage() {
  const router = useRouter();
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;
  const { operators, loading, error, statement } = useOperatorStatements(businessId);
  const [openAccount, setOpenAccount] = useState<OperatorStatement | null>(null);

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors">
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            Operatör Kasaları <Lock size={14} className="text-[rgb(var(--v2-muted))]" />
          </h1>
          <p className="text-xs text-[rgb(var(--v2-muted))]">read-only kâr-merkezi · biriken kâr − ödeme = bakiye</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {loading && operators.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : operators.length === 0 ? (
        <div className="v2-card p-8 text-center">
          <Users size={32} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-[rgb(var(--v2-ink))] font-medium">Operatör kâr-merkezi yok</p>
          <p className="text-xs text-[rgb(var(--v2-muted))] mt-1">
            Alt kasa hesaplarını &quot;kâr-merkezi (operatör)&quot; olarak işaretleyin.
          </p>
        </div>
      ) : (
        <section className="space-y-2">
          <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
            {operators.map((op) => (
              <button key={op.account_id} onClick={() => setOpenAccount(op)}
                className="w-full p-4 flex items-center gap-3 text-left hover:bg-[rgb(var(--v2-sunken))] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[rgb(var(--v2-ink))] truncate">{op.account_name}</p>
                  <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
                    Kâr +{formatCurrency(op.total_earned, "TRY")}
                    {" · Ödeme -"}{formatCurrency(op.total_paid_out, "TRY")}
                  </p>
                  {op.provisional_pending > 0.005 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-300 mt-0.5 flex items-center gap-1">
                      <Clock size={9} /> T+1 bekleyen: {formatCurrency(op.provisional_pending, "TRY")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-base font-bold num",
                    op.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {formatCurrency(op.balance, "TRY")}
                  </span>
                  <ChevronRight size={16} className="text-[rgb(var(--v2-muted))]" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <OperatorStatementModal account={openAccount} load={statement}
        onClose={() => setOpenAccount(null)} />
    </div>
  );
}
