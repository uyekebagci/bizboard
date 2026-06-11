"use client";

/**
 * Ledger v2 (Faz B — Gün Açılışı): "Günü Aç" modal'ı — hesap-başı açılış
 * (otomatik devir + elle DEVİR YUVARLAMA) + fark önizleme + Σ=0 düzeltme posting'i.
 *
 * <p>Akış:</p>
 * <ol>
 *   <li>Her "parası olan" hesabın açılışı önceki günün CLOSED actual'ından
 *       OTOMATİK dolar (carriedOver). Görünür.</li>
 *   <li>Kullanıcı her hesabın açılışını elle düzeltir/yuvarlar (rounded). Hesap
 *       özelinde fark (rounded − carriedOver) canlı gösterilir.</li>
 *   <li>Toplam devir-yuvarlama farkı = Σ fark. Onayda backend tek bir Σ=0 "Devir
 *       Yuvarlama" düzeltme posting'i üretir (P&L-temiz; bakiyeye yansır).</li>
 *   <li>"Günü Aç" → gün AÇIK; işlem girişi serbest (enforcement açıkken).</li>
 * </ol>
 *
 * <p>Portal'lı (createPortal); çift tema (surface/brand token'ları).</p>
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, AlertTriangle, Sunrise, CalendarClock, ArrowRight } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { formatCurrency, formatMoneyInput, parseMoneyInput, cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { DayOpen } from "@/types";

interface Props {
  /** null ise modal kapalı. preview = backend hesap açılışları + otomatik devir. */
  preview: DayOpen | null;
  businessId: string;
  isAdmin: boolean;
  onClose: () => void;
  onOpened: (d: DayOpen) => void;
}

