"use client";

/**
 * v1.7.0.x: /dashboard/add-transaction/income — sidebar shortcut'tan dedicated
 * Gelir formu. Direction "income" kilitli (toggle gizli). POS opsiyonu form
 * içinde gizli değil (existing flow); POS için ayrı /pos route'u var.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, CheckCircle2 } from "lucide-react";
import { AddTransactionForm } from "@/components/transactions/AddTransactionForm";
import { PageHeader } from "@/components/shared/PageHeader";

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
      <PageHeader
        title="Yeni Gelir"
        icon={ArrowDownLeft}
        iconClassName="bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
        onBack={() => router.replace("/dashboard/add-transaction")}
        fallbackHref="/dashboard/add-transaction"
        actions={
          <Link
            href="/dashboard"
            className="text-xs text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] whitespace-nowrap"
          >
            Ana Sayfa
          </Link>
        }
      />

      {showSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} />
          İşlem oluşturuldu. Form temizlendi — başka bir gelir ekleyebilirsiniz.
        </div>
      )}

      <div className="v2-card p-5 sm:p-6">
        <AddTransactionForm
          key={formKey}
          preselectedType="income"
          lockDirection
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
