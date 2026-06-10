"use client";

/**
 * Ledger v2 (Faz B, §4): gün-kapanışı finalize modal'ı — çok-hesaplı zorunlu
 * sayım + SAĞLAMA HESAP + variance/kaçak göstergesi + backdated tarih seçimi.
 *
 * <p>Akış:</p>
 * <ol>
 *   <li>(Admin) Geçmiş tarih seçilebilir (backdated, §4.1).</li>
 *   <li>Her "parası olan" hesap için GERÇEK bakiye girilir (zorunlu).
 *       SON KASA = Σ sayım canlı toplanır.</li>
 *   <li>SAĞLAMA HESAP canlı: ÖNCEKİ KASA / TOPLAM GELEN / TOPLAM GİDEN /
 *       OLMASI GEREKEN / SON KASA / ARTI EKSİ KALAN.</li>
 *   <li>variance = OLMASI GEREKEN − SON KASA. Eşik aşılırsa kaçak uyarısı +
 *       gerekçe zorunlu.</li>
 * </ol>
 *
 * <p>Portal'lı (createPortal): ata {@code .glass-card} backdrop-filter fixed
 * konumu bozmasın diye. Çift tema: surface/brand token'ları.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, AlertTriangle, Check, ShieldAlert, CalendarClock } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { formatCurrency, formatMoneyInput, parseMoneyInput, cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { DayClose } from "@/types";

const REASONS = [
  { value: "LOSS", label: "Kayıp" },
  { value: "MIS_ENTRY", label: "Yanlış Girim" },
  { value: "ROUNDING", label: "Yuvarlama" },
  { value: "OTHER", label: "Diğer" },
] as const;

const DEFAULT_THRESHOLD = 100;

interface Props {
  /** null ise modal kapalı. preview = backend canlı SAĞLAMA HESAP + sayılacak hesaplar. */
  preview: DayClose | null;
  businessId: string;
  isAdmin: boolean;
  onClose: () => void;
  onClosed: (dc: DayClose) => void;
}

