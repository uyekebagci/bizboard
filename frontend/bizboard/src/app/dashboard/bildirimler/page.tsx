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
import {
  Bell, Check, CheckCheck, Loader2, Inbox,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { Notification } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";

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
      <PageHeader
        title="Tüm Bildirimler"
        subtitle={unreadCount > 0 ? `${unreadCount} okunmamış` : "Tümü okundu"}
        icon={Bell}
        actions={
          <button
            onClick={markAll}
            disabled={busyAll || unreadCount === 0}
            className="v2-btn v2-btn--ink v2-press text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busyAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
            Tümünü okundu işaretle
          </button>
        }
      />

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
        <ListSkeleton rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === "unread" ? "Okunmamış bildiriminiz yok" : "Henüz bildiriminiz yok"}
        />
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
              notification.is_read ? "text-[rgb(var(--v2-muted))] font-medium" : "text-[rgb(var(--v2-ink))] font-semibold",
            )}
          >
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-strong dark:text-accent font-semibold shrink-0">
              YENİ
            </span>
          )}
        </div>
        <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5 whitespace-pre-line">{notification.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] text-[rgb(var(--v2-muted))]">{formatTime(notification.created_at)}</p>
          {notification.business_name && (
            <span className="text-[10px] text-[rgb(var(--v2-muted))]">· {notification.business_name}</span>
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
          className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-accent hover:bg-[rgb(var(--v2-sunken))] transition shrink-0"
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
