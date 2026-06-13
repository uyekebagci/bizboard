"use client";

/**
 * Tüm Bildirimler — kullanıcının aldığı bildirimlerin geçmişi/listesi.
 *
 * Veri: GET /notifications?size=100 (mevcut NotificationController).
 * Aksiyonlar: tekil okundu (PATCH /notifications/{id}/read),
 * tümünü okundu (PATCH /notifications/read-all).
 *
 * Çift tema: surface-* / status-* token'ları CSS değişkenleriyle dark+light'a
 * otomatik uyumlu (globals.css). Ayrıca dark-prefix gerekmez.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bell, Check, CheckCheck, Loader2, Inbox,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { Notification } from "@/types";

const PAGE_SIZE = 100;

/** Bildirim seviyesine göre sol-şerit + ikon rengi (çift tema token'ları). */
function levelClasses(type: string): { dot: string; ring: string } {
  switch ((type || "").toLowerCase()) {
    case "alert":
      return { dot: "bg-status-danger", ring: "border-status-danger/30 bg-status-danger/10" };
    case "warning":
      return { dot: "bg-status-warning", ring: "border-status-warning/30 bg-status-warning/10" };
    case "success":
      return { dot: "bg-status-success", ring: "border-status-success/30 bg-status-success/10" };
    default:
      return { dot: "bg-brand-500", ring: "border-brand-500/30 bg-brand-500/10" };
  }
}

export default function BildirimlerPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Notification[]>(`/notifications?size=${PAGE_SIZE}`);
      setItems(data || []);
    } catch (err) {
      logger.error("api", "Notifications history fetch failed", undefined, err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.is_read) : items),
    [items, filter],
  );

  async function markOne(n: Notification) {
    if (n.is_read) return;
    setBusyId(n.id);
    try {
      await api.patch<Notification>(`/notifications/${n.id}/read`);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    } catch (err) {
      logger.error("api", "Mark notification read failed", { id: n.id }, err);
    } finally {
      setBusyId(null);
    }
  }

  async function markAll() {
    if (unreadCount === 0) return;
    setBusyAll(true);
    try {
      await api.patch<{ updated: number }>("/notifications/read-all");
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    } catch (err) {
      logger.error("api", "Mark all read failed", undefined, err);
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          aria-label="Geri"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center shrink-0">
            <Bell size={20} className="text-brand-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-surface-100">Tüm Bildirimler</h1>
            <p className="text-xs text-surface-400">
              {unreadCount > 0 ? `${unreadCount} okunmamış` : "Tümü okundu"}
            </p>
          </div>
        </div>
        <button
          onClick={markAll}
          disabled={busyAll || unreadCount === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busyAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
          Tümünü okundu işaretle
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              filter === f
                ? "bg-brand-600 text-white"
                : "bg-surface-700 text-surface-300 hover:bg-surface-600",
            )}
          >
            {f === "all" ? "Tümü" : "Okunmamış"}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-brand-400" />
        </div>
      ) : visible.length === 0 ? (
        <div className="v2-card rounded-2xl p-8 text-center">
          <Inbox size={32} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-[rgb(var(--v2-ink))] font-medium">
            {filter === "unread" ? "Okunmamış bildiriminiz yok" : "Henüz bildiriminiz yok"}
          </p>
        </div>
      ) : (
        <div className="v2-card rounded-2xl divide-y divide-[rgb(var(--v2-border))]">
          {visible.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              busy={busyId === n.id}
              onMarkRead={() => markOne(n)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  notification: Notification;
  busy: boolean;
  onMarkRead: () => void;
}

function NotificationRow({ notification, busy, onMarkRead }: RowProps) {
  const cls = levelClasses(String(notification.type));
  const inner = (
    <div className="flex items-start gap-3 p-4">
      <span className={cn("mt-1.5 w-2.5 h-2.5 rounded-full shrink-0", cls.dot)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "text-sm truncate",
              notification.is_read ? "text-surface-300 font-medium" : "text-surface-100 font-semibold",
            )}
          >
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 font-semibold shrink-0">
              YENİ
            </span>
          )}
        </div>
        <p className="text-xs text-surface-300 mt-0.5 whitespace-pre-line">{notification.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] text-surface-400">{formatTime(notification.created_at)}</p>
          {notification.business_name && (
            <span className="text-[10px] text-surface-400">· {notification.business_name}</span>
          )}
        </div>
      </div>
      {!notification.is_read && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMarkRead();
          }}
          disabled={busy}
          aria-label="Okundu işaretle"
          className="p-1.5 rounded-lg text-surface-400 hover:text-brand-400 hover:bg-surface-700 transition shrink-0"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={16} />}
        </button>
      )}
    </div>
  );

  if (notification.action_url) {
    return (
      <Link href={notification.action_url} className="row-hover block">
        {inner}
      </Link>
    );
  }
  return <div className="row-hover">{inner}</div>;
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
