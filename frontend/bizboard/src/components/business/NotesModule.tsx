"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Pin,
  PinOff,
  Trash2,
  Pencil,
  X,
  Check,
  EyeOff,
  Eye,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { BusinessNote } from "@/types";

const NOTE_COLORS = [
  { value: null, label: "Varsayilan", bg: "bg-surface-800", border: "border-surface-600" },
  { value: "yellow", label: "Sari", bg: "bg-yellow-50", border: "border-yellow-200" },
  { value: "blue", label: "Mavi", bg: "bg-blue-500/15", border: "border-blue-500/30" },
  { value: "green", label: "Yesil", bg: "bg-emerald-500/15", border: "border-emerald-500/30" },
  { value: "red", label: "Kirmizi", bg: "bg-red-500/15", border: "border-red-500/30" },
  { value: "purple", label: "Mor", bg: "bg-purple-500/15", border: "border-purple-500/30" },
];

function getColorClasses(color: string | null) {
  const found = NOTE_COLORS.find((c) => c.value === color);
  return found || NOTE_COLORS[0];
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "az once";
  if (diffMin < 60) return `${diffMin} dk once`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} saat once`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD} gun once`;
  return d.toLocaleDateString("tr-TR");
}

/** WP a9da4e9d fix: not kapsamı — işletme notları vs alacaklara özel notlar. */
type NoteScope = "BUSINESS" | "RECEIVABLES";

interface Props {
  businessId: string;
  /** Hangi not kümesi gösterilsin/eklensin. Default "BUSINESS" (geriye uyum). */
  scope?: NoteScope;
}

