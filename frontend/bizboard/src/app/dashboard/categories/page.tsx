"use client";

/**
 * Kategori Yönetim Sayfası — Kategori FE WP.
 *
 * <p>İşletme bazlı gelir/gider kategorilerinin yönetimi. Gelir ve gider ayrı
 * sekmelerde tutulur (backend {@code direction} INCOME/EXPENSE). Liste
 * ikon/renk/ad/sıra gösterir; oluştur/düzenle/sil (soft-delete) destekler.</p>
 *
 * <p>API: {@code GET|POST /businesses/{id}/categories}, {@code PUT /categories/{id}},
 * {@code DELETE /categories/{id}} (soft-delete). İşlemlerde kategori zorunlu
 * olduğundan bu sayfa, kullanıcının önceden kategori kümesini kurmasını sağlar.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Pencil, Trash2, ArrowDownLeft, ArrowUpRight,
  Loader2, Tags,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { DarkSelect } from "@/components/shared/DarkSelect";
import type { Business, Category, TransactionDirection } from "@/types";
import { CategoryFormModal } from "@/components/transactions/CategoryFormModal";

export default function CategoriesPage() {
  const router = useRouter();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [direction, setDirection] = useState<TransactionDirection>("income");

  const [loadingBiz, setLoadingBiz] = useState(true);
  const [loadingCat, setLoadingCat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // İşletmeleri yükle
  useEffect(() => {
    api.get<Business[]>("/businesses")
      .then((data) => {
        setBusinesses(data || []);
        if (data && data.length > 0) setBusinessId((prev) => prev || data[0].id);
      })
      .catch((err) => setError(getErrorMessage(err, "İşletmeler yüklenemedi")))
      .finally(() => setLoadingBiz(false));
  }, []);

  // Seçili işletmenin kategorilerini yükle
  useEffect(() => {
    if (!businessId) { setCategories([]); return; }
    setLoadingCat(true);
    api.get<Category[]>(`/businesses/${businessId}/categories`)
      .then((data) => setCategories(data || []))
      .catch((err) => setError(getErrorMessage(err, "Kategoriler yüklenemedi")))
      .finally(() => setLoadingCat(false));
  }, [businessId]);

  const visible = useMemo(
    () => categories
      .filter((c) => c.direction === direction)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr")),
    [categories, direction],
  );

  function openCreate() {
    setEditTarget(null);
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditTarget(cat);
    setShowForm(true);
  }

  function handleSaved(saved: Category) {
    setCategories((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
    });
    setShowForm(false);
    setEditTarget(null);
  }

  async function handleDelete(cat: Category) {
    if (!window.confirm(`"${cat.name}" kategorisi silinsin mi? Mevcut işlemler etkilenmez.`)) return;
    setDeletingId(cat.id);
    try {
      await api.delete(`/categories/${cat.id}`);
      // Soft-delete: listeden çıkar.
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      toast.success("Kategori silindi");
    } catch (err) {
      toast.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  const incomeCount = categories.filter((c) => c.direction === "income").length;
  const expenseCount = categories.filter((c) => c.direction === "expense").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 mt-0.5 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
              aria-label="Geri dön"
            >
              <ArrowLeft size={20} className="text-surface-300" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Tags size={22} className="text-brand-400" /> Kategoriler
              </h1>
              <p className="text-surface-400 mt-1 text-sm">
                Gelir ve gider kategorilerini yönetin. İşlemlerde kategori zorunludur.
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            disabled={!businessId}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl transition-colors shrink-0 disabled:opacity-50"
          >
            <Plus size={16} />
            Yeni Kategori
          </button>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* İşletme seçici */}
      <section className="glass-card p-3">
        {loadingBiz ? (
          <div className="h-11 bg-surface-700 rounded-xl animate-pulse" />
        ) : businesses.length === 0 ? (
          <p className="text-sm text-surface-400 px-1 py-2">
            Önce bir işletme oluşturun.
          </p>
        ) : businesses.length === 1 ? (
          <p className="text-sm text-surface-300 px-1 py-1">
            <span className="text-surface-400">İşletme:</span> {businesses[0].name}
          </p>
        ) : (
          <DarkSelect
            value={businessId}
            onChange={setBusinessId}
            placeholder="İşletme seçin"
            searchable={businesses.length > 6}
            options={businesses.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
      </section>

      {/* Gelir / Gider sekmeleri */}
      <div className="flex rounded-xl border border-surface-600 overflow-hidden">
        <button
          type="button"
          onClick={() => setDirection("income")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors",
            direction === "income"
              ? "bg-green-500/15 text-green-300"
              : "bg-surface-800 text-surface-300 hover:bg-surface-700",
          )}
        >
          <ArrowDownLeft size={16} /> Gelir
          <span className="text-[11px] text-surface-400">({incomeCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setDirection("expense")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors border-l border-surface-600",
            direction === "expense"
              ? "bg-red-500/15 text-red-300"
              : "bg-surface-800 text-surface-300 hover:bg-surface-700",
          )}
        >
          <ArrowUpRight size={16} /> Gider
          <span className="text-[11px] text-surface-400">({expenseCount})</span>
        </button>
      </div>

      {/* Liste */}
      <section className="space-y-2">
        {loadingCat ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 bg-surface-700/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !businessId ? null : visible.length === 0 ? (
          <EmptyState direction={direction} onCreate={openCreate} />
        ) : (
          visible.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              onEdit={() => openEdit(cat)}
              onDelete={() => handleDelete(cat)}
              deleting={deletingId === cat.id}
            />
          ))
        )}
      </section>

      {showForm && businessId && (
        <CategoryFormModal
          businessId={businessId}
          direction={direction}
          existing={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function CategoryRow({
  category, onEdit, onDelete, deleting,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const color = category.color || "#868e96";
  return (
    <div className="glass-card flex items-center gap-3 p-3">
      <span
        className="flex items-center justify-center w-10 h-10 rounded-xl text-lg shrink-0"
        style={{ backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
      >
        {category.icon || "🏷️"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-surface-100 truncate">{category.name}</p>
        <p className="text-[11px] text-surface-400">Sıra: {category.sort_order}</p>
      </div>
      <button
        onClick={onEdit}
        className="p-2 rounded-lg text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
        aria-label="Düzenle"
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="p-2 rounded-lg text-red-300 hover:text-red-200 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        aria-label="Sil"
      >
        {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
      </button>
    </div>
  );
}

function EmptyState({
  direction, onCreate,
}: {
  direction: TransactionDirection;
  onCreate: () => void;
}) {
  const isIncome = direction === "income";
  return (
    <div className="glass-card p-8 text-center">
      <div className="mx-auto mb-3 flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-700">
        {isIncome ? (
          <ArrowDownLeft size={26} className="text-green-400" />
        ) : (
          <ArrowUpRight size={26} className="text-red-400" />
        )}
      </div>
      <h3 className="text-base font-semibold text-surface-100">
        Henüz {isIncome ? "gelir" : "gider"} kategorisi yok
      </h3>
      <p className="text-sm text-surface-400 mt-1 mb-4">
        İlk kategoriyi oluşturun; işlem eklerken seçilebilir olsun.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl transition-colors"
      >
        <Plus size={16} /> Kategori Oluştur
      </button>
    </div>
  );
}
