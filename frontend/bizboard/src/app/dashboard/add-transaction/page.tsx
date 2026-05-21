"use client";

/**
 * v1.6.23.26 (UI Fix WP TODO 06c8f232): Form mantığı reusable
 * {@link AddTransactionForm} component'ine taşındı. Bu page yalnız URL
 * route'u (deep link / mobile shortcut) için ince wrapper olarak kaldı —
 * yeni hesap detay sayfaları "+ Yeni İşlem" butonu artık modal açıyor
 * (sayfa navigation yok).
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { PaymentMethod } from "@/types";
import { AddTransactionForm } from "@/components/transactions/AddTransactionForm";

export default function AddTransactionPageWrapper() {
  return (
    <Suspense>
      <AddTransactionPage />
    </Suspense>
  );
}

function AddTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedType = searchParams.get("type") as "income" | "expense" | null;
  const preselectedBusinessId = searchParams.get("business") || "";
  const preselectedPaymentMethod = (() => {
    const raw = (searchParams.get("payment_method") || "").toUpperCase();
    return raw === "POS" || raw === "NAKIT" ? (raw as PaymentMethod) : null;
  })();

  function handleSuccess() {
    const from = searchParams.get("from");
    if (from) {
      router.push(from);
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <h1 className="text-xl font-bold text-white">Yeni Islem</h1>
      </div>

      <AddTransactionForm
        preselectedBusinessId={preselectedBusinessId}
        preselectedType={preselectedType}
        preselectedPaymentMethod={preselectedPaymentMethod}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
