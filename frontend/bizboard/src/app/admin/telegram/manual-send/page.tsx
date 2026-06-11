"use client";

/**
 * MAN-2 (Telegram Admin Hedefli Gönderim): admin manuel bildirim gönderim ekranı.
 *
 * <p>Mesaj yaz + hedef seç (tüm adminler / bağlı Telegram chat'leri) + kanal seç
 * + gönder + sonuç (gitti/gitmedi). ADMIN-only. Çift tema (surface tokens).</p>
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Send,
  Loader2,
  Users,
  User as UserIcon,
  CheckCircle2,
  XCircle,
  Check,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  listTelegramChats,
  manualSend,
  sendStatusLabel,
  type TelegramChat,
  type RecipientType,
  type SendChannel,
  type ManualSendResult,
} from "@/lib/api/admin-telegram";

const TITLE_MAX = 200;
const BODY_MAX = 2000;

export default function AdminManualSendPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);

  const [recipientType, setRecipientType] = useState<RecipientType>("TELEGRAM_CHATS");
  const [channel, setChannel] = useState<SendChannel>("TELEGRAM");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ManualSendResult | null>(null);

  useEffect(() => {
    if (profile && profile.role !== "admin") router.replace("/dashboard");
  }, [profile, router]);

  const loadChats = useCallback(async () => {
    setChatsLoading(true);
    try {
      setChats(await listTelegramChats());
    } catch (err) {
      toast.error(err);
    } finally {
      setChatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  function toggleChat(chatId: string) {
    setSelectedChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((c) => c !== chatId) : [...prev, chatId]
    );
  }

  function canSend(): boolean {
    if (sending) return false;
    if (!body.trim()) return false;
    if (recipientType === "TELEGRAM_CHATS" && selectedChatIds.length === 0) return false;
    return true;
  }

  async function handleSend() {
    if (!canSend()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await manualSend({
        recipient_type: recipientType,
        telegram_chat_ids:
          recipientType === "TELEGRAM_CHATS" ? selectedChatIds : undefined,
        channel: recipientType === "ALL_ADMINS" ? channel : undefined,
        title: title.trim() || undefined,
        body: body.trim(),
      });
      setResult(res);
      const ok = res.telegram_sent > 0 || res.dispatched_recipients > 0;
      if (ok && res.telegram_failed === 0) {
        toast.success("Bildirim gönderildi");
      } else if (res.telegram_failed > 0) {
        toast.warning(
          `Gönderildi: ${res.telegram_sent}, başarısız: ${res.telegram_failed}`
        );
      } else {
        toast.info("İşlem tamamlandı");
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  }

  if (profile?.role !== "admin") return null;

  return (
    <div className="min-h-[100dvh] bg-surface-900 text-surface-100">
      <header className="sticky top-0 z-40 bg-surface-800/95 backdrop-blur-lg border-b border-surface-700">
        <div className="flex items-center gap-3 px-4 py-3 max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => router.push("/admin/telegram")}
            className="p-2 rounded-xl hover:bg-surface-700"
            aria-label="Geri"
          >
            <ChevronLeft size={18} className="text-surface-300" />
          </button>
          <Send size={20} className="text-sky-400" />
          <h1 className="text-lg font-bold">Manuel Bildirim Gönder</h1>
        </div>
      </header>

      <main className="px-4 py-4 max-w-3xl mx-auto space-y-4">
        {/* Hedef tipi */}
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-surface-100">Hedef</h3>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: "TELEGRAM_CHATS", l: "Bağlı Telegram chat'leri" },
                { v: "ALL_ADMINS", l: "Tüm adminler" },
              ] as { v: RecipientType; l: string }[]
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setRecipientType(o.v)}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  recipientType === o.v
                    ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                    : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-500"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>

          {/* ALL_ADMINS → kanal seçimi */}
          {recipientType === "ALL_ADMINS" && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-surface-400 mb-1.5">
                Kanal
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { v: "IN_APP", l: "Uygulama içi" },
                    { v: "TELEGRAM", l: "Telegram" },
                    { v: "BOTH", l: "Her ikisi" },
                  ] as { v: SendChannel; l: string }[]
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setChannel(o.v)}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      channel === o.v
                        ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                        : "bg-surface-900 border-surface-600 text-surface-400 hover:border-surface-500"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TELEGRAM_CHATS → chat çoklu seçim */}
          {recipientType === "TELEGRAM_CHATS" && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-surface-400 mb-1.5">
                Chat / Grup seç ({selectedChatIds.length} seçili)
              </label>
              {chatsLoading ? (
                <div className="py-6 flex justify-center">
                  <Loader2 size={18} className="animate-spin text-surface-400" />
                </div>
              ) : chats.length === 0 ? (
                <p className="text-sm text-surface-400 py-3">
                  Bağlı Telegram chat'i yok.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {chats.map((c) => {
                    const sel = selectedChatIds.includes(c.chat_id);
                    return (
                      <button
                        key={c.binding_id}
                        type="button"
                        onClick={() => toggleChat(c.chat_id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                          sel
                            ? "bg-sky-500/10 border-sky-500/40"
                            : "bg-surface-900 border-surface-600 hover:border-surface-500"
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${
                            c.chat_type === "GROUP"
                              ? "bg-violet-500/15 text-violet-300"
                              : "bg-sky-500/15 text-sky-300"
                          }`}
                        >
                          {c.chat_type === "GROUP" ? (
                            <Users size={14} />
                          ) : (
                            <UserIcon size={14} />
                          )}
                        </span>
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block text-surface-100 truncate">
                            {c.chat_name}
                          </span>
                          <span className="block text-[11px] text-surface-400 truncate">
                            {c.user_name ?? "—"}
                            {c.username ? ` (@${c.username})` : ""}
                          </span>
                        </span>
                        {sel && <Check size={16} className="text-sky-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* İçerik */}
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-surface-100">İçerik</h3>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-surface-400 mb-1.5">
              Başlık (opsiyonel)
            </label>
            <input
              type="text"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="örn. Önemli duyuru"
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm placeholder-surface-500 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
            <div className="text-right text-[10px] text-surface-500 mt-1">
              {title.length}/{TITLE_MAX}
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-surface-400 mb-1.5">
              Mesaj
            </label>
            <textarea
              value={body}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Gönderilecek mesaj..."
              className="w-full px-4 py-2.5 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 text-sm placeholder-surface-500 focus:outline-none focus:border-sky-500/50 transition-colors resize-y"
            />
            <div className="text-right text-[10px] text-surface-500 mt-1">
              {body.length}/{BODY_MAX}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend()}
            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            Gönder
          </button>
        </section>

        {/* Sonuç */}
        {result && (
          <section className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-surface-100">Sonuç</h3>
            <div className="flex flex-wrap gap-3 text-sm">
              {result.dispatched_recipients > 0 && (
                <span className="inline-flex items-center gap-1.5 text-surface-300">
                  <Users size={14} /> {result.dispatched_recipients} alıcıya iletildi
                </span>
              )}
              {result.telegram_sent > 0 && (
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={14} /> {result.telegram_sent} Telegram gönderildi
                </span>
              )}
              {result.telegram_failed > 0 && (
                <span className="inline-flex items-center gap-1.5 text-red-400">
                  <XCircle size={14} /> {result.telegram_failed} başarısız
                </span>
              )}
            </div>
            {result.telegram_targets.length > 0 && (
              <ul className="divide-y divide-surface-700/60 text-sm">
                {result.telegram_targets.map((t, i) => (
                  <li
                    key={`${t.chat_id}-${i}`}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-surface-300 num truncate">{t.chat_id}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        t.status === "OK" ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {t.status === "OK" ? (
                        <CheckCircle2 size={13} />
                      ) : (
                        <XCircle size={13} />
                      )}
                      {sendStatusLabel(t.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
