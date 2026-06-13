"use client";

/**
 * Ledger v2 (Faz B, §4.2): finalize kapanış DÜZENLEME ÖNERİ modal'ı.
 * Admin önerilen yeni sayımları + ZORUNLU gerekçe girer → PENDING request
 * oluşur (kapanış değişmez, onay bekler). Portal'lı, çift tema (v2 Daxa).
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, AlertTriangle, FileEdit } from "lucide-react";
import { formatCurrency, formatMoneyInput, parseMoneyInput, cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { DayClose } from "@/types";
import type { EditRequestInput } from "@/hooks/useDayCloseEdit";

const REASONS = [
  { value: "LOSS", label: "Kayıp" },
  { value: "MIS_ENTRY", label: "Yanlış Girim" },
  { value: "ROUNDING", label: "Yuvarlama" },
  { value: "OTHER", label: "Diğer" },
] as const;

interface Props {
  dayClose: DayClose | null;
  submit: (input: EditRequestInput) => Promise<unknown>;
  onClose: () => void;
}

export function EditRequestModal({ dayClose, submit, onClose }: Props) {
  const open = !!dayClose;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dayClose) {
      const seed: Record<string, string> = {};
      for (const a of dayClose.account_counts ?? []) {
        seed[a.account_id] = a.counted_balance != null ? String(a.counted_balance) : "";
      }
      setCounts(seed);
      setReason("");
      setNote("");
      setError(null);
    }
  }, [dayClose]);

  const newActual = useMemo(
    () => Object.values(counts).reduce((s, v) => s + (v ? parseMoneyInput(v) : 0), 0),
    [counts],
  );

  if (!open || !mounted) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason) { setError("Gerekçe kategorisi zorunlu"); return; }
    if (!note.trim()) { setError("Açıklama zorunlu"); return; }
    setSubmitting(true);
    try {
      const accountCounts = (dayClose?.account_counts ?? [])
        .filter((a) => counts[a.account_id] !== "" && counts[a.account_id] != null)
        .map((a) => ({ accountId: a.account_id, countedBalance: parseMoneyInput(counts[a.account_id]) }));
      await submit({
        dayCloseId: dayClose!.id!,
        accountCounts: accountCounts.length ? accountCounts : undefined,
        reasonCategory: reason,
        reasonNote: note.trim(),
      });
      toast.success("Düzenleme önerisi oluşturuldu — onay bekliyor");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Öneri oluşturulamadı"));
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="v2-card shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[rgb(var(--v2-border))]">
          <div className="flex items-center gap-2">
            <FileEdit size={16} className="text-amber-700 dark:text-amber-300" />
            <h3 className="text-lg font-bold text-[rgb(var(--v2-ink))]">
              Kapanış Düzenle (Onaylı) — {dayClose?.close_date}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
          <p className="text-xs text-[rgb(var(--v2-muted))]">
            Bu düzenleme doğrudan uygulanmaz — onaylanınca kapanış güncellenir, sonraki günler
            yeniden hesaplanır. Eski değerler audit'lenir (geri alınabilir).
          </p>

          <div className="space-y-2">
            <p className="label">Yeni Sayımlar (boş bırakılırsa değişmez)</p>
            {(dayClose?.account_counts ?? []).map((a) => (
              <div key={a.account_id} className="rounded-xl p-3 v2-sunken border border-[rgb(var(--v2-border))]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-[rgb(var(--v2-ink))] truncate">{a.account_name}</span>
                  <span className="text-[10px] uppercase text-[rgb(var(--v2-muted))]">{a.account_type}</span>
                </div>
                <input
                  type="text" inputMode="numeric"
                  value={counts[a.account_id] ?? ""}
                  onChange={(e) => setCounts((p) => ({ ...p, [a.account_id]: formatMoneyInput(e.target.value) }))}
                  className="input font-semibold"
                  placeholder="Yeni bakiye"
                />
              </div>
            ))}
            <p className="text-[11px] text-[rgb(var(--v2-muted))]">
              Yeni Son Kasa: <span className="text-[rgb(var(--v2-ink))] font-medium">{formatCurrency(newActual, "TRY")}</span>
            </p>
          </div>

          <div>
            <label className="label">Gerekçe Kategorisi <span className="text-red-500 dark:text-red-400">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <button key={r.value} type="button" onClick={() => setReason(r.value)}
                  className={cn(
                    "v2-press px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                    reason === r.value
                      ? "bg-[rgb(var(--accent))]/12 border-[rgb(var(--accent))]/60 text-accent-strong dark:text-accent"
                      : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
                  )}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Açıklama <span className="text-red-500 dark:text-red-400">*</span></label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              className="input min-h-[70px] resize-none" placeholder="Düzenleme gerekçesi..." />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={submitting}
              className="btn-secondary flex-1 px-4 py-2.5 text-sm">Vazgeç</button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {submitting ? (<><Loader2 size={16} className="animate-spin" /> Gönderiliyor...</>) : "Öneri Oluştur"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
