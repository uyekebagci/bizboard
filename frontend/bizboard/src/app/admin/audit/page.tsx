"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Clock,
  User as UserIcon,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Download,
} from "lucide-react";
import {
  api,
  ApiError,
  API_URL,
  getToken,
  refreshAccessToken,
} from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import type { AuditLog, PagedResponse } from "@/types";

/** mod-audit: tamper-proof zincir doğrulama cevabı (backend record alanları). */
interface ChainVerification {
  valid: boolean;
  verifiedCount: number;
  unchainedCount: number;
  brokenAtSeq: number | null;
  brokenRecordId: string | null;
  brokenPosition: number | null;
  message: string;
}

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);

  const [page, setPage] = useState(0);
  const [data, setData] = useState<PagedResponse<AuditLog> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actorId, setActorId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // mod-audit: tamper-proof zincir doğrulama
  const [verifying, setVerifying] = useState(false);
  const [chain, setChain] = useState<ChainVerification | null>(null);

  // mod-audit: canlı SSE akışı
  const [live, setLive] = useState(false);
  const [liveItems, setLiveItems] = useState<AuditLog[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // mod-audit: export menüsü
  const [exporting, setExporting] = useState(false);

  // Sadece admin'lerin erisimine izin ver — backend zaten kontrol ediyor.
  useEffect(() => {
    if (profile && profile.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [profile, router]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("size", String(PAGE_SIZE));
    if (actorId) params.set("actor_id", actorId);
    if (businessId) params.set("business_id", businessId);
    if (action) params.set("action", action);
    if (entityType) params.set("entity_type", entityType);
    if (from) params.set("from", `${from}T00:00:00`);
    if (to) params.set("to", `${to}T23:59:59`);
    return params.toString();
  }, [page, actorId, businessId, action, entityType, from, to]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<PagedResponse<AuditLog>>(`/admin/audit-logs?${query}`);
        if (alive) setData(res);
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError) {
          setError(getErrorMessage(err));
        } else if (err instanceof Error) {
          setError(getErrorMessage(err));
        } else {
          setError("Audit log yuklenemedi");
        }
        logger.error("api", "Audit log fetch failed", undefined, err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [query]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
  }

  // mod-audit: tamper-proof zincir doğrulama.
  async function verifyChain() {
    setVerifying(true);
    setChain(null);
    try {
      const res = await api.post<ChainVerification>("/admin/audit/verify-chain", {});
      setChain(res);
    } catch (err) {
      setChain({
        valid: false,
        verifiedCount: 0,
        unchainedCount: 0,
        brokenAtSeq: null,
        brokenRecordId: null,
        brokenPosition: null,
        message:
          err instanceof ApiError || err instanceof Error
            ? getErrorMessage(err)
            : "Zincir doğrulanamadı",
      });
      logger.error("api", "Audit chain verify failed", undefined, err);
    } finally {
      setVerifying(false);
    }
  }

  // mod-audit: filtreli server-side export (CSV/JSON). Authenticated fetch → blob.
  const serverExport = useCallback(
    async (format: "csv" | "json") => {
      setExporting(true);
      try {
        // Token süresi yakınsa sessiz yenile (büyük export sırasında 401 olmasın).
        if (getToken()) {
          try {
            await refreshAccessToken();
          } catch {
            /* ignore — mevcut token ile dene */
          }
        }
        const params = new URLSearchParams();
        params.set("format", format);
        if (actorId) params.set("actor_id", actorId);
        if (businessId) params.set("business_id", businessId);
        if (action) params.set("action", action);
        if (entityType) params.set("entity_type", entityType);
        if (from) params.set("from", `${from}T00:00:00`);
        if (to) params.set("to", `${to}T23:59:59`);

        const token = getToken();
        const res = await fetch(`${API_URL}/admin/audit/export?${params.toString()}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error(`Export başarısız (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-export-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export başarısız");
        logger.error("api", "Audit export failed", undefined, err);
      } finally {
        setExporting(false);
      }
    },
    [actorId, businessId, action, entityType, from, to]
  );

  // mod-audit: canlı SSE akışı. EventSource header set edemez → ?access_token=.
  useEffect(() => {
    if (!live) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setLiveConnected(false);
      return;
    }

    let cancelled = false;
    async function connect() {
      // Token taze olsun (15 dk TTL) — uzun-ömürlü SSE için önce yenile.
      try {
        await refreshAccessToken();
      } catch {
        /* mevcut token ile dene */
      }
      if (cancelled) return;
      const token = getToken();
      if (!token) {
        setError("Canlı akış için oturum gerekli");
        setLive(false);
        return;
      }
      const url = `${API_URL}/admin/audit/stream?access_token=${encodeURIComponent(token)}`;
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        if (!cancelled) setLiveConnected(true);
      });
      es.addEventListener("audit", (ev: MessageEvent) => {
        if (cancelled) return;
        try {
          const rec = JSON.parse(ev.data) as AuditLog;
          // En yeni üstte; bellek için son 100 ile sınırla.
          setLiveItems((prev) => [rec, ...prev].slice(0, 100));
        } catch {
          /* malformed event — yoksay */
        }
      });
      es.onerror = () => {
        // EventSource otomatik reconnect dener; bağlı değil işaretle.
        if (!cancelled) setLiveConnected(false);
      };
    }
    void connect();

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [live]);

  function toggleLive() {
    setLiveItems([]);
    setLive((v) => !v);
  }

  return (
    <div className="min-h-[100dvh] bg-surface-900 text-surface-100">
      <header className="sticky top-0 z-40 bg-surface-800/95 backdrop-blur-lg border-b border-surface-700">
        <div className="flex items-center gap-3 px-4 py-3 max-w-7xl mx-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-surface-700"
            aria-label="Geri"
          >
            <ArrowLeft size={18} className="text-surface-300" />
          </button>
          <h1 className="text-lg font-bold">Audit Log</h1>
          <span className="ml-2 text-xs text-surface-400">
            {data?.total_elements != null ? `${data.total_elements} kayit` : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {/* mod-audit: tamper-proof zincir doğrula */}
            <button
              type="button"
              onClick={verifyChain}
              disabled={verifying}
              title="Tamper-proof hash-chain doğrula"
              className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {verifying ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ShieldCheck size={13} />
              )}
              Zinciri doğrula
            </button>

            {/* mod-audit: canlı SSE akışı toggle */}
            <button
              type="button"
              onClick={toggleLive}
              title="Canlı audit akışı"
              className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${
                live
                  ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-surface-700 hover:bg-surface-600"
              }`}
            >
              <Radio size={13} className={live && liveConnected ? "animate-pulse" : ""} />
              {live ? (liveConnected ? "Canlı" : "Bağlanıyor…") : "Canlı"}
            </button>

            {/* mod-audit: filtreli server-side export */}
            <button
              type="button"
              onClick={() => serverExport("csv")}
              disabled={exporting}
              title="Filtreli tüm kayıtları CSV indir"
              className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {exporting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              CSV
            </button>
            <button
              type="button"
              onClick={() => serverExport("json")}
              disabled={exporting}
              title="Filtreli tüm kayıtları JSON indir"
              className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50"
            >
              JSON
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-7xl mx-auto">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-4"
        >
          <input
            type="text"
            placeholder="Actor user id"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="input-sm"
          />
          <input
            type="text"
            placeholder="Business id"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="input-sm"
          />
          <input
            type="text"
            placeholder="Action (orn. user.login)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="input-sm"
          />
          <input
            type="text"
            placeholder="Entity type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="input-sm"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-sm"
          />
          <button
            type="submit"
            className="col-span-1 sm:col-span-2 lg:col-span-6 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center justify-center gap-2"
          >
            <Filter size={14} />
            Filtrele
          </button>
        </form>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* mod-audit: zincir doğrulama sonucu */}
        {chain && (
          <div
            className={`mb-3 p-3 rounded-xl border text-sm flex items-start gap-2 ${
              chain.valid
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            {chain.valid ? (
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            ) : (
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">
                {chain.valid ? "Zincir bütünlüğü doğrulandı" : "ZİNCİR KIRIK — olası tahrifat"}
              </p>
              <p className="text-xs opacity-90 mt-0.5 break-words">{chain.message}</p>
              <p className="text-[11px] opacity-70 mt-1">
                Doğrulanan: {chain.verifiedCount}
                {chain.unchainedCount > 0 && ` · Zincirsiz: ${chain.unchainedCount}`}
                {chain.brokenAtSeq != null && ` · Kırılma seq: ${chain.brokenAtSeq}`}
              </p>
            </div>
          </div>
        )}

        {/* mod-audit: canlı akış paneli */}
        {live && (
          <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-300 border-b border-emerald-500/20">
              <Radio size={12} className={liveConnected ? "animate-pulse" : ""} />
              <span className="font-semibold">Canlı akış</span>
              <span className="opacity-70">
                {liveConnected ? "bağlı" : "bağlanıyor…"} · {liveItems.length} yeni kayıt
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-emerald-500/10">
              {liveItems.length === 0 && (
                <p className="text-center text-surface-400 py-4 text-xs">
                  Yeni audit kaydı bekleniyor…
                </p>
              )}
              {liveItems.map((r) => (
                <div key={`live-${r.id}`} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                  <span className="font-medium text-surface-100">{actionLabel(r.action)}</span>
                  {r.detail && (
                    <span className="text-surface-400 truncate">— {r.detail}</span>
                  )}
                  <span className="ml-auto text-[11px] text-surface-500 shrink-0">
                    {r.actor_username ?? "Sistem"} · {relativeTime(r.occurred_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass-card overflow-hidden divide-y divide-surface-700/60">
          {loading && (
            <div className="flex items-center justify-center py-10 text-surface-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}

          {!loading && data && data.items.length === 0 && (
            <p className="text-center text-surface-400 py-10 text-sm">
              Kayit bulunamadi
            </p>
          )}

          {!loading &&
            data?.items.map((r) => {
              const badge = r.highlight_type ? HIGHLIGHT_BADGES[r.highlight_type] : null;
              return (
              <div key={r.id}>
                {/* A1+A3: timeline satırı — ikon + Türkçe aksiyon/detail + aktör + göreli zaman */}
                <button
                  type="button"
                  onClick={() => setExpanded((p) => (p === r.id ? null : r.id))}
                  className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-surface-800/60 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-700/60 grid place-items-center shrink-0 mt-0.5">
                    <Clock size={14} className="text-surface-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-surface-100">{actionLabel(r.action)}</span>
                      {badge && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {/* A1: backend'in insan-okunur detail'ı ana açıklama */}
                    {r.detail && (
                      <p className="text-[13px] text-surface-300 mt-0.5 break-words">{r.detail}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-surface-400">
                      <span className="inline-flex items-center gap-1">
                        <UserIcon size={11} /> {r.actor_username ?? "Sistem"}
                      </span>
                      <span className="opacity-50">·</span>
                      <span title={formatDt(r.occurred_at)}>{relativeTime(r.occurred_at)}</span>
                      {r.entity_type && (
                        <>
                          <span className="opacity-50">·</span>
                          <span className="truncate">{r.entity_type}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                {expanded === r.id && (
                  <div className="bg-surface-800/60 px-4 py-3 text-xs">
                    <pre className="whitespace-pre-wrap break-all text-surface-300">
                      {JSON.stringify(
                        {
                          id: r.id,
                          action: r.action,
                          occurred_at: formatDt(r.occurred_at),
                          trace_id: r.trace_id,
                          actor_user_id: r.actor_user_id,
                          business_id: r.business_id,
                          entity_id: r.entity_id,
                          ip: r.ip,
                          user_agent: r.user_agent,
                          metadata: r.metadata,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
              );
            })}
        </div>

        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50"
            >
              <ChevronLeft size={14} />
              Onceki
            </button>
            <span className="text-xs text-surface-400">
              Sayfa {data.page + 1} / {data.total_pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.has_next || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50"
            >
              Sonraki
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function formatDt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// A3: Aksiyon enum → Türkçe etiket. Bilinmeyen → enum'u Title-Case'e çevir.
const ACTION_LABELS: Record<string, string> = {
  TRANSACTION_CREATE: "İşlem eklendi",
  TRANSACTION_UPDATE: "İşlem güncellendi",
  TRANSACTION_DELETE: "İşlem silindi",
  DEBT_CREATE: "Borç/alacak eklendi",
  DEBT_UPDATE: "Borç/alacak güncellendi",
  DEBT_DELETE: "Borç/alacak silindi",
  DEBT_SETTLED: "Borç/alacak kapatıldı",
  DEBT_WRITEOFF: "Borç silindi (düşüm)",
  DEBT_WRITEOFF_REVERSE: "Borç düşümü geri alındı",
  PAYMENT_CREATE: "Ödeme alındı/yapıldı",
  PAYMENT_DELETE: "Ödeme silindi",
  CASH_CLOSING_CREATE: "Günsonu kapatıldı",
  CASH_CLOSING_REOPEN: "Günsonu yeniden açıldı",
  CASH_CLOSING_BACKDATE: "Geçmiş tarihli kapanış",
  BUSINESS_CREATE: "İşletme oluşturuldu",
  BUSINESS_UPDATE: "İşletme güncellendi",
  BUSINESS_DELETE: "İşletme silindi",
  USER_CREATE: "Kullanıcı oluşturuldu",
  USER_UPDATE: "Kullanıcı güncellendi",
  USER_DELETE: "Kullanıcı silindi",
  USER_LOGIN: "Giriş yapıldı",
  PASSWORD_CHANGE: "Parola değiştirildi",
  COUNTERPART_CREATE: "Cari eklendi",
  COUNTERPART_UPDATE: "Cari güncellendi",
  COUNTERPART_DELETE: "Cari silindi",
  BANK_ACCOUNT_CREATE: "Hesap/kasa oluşturuldu",
  BANK_ACCOUNT_UPDATE: "Hesap/kasa güncellendi",
  BANK_ACCOUNT_DELETE: "Hesap/kasa silindi",
  POS_SETTLE: "POS tahsilatı işlendi",
  TRANSFER_CREATE: "Transfer yapıldı",
  NOTIFICATION_SENT: "Bildirim gönderildi",
};

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback: SNAKE_CASE → "Snake case"
  const t = action.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// A3: highlight_type → Türkçe rozet etiketi + renk.
const HIGHLIGHT_BADGES: Record<string, { label: string; cls: string }> = {
  BACKDATED: { label: "Geçmiş tarihli", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  CORRECTION: { label: "Düzeltme", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  CLOSING_REOPEN: { label: "Yeniden açma", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  POS_RATE_OVERRIDE: { label: "POS oran override", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

// A3: göreli zaman ("2 saat önce") — Intl.RelativeTimeFormat tr.
const RTF = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });
function relativeTime(iso: string): string {
  try {
    const diffMs = new Date(iso).getTime() - Date.now();
    const sec = Math.round(diffMs / 1000);
    const abs = Math.abs(sec);
    if (abs < 60) return RTF.format(Math.round(sec), "second");
    if (abs < 3600) return RTF.format(Math.round(sec / 60), "minute");
    if (abs < 86400) return RTF.format(Math.round(sec / 3600), "hour");
    if (abs < 2592000) return RTF.format(Math.round(sec / 86400), "day");
    if (abs < 31536000) return RTF.format(Math.round(sec / 2592000), "month");
    return RTF.format(Math.round(sec / 31536000), "year");
  } catch {
    return "";
  }
}

