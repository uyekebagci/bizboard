"use client";

/**
 * Standalone hatırlatıcı oluştur/düzenle modalı.
 *
 * Create: POST /reminders · Edit: PUT /reminders/{id}.
 * İşletme bağlamı OPSİYONEL (boş = işletmeden bağımsız hatırlatıcı).
 * Çift tema: surface-* / field / modal-* token'ları globals.css ile dark+light.
 */

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { DarkSelect } from "@/components/shared/DarkSelect";
import type { Business, Reminder, ReminderInput, ReminderRecurrence } from "@/types";

interface Props {
  /** Düzenlenecek hatırlatıcı; yoksa create modu. */
  reminder?: Reminder | null;
  onClose: () => void;
  onSaved: () => void;
}

const RECURRENCE_OPTIONS: { value: ReminderRecurrence; label: string }[] = [
  { value: "NONE", label: "Tek sefer" },
  { value: "DAILY", label: "Her gün" },
  { value: "WEEKLY", label: "Her hafta" },
  { value: "MONTHLY", label: "Her ay" },
];

/** ISO datetime → <input type="datetime-local"> value (yerel, saniyesiz). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export function ReminderModal({ reminder, onClose, onSaved }: Props) {
  const isEdit = !!reminder;
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [message, setMessage] = useState(reminder?.message ?? "");
  const [remindAt, setRemindAt] = useState(toLocalInput(reminder?.remind_at));
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>(reminder?.recurrence ?? "NONE");
  const [businessId, setBusinessId] = useState(reminder?.business_id ?? "");
  const [enabled, setEnabled] = useState(reminder?.enabled ?? true);

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Business[]>("/businesses")
      .then((r) => setBusinesses(r || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Başlık zorunlu");
      return;
    }
    if (!remindAt) {
      setError("Hatırlatma zamanı zorunlu");
      return;
    }

    const payload: ReminderInput = {
      title: title.trim(),
      message: message.trim() || null,
      // datetime-local yerel saat — backend LocalDateTime bekler (zone'suz).
      remind_at: remindAt.length === 16 ? `${remindAt}:00` : remindAt,
      recurrence,
      business_id: businessId || null,
      enabled,
    };

    setSubmitting(true);
    try {
      if (isEdit && reminder) {
        await api.put<Reminder>(`/reminders/${reminder.id}`, payload);
        toast.success("Hatırlatıcı güncellendi");
      } else {
        await api.post<Reminder>("/reminders", payload);
        toast.success("Hatırlatıcı eklendi");
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "İşlem başarısız";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col"
      >
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? "Hatırlatıcıyı Düzenle" : "Yeni Hatırlatıcı"}</h3>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Kapat">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Başlık *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Örn. Kira ödemesi"
              className="field field-sm py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Açıklama (opsiyonel)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Detay…"
              className="field field-sm py-2.5 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Hatırlatma Zamanı *
            </label>
            <input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="field field-sm py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Tekrar</label>
            <DarkSelect
              value={recurrence}
              onChange={(v) => setRecurrence(v as ReminderRecurrence)}
              options={RECURRENCE_OPTIONS}
              aria-label="Tekrar sıklığı"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              İşletme (opsiyonel)
            </label>
            <DarkSelect
              value={businessId}
              onChange={(v) => setBusinessId(v)}
              options={[
                { value: "", label: "İşletmeden bağımsız" },
                ...businesses.map((b) => ({ value: b.id, label: b.name })),
              ]}
              aria-label="İşletme"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-brand-500"
            />
            <span className="text-sm text-surface-200">Aktif</span>
          </label>
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
            disabled={submitting}
            className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-1.5"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isEdit ? (
              <Save size={14} />
            ) : (
              <Plus size={14} />
            )}
            {isEdit ? "Kaydet" : "Ekle"}
          </button>
        </div>
      </form>
    </div>
  );
}
