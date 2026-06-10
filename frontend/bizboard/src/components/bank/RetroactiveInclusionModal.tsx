"use client";

/**
 * WP Sub-Cash Retroactive Inclusion modal.
 *
 * <p>Sub-cash detail içinde "Geri Dönük İşlem Ekle" tıklayınca açılır.
 * Sub-cash'in assigned entity'lerine ait, henüz inclusion'da olmayan tx'leri
 * listeler. Kullanıcı seçer + bulk POST eder.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Rewind, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { AvailableTxPage, Transaction } from "@/types";

interface Props {
  subCashId: string;
  subCashName: string;
  onClose: () => void;
  onAdded: () => void;
}

const PAGE_SIZE = 50;

export function RetroactiveInclusionModal({ subCashId, subCashName, onClose, onAdded }: Props) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [query, setQuery] = useState("");

  async function fetchPage(pageOffset = 0) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        from,
        to,
        offset: String(pageOffset),
        limit: String(PAGE_SIZE),
      });
      const r = await api.get<AvailableTxPage>(
        `/bank-accounts/${subCashId}/available-tx?${qs}`,
      );
      setItems(r.items || []);
      setTotal(r.total ?? 0);
      setOffset(pageOffset);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Liste yüklenemedi");
      logger.error("api", "available-tx fetch failed", { subCashId }, err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchPage(0); /* eslint-disable-next-line */ }, [from, to, subCashId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) =>
      (t.description ?? "").toLowerCase().includes(q)
      || (t.target_counterpart_name ?? "").toLowerCase().includes(q)
      || (t.pos_device_name ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const allVisibleSelected = filtered.length > 0
    && filtered.every((t) => selected.has(t.id));

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAllVisible() {
    const next = new Set(selected);
    if (allVisibleSelected) {
      filtered.forEach((t) => next.delete(t.id));
    } else {
      filtered.forEach((t) => next.add(t.id));
    }
    setSelected(next);
  }

  async function handleSubmit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{ added: number; skipped: number; failed: string[] }>(
        `/bank-accounts/${subCashId}/inclusions`,
        { transaction_ids: Array.from(selected) },
      );
      logger.info("api", "retroactive inclusions added", {
        subCashId, added: result.added, skipped: result.skipped, failed: result.failed.length,
      });
      toast.success("İşlem dahil edildi");
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ekleme başarısız");
      logger.error("api", "retroactive inclusion failed", { subCashId }, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="min-w-0 flex items-center gap-2">
            <Rewind size={16} className="text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">
                Geri Dönük İşlem Ekle — {subCashName}
              </h3>
              <p className="text-[10px] text-surface-400">
                Bağlı entity&apos;lere ait, henüz bu kasada olmayan işlemler
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-surface-700 space-y-2.5">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase text-surface-400 mb-1 block">Başlangıç</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-surface-900 border border-surface-600 text-white text-xs"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase text-surface-400 mb-1 block">Bitiş</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-surface-900 border border-surface-600 text-white text-xs"
              />
            </div>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Açıklama, karşı taraf, POS cihazı..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-900 border border-surface-600 rounded-lg text-white placeholder:text-surface-500"
            />
          </div>
        </div>

        {/* Bulk toolbar */}
        <div className="px-3 py-2 border-b border-surface-700 flex items-center justify-between text-[11px]">
          <label className="flex items-center gap-2 cursor-pointer text-surface-300">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              className="cursor-pointer"
            />
            <span>
              Tümünü Seç ({filtered.length} görünür · toplam {total})
            </span>
          </label>
          {selected.size > 0 && (
            <span className="text-blue-300 font-medium">
              Seçili: {selected.size}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-surface-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <CheckCircle2 size={28} className="mx-auto text-surface-500 mb-2" />
              <p className="text-sm text-surface-300 font-medium">
                Eklenebilecek işlem yok
              </p>
              <p className="text-[11px] text-surface-400 mt-1 leading-relaxed">
                Bu tarih aralığında bağlı entity&apos;lere ait olup dahil edilmemiş
                bir işlem bulunamadı.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-surface-700">
              {filtered.map((t) => {
                const checked = selected.has(t.id);
                const isIncome = t.direction === "income";
                const matchVia = t.target_counterpart_name
                  ? `Karşı taraf: ${t.target_counterpart_name}`
                  : t.pos_device_name
                  ? `POS: ${t.pos_device_name}`
                  : t.settled_bank_account_name
                  ? `Banka: ${t.settled_bank_account_name}`
                  : "—";
                return (
                  <li
                    key={t.id}
                    onClick={() => toggleSelect(t.id)}
                    className={cn(
                      "px-3 py-2.5 cursor-pointer hover:bg-surface-700/40",
                      checked && "bg-blue-500/10",
                    )}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {t.description || (isIncome ? "Gelir" : "Gider")}
                          <span className="ml-2 text-[10px] text-surface-400">
                            · {new Date(t.date).toLocaleDateString("tr-TR")}
                          </span>
                          {t.payment_method && (
                            <span className="ml-1 text-[10px] text-surface-500">
                              · {t.payment_method}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-surface-400 truncate mt-0.5">
                          {matchVia}
                        </p>
                      </div>
                      <p className={cn(
                        "text-sm font-semibold shrink-0",
                        isIncome ? "text-emerald-300" : "text-rose-300",
                      )}>
                        {isIncome ? "+" : "−"}{formatCurrency(t.amount, t.currency || "TRY")}
                      </p>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > PAGE_SIZE && (
          <div className="px-3 py-2 border-t border-surface-700 flex items-center justify-between text-[11px] text-surface-400">
            <span>
              {offset + 1} - {Math.min(offset + items.length, total)} / {total}
            </span>
            <div className="flex gap-1">
              <button
                disabled={offset === 0 || loading}
                onClick={() => fetchPage(Math.max(0, offset - PAGE_SIZE))}
                className="px-2 py-1 rounded bg-surface-700 hover:bg-surface-600 disabled:opacity-50"
              >
                ← Önceki
              </button>
              <button
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => fetchPage(offset + PAGE_SIZE)}
                className="px-2 py-1 rounded bg-surface-700 hover:bg-surface-600 disabled:opacity-50"
              >
                Sonraki →
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-3 my-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 p-3 border-t border-surface-700">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium disabled:opacity-50"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Seçilenleri Ekle ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
