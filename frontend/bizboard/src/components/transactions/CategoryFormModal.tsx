"use client";

/**
 * Kategori oluştur/düzenle modal'ı — Kategori Yönetim Sayfası için tam form.
 *
 * <p>{@link QuickCategoryModal} işlem formundan hızlı oluşturma içindir (ad +
 * ikon/renk). Bu modal yönetim sayfasında kullanılır ve ek olarak
 * {@code sort_order} (sıra) düzenlemeyi de destekler.</p>
 *
 * <ul>
 *   <li>Create: {@code POST /businesses/{id}/categories} — name, direction,
 *       icon, color, sort_order.</li>
 *   <li>Update: {@code PUT /categories/{id}} — name, icon, color, sort_order.
 *       (Yön değiştirilmez — backend kontratı PUT'ta direction kabul etmez.)</li>
 * </ul>
 */

import { useState } from "react";
import { X, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { Category, TransactionDirection } from "@/types";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_COLOR,
} from "./category-presets";

interface Props {
  businessId: string;
  /** Create modunda yeni kategorinin yönü (sekme yönü). */
  direction: TransactionDirection;
  /** Düzenleme modunda mevcut kategori; null ise create. */
  existing?: Category | null;
  onClose: () => void;
  onSaved: (c: Category) => void;
}

export function CategoryFormModal({
  businessId, direction, existing, onClose, onSaved,
}: Props) {
  const isEdit = !!existing;
  const effectiveDirection = existing?.direction ?? direction;
  const isIncome = effectiveDirection === "income";

  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState<string>(existing?.icon ?? DEFAULT_CATEGORY_ICON);
  const [color, setColor] = useState<string>(existing?.color ?? DEFAULT_CATEGORY_COLOR);
  const [sortOrder, setSortOrder] = useState<string>(String(existing?.sort_order ?? 0));
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
        });
        toast.success("Kategori güncellendi");
      } else {
        saved = await api.post<Category>(`/businesses/${businessId}/categories`, {
          name: trimmed,
          direction: effectiveDirection.toUpperCase(), // INCOME/EXPENSE (case-insensitive)
          icon: icon || null,
          color: color || null,
          sort_order: sort,
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

          {/* Yön rozeti (kilitli) */}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
              isIncome
                ? "bg-green-500/15 border-green-500/40 text-green-300"
                : "bg-red-500/15 border-red-500/40 text-red-300",
            )}
          >
            {isIncome ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
            {isIncome ? "Gelir kategorisi" : "Gider kategorisi"}
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
