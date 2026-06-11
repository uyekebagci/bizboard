/**
 * Telegram Admin Hedefli Gönderim — admin API istemcisi (CHT-1, CHT-2, MAN-1).
 *
 * Backend uçları {@code /admin/notifications/**} altında, ADMIN-only.
 */

import { api } from "@/lib/api/client";

// ── CHT-1: bağlı chat listesi ────────────────────────────────────────────────

export interface TelegramChat {
  binding_id: string;
  chat_id: string;
  chat_type: "DM" | "GROUP" | "UNKNOWN";
  chat_name: string;
  user_id: string;
  user_name: string | null;
  username: string | null;
  linked_at: string;
  enabled_event_count: number;
  total_event_count: number;
}

export function listTelegramChats(): Promise<TelegramChat[]> {
  return api.get<TelegramChat[]>("/admin/notifications/telegram/chats");
}

// ── CHT-2: per-chat event tercihleri ─────────────────────────────────────────

export interface ChatEventPref {
  event: string;
  enabled: boolean;
}

export function listChatPreferences(bindingId: string): Promise<ChatEventPref[]> {
  return api.get<ChatEventPref[]>(
    `/admin/notifications/telegram/chats/${bindingId}/preferences`
  );
}

export function setChatPreference(
  bindingId: string,
  event: string,
  enabled: boolean
): Promise<ChatEventPref> {
  return api.put<ChatEventPref>(
    `/admin/notifications/telegram/chats/${bindingId}/preferences`,
    { event, enabled }
  );
}

// ── MAN-1: manuel gönderim ───────────────────────────────────────────────────

export type RecipientType = "ALL_ADMINS" | "USERS" | "TELEGRAM_CHATS";
export type SendChannel = "IN_APP" | "TELEGRAM" | "BOTH";

export interface ManualSendRequest {
  recipient_type: RecipientType;
  recipient_ids?: string[];
  telegram_chat_ids?: string[];
  channel?: SendChannel;
  title?: string;
  body: string;
}

export interface ManualSendTargetResult {
  chat_id: string;
  chat_name?: string;
  status: string;
}

export interface ManualSendResult {
  dispatched_recipients: number;
  telegram_sent: number;
  telegram_failed: number;
  telegram_targets: ManualSendTargetResult[];
}

export function manualSend(req: ManualSendRequest): Promise<ManualSendResult> {
  return api.post<ManualSendResult>("/admin/notifications/manual-send", req);
}

// ── Event etiketleri (backend NotificationEvent enum ile eşleşir) ─────────────

export const EVENT_LABELS: Record<string, string> = {
  DEBT_DUE_SOON: "Borç/alacak vadesi yaklaştı",
  CHEQUE_DUE_SOON: "Çek/senet vadesi yaklaştı",
  PAYMENT_RECEIVED: "Ödeme alındı",
  CASH_CLOSING_REMINDER: "Kasa kapanışı hatırlatması",
  TAX_DEADLINE_DUE_SOON: "Vergi son tarihi yaklaştı",
  OTP: "Doğrulama kodu (OTP)",
  LOW_STOCK: "Düşük stok",
  WARRANTY_EXPIRING: "Garanti bitiyor",
  NEW_TRANSACTION: "Yeni işlem",
  FIRM_ACCESS_GRANTED: "Firma erişimi verildi",
  DAY_CLOSE_VARIANCE_ALERT: "Kaçak alarmı (gün kapanışı farkı)",
  INSTRUMENT_BOUNCED: "Karşılıksız çek/senet",
  GENERIC: "Sistem bildirimi (otomatik / manuel)",
};

export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

/** Telegram OUTBOUND sonuç durumu → Türkçe etiket. */
export function sendStatusLabel(status: string): string {
  switch (status) {
    case "OK":
      return "Gönderildi";
    case "FORBIDDEN":
      return "Engellendi (bot kaldırılmış)";
    case "RATE_LIMITED":
      return "Telegram limiti — sonra";
    case "NOT_CONFIGURED":
      return "Bot yapılandırılmamış";
    case "UNKNOWN_TARGET":
      return "Hedef bulunamadı";
    case "ERROR":
    default:
      return "Hata";
  }
}
