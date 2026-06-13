"use client";

/**
 * v1.7.x WP 8b961444 TODO 5557e062: Grup düzenle / sil modal'ı.
 * Group başlığındaki kalem ikonundan açılır (admin-only).
 *
 * <p>Silindiğinde grup içindeki firmalar SET NULL ile "Gruplanmamış"
 * bölümüne düşer (DB constraint).</p>
 */

import { useState } from "react";
import { X, Loader2, Save, Trash2, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { MyCompanyGroup } from "@/types";

const PRESET_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6",
];
const PRESET_ICONS = ["🏢", "🏭", "🏪", "🌾", "⚡", "🚜", "🔧", "💼", "📦", "🛠️"];

interface Props {
  group: MyCompanyGroup;
  onClose: () => void;
  onUpdated: (g: MyCompanyGroup) => void;
  onDeleted: (id: string) => void;
}

export function EditGroupModal({ group, onClose, onUpdated, onDeleted }: Props) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color || PRESET_COLORS[0]);
  const [icon, setIcon] = useState(group.icon || PRESET_ICONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Grup adı zorunlu"); return; }
    setSubmitting(true);
    try {
      const updated = await api.patch<MyCompanyGroup>(`/firms/groups/${group.id}`, {
        name: name.trim(), color, icon,
      });
      toast.success("Grup güncellendi");
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Güncelleme başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      await api.delete(`/firms/groups/${group.id}`);
      toast.info("Grup silindi");
      onDeleted(group.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Silme başarısız");
      setConfirmDelete(false);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-md shadow-xl"
      >
        <div className="modal-header">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">Grubu Düzenle</h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Grup Adı *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="field field-sm py-2.5" />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Renk</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-lg border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "#fff" : "transparent",
                    transform: color === c ? "scale(1.1)" : undefined,
                  }} />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">İkon</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ICONS.map((ic) => (
                <button key={ic} type="button" onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg border-2 transition-all ${
                    icon === ic
                      ? "border-[rgb(var(--accent))]/60 bg-[rgb(var(--accent))]/12 scale-110"
                      : "border-[rgb(var(--v2-border))] hover:border-[rgb(var(--accent))]/50"
                  }`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {group.firm_count > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
              Bu grupta {group.firm_count} firma var. Silersen firmalar "Gruplanmamış" bölümüne düşer.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={submitting}
            className="px-3 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-700 dark:text-red-300 text-sm font-semibold inline-flex items-center gap-1.5 border border-red-500/30 disabled:opacity-50">
            <Trash2 size={14} /> Sil
          </button>
          <button type="button" onClick={onClose} disabled={submitting}
            className="ml-auto btn-secondary px-4 py-2.5 text-sm disabled:opacity-50">
            Vazgeç
          </button>
          <button type="submit" disabled={submitting || !name.trim()}
            className="px-4 py-2.5 rounded-xl bg-[rgb(var(--v2-ink))] text-[rgb(var(--v2-card))] hover:opacity-90 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Kaydet
          </button>
        </div>
      </form>
    </div>

    {confirmDelete && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
           onClick={() => setConfirmDelete(false)}>
        <div onClick={(e) => e.stopPropagation()}
             className="v2-card border border-red-500/30 max-w-sm w-full p-5">
          <h4 className="text-base font-semibold text-[rgb(var(--v2-ink))] mb-2">Grubu sil</h4>
          <p className="text-sm text-[rgb(var(--v2-muted))] mb-4">
            <strong>{group.name}</strong> grubunu silmek istediğinden emin misin?
            {group.firm_count > 0 && (
              <> Grup içindeki {group.firm_count} firma <em>"Gruplanmamış"</em> bölümüne düşer.</>
            )}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} disabled={submitting}
              className="btn-secondary flex-1 py-2 text-sm">
              Vazgeç
            </button>
            <button onClick={handleDelete} disabled={submitting}
              className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Sil
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
