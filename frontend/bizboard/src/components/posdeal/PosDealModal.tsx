"use client";

/**
 * Ledger v2 (Faz C, §3.5 / §6 / TODO 7): POS işlem (deal) girişi modal'ı.
 *
 * <p>Operatör girer: cihaz (→ sahip otomatik) + müşteri oranı + brüt + opsiyonel
 * getiren + tarih. Müşteri oranı/brüt değişince kâr-payı şelalesi CANLI önizlenir
 * (RATE_SPREAD/MARGIN_PCT aynı-gün, OWNER_COMMISSION T+1 provisional işaretli).</p>
 *
 * <p>Portal'lı (createPortal). Çift tema (surface/brand token'ları).</p>
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Sparkles, Clock } from "lucide-react";
import { formatCurrency, formatMoneyInput, parseMoneyInput, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { CreatePosDealInput } from "@/hooks/usePosDeals";
import type { PosDeal, PosDeviceListItem, Counterpart } from "@/types";

interface Props {
  open: boolean;
  devices: PosDeviceListItem[];
  counterparts: Counterpart[];
  onClose: () => void;
  create: (input: CreatePosDealInput) => Promise<PosDeal>;
  preview: (input: CreatePosDealInput) => Promise<PosDeal>;
  onCreated: () => void;
}

export function PosDealModal({ open, devices, counterparts, onClose, create, preview, onCreated }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [deviceId, setDeviceId] = useState("");
  const [gross, setGross] = useState("");
  const [rate, setRate] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [dealDate, setDealDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewDeal, setPreviewDeal] = useState<PosDeal | null>(null);

  useEffect(() => {
    if (open) {
      setDeviceId(devices[0]?.id ?? "");
      setGross(""); setRate(""); setReferrerId(""); setNotes("");
      setDealDate(new Date().toISOString().slice(0, 10));
      setPreviewDeal(null);
    }
  }, [open, devices]);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === deviceId) ?? null, [devices, deviceId]);

  const grossNum = gross ? parseMoneyInput(gross) : 0;
  const rateNum = rate ? Number(rate.replace(",", ".")) : 0;
  const canPreview = !!deviceId && grossNum > 0 && rateNum > 0;

  // Müşteri oranı / brüt / cihaz değişince payları canlı önizle (debounced).
  useEffect(() => {
    if (!open || !canPreview) { setPreviewDeal(null); return; }
    const t = setTimeout(async () => {
      try {
        const p = await preview({
          posDeviceId: deviceId, grossAmount: grossNum, customerRate: rateNum,
          referrerCounterpartId: referrerId || null, dealDate,
        });
        setPreviewDeal(p);
      } catch { setPreviewDeal(null); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId, grossNum, rateNum, referrerId, dealDate]);

  async function handleSubmit() {
    if (!canPreview) { toast.error("Cihaz, brüt ve müşteri oranı zorunlu"); return; }
    setSubmitting(true);
    try {
      await create({
        posDeviceId: deviceId, grossAmount: grossNum, customerRate: rateNum,
        referrerCounterpartId: referrerId || null, dealDate, notes: notes || null,
      });
      toast.success("POS işlemi girildi, kâr-payı hesaplandı");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="v2-card relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4
                        bg-[rgb(var(--v2-card))]/95 backdrop-blur border-b border-[rgb(var(--v2-border))]">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent-strong dark:text-accent" />
            <h2 className="text-base font-bold text-[rgb(var(--v2-ink))]">POS İşlem Gir</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Cihaz (→ sahip otomatik) */}
          <div>
            <label className="label">POS Cihazı <span className="text-red-400">*</span></label>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="input w-full">
              <option value="">— Seç —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.owner_my_company_name ? ` · ${d.owner_my_company_name}` : ""}
                </option>
              ))}
            </select>
            {selectedDevice && (
              <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-1">
                Sahip: {selectedDevice.owner_my_company_name ?? "—"}
                {selectedDevice.default_rate != null && <> · Banka oranı %{selectedDevice.default_rate}</>}
              </p>
            )}
          </div>

          {/* Brüt + müşteri oranı */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Brüt Tutar <span className="text-red-400">*</span></label>
              <input type="text" inputMode="numeric" value={gross}
                onChange={(e) => setGross(formatMoneyInput(e.target.value))}
                className="input w-full font-semibold" placeholder="0" />
            </div>
            <div>
              <label className="label">Müşteri Oranı % <span className="text-red-400">*</span></label>
              <input type="text" inputMode="decimal" value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="input w-full font-semibold" placeholder="6.5" />
            </div>
          </div>

          {/* Getiren + tarih */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Getiren (ops.)</label>
              <select value={referrerId} onChange={(e) => setReferrerId(e.target.value)} className="input w-full">
                <option value="">— Yok —</option>
                {counterparts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Tarih</label>
              <input type="date" value={dealDate} max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDealDate(e.target.value)} className="input w-full" />
            </div>
          </div>

          <div>
            <label className="label">Not (ops.)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="input w-full" placeholder="Açıklama" />
          </div>

          {/* Canlı kâr-payı önizleme */}
          {previewDeal && previewDeal.shares.length > 0 && (
            <div className="rounded-2xl p-4 v2-sunken border border-[rgb(var(--v2-border))] space-y-2">
              <p className="text-[11px] text-[rgb(var(--v2-muted))] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Sparkles size={11} className="text-accent-strong dark:text-accent" /> Kâr-Payı Önizleme
              </p>
              {previewDeal.shares.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-[rgb(var(--v2-muted))] flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{s.operator_name ?? "Şirket"}</span>
                    <span className="text-[9px] uppercase tracking-wider text-[rgb(var(--v2-muted))]">{s.rule_type}</span>
                    {s.provisional && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 flex items-center gap-0.5">
                        <Clock size={8} /> T+1
                      </span>
                    )}
                  </span>
                  <span className={cn("font-semibold num", s.amount >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                    {formatCurrency(s.amount, "TRY")}
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-[rgb(var(--v2-muted))] pt-1 border-t border-[rgb(var(--v2-border))]">
                T+1 işaretli paylar gün kapanışında banka yatışı girilince kesinleşir (Tuncay).
              </p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-2 px-5 py-4 bg-[rgb(var(--v2-card))]/95 backdrop-blur border-t border-[rgb(var(--v2-border))]">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5">İptal</button>
          <button onClick={handleSubmit} disabled={submitting || !canPreview}
            className="flex-1 py-2.5 rounded-xl bg-[rgb(var(--v2-ink))] hover:opacity-90 text-[rgb(var(--v2-card))] font-semibold
                       disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            İşlemi Gir
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