export function OpenDayModal({ preview, businessId, isAdmin, onClose, onOpened }: Props) {
  const open = !!preview;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [openDate, setOpenDate] = useState("");
  const [rounded, setRounded] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Açılışta yuvarlama girdilerini hesapların carriedOver'ı ile seed et
  // (kullanıcı sıfırdan değil, devirden başlar — yalnız yuvarlar).
  useEffect(() => {
    if (preview) {
      const seed: Record<string, string> = {};
      for (const a of preview.account_openings ?? []) {
        const v = a.rounded != null ? a.rounded : a.carried_over;
        seed[a.account_id] = v != null ? String(v) : "";
      }
      setRounded(seed);
      setOpenDate(preview.open_date ?? "");
      setNote(preview.reason_note ?? "");
      setError(null);
    }
  }, [preview]);

  const openings = preview?.account_openings ?? [];

  const carriedTotal = useMemo(
    () => openings.reduce((s, a) => s + (a.carried_over ?? 0), 0),
    [openings],
  );
  const roundedTotal = useMemo(
    () => openings.reduce((s, a) => s + (rounded[a.account_id] ? parseMoneyInput(rounded[a.account_id]) : 0), 0),
    [openings, rounded],
  );
  const roundingDelta = roundedTotal - carriedTotal;

  const today = new Date().toISOString().slice(0, 10);
  const isBackdated = !!openDate && openDate < today;
  const alreadyOpen = preview?.lifecycle_status === "OPEN";

  if (!open || !mounted) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isBackdated && !isAdmin) { setError("Geçmiş tarih için admin yetkisi gerekir"); return; }

    setSubmitting(true);
    try {
      const result = await api.post<DayOpen>(`/day-opens?business_id=${businessId}`, {
        open_date: openDate || null,
        account_openings: openings.map((a) => ({
          account_id: a.account_id,
          rounded_opening: parseMoneyInput(rounded[a.account_id] ?? "0"),
        })),
        reason_note: note.trim() || null,
        override: alreadyOpen, // zaten açıksa yeniden-açılış (yuvarlama düzeltme)
      });
      toast.success(isBackdated ? "Geçmiş gün açıldı" : "Gün açıldı");
      onOpened(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError(getErrorMessage(err, "Gün açılamadı (durum uygun değil)"));
      } else {
        setError(getErrorMessage(err, "Gün açılamadı"));
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
          <h3 className="text-lg font-bold h-display text-white flex items-center gap-2">
            <Sunrise size={18} className="text-amber-300" /> Günü Aç — Devir Yuvarlama
          </h3>
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

          {alreadyOpen && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              Bu gün zaten AÇIK. Kaydetmek açılışları (devir yuvarlamayı) GÜNCELLER —
              eski yuvarlama düzeltmesi geri alınıp yeniden üretilir.
            </div>
          )}

          {/* Tarih (admin: backdated) */}
          {isAdmin && (
            <div>
              <label className="label flex items-center gap-1.5">
                <CalendarClock size={13} /> Açılış Tarihi
                {isBackdated && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Geri Dönük
                  </span>
                )}
              </label>
              <input type="date" value={openDate} max={today}
                onChange={(e) => setOpenDate(e.target.value)} className="input" />
            </div>
          )}

          {/* Hesap-başı açılış (otomatik devir + elle yuvarlama) */}
          <div className="space-y-2">
            <p className="label">Hesap Açılışları (Devir → Yuvarlanmış)</p>
            {openings.length === 0 && (
              <p className="text-xs text-surface-400">
                Açılacak (parası olan) hesap yok. Önce hesap/kasa ekleyin.
              </p>
            )}
            {openings.map((a) => {
              const v = rounded[a.account_id] ?? "";
              const roundedVal = v ? parseMoneyInput(v) : 0;
              const delta = roundedVal - (a.carried_over ?? 0);
              return (
                <div key={a.account_id} className="rounded-xl p-3 bg-surface-900/40 border border-surface-700/60">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium text-white truncate">{a.account_name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-surface-400">
                      {a.account_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-400 num shrink-0">
                      {formatCurrency(a.carried_over ?? 0, "TRY")}
                    </span>
                    <ArrowRight size={13} className="text-surface-500 shrink-0" />
                    <input type="text" inputMode="numeric" value={v}
                      onChange={(e) => setRounded((p) => ({ ...p, [a.account_id]: formatMoneyInput(e.target.value) }))}
                      className="input flex-1 font-semibold" placeholder="Yuvarlanmış açılış" />
                  </div>
                  <p className="text-[11px] text-surface-400 mt-1">
                    Devir: {formatCurrency(a.carried_over ?? 0, "TRY")}
                    {Math.abs(delta) > 0.005 && (
                      <span className={cn("ml-2 font-medium", delta > 0 ? "text-emerald-400" : "text-red-400")}>
                        (yuvarlama {delta > 0 ? "+" : ""}{formatCurrency(delta, "TRY")})
                      </span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Toplam blok */}
          <div className="rounded-2xl p-4 bg-surface-900/40 border border-surface-700/60 space-y-1.5">
            <Row label="Toplam Devir (otomatik)" value={carriedTotal} />
            <Row label="Yuvarlanmış Açılış" value={roundedTotal} bold />
            <div className="border-t border-surface-700/60 my-1.5" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-300">Devir Yuvarlama Farkı</span>
              <span className={cn("text-base font-bold num",
                Math.abs(roundingDelta) <= 0.005 && "text-white",
                roundingDelta > 0.005 && "text-emerald-400",
                roundingDelta < -0.005 && "text-red-400")}>
                {roundingDelta > 0 ? "+" : ""}{formatCurrency(roundingDelta, "TRY")}
              </span>
            </div>
          </div>
          {Math.abs(roundingDelta) > 0.005 && (
            <p className="text-xs text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Fark için denetlenen "Devir Yuvarlama"
              düzeltme kaydı (Σ=0) üretilir — gelir/gider yaratmaz.
            </p>
          )}

          <div>
            <label className="label">Not (opsiyonel)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              className="input min-h-[56px] resize-none"
              placeholder="Yuvarlama gerekçesi / açıklama..." />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={submitting}
              className="btn-secondary flex-1 px-4 py-2.5 text-sm">
              Vazgeç
            </button>
            <button type="submit" disabled={submitting || openings.length === 0}
              className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {submitting
                ? (<><Loader2 size={16} className="animate-spin" /> Açılıyor...</>)
                : (<><Sunrise size={16} /> Günü Aç</>)}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-surface-300", bold ? "text-sm font-semibold" : "text-xs")}>{label}</span>
      <span className={cn("num tabular-nums",
        bold ? "text-base font-bold text-white" : "text-sm text-surface-200")}>
        {formatCurrency(value, "TRY")}
      </span>
    </div>
  );
}
