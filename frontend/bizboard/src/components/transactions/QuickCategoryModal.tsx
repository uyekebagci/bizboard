"use client";

/**
 * İşlem formundan inline HIZLI kategori oluşturma modal'ı.
 *
 * <p>AddTransactionForm ve TransactionList düzenleme akışındaki kategori
 * seçicisinde "+ Yeni kategori" tıklanınca açılır. Sayfa navigasyonu yapmaz;
 * oluşturulan kategori parent'a geri döner, parent listeye ekleyip otomatik
 * seçer. {@link QuickCounterpartModal} ile aynı UX deseni.</p>
 *
 * <p>Paylaşımlı (yön-bağımsız) kategori modeli: oluşturulan kategori hem gelir
 * hem gider işlemlerinde kullanılabilir; yön seçimi YOKTUR. POST
 * {@code /businesses/{id}/categories}.</p>
 */

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { Category, CategoryApplicability } from "@/types";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_COLOR,
} from "./category-presets";

interface Props {
  /** Kategori bu işletmeye bağlanır (paylaşımlı — yön-bağımsız). */
  businessId: string;
  onClose: () => void;
  onCreated: (c: Category) => void;
}

export function QuickCategoryModal({ businessId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_CATEGORY_ICON);
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  // Ledger v2 (Faz A, §3.9): hibrit uygulanabilirlik (default BOTH).
  const [applicability, setApplicability] = useState<CategoryApplicability>("BOTH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) { setError("Kategori adı zorunlu"); return; }
    if (!businessId) { setError("Önce işletme seçin"); return; }
    setSubmitting(true);
    try {
      // Paylaşımlı kategori: direction gönderilmez (backend yok sayar).
      // Ledger v2 (Faz A, §3.9): applicability (BOTH/INCOME_ONLY/EXPENSE_ONLY).
      const created = await api.post<Category>(`/businesses/${businessId}/categories`, {
        name: trimmed,
        icon: icon || null,
        color: color || null,
        applicability,
      });
      toast.success("Kategori oluşturuldu");
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Oluşturma başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-sm shadow-xl"
      >
        <div className="modal-header">
          <h3 className="text-base font-semibold text-white">Yeni Kategori</h3>
          <button type="button" onClick={onClose} className="modal-close">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Ledger v2 (§3.9): uygulanabilirlik — BOTH (varsayılan, paylaşımlı)
              ya da tek tarafa kilit. İşlem formu o anki yöne göre süzer. */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Kullanım
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { v: "BOTH", label: "İkisi de", hint: "gelir + gider" },
                { v: "INCOME_ONLY", label: "Yalnız gelir", hint: "" },
                { v: "EXPENSE_ONLY", label: "Yalnız gider", hint: "" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setApplicability(opt.v)}
                  className={cn(
                    "py-2 px-2 rounded-lg text-[11px] font-medium border transition-all text-center",
                    applicability === opt.v
                      ? "bg-brand-500/20 border-brand-500/60 text-brand-200"
                      : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-300",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-surface-500">
              {applicability === "BOTH"
                ? "Hem gelir hem gider işlemlerinde görünür."
                : applicability === "INCOME_ONLY"
                  ? "Yalnız gelir işlemlerinde listelenir."
                  : "Yalnız gider işlemlerinde listelenir."}
            </p>
          </div>

          {/* Önizleme */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-700/50 border border-surface-600">
            <span
              className="flex items-center justify-center w-9 h-9 rounded-xl text-lg shrink-0"
              style={{ backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
            >
              {icon}
            </span>
            <span className="text-sm font-medium text-surface-100 truncate">
              {name.trim() || "Kategori adı"}
            </span>
          </div>

          {/* Ad */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Kategori Adı *
            </label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Kira, Malzeme, Satış"
              maxLength={60}
              className="field field-sm py-2.5"
            />
          </div>

          {/* İkon */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              İkon <span className="text-surface-400 font-normal">(opsiyonel)</span>
            </label>
            <div className="grid grid-cols-8 gap-1">
              {CATEGORY_ICONS.map((emo) => (
                <button
                  key={emo}
                  type="button"
                  onClick={() => setIcon(emo)}
                  className={cn(
                    "aspect-square rounded-lg text-base flex items-center justify-center transition-all border",
                    icon === emo
                      ? "bg-brand-500/20 border-brand-500/60"
                      : "bg-surface-700 border-transparent hover:border-surface-500",
                  )}
                  aria-label={`İkon ${emo}`}
                >
                  {emo}
                </button>
              ))}
            </div>
          </div>

          {/* Renk */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Renk <span className="text-surface-400 font-normal">(opsiyonel)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-7 h-7 rounded-full transition-all border-2",
                    color === c ? "border-white scale-110" : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Renk ${c}`}
                />
              ))}
            </div>
          </div>

          {!businessId && (
            <p className="text-[11px] text-amber-300 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
              Kategori oluşturmak için önce işletme seçin.
            </p>
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
            disabled={submitting || !name.trim() || !businessId}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Oluştur
          </button>
        </div>
      </form>
    </div>
  );
}
