"use client";

import { Loader2, UserX } from "lucide-react";

interface AuditAnonymizeModalProps {
  days: string;
  onDaysChange: (v: string) => void;
  anonymizing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Daxa input — solid alt-yüzey + ince border + accent focus, çift tema
// (page.tsx INPUT_CLS ile birebir).
const INPUT_CLS =
  "w-full text-sm rounded-xl py-2 px-3 border border-[rgb(var(--v2-border))] " +
  "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] " +
  "focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all";

/**
 * mod-audit: KVKK retention anonimleştirme onay modalı (Daxa).
 * Gün-sayısı input + onay → POST /admin/audit/anonymize?days= (page.tsx tetikler).
 */
export function AuditAnonymizeModal({
  days,
  onDaysChange,
  anonymizing,
  onConfirm,
  onCancel,
}: AuditAnonymizeModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="KVKK anonimleştirme onayı"
    >
      <div className="modal-surface rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-center gap-2.5 mb-2">
          <UserX size={20} className="text-accent-strong dark:text-accent shrink-0" />
          <h3 className="text-lg font-semibold text-[rgb(var(--v2-ink))]">
            KVKK Anonimleştir
          </h3>
        </div>
        <p className="text-sm text-[rgb(var(--v2-muted))] mb-4">
          Belirtilen günden eski denetim kayıtlarının kişisel verileri (KVKK)
          anonimleştirilir. Kayıt silinmez; içerik geri alınamaz biçimde
          maskelenir ve hash zinciri yeniden imzalanır.
        </p>

        <label
          htmlFor="anonymize-days"
          className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5"
        >
          Bu kadar günden eski kayıtlar
        </label>
        <input
          id="anonymize-days"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={days}
          onChange={(e) => onDaysChange(e.target.value)}
          className={INPUT_CLS}
          autoFocus
        />
        <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-1.5">
          Örn. 365 → bir yıldan eski kayıtlar anonimleştirilir.
        </p>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={anonymizing}
            className="flex-1 v2-btn v2-press !py-2.5 border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={anonymizing}
            className="flex-1 v2-btn v2-btn--accent v2-press !py-2.5"
          >
            {anonymizing && <Loader2 size={15} className="animate-spin" />}
            {anonymizing ? "Anonimleştiriliyor…" : "Anonimleştir"}
          </button>
        </div>
      </div>
    </div>
  );
}
