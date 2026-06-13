"use client";

/**
 * Hatırlatıcılar — kullanıcı-tanımlı standalone hatırlatma CRUD ekranı.
 *
 * Veri: GET /reminders (yalnız kullanıcının kendi hatırlatıcıları).
 * Aksiyon: ekle/düzenle (modal), sil (DELETE /reminders/{id}).
 * Çift tema: v2-card / modal-surface / status-* token'ları globals.css ile.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, AlarmClock, Plus, Loader2, Pencil, Trash2, Repeat, Clock,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import type { Reminder, ReminderRecurrence } from "@/types";
import { ReminderModal } from "@/components/reminders/ReminderModal";

const RECURRENCE_LABEL: Record<ReminderRecurrence, string> = {
  NONE: "Tek sefer",
  DAILY: "Her gün",
  WEEKLY: "Her hafta",
  MONTHLY: "Her ay",
};

export default function HatirlaticilarPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Reminder[]>("/reminders");
      setRows(data || []);
    } catch (err) {
      logger.error("api", "Reminders fetch failed", undefined, err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(r: Reminder) {
    setEditing(r);
    setShowModal(true);
  }

  async function handleDelete(r: Reminder) {
    if (!window.confirm(`"${r.title}" hatırlatıcısını silmek istediğinize emin misiniz?`)) return;
    setDeletingId(r.id);
    try {
      await api.delete(`/reminders/${r.id}`);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Hatırlatıcı silindi");
    } catch (err) {
      toast.error(err instanceof ApiError ? err : "Silme başarısız");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-[rgb(var(--v2-sunken))] hover:opacity-80 transition-colors"
          aria-label="Geri"
        >
          <ArrowLeft size={20} className="text-[rgb(var(--v2-muted))]" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
            <AlarmClock size={20} className="text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[rgb(var(--v2-ink))]">Hatırlatıcılar</h1>
            <p className="text-xs text-[rgb(var(--v2-muted))]">Kişisel hatırlatmalarınız</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary flex items-center gap-1.5 px-3 py-2 text-sm"
        >
          <Plus size={16} />
          Ekle
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-brand-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="v2-card p-8 text-center">
          <AlarmClock size={32} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-[rgb(var(--v2-ink))] font-medium">Henüz hatırlatıcınız yok</p>
          <button onClick={openCreate} className="text-sm text-accent hover:text-accent-strong mt-2">
            İlk hatırlatıcıyı ekle
          </button>
        </div>
      ) : (
        <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "text-sm font-semibold truncate",
                      r.enabled ? "text-[rgb(var(--v2-ink))]" : "text-[rgb(var(--v2-muted))] line-through",
                    )}
                  >
                    {r.title}
                  </p>
                  {!r.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] shrink-0">
                      Pasif
                    </span>
                  )}
                </div>
                {r.message && (
                  <p className="text-xs text-[rgb(var(--v2-ink))] mt-0.5 line-clamp-2">{r.message}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-[rgb(var(--v2-muted))]">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} /> {formatTime(r.remind_at)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Repeat size={12} /> {RECURRENCE_LABEL[r.recurrence]}
                  </span>
                  {r.business_name && <span>· {r.business_name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(r)}
                  aria-label="Düzenle"
                  className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-accent hover:bg-[rgb(var(--v2-sunken))] transition"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  disabled={deletingId === r.id}
                  aria-label="Sil"
                  className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-status-danger hover:bg-[rgb(var(--v2-sunken))] transition disabled:opacity-50"
                >
                  {deletingId === r.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ReminderModal
          reminder={editing}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
