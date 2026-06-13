"use client";

/**
 * AI modülü (v1.1): AI asistanı sayfası — RAG sohbet + (admin) yeniden-indeks
 * ve anomali opt-in. Glass desenleri + çift tema uyumlu.
 *
 * İşletme seçici: store'daki {@code activeBusiness} varsayılan; yoksa ilk
 * işletme. Tüm istekler business-scoped (backend guard'lı).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Info,
} from "lucide-react";
import { aiApi, type AiStatus } from "@/lib/api/ai";
import { ApiError } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export default function AiPage() {
  const profile = useAppStore((s) => s.profile);
  const businesses = useAppStore((s) => s.businesses);
  const activeBusiness = useAppStore((s) => s.activeBusiness);

  const isAdmin = profile?.role === "admin";

  const [selectedId, setSelectedId] = useState<string>("");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // admin: anomali opt-in + reindex durumları
  const [anomalyEnabled, setAnomalyEnabled] = useState<boolean | null>(null);
  const [anomalyBusy, setAnomalyBusy] = useState(false);
  const [reindexBusy, setReindexBusy] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  // Varsayılan işletme seçimi.
  useEffect(() => {
    if (selectedId) return;
    if (activeBusiness?.id) setSelectedId(activeBusiness.id);
    else if (businesses.length > 0) setSelectedId(businesses[0].id);
  }, [activeBusiness, businesses, selectedId]);

  // Modül durumu.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await aiApi.status();
        if (alive) setStatus(s);
      } catch (err) {
        logger.error("api", "AI status alinamadi", undefined, err);
      } finally {
        if (alive) setStatusLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Seçili işletme için anomali opt-in durumu (admin).
  useEffect(() => {
    if (!isAdmin || !selectedId) {
      setAnomalyEnabled(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const cfg = await aiApi.getAnomalyConfig(selectedId);
        if (alive) setAnomalyEnabled(cfg.enabled);
      } catch (err) {
        logger.error("api", "Anomali config alinamadi", undefined, err);
        if (alive) setAnomalyEnabled(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin, selectedId]);

  const selectedBusiness = useMemo(
    () => businesses.find((b) => b.id === selectedId) ?? null,
    [businesses, selectedId]
  );

  async function toggleAnomaly() {
    if (!selectedId || anomalyEnabled === null || anomalyBusy) return;
    setAnomalyBusy(true);
    try {
      const cfg = await aiApi.setAnomalyConfig(selectedId, !anomalyEnabled);
      setAnomalyEnabled(cfg.enabled);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Güncellenemedi.";
      logger.error("api", "Anomali config guncellenemedi", undefined, err);
      alert(msg);
    } finally {
      setAnomalyBusy(false);
    }
  }

  async function runReindex() {
    if (!selectedId || reindexBusy) return;
    setReindexBusy(true);
    setReindexResult(null);
    try {
      const res = await aiApi.reindex(selectedId);
      setReindexResult(`${res.stored} kayıt indekslendi.`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "İndeksleme başarısız.";
      setReindexResult(`Hata: ${msg}`);
    } finally {
      setReindexBusy(false);
    }
  }

  const aiUnavailable =
    !statusLoading && status && (!status.enabled || !status.llm_available);

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Asistan"
        subtitle="Finansal verinizi sorgulayın ve anomali uyarıları alın"
        icon={Bot}
      />

      {/* AI kapalı/yapılandırılmamış uyarısı */}
      {aiUnavailable && (
        <div className="v2-card p-4 flex items-start gap-3">
          <Info size={18} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-[rgb(var(--v2-muted))]">
            AI asistanı şu an yapılandırılmamış (LLM anahtarı eksik veya modül
            kapalı). Yönetici anahtarları ortam değişkenlerinden ayarlayınca
            etkinleşir.
          </div>
        </div>
      )}

      {/* İşletme seçici */}
      {businesses.length > 0 && (
        <div className="v2-card p-4">
          <label className="label">İşletme</label>
          <select
            className="input mt-1"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sohbet */}
      {selectedId ? (
        <ChatPanel businessId={selectedId} businessName={selectedBusiness?.name} />
      ) : (
        <EmptyState
          icon={Bot}
          title={businesses.length === 0 ? "Henüz erişilebilir bir işletme yok" : "Bir işletme seçin"}
        />
      )}

      {/* Admin paneli: yeniden-indeks + anomali opt-in */}
      {isAdmin && selectedId && (
        <div className="v2-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-accent" />
            <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))]">Yönetim</h2>
          </div>

          {/* Reindex */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm text-[rgb(var(--v2-ink))]">Finansal veriyi indeksle</p>
              <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                İşlem/kategori/aylık özetleri yeniden embed eder (RAG için).
              </p>
            </div>
            <button
              onClick={runReindex}
              disabled={reindexBusy}
              className="btn-secondary flex items-center gap-2 shrink-0"
            >
              {reindexBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Yeniden İndeksle
            </button>
          </div>
          {reindexResult && (
            <p className="text-[11px] text-[rgb(var(--v2-muted))]">{reindexResult}</p>
          )}

          {/* Anomali opt-in */}
          <div className="flex items-center justify-between gap-3 flex-wrap border-t border-[rgb(var(--v2-border))] pt-4">
            <div className="min-w-0 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-[rgb(var(--v2-ink))]">Anomali tespiti</p>
                <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                  Alışılmadık giderleri günlük tarar ve admin'lere bildirir
                  (varsayılan kapalı).
                </p>
              </div>
            </div>
            <button
              onClick={toggleAnomaly}
              disabled={anomalyBusy || anomalyEnabled === null}
              className={
                anomalyEnabled
                  ? "btn-primary shrink-0"
                  : "btn-secondary shrink-0"
              }
            >
              {anomalyBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : anomalyEnabled ? (
                "Açık"
              ) : (
                "Kapalı"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