export function CloseDayModal({ preview, businessId, isAdmin, onClose, onClosed }: Props) {
  const open = !!preview;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [closeDate, setCloseDate] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Açılışta sayım girdilerini hesaplara göre seed et.
  useEffect(() => {
    if (preview) {
      const seed: Record<string, string> = {};
      for (const a of preview.account_counts ?? []) {
        seed[a.account_id] = a.counted_balance != null ? String(a.counted_balance) : "";
      }
      setCounts(seed);
      setCloseDate(preview.close_date ?? "");
      setReason("");
      setNote("");
      setError(null);
    }
  }, [preview]);

  const opening = preview?.opening_balance ?? 0;
  const totalIn = preview?.total_in ?? 0;
  const totalOut = preview?.total_out ?? 0;
  const computed = preview?.computed_closing ?? 0;

  // SON KASA = Σ girilen sayım.
  const actualTotal = useMemo(
    () => Object.values(counts).reduce((sum, v) => sum + (v ? parseMoneyInput(v) : 0), 0),
    [counts],
  );
  const allFilled = useMemo(
    () => (preview?.account_counts ?? []).every((a) => counts[a.account_id] !== ""
      && counts[a.account_id] != null),
    [counts, preview],
  );

  // variance = OLMASI GEREKEN − SON KASA (Excel/KARAR A1). Artı = eksik/kayıp.
  const variance = computed - actualTotal;
  const isShortage = variance > 0;   // eksik (kayıp)
  const isOver = variance < 0;       // fazla
  const overThreshold = Math.abs(variance) > DEFAULT_THRESHOLD;
  const needsReason = allFilled && Math.abs(variance) > 0.005;

  const today = new Date().toISOString().slice(0, 10);
  const isBackdated = !!closeDate && closeDate < today;

  if (!open || !mounted) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!allFilled) { setError("Her hesabın gerçek bakiyesi zorunlu"); return; }
    if (needsReason && !reason) { setError("Fark var — gerekçe kategorisi seçin"); return; }
    if (needsReason && !note.trim()) { setError("Fark var — açıklama zorunlu"); return; }
    if (isBackdated && !isAdmin) { setError("Geçmiş tarih için admin yetkisi gerekir"); return; }

    setSubmitting(true);
    try {
      const result = await api.post<DayClose>(`/day-closes?business_id=${businessId}`, {
        close_date: closeDate || null,
        account_counts: (preview?.account_counts ?? []).map((a) => ({
          account_id: a.account_id,
          counted_balance: parseMoneyInput(counts[a.account_id] ?? "0"),
        })),
        variance_threshold: DEFAULT_THRESHOLD,
        reason_category: needsReason ? reason : null,
        reason_note: needsReason ? note.trim() : null,
        override: true,
      });
      toast.success(isBackdated ? "Geçmiş gün kapatıldı (zincir güncellendi)" : "Gün kapatıldı");
      onClosed(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Bu gün zaten kapatılmış. Üzerine yazmak için tekrar deneyin.");
      } else {
        setError(getErrorMessage(err, "Kapatılamadı"));
      }
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-card shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-surface-700/60">
          <h3 className="text-lg font-bold h-display text-white">Gün Kapanışı — Mutabakat</h3>
          <button onClick={onClose} className="modal-close">
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Tarih (admin: backdated) */}
          {isAdmin && (
            <div>
              <label className="label flex items-center gap-1.5">
                <CalendarClock size={13} /> Kapanış Tarihi
                {isBackdated && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Geri Dönük
                  </span>
                )}
              </label>
              <input
                type="date"
                value={closeDate}
                max={today}
                onChange={(e) => setCloseDate(e.target.value)}
                className="input"
              />
            </div>
          )}

          {/* Çok-hesaplı zorunlu sayım */}
          <div className="space-y-2">
            <p className="label">Hesap Sayımları <span className="text-red-400">*</span></p>
            {(preview?.account_counts ?? []).length === 0 && (
              <p className="text-xs text-surface-400">
                Sayılacak (parası olan) hesap yok. Önce hesap/kasa ekleyin.
              </p>
            )}
            {(preview?.account_counts ?? []).map((a) => {
              const v = counts[a.account_id] ?? "";
              const counted = v ? parseMoneyInput(v) : null;
              const accVar = counted != null && a.computed_balance != null
                ? counted - a.computed_balance : null;
              return (
                <div key={a.account_id} className="rounded-xl p-3 bg-surface-900/40 border border-surface-700/60">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium text-white truncate">{a.account_name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-surface-400">
                      {a.account_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={v}
                      onChange={(e) => setCounts((p) => ({ ...p, [a.account_id]: formatMoneyInput(e.target.value) }))}
                      className="input flex-1 font-semibold"
                      placeholder="Gerçek bakiye"
                    />
                  </div>
                  <p className="text-[11px] text-surface-400 mt-1">
                    Sistem: {formatCurrency(a.computed_balance ?? 0, "TRY")}
                    {accVar != null && Math.abs(accVar) > 0.005 && (
                      <span className={cn("ml-2 font-medium", accVar > 0 ? "text-emerald-400" : "text-red-400")}>
                        ({accVar > 0 ? "+" : ""}{formatCurrency(accVar, "TRY")})
                      </span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          {/* SAĞLAMA HESAP bloğu (canlı) */}
          <div className="rounded-2xl p-4 bg-surface-900/40 border border-surface-700/60 space-y-1.5">
            <p className="text-[11px] text-surface-400 uppercase tracking-wider mb-1">Sağlama Hesap</p>
            <Row label="Önceki Kasa" value={opening} />
            <Row label="Toplam Gelen" value={totalIn} positive />
            <Row label="Toplam Giden" value={-totalOut} />
            <div className="border-t border-surface-700/60 my-1.5" />
            <Row label="Olması Gereken" value={computed} bold />
            <Row label="Son Kasa (sayım)" value={actualTotal} bold />
          </div>

          {/* Variance / kaçak göstergesi */}
          {allFilled && (
            <div className={cn(
              "rounded-2xl p-4 border flex items-center justify-between transition-colors",
              Math.abs(variance) <= 0.005 && "bg-surface-700/50 border-surface-700/60",
              isShortage && "bg-red-500/10 border-red-500/30",
              isOver && "bg-emerald-500/10 border-emerald-500/30",
            )}>
              <div className="flex items-center gap-2">
                {overThreshold && isShortage && <ShieldAlert size={16} className="text-red-400" />}
                <span className="text-sm text-surface-300">
                  {isShortage ? "Eksik Olan (kaçak)" : isOver ? "Fazla" : "Mutabık"}
                </span>
              </div>
              <span className={cn(
                "text-lg font-bold",
                Math.abs(variance) <= 0.005 && "text-white",
                isShortage && "text-red-400",
                isOver && "text-emerald-400",
              )}>
                {variance > 0 ? "+" : ""}{formatCurrency(variance, "TRY")}
              </span>
            </div>
          )}
          {allFilled && overThreshold && (
            <p className="text-xs text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Eşik ({formatCurrency(DEFAULT_THRESHOLD, "TRY")}) aşıldı —
              kapanış sonrası kaçak alarmı kaydedilir.
            </p>
          )}

          {/* Gerekçe (fark varsa zorunlu) */}
          {needsReason && (
            <>
              <div>
                <label className="label">Gerekçe Kategorisi <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      className={cn(
                        "px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                        reason === r.value
                          ? "bg-brand-500/15 border-brand-500/40 text-brand-300"
                          : "bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-300",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Açıklama <span className="text-red-400">*</span></label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input min-h-[70px] resize-none"
                  placeholder={isShortage ? "Eksiğin sebebi..." : "Fazlalığın sebebi..."}
                />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={submitting}
              className="btn-secondary flex-1 px-4 py-2.5 text-sm">
              Vazgeç
            </button>
            <button type="submit" disabled={submitting || !allFilled}
              className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {submitting
                ? (<><Loader2 size={16} className="animate-spin" /> Kapatılıyor...</>)
                : (<><Check size={16} /> Günü Kapat</>)}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value, bold, positive }: {
  label: string; value: number; bold?: boolean; positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-surface-300", bold ? "text-sm font-semibold" : "text-xs")}>{label}</span>
      <span className={cn(
        "num tabular-nums",
        bold ? "text-base font-bold text-white" : "text-sm",
        !bold && positive && "text-emerald-300",
        !bold && !positive && value < 0 && "text-red-300",
        !bold && !positive && value >= 0 && "text-surface-200",
      )}>
        {value > 0 && positive ? "+" : ""}{formatCurrency(value, "TRY")}
      </span>
    </div>
  );
}
