"use client";

/**
 * v1.6.23.26 (UI Fix WP TODO 06c8f232): "+ Yeni İşlem" modal'ı.
 * v1.7.0-beta (Bankalar WP TODO 2a4198b2): 3'lü toggle — Gelir / Gider / Transfer.
 *
 * <p>Önceden Son İşlemler widget'ındaki buton {@code /dashboard/add-transaction}
 * sayfasına navigate ediyordu. Artık aynı sayfa içinde modal açılır; submit
 * sonrası modal kapanır + parent callback ile cache invalidate edilir.</p>
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Receipt, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, HandCoins } from "lucide-react";
import type { PaymentMethod } from "@/types";
import { cn } from "@/lib/utils";
import { AddTransactionForm } from "./AddTransactionForm";
import { TransferForm } from "./TransferForm";
import { LoanForm } from "./LoanForm";

type Tab = "income" | "expense" | "transfer" | "loan";

interface Props {
  open: boolean;
  /** Form'da işletme select'i gizlemek için preselected id. */
  businessId?: string;
  /** Payment method shortcut — POS butonu öneri kullanıyor. */
  preselectedPaymentMethod?: PaymentMethod | null;
  preselectedType?: "income" | "expense" | null;
  /** v1.7.0-beta: Transfer kısayolu — direkt Transfer tab'iyle aç. */
  initialTab?: Tab;
  /** v1.7.0-beta: Transfer tab'inde kaynak hesap önceden seçili. */
  preselectedTransferFromId?: string;
  onClose: () => void;
  /** Submit success → parent: cache invalidate çağrılarını burada yap. */
  onSuccess?: () => void;
}

export function AddTransactionModal({
  open, businessId, preselectedPaymentMethod = null, preselectedType = null,
  initialTab, preselectedTransferFromId, onClose, onSuccess,
}: Props) {
  const [tab, setTab] = useState<Tab>(
    initialTab ?? (preselectedType ?? "expense"),
  );

  // SSR-safe portal: createPortal yalnızca client'ta (mount sonrası) çalışır;
  // server render'da document yok → mounted=false iken null döner.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // open değişince tab'ı reset (yeniden açıldığında initialTab'a düşsün)
  useEffect(() => {
    if (open) setTab(initialTab ?? (preselectedType ?? "expense"));
  }, [open, initialTab, preselectedType]);

  // Esc → close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const isTransfer = tab === "transfer";
  const isLoan = tab === "loan";

  // v1.7.x hotfix: Modal'ı document.body'ye PORTAL ediyoruz.
  // Önceden modal, ata <section className="glass-card"> içinde render
  // oluyordu. .glass-card dark temada `backdrop-filter: blur(14px)` taşır;
  // CSS spec'e göre backdrop-filter (transform/filter/will-change gibi) o
  // elementi `position: fixed` için containing block yapar → overlay viewport
  // yerine o panele göre konumlanıp panel'in overflow-hidden'ı ile kırpılıyordu
  // (light temada blur=none olduğu için sorun görünmüyordu). Portal ile
  // overlay her zaman <body>'nin altında olur → fixed inset-0 viewport'a göre
  // tam ekran ortalı + backdrop + scroll garanti.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="v2-card shadow-xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--v2-border))] shrink-0">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            <Receipt size={16} className="text-accent-strong dark:text-accent" />
            Yeni İşlem
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        {/* v1.7.0-beta: 3'lü toggle. Çatı v1.2: + Borç (verilen/alınan). */}
        <div className="px-4 py-2 border-b border-[rgb(var(--v2-border))] shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <TabBtn
            active={tab === "income"}
            onClick={() => setTab("income")}
            tone="emerald"
            icon={<ArrowDownLeft size={14} />}
            label="Gelir"
          />
          <TabBtn
            active={tab === "expense"}
            onClick={() => setTab("expense")}
            tone="red"
            icon={<ArrowUpRight size={14} />}
            label="Gider"
          />
          <TabBtn
            active={tab === "transfer"}
            onClick={() => setTab("transfer")}
            tone="blue"
            icon={<ArrowLeftRight size={14} />}
            label="Transfer"
          />
          <TabBtn
            active={tab === "loan"}
            onClick={() => setTab("loan")}
            tone="amber"
            icon={<HandCoins size={14} />}
            label="Borç"
          />
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {isTransfer ? (
            <TransferForm
              compact
              preselectedFromId={preselectedTransferFromId}
              onCancel={onClose}
              onSuccess={() => {
                onSuccess?.();
                onClose();
              }}
            />
          ) : isLoan ? (
            <LoanForm
              compact
              businessId={businessId}
              onCancel={onClose}
              onSuccess={() => {
                onSuccess?.();
                onClose();
              }}
            />
          ) : (
            <AddTransactionForm
              compact
              preselectedBusinessId={businessId}
              preselectedPaymentMethod={preselectedPaymentMethod}
              preselectedType={tab}
              onCancel={onClose}
              onSuccess={() => {
                onSuccess?.();
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TabBtn({
  active, onClick, tone, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  tone: "emerald" | "red" | "blue" | "amber";
  icon: React.ReactNode;
  label: string;
}) {
  const activeCls = {
    emerald: "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
    red:     "bg-red-500/15 border-red-500/50 text-red-700 dark:text-red-300",
    blue:    "bg-blue-500/15 border-blue-500/50 text-blue-700 dark:text-blue-300",
    amber:   "bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "v2-press py-2 rounded-xl font-medium text-sm border-2 transition-colors inline-flex items-center justify-center gap-1.5",
        active
          ? activeCls
          : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
