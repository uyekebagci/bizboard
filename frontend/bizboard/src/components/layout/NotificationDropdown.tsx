"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Notification } from "@/types";

const POLL_INTERVAL_MS = 60_000;

interface UnreadResponse {
  count: number;
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const setNotifications = useAppStore((s) => s.setNotifications);

  // Poll unread count
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await api.get<UnreadResponse>("/notifications/unread-count");
        if (alive) setUnread(r.count);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) {
          logger.warn("api", "Unread count fetch failed", undefined);
        }
      }
    }
    void tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function loadItems() {
    setLoading(true);
    try {
      const data = await api.get<Notification[]>("/notifications?size=20");
      setItems(data || []);
      setNotifications(data || []);
    } catch (err) {
      logger.error("api", "Notifications fetch failed", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (next) void loadItems();
      return next;
    });
  }

  async function handleMarkOne(n: Notification) {
    if (n.is_read) return;
    setBusyId(n.id);
    try {
      await api.patch<Notification>(`/notifications/${n.id}/read`);
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      setUnread((c) => Math.max(0, c - 1));
    } catch (err) {
      logger.error("api", "Mark notification read failed", { id: n.id }, err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAll() {
    if (unread === 0) return;
    setBusyAll(true);
    try {
      await api.patch<{ updated: number }>("/notifications/read-all");
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      setUnread(0);
    } catch (err) {
      logger.error("api", "Mark all read failed", undefined, err);
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Bildirimler"
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2.5 rounded-xl hover:bg-surface-700 transition-colors relative"
      >
        <Bell size={20} className="text-surface-300" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-status-danger text-surface-100 text-xs font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] bg-surface-800 rounded-xl shadow-card-hover border border-surface-700 py-1 z-50"
        >
          <div className="modal-header">
            <p className="text-sm font-semibold text-surface-100">Bildirimler</p>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={busyAll || unread === 0}
              className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {busyAll ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
              Tümünü okundu işaretle
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-surface-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-surface-400 text-center py-10 px-4">
                Henüz bildiriminiz yok
              </p>
            ) : (
              items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  busy={busyId === n.id}
                  onMarkRead={() => handleMarkOne(n)}
                  onClose={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  notification: Notification;
  busy: boolean;
  onMarkRead: () => void;
  onClose: () => void;
}

function NotificationItem({ notification, busy, onMarkRead, onClose }: ItemProps) {
  const time = formatTime(notification.created_at);
  const inner = (
    <>
      {!notification.is_read && (
        <span
          className="absolute left-1.5 top-3 w-2 h-2 rounded-full bg-brand-500"
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-surface-100 font-medium truncate">
          {notification.title}
        </p>
        <p className="text-xs text-surface-300 line-clamp-2 mt-0.5">
          {notification.message}
        </p>
        <p className="text-[10px] text-surface-400 mt-1">{time}</p>
      </div>
    </>
  );

  if (notification.action_url) {
    return (
      <Link
        href={notification.action_url}
        onClick={() => {
          onClose();
          if (!notification.is_read) onMarkRead();
        }}
        className="relative flex items-start gap-3 px-5 py-3 hover:bg-surface-700 transition-colors"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="relative flex items-start gap-3 px-5 py-3 hover:bg-surface-700 transition-colors group">
      {inner}
      {!notification.is_read && (
        <button
          type="button"
          onClick={onMarkRead}
          disabled={busy}
          aria-label="Okundu işaretle"
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-surface-400 hover:text-brand-400 transition"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
        </button>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
