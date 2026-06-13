"use client";

/**
 * CHT-1 + CHT-2 (Telegram Admin Hedefli Gönderim): bağlı chat/grup/kişi listesi
 * + per-chat event tercih konfigürasyonu. ADMIN-only (backend zaten korur;
 * burada da yönlendirme guard'ı). Çift tema (v2 token'ları) + portal'lı modal.
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Send,
  Loader2,
  Users,
  User as UserIcon,
  RefreshCw,
  Settings2,
  X,
  MessageSquarePlus,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  listTelegramChats,
  listChatPreferences,
  setChatPreference,
  eventLabel,
  type TelegramChat,
  type ChatEventPref,
} from "@/lib/api/admin-telegram";

export default function AdminTelegramPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);

  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configChat, setConfigChat] = useState<TelegramChat | null>(null);

  useEffect(() => {
    if (profile && profile.role !== "admin") router.replace("/dashboard");
  }, [profile, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setChats(await listTelegramChats());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (profile?.role !== "admin") return null;

  return (
    <div className="min-h-[100dvh] bg-[rgb(var(--v2-app))] text-[rgb(var(--v2-ink))]">
      <header className="sticky top-0 z-40 bg-[rgb(var(--v2-card))]/95 backdrop-blur-lg border-b border-[rgb(var(--v2-border))]">
        <div className="flex items-center gap-3 px-4 py-3 max-w-5xl mx-auto">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="p-2 rounded-xl hover:bg-[rgb(var(--v2-sunken))]"
            aria-label="Geri"
          >
            <ChevronLeft size={18} className="text-[rgb(var(--v2-muted))]" />
          </button>
          <Send size={20} className="text-[rgb(var(--accent))]" />
          <h1 className="text-lg font-bold text-[rgb(var(--v2-ink))]">Telegram Bağlı Hesaplar</h1>
          <span className="ml-2 text-xs text-[rgb(var(--v2-muted))]">
            {chats.length > 0 ? `${chats.length} chat` : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/admin/telegram/manual-send"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg v2-btn v2-btn--accent font-medium"
            >
              <MessageSquarePlus size={14} />
              Manuel Gönderim
            </a>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[rgb(var(--v2-sunken))] hover:bg-[rgb(var(--v2-border))] text-[rgb(var(--v2-ink))] disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Yenile
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-5xl mx-auto">
        {error && (
          <div className="mb-3 p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">
            {error}
          </div>
        )}

        <div className="v2-card rounded-2xl overflow-hidden divide-y divide-[rgb(var(--v2-border))]">
          {loading && (
            <div className="flex items-center justify-center py-10 text-[rgb(var(--v2-muted))]">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}

          {!loading && chats.length === 0 && (
            <p className="text-center text-[rgb(var(--v2-muted))] py-10 text-sm">
              Henüz bağlı Telegram hesabı/grubu yok. Kullanıcılar Profil &gt;
              Bildirimler&apos;den, gruplar bot eklenip bağlanarak görünür.
            </p>
          )}

          {!loading &&
            chats.map((c) => (
              <div
                key={c.binding_id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[rgb(var(--v2-sunken))] transition-colors"
              >
                <div
                  className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${
                    c.chat_type === "GROUP"
                      ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                      : "bg-accent/15 text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent-bright))]"
                  }`}
                >
                  {c.chat_type === "GROUP" ? <Users size={16} /> : <UserIcon size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[rgb(var(--v2-ink))] truncate">
                      {c.chat_name}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                        c.chat_type === "GROUP"
                          ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30"
                          : "v2-chip-accent"
                      }`}
                    >
                      {c.chat_type === "GROUP" ? "Grup" : c.chat_type === "DM" ? "Kişi" : "?"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[rgb(var(--v2-muted))]">
                    <span className="truncate">
                      {c.user_name ?? "—"}
                      {c.username ? ` (@${c.username})` : ""}
                    </span>
                    <span className="opacity-50">·</span>
                    <span>{formatDate(c.linked_at)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-[rgb(var(--v2-muted))]">Aktif olay</div>
                  <div className="text-sm font-semibold text-[rgb(var(--v2-ink))] num">
                    {c.enabled_event_count}/{c.total_event_count}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfigChat(c)}
                  className="ml-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[rgb(var(--v2-sunken))] hover:bg-[rgb(var(--v2-border))] text-[rgb(var(--v2-ink))] shrink-0"
                >
                  <Settings2 size={14} />
                  Konfigür
                </button>
              </div>
            ))}
        </div>
      </main>

      {configChat && (
        <ChatConfigModal
          chat={configChat}
          onClose={() => setConfigChat(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

// ── CHT-2: per-chat event konfigürasyon modalı ──────────────────────────────

function ChatConfigModal({
  chat,
  onClose,
  onChanged,
}: {
  chat: TelegramChat;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [prefs, setPrefs] = useState<ChatEventPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listChatPreferences(chat.binding_id)
      .then((p) => {
        if (alive) setPrefs(p);
      })
      .catch((e) => toast.error(e))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chat.binding_id]);

  async function toggle(event: string, next: boolean) {
    setPrefs((p) => p.map((x) => (x.event === event ? { ...x, enabled: next } : x)));
    setSaving(event);
    try {
      await setChatPreference(chat.binding_id, event, next);
      onChanged();
    } catch (e) {
      setPrefs((p) => p.map((x) => (x.event === event ? { ...x, enabled: !next } : x)));
      toast.error(e);
    } finally {
      setSaving(null);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="modal-surface rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))] truncate">
              {chat.chat_name}
            </h3>
            <p className="text-[11px] text-[rgb(var(--v2-muted))]">
              Bu chat&apos;e hangi olayların gideceğini seçin
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] transition-colors"
            aria-label="Kapat"
          >
            <X size={18} className="text-[rgb(var(--v2-muted))]" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={18} className="animate-spin text-[rgb(var(--v2-muted))]" />
            </div>
          ) : (
            <div className="v2-table-wrap">
              <table className="v2-table w-full text-sm">
                <tbody>
                  {prefs.map((p) => {
                    const busy = saving === p.event;
                    return (
                      <tr key={p.event} className="row-hover">
                        <td className="py-2.5 pr-3 text-[rgb(var(--v2-ink))]">{eventLabel(p.event)}</td>
                        <td className="py-2.5 text-right w-16">
                          <button
                            onClick={() => toggle(p.event, !p.enabled)}
                            disabled={busy}
                            role="switch"
                            aria-checked={p.enabled}
                            aria-label={eventLabel(p.event)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              p.enabled ? "bg-[rgb(var(--accent))]" : "bg-surface-600"
                            } ${busy ? "opacity-60" : ""}`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                p.enabled ? "translate-x-4" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
