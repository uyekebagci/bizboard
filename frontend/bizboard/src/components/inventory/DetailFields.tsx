"use client";

// ══════════════════════════════════════════════════════════
// Envanter detay/duzenleme — paylasilan yardimci bilesenler
// (R3 god-component bolme: page.tsx'ten cikarildi)
// ══════════════════════════════════════════════════════════

import { cn, formatMoneyInput } from "@/lib/utils";

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">{title}</h4>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

export function DetailRow({ label, value, warn }: { label: string; value: string | null | undefined; warn?: boolean }) {
  if (!value) return null;
  return (
    <div className="p-2 bg-surface-700 rounded-lg">
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-medium", warn ? "text-red-600" : "text-white")}>{value}</p>
    </div>
  );
}

export function EditField({ label, value, onChange, type = "text", money = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; money?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] text-surface-400 uppercase tracking-wider mb-1">{label}</label>
      <input type={money ? "text" : type} inputMode={money ? "numeric" : undefined} value={value}
        onChange={(e) => onChange(money ? formatMoneyInput(e.target.value) : e.target.value)}
        step={!money && type === "number" ? "0.01" : undefined}
        className="field field-sm py-2" />
    </div>
  );
}
