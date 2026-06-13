"use client";

import { Loader2, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";

/** mod-audit: tamper-proof zincir doğrulama cevabı (backend record alanları). */
export interface ChainVerification {
  valid: boolean;
  verifiedCount: number;
  unchainedCount: number;
  brokenAtSeq: number | null;
  brokenRecordId: string | null;
  brokenPosition: number | null;
  message: string;
}

interface AuditChainBannerProps {
  chain: ChainVerification;
  repairing: boolean;
  verifying: boolean;
  onRepair: () => void;
}

/**
 * mod-audit: zincir doğrulama sonucu bandı (Daxa). Geçerliyse accent, kırıksa
 * status-danger; kırık durumda "Zinciri Onar" aksiyonu gösterir
 * (POST /admin/audit/backfill-chain → tekrar verify; page.tsx tetikler).
 */
export function AuditChainBanner({
  chain,
  repairing,
  verifying,
  onRepair,
}: AuditChainBannerProps) {
  return (
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
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {chain.valid ? "Zincir bütünlüğü doğrulandı" : "ZİNCİR KIRIK — olası tahrifat"}
        </p>
        <p className="text-xs opacity-90 mt-0.5 break-words">{chain.message}</p>
        <p className="text-[11px] opacity-70 mt-1">
          Doğrulanan: {chain.verifiedCount}
          {chain.unchainedCount > 0 && ` · Zincirsiz: ${chain.unchainedCount}`}
          {chain.brokenAtSeq != null && ` · Kırılma seq: ${chain.brokenAtSeq}`}
        </p>
        {/* mod-audit: zincir kırıksa onar (backfill-chain → tekrar verify) */}
        {!chain.valid && (
          <button
            type="button"
            onClick={onRepair}
            disabled={repairing || verifying}
            className="mt-2.5 v2-btn v2-btn--ink v2-press !py-1.5 !px-3 text-xs"
          >
            {repairing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Wrench size={13} />
            )}
            {repairing ? "Onarılıyor…" : "Zinciri Onar"}
          </button>
        )}
      </div>
    </div>
  );
}
