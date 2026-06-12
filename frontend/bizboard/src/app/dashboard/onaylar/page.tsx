"use client";

/**
 * Onay (Approval) modülü v1.1 — Onay Kuyruğu sayfası.
 *
 * Bekleyen (ve diğer) onay taleplerini listeler; admin onaylayabilir / reddedebilir /
 * iptal edebilir; verify-code gerektiren talepleri önce doğrular; çoklu seçimle
 * bulk-approve yapabilir. Çift tema — mevcut glass/.field/.btn-* desenleri.
 *
 * ADMIN-only: admin olmayan kullanıcı uyarı görür (route render olsa da uçlar 403).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  Loader2,
  Check,
  X,
  Ban,
  KeyRound,
  CheckCheck,
  RefreshCw,
  Clock,
  Send,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/api/client";
import {
  listApprovals,
  approveApproval,
  rejectApproval,
  cancelApproval,
  verifyApprovalCode,
  bulkApprove,
  type Approval,
  type ApprovalStatus,
} from "@/lib/api/approvals";

const STATUS_TABS: { key: ApprovalStatus | "ALL"; label: string }[] = [
  { key: "PENDING", label: "Bekleyen" },
  { key: "APPROVED", label: "Onaylanan" },
  { key: "REJECTED", label: "Reddedilen" },
  { key: "CANCELLED", label: "İptal" },
  { key: "ALL", label: "Tümü" },
];

function statusBadgeClass(status: ApprovalStatus): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "APPROVED":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "REJECTED":
      return "bg-red-500/15 text-red-300 border-red-500/30";
    case "CANCELLED":
      return "bg-surface-600/40 text-surface-300 border-surface-500/40";
    case "EXPIRED":
      return "bg-surface-600/40 text-surface-400 border-surface-500/40";
    default:
      return "bg-surface-600/40 text-surface-300 border-surface-500/40";
  }
}

function statusLabel(status: ApprovalStatus): string {
  return (
    {
      PENDING: "Bekliyor",
      APPROVED: "Onaylandı",
      REJECTED: "Reddedildi",
      CANCELLED: "İptal edildi",
      EXPIRED: "Süresi doldu",
    } as Record<ApprovalStatus, string>
  )[status];
}

export default function OnaylarPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  const [tab, setTab] = useState<ApprovalStatus | "ALL">("PENDING");
  const [rows, setRows] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listApprovals(tab === "ALL" ? undefined : tab);
      setRows(data || []);
      setSelected(new Set());
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Onaylar yüklenemedi.";
      setError(msg);
      logger.error("api", "Approvals fetch failed", undefined, err);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
  }, [isAdmin, load]);

  const pendingRows = useMemo(
    () => rows.filter((r) => r.status === "PENDING"),
    [rows]
  );
  const selectablePending = useMemo(
    () => pendingRows.filter((r) => !r.verify_required || r.verified),
    [pendingRows]
  );

  async function doApprove(a: Approval) {
    setBusyId(a.id);
    try {
      await approveApproval(a.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Onaylama başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  async function doReject(a: Approval) {
    const reason = window.prompt("Red gerekçesi (zorunlu):");
    if (reason == null) return;
    if (!reason.trim()) {
      alert("Red gerekçesi zorunludur.");
      return;
    }
    setBusyId(a.id);
    try {
      await rejectApproval(a.id, reason.trim());
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Reddetme başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  async function doCancel(a: Approval) {
    if (!window.confirm("Bu onay talebini iptal etmek istediğinize emin misiniz?"))
      return;
    setBusyId(a.id);
    try {
      await cancelApproval(a.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "İptal başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  async function doVerify(a: Approval) {
    const code = window.prompt("Doğrulama kodunu girin:");
    if (code == null) return;
    setBusyId(a.id);
    try {
      await verifyApprovalCode(a.id, code.trim());
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Kod doğrulanamadı.");
    } finally {
      setBusyId(null);
    }
  }

  async function doBulkApprove() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `${ids.length} onay talebini onaylamak istediğinize emin misiniz?`
      )
    )
      return;
    setBusyId("__bulk__");
    try {
      const res = await bulkApprove(ids);
      const approved = res.results.filter((r) => r.status === "APPROVED").length;
      const skipped = res.results.length - approved;
      alert(`Toplu onay: ${approved} onaylandı, ${skipped} atlandı.`);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Toplu onay başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === selectablePending.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectablePending.map((r) => r.id)));
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-5 pb-24">
        <Header onBack={() => router.back()} />
        <div className="glass-card p-6 text-center">
          <ShieldCheck size={28} className="mx-auto text-amber-300 mb-2" />
          <p className="text-surface-200 font-medium">
            Onay Kuyruğu yalnızca yöneticiler içindir.
          </p>
          <p className="text-xs text-surface-400 mt-1">
            Erişiminiz yoksa lütfen bir yönetici ile iletişime geçin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <Header onBack={() => router.back()} />

      {/* Status tabs + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border",
                tab === t.key
                  ? "bg-brand-500/20 text-brand-200 border-brand-500/40"
                  : "bg-surface-700/40 text-surface-300 border-surface-600/40 hover:text-surface-100"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="btn-secondary inline-flex items-center gap-1.5"
            disabled={loading}
            aria-label="Yenile"
          >
            <RefreshCw size={15} className={cn(loading && "animate-spin")} />
            Yenile
          </button>
          {tab === "PENDING" && (
            <button
              type="button"
              onClick={() => void doBulkApprove()}
              disabled={selected.size === 0 || busyId === "__bulk__"}
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {busyId === "__bulk__" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <CheckCheck size={15} />
              )}
              Seçilenleri Onayla ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Bulk select-all (yalnız bekleyenler sekmesinde) */}
      {tab === "PENDING" && selectablePending.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-surface-400 px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={
              selected.size === selectablePending.length &&
              selectablePending.length > 0
            }
            onChange={toggleSelectAll}
            className="rounded border-surface-500"
          />
          Doğrulanmış bekleyenlerin hepsini seç ({selectablePending.length})
        </label>
      )}

      {error && (
        <div className="glass-card p-4 border border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-brand-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Clock size={28} className="mx-auto text-surface-400 mb-2" />
          <p className="text-surface-300">Bu filtrede onay talebi yok.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const isPending = a.status === "PENDING";
            const verifyPending = a.verify_required && !a.verified;
            const selectable = isPending && !verifyPending;
            const rowBusy = busyId === a.id;
            return (
              <li key={a.id} className="glass-card p-4">
                <div className="flex items-start gap-3">
                  {tab === "PENDING" && (
                    <input
                      type="checkbox"
                      className="mt-1.5 rounded border-surface-500 disabled:opacity-40"
                      checked={selected.has(a.id)}
                      disabled={!selectable}
                      onChange={() => toggleSelect(a.id)}
                      aria-label="Seç"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-surface-100 truncate">
                        {a.title}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] font-medium border",
                          statusBadgeClass(a.status)
                        )}
                      >
                        {statusLabel(a.status)}
                      </span>
                      {verifyPending && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium border bg-purple-500/15 text-purple-300 border-purple-500/30 inline-flex items-center gap-1">
                          <KeyRound size={11} /> Kod gerekli
                        </span>
                      )}
                      {a.telegram_sent && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium border bg-sky-500/15 text-sky-300 border-sky-500/30 inline-flex items-center gap-1"
                          title="Onay butonları Telegram'a iletildi"
                        >
                          <Send size={11} /> Telegram'a iletildi
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-surface-400 mt-1">
                      <span className="font-mono">{a.action_type}</span>
                      {a.business_name && <> · {a.business_name}</>}
                      {a.requested_by_name && <> · talep: {a.requested_by_name}</>}
                      {a.created_at && (
                        <> · {new Date(a.created_at).toLocaleString("tr-TR")}</>
                      )}
                    </p>
                    {a.reason && (
                      <p className="text-xs text-surface-300 mt-1 italic">
                        Gerekçe: {a.reason}
                      </p>
                    )}
                    {a.payload && Object.keys(a.payload).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-[11px] text-surface-400 cursor-pointer select-none">
                          Detay (payload)
                        </summary>
                        <pre className="mt-1 text-[11px] text-surface-300 bg-surface-800/60 rounded-lg p-2 overflow-x-auto">
                          {JSON.stringify(a.payload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>

                  {/* Aksiyonlar */}
                  {isPending && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {rowBusy ? (
                        <Loader2 size={16} className="animate-spin text-brand-400" />
                      ) : verifyPending ? (
                        <button
                          type="button"
                          onClick={() => void doVerify(a)}
                          className="btn-secondary inline-flex items-center gap-1 text-xs"
                          title="Doğrulama kodunu gir"
                        >
                          <KeyRound size={14} /> Doğrula
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void doApprove(a)}
                          className="btn-primary inline-flex items-center gap-1 text-xs"
                          title="Onayla"
                        >
                          <Check size={14} /> Onayla
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void doReject(a)}
                        disabled={rowBusy}
                        className="btn-danger inline-flex items-center gap-1 text-xs"
                        title="Reddet"
                      >
                        <X size={14} /> Reddet
                      </button>
                      <button
                        type="button"
                        onClick={() => void doCancel(a)}
                        disabled={rowBusy}
                        className="btn-secondary inline-flex items-center gap-1 text-xs"
                        title="İptal et"
                      >
                        <Ban size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        aria-label="Geri"
      >
        <ArrowLeft size={20} className="text-surface-300" />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
          <ShieldCheck size={20} className="text-amber-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-surface-100">Onay Kuyruğu</h1>
          <p className="text-xs text-surface-400">
            Hassas işlemler için onay talepleri
          </p>
        </div>
      </div>
    </div>
  );
}
