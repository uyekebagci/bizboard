"use client";

/**
 * Kategori oluştur/düzenle modal'ı — Kategori Yönetim Sayfası için tam form.
 *
 * <p>{@link QuickCategoryModal} işlem formundan hızlı oluşturma içindir (ad +
 * ikon/renk). Bu modal yönetim sayfasında kullanılır ve ek olarak
 * {@code sort_order} (sıra) düzenlemeyi de destekler.</p>
 *
 * <p>Paylaşımlı (yön-bağımsız) kategori modeli: kategoriler hem gelir hem
 * giderde kullanılır; yön seçimi YOKTUR.</p>
 *
 * <ul>
 *   <li>Create: {@code POST /businesses/{id}/categories} — name, icon, color,
 *       sort_order.</li>
 *   <li>Update: {@code PUT /categories/{id}} — name, icon, color, sort_order.</li>
 * </ul>
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
  businessId: string;
  /** Düzenleme modunda mevcut kategori; null ise create. */
  existing?: Category | null;
  onClose: () => void;
  onSaved: (c: Category) => void;
}

export function CategoryFormModal({
  businessId, existing, onClose, onSaved,
}: Props) {
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState<string>(existing?.icon ?? DEFAULT_CATEGORY_ICON);
  const [color, setColor] = useState<string>(existing?.color ?? DEFAULT_CATEGORY_COLOR);
  const [sortOrder, setSortOrder] = useState<string>(String(existing?.sort_order ?? 0));
  // Ledger v2 (Faz A, §3.9): hibrit uygulanabilirlik (default BOTH).
  const [applicability, setApplicability] = useState<CategoryApplicability>(
    existing?.applicability ?? "BOTH",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) { setError("Kategori adı zorunlu"); return; }
    const parsedSort = Number.parseInt(sortOrder, 10);
    const sort = Number.isFinite(parsedSort) ? parsedSort : 0;

    setSubmitting(true);
    try {
      let saved: Category;
      if (isEdit && existing) {
        saved = await api.put<Category>(`/categories/${existing.id}`, {
          name: trimmed,
          icon: icon || null,
          color: color || null,
          sort_order: sort,
          applicability,
        });
        toast.success("Kategori güncellendi");
      } else {
        // Paylaşımlı kategori: direction gönderilmez (backend yok sayar).
        // Ledger v2 (§3.9): applicability (BOTH/INCOME_ONLY/EXPENSE_ONLY).
        saved = await api.post<Category>(`/businesses/${businessId}/categories`, {
          name: trimmed,
          icon: icon || null,
          color: color || null,
          sort_order: sort,
          applicability,
        });
        toast.success("Kategori oluşturuldu");
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kaydetme başarısız");
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
          <h3 className="text-base font-semibold text-white">
            {isEdit ? "Kategoriyi Düzenle" : "Yeni Kategori"}
          </h3>
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

          {/* Ledger v2 (§3.9): uygulanabilirlik — BOTH (paylaşımlı) ya da
              tek tarafa kilit. İşlem formu o anki yöne göre süzer. */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Kullanım
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { v: "BOTH", label: "İkisi de" },
                { v: "INCOME_ONLY", label: "Yalnız gelir" },
                { v: "EXPENSE_ONLY", label: "Yalnız gider" },
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
                ? "Hem gelir hem gider işlemlerinde görünür (paylaşımlı)."
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

          {/* Sıra */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Sıra <span className="text-surface-400 font-normal">(küçük = üstte)</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              min={0}
              className="field field-sm py-2.5"
            />
          </div>

          {/* İkon */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">İkon</label>
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
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Renk</label>
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
            disabled={submitting || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Kaydet" : "Oluştur"}
          </button>
        </div>
      </form>
    </div>
  );
}
