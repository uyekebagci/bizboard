"use client";

/**
 * v1.7.0.x: /dashboard/add-transaction/income — sidebar shortcut'tan dedicated
 * Gelir formu. Direction "income" kilitli (toggle gizli). POS opsiyonu form
 * içinde gizli değil (existing flow); POS için ayrı /pos route'u var.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, CheckCircle2 } from "lucide-react";
import { AddTransactionForm } from "@/components/transactions/AddTransactionForm";

export default function IncomeFormPage() {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0); // submit success → remount
  const [showSuccess, setShowSuccess] = useState(false);

  function handleSuccess() {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setFormKey((k) => k + 1);
    }, 1500);
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/dashboard/add-transaction")}
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
            aria-label="Tip seçimine dön"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <ArrowDownLeft size={20} className="text-emerald-300 shrink-0" />
            <h1 className="text-xl font-bold text-white truncate">Yeni Gelir</h1>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-surface-400 hover:text-surface-200 whitespace-nowrap"
        >
          ← Dashboard
        </Link>
      </div>

      {showSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} />
          İşlem oluşturuldu. Form temizlendi — başka bir gelir ekleyebilirsiniz.
        </div>
      )}

      <AddTransactionForm
        key={formKey}
        preselectedType="income"
        lockDirection
        onSuccess={handleSuccess}
      />
    </div>
  );
}
