"use client";

/**
 * Ledger v2 (Faz C, §3.11 / TODO 7): Operatör Kasaları — READ-ONLY kâr-merkezi
 * statement.
 *
 * - Operatör listesi: biriken kâr / ödeme / bakiye + provisional (T+1 bekleyen).
 * - Operatöre tıklayınca: satır satır statement (kâr girişleri + ödemeler).
 * - MANUEL GİRİŞ YOK — sadece görüntü (bakiye = Σ kâr − Σ ödeme).
 *
 * Çift tema; detay modal portal'lı.
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
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            Operatör Kasaları <Lock size={14} className="text-surface-400" />
          </h1>
          <p className="text-xs text-surface-400">read-only kâr-merkezi · biriken kâr − ödeme = bakiye</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {loading && operators.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : operators.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Users size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Operatör kâr-merkezi yok</p>
          <p className="text-xs text-surface-400 mt-1">
            Alt kasa hesaplarını "kâr-merkezi (operatör)" olarak işaretleyin.
          </p>
        </div>
      ) : (
        <section className="space-y-2">
          <div className="glass-card divide-y divide-surface-700">
            {operators.map((op) => (
              <button key={op.account_id} onClick={() => setOpenAccount(op)}
                className="w-full p-4 flex items-center gap-3 text-left hover:bg-surface-700/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{op.account_name}</p>
                  <p className="text-[11px] text-surface-400 mt-0.5">
                    Kâr +{formatCurrency(op.total_earned, "TRY")}
                    {" · Ödeme -"}{formatCurrency(op.total_paid_out, "TRY")}
                  </p>
                  {op.provisional_pending > 0.005 && (
                    <p className="text-[11px] text-amber-300 mt-0.5 flex items-center gap-1">
                      <Clock size={9} /> T+1 bekleyen: {formatCurrency(op.provisional_pending, "TRY")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-base font-bold num",
                    op.balance >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {formatCurrency(op.balance, "TRY")}
                  </span>
                  <ChevronRight size={16} className="text-surface-500" />
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
