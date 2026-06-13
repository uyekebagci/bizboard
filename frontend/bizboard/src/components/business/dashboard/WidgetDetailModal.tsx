"use client";

/**
 * v1.6.23.15 (TODO d0ccb7f0): Generic widget detail modal.
 *
 * Reusable wrapper — her widget kendi içeriğini children prop'u ile geçer.
 * Modal close: backdrop click + Esc + X butonu.
 */

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/useFocusTrap";

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

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);

  if (!open) return null;

  const maxW = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="widget-detail-modal-title"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "v2-card shadow-xl w-full max-h-[90vh] overflow-hidden flex flex-col",
          maxW
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--v2-border))] shrink-0">
          <div className="min-w-0">
            <h3 id="widget-detail-modal-title" className="text-base font-bold h-display text-[rgb(var(--v2-ink))] truncate">{title}</h3>
            {subtitle && <p className="text-xs text-[rgb(var(--v2-muted))] truncate mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerAction}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
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
