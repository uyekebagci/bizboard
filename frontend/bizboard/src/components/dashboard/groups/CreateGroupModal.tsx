"use client";

/**
 * v1.6.12: Yeni grup oluşturma modal'ı.
 * Üç alan: isim (max 80) + renk (8 paletten biri) + öncelik (3 chip).
 */

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import {
  GROUP_COLORS, GROUP_COLOR_CLASSES,
  PRIORITY_PINNED, PRIORITY_HIGH, PRIORITY_NORMAL,
  priorityIcon, priorityLabel,
} from "@/lib/business-groups";
import type { GroupColor, GroupPriority } from "@/types";

interface Props {
  onClose: () => void;
  onSubmit: (input: { name: string; color: GroupColor; priority: GroupPriority }) => Promise<void>;
}

export function CreateGroupModal({ onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<GroupColor>("blue");
  const [priority, setPriority] = useState<GroupPriority>(PRIORITY_NORMAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Grup adi zorunlu");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), color, priority });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Grup olusturulamadi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-card shadow-xl w-full max-w-md">
        <div className="modal-header">
          <h3 className="text-lg font-semibold text-white">Yeni Grup Olustur</h3>
          <button
            onClick={onClose}
            className="modal-close"
            aria-label="Kapat"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="label">Grup Adi</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="input"
              placeholder="orn. Kuzey Subeleri"
              autoFocus
            />
            <p className="mt-1 text-[10px] text-surface-400">{name.length}/80</p>
          </div>

          {/* Color */}
          <div>
            <label className="label">Renk</label>
            <div className="grid grid-cols-8 gap-2">
              {GROUP_COLORS.map((c) => {
                const cls = GROUP_COLOR_CLASSES[c];
                const active = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-9 rounded-xl ${cls.dot} ${
                      active ? `ring-2 ring-offset-2 ring-offset-surface-800 ${cls.ring}` : "opacity-70 hover:opacity-100"
                    } transition-all`}
                    aria-label={c}
                    title={c}
                  />
                );
              })}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="label">Oncelik</label>
            <div className="grid grid-cols-3 gap-2">
              {([PRIORITY_PINNED, PRIORITY_HIGH, PRIORITY_NORMAL] as GroupPriority[]).map((p) => {
                const active = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      active
                        ? "bg-brand-500/15 border-brand-500/40 text-brand-300"
                        : "bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-300"
                    }`}
                  >
                    {priorityIcon(p) && <span>{priorityIcon(p)}</span>}
                    {priorityLabel(p)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary flex-1 px-4 py-2.5 text-sm"
            >
              Vazgec
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Olusturuluyor...</>
              ) : (
                "Olustur"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
