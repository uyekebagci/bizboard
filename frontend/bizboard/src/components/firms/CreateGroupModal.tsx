"use client";

/**
 * v1.7.x WP 8b961444 TODO 5557e062: Nested grup oluşturma modalı.
 * Edit modal'ın grup dropdown'undan tetiklenir.
 */

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { MyCompanyGroup } from "@/types";

const PRESET_COLORS = [
  { v: "#3B82F6", n: "Mavi" },
  { v: "#10B981", n: "Yeşil" },
  { v: "#F59E0B", n: "Amber" },
  { v: "#EF4444", n: "Kırmızı" },
  { v: "#8B5CF6", n: "Mor" },
  { v: "#EC4899", n: "Pembe" },
  { v: "#6366F1", n: "İndigo" },
  { v: "#14B8A6", n: "Teal" },
];

const PRESET_ICONS = ["🏢", "🏭", "🏪", "🌾", "⚡", "🚜", "🔧", "💼", "📦", "🛠️"];

interface Props {
  onClose: () => void;
  onCreated: (g: MyCompanyGroup) => void;
}

export function CreateGroupModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0].v);
  const [icon, setIcon] = useState(PRESET_ICONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Grup adı zorunlu"); return; }
    setSubmitting(true);
    try {
      const created = await api.post<MyCompanyGroup>("/firms/groups", {
        name: name.trim(),
        color,
        icon,
        order_index: 0,
      });
      toast.success("Grup oluşturuldu");
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Grup oluşturulamadı");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-md shadow-xl"
      >
        <div className="modal-header">
          <h3 className="text-base font-semibold text-white">Yeni Grup Oluştur</h3>
          <button type="button" onClick={onClose}
            className="modal-close">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Grup Adı *</label>
            <input
              autoFocus required value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="örn. Elektrik Şirketleri"
              maxLength={120}
              className="field field-sm py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Renk</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button key={c.v} type="button"
                  onClick={() => setColor(c.v)}
                  title={c.n}
                  className="w-7 h-7 rounded-lg border-2 transition-all"
                  style={{
                    backgroundColor: c.v,
                    borderColor: color === c.v ? "#fff" : "transparent",
                    transform: color === c.v ? "scale(1.1)" : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">İkon</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ICONS.map((ic) => (
                <button key={ic} type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg border-2 transition-all ${
                    icon === ic ? "border-brand-500 bg-brand-500/15 scale-110"
                                : "border-surface-600 hover:border-surface-400"
                  }`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 p-2.5 rounded-lg bg-surface-900/40 border border-surface-700 flex items-center gap-2">
            <span className="text-[10px] uppercase text-surface-400">Önizleme</span>
            <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border"
                  style={{ borderColor: color, color, background: `${color}22` }}>
              <span>{icon}</span>
              <span>{name || "Grup adı"}</span>
            </span>
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-700">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50">
            Vazgeç
          </button>
          <button type="submit" disabled={submitting || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Oluştur
          </button>
        </div>
      </form>
    </div>
  );
}
