"use client";

/**
 * v1.6.23.26 (UI Fix WP TODO 06c8f232): "+ Yeni İşlem" modal'ı.
 *
 * <p>Önceden Son İşlemler widget'ındaki buton {@code /dashboard/add-transaction}
 * sayfasına navigate ediyordu. Artık aynı sayfa içinde modal açılır; submit
 * sonrası modal kapanır + parent callback ile cache invalidate edilir
 * (refreshConsolidated + refreshClosing + triggerRefresh).</p>
 */

import { useEffect } from "react";
import { X, Receipt } from "lucide-react";
import type { PaymentMethod } from "@/types";
import { AddTransactionForm } from "./AddTransactionForm";

interface Props {
  open: boolean;
  /** Form'da işletme select'i gizlemek için preselected id. */
  businessId?: string;
  /** Payment method shortcut — POS butonu öneri kullanıyor. */
  preselectedPaymentMethod?: PaymentMethod | null;
  preselectedType?: "income" | "expense" | null;
  onClose: () => void;
  /** Submit success → parent: cache invalidate çağrılarını burada yap. */
  onSuccess?: () => void;
}

export function AddTransactionModal({
  open, businessId, preselectedPaymentMethod = null, preselectedType = null,
  onClose, onSuccess,
}: Props) {
  // Esc → close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl shadow-xl border border-surface-600 w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700 shrink-0">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Receipt size={16} className="text-brand-400" />
            Yeni İşlem
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-white"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          <AddTransactionForm
            compact
            preselectedBusinessId={businessId}
            preselectedPaymentMethod={preselectedPaymentMethod}
            preselectedType={preselectedType}
            onCancel={onClose}
            onSuccess={() => {
              onSuccess?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
