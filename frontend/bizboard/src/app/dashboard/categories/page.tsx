"use client";

/**
 * Kategori Yönetim Sayfası.
 *
 * <p>İşletme bazlı PAYLAŞIMLI (yön-bağımsız) kategori yönetimi: bir kategori hem
 * gelir hem gider işlemlerinde kullanılabilir. Tek liste; ikon/renk/ad/sıra
 * gösterir; oluştur/düzenle/sil (soft-delete) destekler.</p>
 *
 * <p>API: {@code GET|POST /businesses/{id}/categories}, {@code PUT /categories/{id}},
 * {@code DELETE /categories/{id}} (soft-delete). İşlemlerde kategori zorunlu
 * olduğundan bu sayfa, kullanıcının önceden kategori kümesini kurmasını sağlar.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Pencil, Trash2,
  Loader2, Tags,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { DarkSelect } from "@/components/shared/DarkSelect";
import type { Business, Category } from "@/types";
import { CategoryFormModal } from "@/components/transactions/CategoryFormModal";

export default function CategoriesPage() {
  const router = useRouter();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);

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
    () => [...categories]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr")),
    [categories],
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


  return (
    <div className="space-y-5">
      {/* Header */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.back()}
              className="v2-icon-btn v2-press mt-0.5"
              aria-label="Geri dön"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="v2-display text-2xl flex items-center gap-2">
                <Tags size={22} className="text-accent-strong dark:text-accent" /> Kategoriler
              </h1>
              <p className="text-[rgb(var(--v2-muted))] mt-1 text-sm">
                Kategorileriniz hem gelir hem gider işlemlerinde kullanılır.
                İşlemlerde kategori zorunludur.
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            disabled={!businessId}
            className="v2-btn v2-btn--ink v2-press flex items-center gap-2 text-sm shrink-0 disabled:opacity-50"
          >
            <Plus size={16} />
            Yeni Kategori
          </button>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">
          {error}
        </div>
      )}

      {/* İşletme seçici */}
      <section className="v2-card p-3">
        {loadingBiz ? (
          <div className="h-11 v2-sunken rounded-xl animate-pulse" />
        ) : businesses.length === 0 ? (
          <p className="text-sm text-[rgb(var(--v2-muted))] px-1 py-2">
            Önce bir işletme oluşturun.
          </p>
        ) : businesses.length === 1 ? (
          <p className="text-sm text-[rgb(var(--v2-ink))] px-1 py-1">
            <span className="text-[rgb(var(--v2-muted))]">İşletme:</span> {businesses[0].name}
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

      {/* Liste — tek paylaşımlı liste (yön sekmeleri yok) */}
      <section className="space-y-2">
        {loadingCat ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 v2-sunken rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !businessId ? null : visible.length === 0 ? (
          <EmptyState onCreate={openCreate} />
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
    <div className="v2-card flex items-center gap-3 p-3">
      <span
        className="flex items-center justify-center w-10 h-10 rounded-xl text-lg shrink-0"
        style={{ backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
      >
        {category.icon || "🏷️"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate">{category.name}</p>
        <p className="text-[11px] text-[rgb(var(--v2-muted))]">Sıra: {category.sort_order}</p>
      </div>
      <button
        onClick={onEdit}
        className="p-2 rounded-lg text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-sunken))] transition-colors"
        aria-label="Düzenle"
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="p-2 rounded-lg text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-50"
        aria-label="Sil"
      >
        {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
      </button>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="v2-card p-8 text-center">
      <div className="mx-auto mb-3 flex items-center justify-center w-14 h-14 rounded-2xl v2-sunken">
        <Tags size={26} className="text-accent-strong dark:text-accent" />
      </div>
      <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">
        Henüz kategori yok
      </h3>
      <p className="text-sm text-[rgb(var(--v2-muted))] mt-1 mb-4">
        İlk kategoriyi oluşturun; işlem eklerken seçilebilir olsun.
      </p>
      <button
        onClick={onCreate}
        className="v2-btn v2-btn--ink v2-press inline-flex items-center gap-2 text-sm"
      >
        <Plus size={16} /> Kategori Oluştur
      </button>
    </div>
  );
}
