"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  ShieldCheck,
  ShieldAlert,
  Radio,
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
import { actionLabel, localizeDetail, relativeTime } from "./audit-i18n";
import { AuditRow } from "./AuditRow";
import { AuditToolbar } from "./AuditToolbar";

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

// Daxa filtre inputu — solid alt-yüzey + ince border + accent focus, çift tema.
const INPUT_CLS =
  "w-full text-sm rounded-xl py-2 px-3 border border-[rgb(var(--v2-border))] " +
  "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] " +
  "focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all";

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
          setError("Denetim kaydı yüklenemedi");
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
  // Backend: GET /admin/audit/verify-chain (salt-okunur; gövde yok). POST yanlış
  // method'tu → "POST metodu desteklenmiyor (405)" hatasına yol açıyordu.
  async function verifyChain() {
    setVerifying(true);
    setChain(null);
    try {
      const res = await api.get<ChainVerification>("/admin/audit/verify-chain");
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
          throw new Error(`Dışa aktarma başarısız (HTTP ${res.status})`);
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
        setError(err instanceof Error ? err.message : "Dışa aktarma başarısız");
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
    <div className="space-y-5">
      {/* Daxa başlık + üst aksiyonlar — DashboardShell içeriği (kendi tam-ekran zemini yok). */}
      <section className="rise flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-1 p-2 rounded-xl text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-sunken))] transition-colors"
          aria-label="Geri"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="v2-eyebrow">Güvenlik &amp; İzlenebilirlik</p>
          <h1 className="v2-display text-2xl mt-1">Denetim Kaydı</h1>
          <p className="text-[rgb(var(--v2-muted))] mt-1 text-sm">
            {data?.total_elements != null
              ? `${data.total_elements} kayıt — değiştirilemez (immutable) denetim izi`
              : "Değiştirilemez (immutable) denetim izi"}
          </p>
        </div>

        <AuditToolbar
          verifying={verifying}
          onVerifyChain={verifyChain}
          live={live}
          liveConnected={liveConnected}
          onToggleLive={toggleLive}
          exporting={exporting}
          onExport={serverExport}
        />
      </section>

      {/* Filtreler — Daxa kart yüzeyi */}
      <section className="v2-card p-3">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2"
        >
          <input
            type="text"
            placeholder="Kullanıcı (actor) ID"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className={INPUT_CLS}
          />
          <input
            type="text"
            placeholder="İşletme ID"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className={INPUT_CLS}
          />
          <input
            type="text"
            placeholder="İşlem (örn. user.login)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className={INPUT_CLS}
          />
          <input
            type="text"
            placeholder="Kayıt tipi (örn. USER)"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className={INPUT_CLS}
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={INPUT_CLS}
            aria-label="Başlangıç tarihi"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={INPUT_CLS}
            aria-label="Bitiş tarihi"
          />
          <button
            type="submit"
            className="v2-btn v2-btn--accent v2-press col-span-1 sm:col-span-2 lg:col-span-6 !py-2"
          >
            <Filter size={14} />
            Filtrele
          </button>
        </form>
      </section>

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">
          {error}
        </div>
      )}

      {/* mod-audit: zincir doğrulama sonucu */}
      {chain && (
        <div
          className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${
            chain.valid
              ? "bg-accent/10 border-accent/30 text-accent-strong dark:text-accent"
              : "bg-status-danger/10 border-status-danger/30 text-status-danger"
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
        <div className="v2-card border-accent/30 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-accent-strong dark:text-accent border-b border-[rgb(var(--v2-border))]">
            <Radio size={12} className={liveConnected ? "animate-pulse" : ""} />
            <span className="font-semibold">Canlı akış</span>
            <span className="text-[rgb(var(--v2-muted))]">
              {liveConnected ? "bağlı" : "bağlanıyor…"} · {liveItems.length} yeni kayıt
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-[rgb(var(--v2-border))]">
            {liveItems.length === 0 && (
              <p className="text-center text-[rgb(var(--v2-muted))] py-4 text-xs">
                Yeni denetim kaydı bekleniyor…
              </p>
            )}
            {liveItems.map((r) => (
              <div key={`live-${r.id}`} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                <span className="font-medium text-[rgb(var(--v2-ink))]">{actionLabel(r.action)}</span>
                {r.detail && (
                  <span className="text-[rgb(var(--v2-muted))] truncate">— {localizeDetail(r.detail)}</span>
                )}
                <span className="ml-auto text-[11px] text-[rgb(var(--v2-muted))] shrink-0">
                  {r.actor_username ?? "Sistem"} · {relativeTime(r.occurred_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="v2-card overflow-hidden divide-y divide-[rgb(var(--v2-border))]">
        {loading && (
          <div className="flex items-center justify-center py-10 text-[rgb(var(--v2-muted))]">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {!loading && data && data.items.length === 0 && (
          <p className="text-center text-[rgb(var(--v2-muted))] py-10 text-sm">
            Kayıt bulunamadı
          </p>
        )}

        {!loading &&
          data?.items.map((r) => (
            <AuditRow
              key={r.id}
              row={r}
              expanded={expanded === r.id}
              onToggle={() => setExpanded((p) => (p === r.id ? null : r.id))}
            />
          ))}
      </div>

      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50 disabled:opacity-50 transition-colors"
          >
            <ChevronLeft size={14} />
            Önceki
          </button>
          <span className="text-xs text-[rgb(var(--v2-muted))]">
            Sayfa {data.page + 1} / {data.total_pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data.has_next || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50 disabled:opacity-50 transition-colors"
          >
            Sonraki
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
