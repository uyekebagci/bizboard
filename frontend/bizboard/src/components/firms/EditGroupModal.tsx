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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-md shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white">Grubu Düzenle</h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Grup Adı *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Renk</label>
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
            <label className="block text-xs font-medium text-surface-200 mb-1.5">İkon</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ICONS.map((ic) => (
                <button key={ic} type="button" onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg border-2 transition-all ${
                    icon === ic ? "border-brand-500 bg-brand-500/15 scale-110"
                                : "border-surface-600 hover:border-surface-400"
                  }`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {group.firm_count > 0 && (
            <p className="text-[11px] text-amber-300 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
              Bu grupta {group.firm_count} firma var. Silersen firmalar "Gruplanmamış" bölümüne düşer.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-surface-700">
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={submitting}
            className="px-3 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-300 text-sm font-semibold inline-flex items-center gap-1.5 border border-red-500/30 disabled:opacity-50">
            <Trash2 size={14} /> Sil
          </button>
          <button type="button" onClick={onClose} disabled={submitting}
            className="ml-auto px-4 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50">
            Vazgeç
          </button>
          <button type="submit" disabled={submitting || !name.trim()}
            className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Kaydet
          </button>
        </div>
      </form>
    </div>

    {confirmDelete && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
           onClick={() => setConfirmDelete(false)}>
        <div onClick={(e) => e.stopPropagation()}
             className="bg-surface-800 rounded-2xl border border-red-500/30 max-w-sm w-full p-5">
          <h4 className="text-base font-semibold text-white mb-2">Grubu sil</h4>
          <p className="text-sm text-surface-300 mb-4">
            <strong>{group.name}</strong> grubunu silmek istediğinden emin misin?
            {group.firm_count > 0 && (
              <> Grup içindeki {group.firm_count} firma <em>"Gruplanmamış"</em> bölümüne düşer.</>
            )}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} disabled={submitting}
              className="flex-1 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium">
              Vazgeç
            </button>
            <button onClick={handleDelete} disabled={submitting}
              className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5">
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
