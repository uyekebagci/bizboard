"use client";

/**
 * v1.7.0.x: /dashboard/add-transaction/pos — dedicated POS tahsilat formu.
 * Direction "income" + payment_method "POS" kilitli (toggle + method seçici
 * gizli). POS cihazı + 2 oran + LIVE BREAKDOWN form içinden geliyor.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, CheckCircle2 } from "lucide-react";
import { AddTransactionForm } from "@/components/transactions/AddTransactionForm";
import { PageHeader } from "@/components/shared/PageHeader";

export default function PosFormPage() {
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
        title="POS Tahsilat"
        icon={CreditCard}
        iconClassName="bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-300"
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
          POS işlemi oluşturuldu. Form temizlendi — başka tahsilat ekleyebilirsiniz.
        </div>
      )}

      <div className="v2-card p-5 sm:p-6">
        <AddTransactionForm
          key={formKey}
          preselectedType="income"
          preselectedPaymentMethod="POS"
          lockDirection
          lockPaymentMethod
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
