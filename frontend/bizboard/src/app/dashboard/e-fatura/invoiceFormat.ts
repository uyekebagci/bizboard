// e-Fatura UI yardımcıları — 2 ondalıklı tutar formatı + durum/senaryo etiketleri.

import type { InvoiceStatus } from "@/types";

/** Para — 2 ondalık (invoice tutarları kuruş hassasiyetinde). */
export function formatMoney(amount: number, currency = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Taslak",
  SIGNED: "İmzalı / Hazır",
  SENT: "Gönderildi",
  ACCEPTED: "Kabul Edildi",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal",
  ERROR: "Hata",
};

export const STATUS_STYLE: Record<InvoiceStatus, string> = {
  DRAFT: "bg-surface-700/60 text-surface-300 border-surface-600/50",
  SIGNED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  SENT: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  ACCEPTED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-300 border-red-500/30",
  CANCELLED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  ERROR: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

export const SCENARIO_LABEL: Record<string, string> = {
  TEMEL: "Temel Fatura",
  TICARI: "Ticari Fatura",
};

export const TYPE_LABEL: Record<string, string> = {
  SATIS: "Satış",
  IADE: "İade",
  TEVKIFAT: "Tevkifat",
  ISTISNA: "İstisna",
  OZELMATRAH: "Özel Matrah",
};