export function NotesModule({ businessId, scope = "BUSINESS" }: Props) {
  const [notes, setNotes] = useState<BusinessNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingNote, setEditingNote] = useState<BusinessNote | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BusinessNote | null>(null);
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, scope]);

  async function fetchNotes() {
    setLoading(true);
    try {
      const data = await api.get<BusinessNote[]>(
        `/businesses/${businessId}/notes?scope=${scope}`
      );
      setNotes(data || []);
    } catch (err) {
      logger.error("api", "Notes fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePin(noteId: string) {
    try {
      await api.patch(`/businesses/${businessId}/notes/${noteId}/pin`, {});
      fetchNotes();
    } catch (err: unknown) {
      toast.error(err);
    }
  }

  async function handleDelete(noteId: string) {
    try {
      await api.delete(`/businesses/${businessId}/notes/${noteId}`);
      toast.info("Not silindi");
      setDeleteConfirm(null);
      fetchNotes();
    } catch (err: unknown) {
      toast.error(err);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-20 bg-surface-600 rounded-xl" />
        <div className="h-20 bg-surface-600 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-400">
          {notes.length} not
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-xs font-medium rounded-xl hover:bg-brand-700 transition-colors"
        >
          <Plus size={14} />
          Not Ekle
        </button>
      </div>

      {/* Notes Grid */}
      {notes.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-surface-400 text-sm">Henuz not eklenmemis</p>
          <p className="text-surface-400 text-xs mt-1">
            Bu isletmeyle ilgili notlarinizi buraya ekleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {notes.map((note) => {
            const colorCls = getColorClasses(note.color);
            return (
              <div
                key={note.id}
                className={`rounded-xl border p-4 transition-shadow hover:shadow-card-hover group relative ${colorCls.bg} ${colorCls.border}`}
              >
                {/* Pin badge */}
                {note.is_pinned && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-brand-600 rounded-full flex items-center justify-center">
                    <Pin size={10} className="text-white" />
                  </div>
                )}

                {/* Admin only badge */}
                {note.admin_only && isAdmin && (
                  <div className="absolute -top-1.5 -left-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-amber-500 rounded-full">
                    <EyeOff size={9} className="text-white" />
                    <span className="text-[9px] text-white font-medium">Gizli</span>
                  </div>
                )}

                {/* Content */}
                <p className="text-sm text-white whitespace-pre-wrap break-words leading-relaxed">
                  {note.content}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-surface-700/60">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-surface-400">
                      {note.created_by_name}
                    </span>
                    <span className="text-[10px] text-surface-300">•</span>
                    <span className="text-[10px] text-surface-400">
                      {timeAgo(note.created_at)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleTogglePin(note.id)}
                      className="p-1.5 rounded-lg hover:bg-surface-600/50 transition-colors"
                      title={note.is_pinned ? "Sabitlemeyi kaldir" : "Sabitle"}
                    >
                      {note.is_pinned ? (
                        <PinOff size={13} className="text-surface-400" />
                      ) : (
                        <Pin size={13} className="text-surface-400" />
                      )}
                    </button>
                    <button
                      onClick={() => setEditingNote(note)}
                      className="p-1.5 rounded-lg hover:bg-surface-600/50 transition-colors"
                      title="Duzenle"
                    >
                      <Pencil size={13} className="text-surface-400" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(note)}
                      className="p-1.5 rounded-lg hover:bg-red-500/15 transition-colors"
                      title="Sil"
                    >
                      <Trash2 size={13} className="text-red-300" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <NoteFormModal
          businessId={businessId}
          isAdmin={isAdmin}
          scope={scope}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            fetchNotes();
          }}
        />
      )}

      {/* Edit Modal */}
      {editingNote && (
        <NoteFormModal
          businessId={businessId}
          isAdmin={isAdmin}
          scope={scope}
          note={editingNote}
          onClose={() => setEditingNote(null)}
          onSuccess={() => {
            setEditingNote(null);
            fetchNotes();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="glass-card shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">
              Notu Sil
            </h3>
            <p className="text-surface-300 text-sm mb-1">
              Bu notu silmek istediginize emin misiniz?
            </p>
            <p className="text-surface-400 text-xs mb-6 line-clamp-2">
              &quot;{deleteConfirm.content}&quot;
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors"
              >
                Iptal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Note Form Modal (Create & Edit) ─────────────────────────
function NoteFormModal({
  businessId,
  isAdmin,
  scope,
  note,
  onClose,
  onSuccess,
}: {
  businessId: string;
  isAdmin: boolean;
  scope: NoteScope;
  note?: BusinessNote;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!note;
  const [content, setContent] = useState(note?.content || "");
  const [color, setColor] = useState<string | null>(note?.color || null);
  const [pinned, setPinned] = useState(note?.is_pinned || false);
  const [adminOnly, setAdminOnly] = useState(
    isEdit ? (note?.admin_only ?? false) : isAdmin ? true : false
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError("Not icerigi zorunludur");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        content: content.trim(),
        color,
        is_pinned: pinned,
      };

      if (isAdmin) {
        body.admin_only = adminOnly;
      }

      if (isEdit) {
        // Düzenleme scope'u değiştirmez — not yaratıldığı kümede kalır.
        await api.put(`/businesses/${businessId}/notes/${note!.id}`, body);
        toast.success("Not güncellendi");
      } else {
        // WP a9da4e9d fix: yeni not oluşturulduğu sayfanın scope'unda kaydedilir.
        body.scope = scope;
        await api.post(`/businesses/${businessId}/notes`, body);
        toast.success("Not eklendi");
      }
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <h3 className="text-lg font-semibold text-white">
            {isEdit ? "Notu Duzenle" : "Yeni Not"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Content */}
          <div>
            <label className="label">Not</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input min-h-[120px] resize-none"
              placeholder="Notunuzu yazin..."
              autoFocus
            />
          </div>

          {/* Color */}
          <div>
            <label className="label">Renk</label>
            <div className="flex gap-2">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value || "default"}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${c.bg} ${
                    color === c.value
                      ? "border-brand-500 scale-110"
                      : "border-surface-600 hover:border-surface-300"
                  }`}
                  title={c.label}
                >
                  {color === c.value && (
                    <Check size={12} className="text-brand-300" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Pin toggle */}
          <div className="flex items-center justify-between p-3 bg-surface-700 border border-surface-600 rounded-xl">
            <div className="flex items-center gap-2">
              <Pin size={14} className="text-surface-400" />
              <span className="text-sm text-surface-200">Sabitle</span>
            </div>
            <button
              type="button"
              onClick={() => setPinned(!pinned)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                pinned ? "bg-brand-600" : "bg-surface-600"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                  pinned ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Admin Only toggle — sadece admin görür */}
          {isAdmin && (
            <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <div className="flex items-center gap-2">
                <EyeOff size={14} className="text-amber-300" />
                <div>
                  <span className="text-sm text-surface-200">Gizli Not</span>
                  <p className="text-[10px] text-surface-400">Sadece admin gorebilir</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminOnly(!adminOnly)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  adminOnly ? "bg-amber-500" : "bg-surface-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                    adminOnly ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
          >
            {submitting
              ? "Kaydediliyor..."
              : isEdit
              ? "Guncelle"
              : "Not Ekle"}
          </button>
        </form>
      </div>
    </div>
  );
}
