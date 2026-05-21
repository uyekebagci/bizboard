"use client";

/**
 * v1.6.23.15 (TODO d0ccb7f0): Generic widget detail modal.
 *
 * Reusable wrapper — her widget kendi içeriğini children prop'u ile geçer.
 * Modal close: backdrop click + Esc + X butonu.
 */

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Modal sağ üst köşede ek aksiyon butonu (örn. "CSV indir"). */
  headerAction?: React.ReactNode;
  /** Maks genişlik — content tipine göre küçük/orta/geniş seçilir. */
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export function WidgetDetailModal({
  open,
  onClose,
  title,
  subtitle,
  headerAction,
  size = "md",
  children,
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

  const maxW = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "bg-surface-800 rounded-2xl shadow-xl border border-surface-600 w-full max-h-[90vh] overflow-hidden flex flex-col",
          maxW
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white truncate">{title}</h3>
            {subtitle && <p className="text-xs text-surface-400 truncate mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerAction}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-white"
              aria-label="Kapat"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}
