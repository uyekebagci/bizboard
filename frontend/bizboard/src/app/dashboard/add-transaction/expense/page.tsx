"use client";

/**
 * v1.7.0.x: /dashboard/add-transaction/expense — dedicated Gider formu.
 * Direction "expense" kilitli. POS expense'de zaten görünmez (form içi kuralı).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { AddTransactionForm } from "@/components/transactions/AddTransactionForm";
import { PageHeader } from "@/components/shared/PageHeader";

export default function ExpenseFormPage() {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
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
        title="Yeni Gider"
        icon={ArrowUpRight}
        iconClassName="bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-300"
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
          İşlem oluşturuldu. Form temizlendi — başka bir gider ekleyebilirsiniz.
        </div>
      )}

      <div className="v2-card p-5 sm:p-6">
        <AddTransactionForm
          key={formKey}
          preselectedType="expense"
          lockDirection
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
