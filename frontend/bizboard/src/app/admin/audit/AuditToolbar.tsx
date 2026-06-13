"use client";

import { Loader2, ShieldCheck, Radio, Download, UserX } from "lucide-react";

interface AuditToolbarProps {
  verifying: boolean;
  onVerifyChain: () => void;
  live: boolean;
  liveConnected: boolean;
  onToggleLive: () => void;
  exporting: boolean;
  onExport: (format: "csv" | "json") => void;
  // mod-audit: KVKK retention anonimleştirme (POST /admin/audit/anonymize)
  anonymizing: boolean;
  onAnonymize: () => void;
}

const BTN =
  "text-xs px-3 py-1.5 rounded-xl border border-[rgb(var(--v2-border))] " +
  "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50 " +
  "disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors";

/** Denetim Kaydı üst aksiyonları (Daxa) — Zinciri doğrula / Canlı / CSV / JSON. */
export function AuditToolbar({
  verifying,
  onVerifyChain,
  live,
  liveConnected,
  onToggleLive,
  exporting,
  onExport,
  anonymizing,
  onAnonymize,
}: AuditToolbarProps) {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {/* mod-audit: tamper-proof zincir doğrula (GET /admin/audit/verify-chain) */}
      <button
        type="button"
        onClick={onVerifyChain}
        disabled={verifying}
        title="Tamper-proof hash zincirini doğrula"
        className={BTN}
      >
        {verifying ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
        Zinciri doğrula
      </button>

      {/* mod-audit: canlı SSE akışı toggle */}
      <button
        type="button"
        onClick={onToggleLive}
        title="Canlı denetim akışı"
        className={`text-xs px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition-colors ${
          live
            ? "bg-accent/16 text-accent-strong dark:text-accent border border-accent/40"
            : "border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50"
        }`}
      >
        <Radio size={13} className={live && liveConnected ? "animate-pulse" : ""} />
        {live ? (liveConnected ? "Canlı" : "Bağlanıyor…") : "Canlı"}
      </button>

      {/* mod-audit: filtreli server-side export */}
      <button
        type="button"
        onClick={() => onExport("csv")}
        disabled={exporting}
        title="Filtreli tüm kayıtları CSV indir"
        className={BTN}
      >
        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        CSV
      </button>
      <button
        type="button"
        onClick={() => onExport("json")}
        disabled={exporting}
        title="Filtreli tüm kayıtları JSON indir"
        className={BTN}
      >
        JSON
      </button>

      {/* mod-audit: KVKK retention anonimleştirme (POST /admin/audit/anonymize) */}
      <button
        type="button"
        onClick={onAnonymize}
        disabled={anonymizing}
        title="KVKK saklama süresi dolan eski kayıtların kişisel verilerini anonimleştir"
        className={BTN}
      >
        {anonymizing ? <Loader2 size={13} className="animate-spin" /> : <UserX size={13} />}
        KVKK Anonimleştir
      </button>
    </div>
  );
}
