"use client";

/**
 * "Para İzi" — fon-bağı (FundLink) ekleme modalı.
 *
 * <p>Bir HEDEF işlemi (genelde çıkış/gider) bir KAYNAK işleme (genelde
 * giriş/tahsilat) bağlar. Uygun kaynaklar = kalanı ({@code remaining}) &gt; 0
 * olanlar; tahsis tutarı kalandan büyük olamaz (BE over-allocation guard).</p>
 *
 * <p><b>STRICT:</b> bu yalnız izlenebilirlik — bakiye/Net Kâr DEĞİŞMEZ.
 * Çift tema (glass-card + surface-* token; dark default + light otomatik).</p>
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Link2, AlertTriangle, ArrowDownLeft } from "lucide-react";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import type { FundSourceCandidate } from "@/hooks/useFundTrail";

interface Props {
  /** Hedef işlem tutarı (bilgi amaçlı; bağlanacak para bu işleme ait). */
  targetAmount: number;
  currency: string;
  /** Aday kaynak listesini getirir (kalanı > 0). */
  loadCandidates: () => Promise<FundSourceCandidate[]>;
  /** (sourceTxId, amount, note) → bağla. */
  onBind: (sourceTxId: string, amount: number, note?: string) => Promise<unknown>;
  onClose: () => void;
  onSuccess?: () => void;
}

export function FundLinkModal({
  targetAmount,
  currency,
  loadCandidates,
  onBind,
  onClose,
  onSuccess,
}: Props) {
  const [candidates, setCandidates] = useState<FundSourceCandidate[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [sourceId, setSourceId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadingList(true);
    loadCandidates()
      .then((rows) => {
        if (!alive) return;
        setCandidates(rows);
      })
      .catch(() => alive && setCandidates([]))
      .finally(() => alive && setLoadingList(false));
    return () => {
      alive = false;
    };
  }, [loadCandidates]);

  const selected = useMemo(
    () => candidates.find((c) => c.transaction_id === sourceId) || null,
    [candidates, sourceId],
  );

  // Seçili kaynağın kalanı — tahsis bunu aşamaz. Ayrıca hedefin tutarını da
  // aşmak anlamsız (bir gider kendi tutarından fazlasını "kaynaktan" alamaz);
  // bu yüzden tavan = min(kaynak kalan, hedef tutar).
  const maxBindable = useMemo(() => {
    if (!selected) return 0;
    return Math.min(selected.remaining, targetAmount);
  }, [selected, targetAmount]);

  // Kaynak seçilince varsayılan tutar = tavan (kullanıcı azaltabilir).
  useEffect(() => {
    if (selected) {
      setAmount(formatMoneyInput(String(maxBindable)));
    } else {
      setAmount("");
    }
    setError(null);
  }, [selected, maxBindable]);

  function labelFor(c: FundSourceCandidate): string {
    const isIncome = (c.direction || "").toUpperCase() === "INCOME";
    const arrow = isIncome ? "↘ giriş" : "↗ çıkış";
    const who = c.counterpart_name ? ` · ${c.counterpart_name}` : "";
    const desc = c.description ? ` · ${c.description.slice(0, 28)}` : "";
    const dt = c.date ? ` · ${c.date}` : "";
    return `${arrow}${dt}${who}${desc}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sourceId || !selected) {
      setError("Kaynak işlem seçin");
      return;
    }
    const val = parseMoneyInput(amount);
    if (!val || val <= 0) {
      setError("Tahsis tutarı > 0 olmalı");
      return;
    }
    if (val > maxBindable + 0.001) {
      setError(
        `Tutar tavanı aşıyor (en fazla ${formatCurrency(maxBindable, currency)})`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await onBind(sourceId, val, note.trim() || undefined);
      toast.success("Fon-bağı eklendi — paranın izi kuruldu (bakiye değişmedi)");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlama başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-md shadow-xl"
      >
        <div className="modal-header">
          <h3 className="text-base font-semibold text-surface-100 flex items-center gap-2">
            <Link2 size={16} className="text-brand-300" />
            Kaynağa Bağla (Para İzi)
          </h3>
          <button type="button" onClick={onClose} className="modal-close">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-lg bg-surface-700/40 p-3 text-xs space-y-1">
            <p className="text-surface-200 flex items-center gap-1.5">
              <ArrowDownLeft size={12} className="text-surface-400" />
              Bu işlemin parası <strong>{formatCurrency(targetAmount, currency)}</strong> bir
              kaynağa bağlanacak.
            </p>
            <p className="text-[10px] text-surface-500">
              Saf izlenebilirlik — bakiye ve Net Kâr DEĞİŞMEZ (çift sayım yok).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Kaynak İşlem (kalanı &gt; 0) *
            </label>
            {loadingList ? (
              <div className="flex items-center gap-2 text-surface-400 text-xs py-2">
                <Loader2 size={14} className="animate-spin" /> Kaynaklar yükleniyor…
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-surface-400 py-2">
                Bağlanabilir (kalanı olan) kaynak işlem bulunamadı.
              </p>
            ) : (
              <DarkSelect
                required
                value={sourceId}
                onChange={setSourceId}
                placeholder="Kaynak işlem seçin"
                searchable={candidates.length > 6}
                options={candidates.map((c) => ({
                  value: c.transaction_id,
                  label: labelFor(c),
                  meta: `kalan ${formatCurrency(c.remaining, currency)}`,
                }))}
              />
            )}
          </div>

          {selected && (
            <>
              <div className="rounded-lg bg-surface-700/40 p-2.5 text-[11px] text-surface-300 space-y-0.5">
                <p>
                  Kaynak tutarı: {formatCurrency(selected.amount, currency)} · Tahsisli:{" "}
                  {formatCurrency(selected.allocated, currency)}
                </p>
                <p className="text-emerald-300">
                  Kalan: {formatCurrency(selected.remaining, currency)} · Bu bağ için tavan:{" "}
                  {formatCurrency(maxBindable, currency)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-200 mb-1.5">
                  Tahsis Tutarı * (kısmi olabilir)
                </label>
                <input
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                  placeholder={formatMoneyInput(String(maxBindable))}
                  className="field field-sm py-2.5"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-200 mb-1.5">
                  Not (opsiyonel)
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ör. kira ödemesi için"
                  className="field field-sm py-2.5"
                />
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting || !sourceId}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50",
              "bg-brand-600 hover:bg-brand-700",
            )}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Bağla
          </button>
        </div>
      </form>
    </div>
  );
}
