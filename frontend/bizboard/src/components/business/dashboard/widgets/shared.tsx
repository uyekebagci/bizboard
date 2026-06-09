"use client";

// ══════════════════════════════════════════════════════════
// Consolidated widget'lari — paylasilan kucuk yardimci bilesenler
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)
// ══════════════════════════════════════════════════════════

import { Wallet, Building2, Banknote, HandCoins } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

export function SectionTitle({ icon: Icon, label, inline }: { icon: typeof Wallet; label: string; inline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5", !inline && "mb-2")}>
      <Icon size={14} className="text-surface-400" />
      <h3 className="text-sm font-semibold text-white">{label}</h3>
    </div>
  );
}

export function Stat({
  label, value, bold, tone,
}: {
  label: string; value: number; bold?: boolean; tone?: "positive" | "negative";
}) {
  return (
    <div>
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn(
        "num mt-0.5",
        bold ? "text-base font-bold text-white" : "text-sm font-medium",
        !bold && tone === "positive" && "text-emerald-300",
        !bold && tone === "negative" && "text-red-300",
        !bold && !tone && "text-white",
      )}>
        {formatCurrency(value, "TRY")}
      </p>
    </div>
  );
}

export function Footer({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="px-4 py-2 border-t border-surface-700/60 flex items-center justify-between text-[11px] text-surface-400 bg-surface-800/40">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

export function DetailRow({
  label, value, tone, bold,
}: {
  label: string; value: number;
  tone: "pos" | "neg" | "warn" | "neutral";
  bold?: boolean;
}) {
  const colorClass = {
    pos: "text-emerald-300",
    neg: "text-red-300",
    warn: "text-amber-300",
    neutral: "text-white",
  }[tone];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-surface-300 text-xs">{label}</span>
      <span className={cn("font-mono", bold && "font-bold text-base", !bold && "text-sm", colorClass)}>
        {formatCurrency(value, "TRY")}
      </span>
    </div>
  );
}

export function PositionStat({ label, value, tone }: { label: string; value: number; tone: "positive" | "negative" }) {
  // v1.6.23.8 (DGR perspective hotfix): negative tone'da minus sign explicit.
  // value < 0 ise formatCurrency zaten "-" prefix verir. Pozitif değerlerde
  // tone=negative ise (defensive — caller -Math.abs zaten veriyor) yine minus göster.
  const displayValue = tone === "negative" && value > 0 ? -value : value;
  return (
    <div>
      <p className="text-brand-200 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-bold mt-0.5", tone === "negative" ? "text-red-200" : "text-white")}>
        {formatCurrency(displayValue, "TRY")}
      </p>
    </div>
  );
}

export function TypeBadge({ type }: { type: string }) {
  // v1.6.23.25: MAIN_CASH (Ana Kasa, amber/locked) + SUB_CASH (Alt Kasa, emerald)
  // ayrımı. Legacy CASH (kullanılmıyor ama eski cache için fallback olarak SUB_CASH'a map'li).
  const map: Record<string, { label: string; cls: string; icon: typeof Wallet }> = {
    CHECKING:    { label: "Banka",     cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",         icon: Building2 },
    SAVINGS:     { label: "Vadeli",    cls: "bg-purple-500/15 text-purple-300 border-purple-500/30",   icon: Building2 },
    MAIN_CASH:   { label: "Ana Kasa",  cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",      icon: Banknote },
    SUB_CASH:    { label: "Alt Kasa",  cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: Banknote },
    CASH:        { label: "Kasa",      cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: Banknote },
    CASH_HOLDER: { label: "Kişide",    cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",   icon: HandCoins },
  };
  const m = map[type] || { label: type, cls: "bg-surface-700 text-surface-300 border-surface-600", icon: Wallet };
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border ${m.cls}`}>
      <Icon size={10} />
      {m.label}
    </span>
  );
}

export function Info({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-medium mt-0.5",
        tone === "pos" && "text-emerald-300",
        tone === "neg" && "text-red-300",
        !tone && "text-white"
      )}>{value}</p>
    </div>
  );
}

export function Stat2({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="card p-2.5">
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-bold mt-0.5",
        tone === "pos" && "text-emerald-300",
        tone === "neg" && "text-red-300",
        !tone && "text-white"
      )}>{value}</p>
    </div>
  );
}

export function TxMiniRow({ tx }: { tx: { id: string; date: string; amount: number; pos_net?: number | null; pos_settled?: boolean | null; settled_bank_account_name?: string | null; description?: string | null; currency: string } }) {
  // Beta v1.1: POS Hacmi mantığı — her tx tutarı amount.
  const displayAmount = tx.amount;
  const settled = tx.pos_settled === true;
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-surface-700/30 text-xs">
      <div className="min-w-0 flex-1">
        <p className="text-surface-200 truncate">{tx.description || "POS çekim"}</p>
        <p className="text-[10px] text-surface-400">
          {new Date(tx.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
          {settled && tx.settled_bank_account_name && ` · ${tx.settled_bank_account_name}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-emerald-300 font-semibold">+{formatCurrency(displayAmount, tx.currency)}</p>
        <p className="text-[9px]">
          {settled ? (
            <span className="text-emerald-300">✓ düştü</span>
          ) : (
            <span className="text-amber-300">⏳ bekliyor</span>
          )}
        </p>
      </div>
    </div>
  );
}
