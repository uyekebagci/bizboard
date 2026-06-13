"use client";

/**
 * Onay modalı — destructive/mutate admin aksiyonları için tek-tip Daxa v2 dialog.
 *
 * <p>Portal'lı (body'e mount), çift tema (.v2-card token'ları), ESC/backdrop ile
 * kapanır, a11y (role=dialog, aria-modal, başlık bağı). {@code danger} kırmızı
 * onay butonu (geri-alınamaz işlem), aksi halde accent/ink. {@code loading}
 * süresince butonlar disable + spinner.</p>
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Açıklama metni veya zengin içerik (ör. parametre input'u). */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Kırmızı (geri-alınamaz) onay butonu. */
  danger?: boolean;
  loading?: boolean;
  /** false dönerse modal açık kalır (ör. doğrulama hatası); void/true kapatır. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Onayla",
  cancelLabel = "İptal",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ESC ile kapat (loading değilken).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="v2-card w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-2">
          {danger && (
            <span className="mt-0.5 shrink-0 grid h-8 w-8 place-items-center rounded-xl bg-red-500/15 text-red-500">
              <AlertTriangle size={18} />
            </span>
          )}
          <h3
            id="confirm-modal-title"
            className="text-lg font-semibold text-[rgb(var(--v2-ink))] flex-1"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 -mr-1 -mt-1 rounded-lg text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-sunken))] transition-colors disabled:opacity-40"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {body != null && (
          <div className="text-sm text-[rgb(var(--v2-muted))] mb-6 leading-relaxed">
            {body}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium v2-sunken text-[rgb(var(--v2-ink))] hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50",
              danger
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "v2-btn v2-btn--ink",
            )}
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ConfirmModal;
