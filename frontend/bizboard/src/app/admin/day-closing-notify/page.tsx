"use client";

/**
 * Gün-Kapanışı Telegram Bildirimi — ADMIN-only config UI.
 *
 * <p>İşletme-başına {@code enabled} toggle (default KAPALI; non-breaking, spam-yok)
 * + "Test Gönder" (gerçek gönderim YAPMAZ; özet gövdesini ÖNİZLER). Backend
 * {@code AdminDayClosingNotifyController} (/admin/day-closing-notify/**).</p>
 *
 * <p>NOT: Telegram grubunun gerçek aktivasyonu kullanıcı tarafında BLOCKED;
 * config UI burada hazır — grup bağlanınca admin toggle'ı açar.</p>
 *
 * <p>Daxa v2 + çift tema, onaysız toggle (idempotent + reversible), önizleme
 * modalı.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Building2,
  ChevronLeft,
  Info,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import type { Business } from "@/types";
import {
  getDayClosingNotifyConfig,
  setDayClosingNotifyConfig,
  testDayClosingNotify,
  type DayClosingNotifyTestPreview,
} from "@/lib/api/admin-day-closing-notify";
import { Toggle } from "@/components/admin/ledger/Toggle";

interface Row {
  business: Business;
  enabled: boolean | null; // null = config yükleniyor
  saving: boolean;
  testing: boolean;
}

export default function AdminDayClosingNotifyPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DayClosingNotifyTestPreview | null>(null);

  useEffect(() => {
    if (profile && profile.role !== "admin") router.replace("/dashboard");
  }, [profile, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = (await api.get<Business[]>("/businesses")) || [];
      // Önce satırları kur (config null), sonra her biri için config çek.
      setRows(
        list.map((business) => ({ business, enabled: null, saving: false, testing: false })),
      );
      const configs = await Promise.all(
        list.map((b) =>
          getDayClosingNotifyConfig(b.id)
            .then((c) => c.enabled)
            .catch(() => false),
        ),
      );
      setRows(
        list.map((business, i) => ({
          business,
          enabled: configs[i],
          saving: false,
          testing: false,
        })),
      );
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.business.id === id ? { ...r, ...patch } : r)));
  }

  async function toggle(row: Row, next: boolean) {
    patchRow(row.business.id, { saving: true });
    try {
      const c = await setDayClosingNotifyConfig(row.business.id, next);
      patchRow(row.business.id, { enabled: c.enabled, saving: false });
      toast.success(
        `${row.business.name}: bildirim ${c.enabled ? "açıldı" : "kapatıldı"}`,
      );
    } catch (e) {
      patchRow(row.business.id, { saving: false });
      toast.error(getErrorMessage(e));
    }
  }

  async function sendTest(row: Row) {
    patchRow(row.business.id, { testing: true });
    try {
      const p = await testDayClosingNotify(row.business.id);
      setPreview(p);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      patchRow(row.business.id, { testing: false });
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="p-2 rounded-lg v2-sunken text-[rgb(var(--v2-ink))] hover:opacity-80 transition-opacity"
          aria-label="Admin paneline dön"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <Send size={24} className="text-accent-strong dark:text-accent" />
          <h1 className="text-2xl font-bold text-[rgb(var(--v2-ink))]">
            Gün-Kapanışı Bildirimi
          </h1>
        </div>
      </div>
      <p className="text-sm text-[rgb(var(--v2-muted))] mb-6 ml-12">
        İşletme-başına gün-kapanışı → Telegram grubu özeti. Varsayılan KAPALI;
        grup bağlanınca açın. &quot;Test Gönder&quot; gerçek gönderim YAPMAZ, özeti
        önizler.
      </p>

      <div className="v2-card p-4 mb-5 border-l-4 border-l-accent flex gap-3">
        <Info size={18} className="shrink-0 mt-0.5 text-accent-strong dark:text-accent" />
        <p className="text-xs text-[rgb(var(--v2-muted))] leading-relaxed">
          Toggle açık olsa bile gönderim için işletmenin Telegram grubunun bota
          bağlanmış olması gerekir (kullanıcı tarafında ayrıca yapılır). Burada
          config hazırlanır; aktivasyon grup bağlandığında etkinleşir.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
          {error}
        </div>
      )}

      <div className="v2-card overflow-hidden">
        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 size={18} className="animate-spin text-[rgb(var(--v2-muted))]" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[rgb(var(--v2-muted))]">
            İşletme bulunamadı.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--v2-border))]">
            {rows.map((row) => (
              <li
                key={row.business.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl v2-sunken text-[rgb(var(--v2-muted))]">
                  <Building2 size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[rgb(var(--v2-ink))] truncate">
                    {row.business.name}
                  </p>
                  <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                    {row.enabled == null
                      ? "yükleniyor…"
                      : row.enabled
                        ? "Bildirim açık"
                        : "Bildirim kapalı"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => sendTest(row)}
                  disabled={row.testing}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg v2-sunken text-[rgb(var(--v2-ink))] hover:opacity-80 disabled:opacity-50 transition-opacity shrink-0"
                >
                  {row.testing ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  Test Gönder
                </button>

                {row.enabled == null ? (
                  <Loader2 size={16} className="animate-spin text-[rgb(var(--v2-muted))]" />
                ) : (
                  <Toggle
                    checked={row.enabled}
                    disabled={row.saving}
                    onChange={(next) => toggle(row, next)}
                    ariaLabel={`${row.business.name} bildirimi`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview && (
        <PreviewModal preview={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

// ── Önizleme modalı (test çıktısı) ──────────────────────────────────────────

function PreviewModal({
  preview,
  onClose,
}: {
  preview: DayClosingNotifyTestPreview;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Gün-kapanışı özeti önizleme"
      onClick={onClose}
    >
      <div
        className="v2-card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[rgb(var(--v2-border))]">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))]">
              Özet Önizleme
            </h3>
            <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
              {preview.date ?? "—"} · Bildirim {preview.enabled ? "AÇIK" : "KAPALI"}{" "}
              · gerçek gönderim YAPILMADI
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-sunken))] transition-colors"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm font-semibold text-[rgb(var(--v2-ink))] mb-3">
            {preview.title}
          </p>
          <pre className="v2-sunken rounded-xl p-4 text-xs text-[rgb(var(--v2-ink))] whitespace-pre-wrap break-words leading-relaxed">
            {preview.summary}
          </pre>
        </div>
      </div>
    </div>,
    document.body,
  );
}
