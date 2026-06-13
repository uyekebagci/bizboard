"use client";

import { Radio } from "lucide-react";
import type { AuditLog } from "@/types";
import { actionLabel, localizeDetail, relativeTime } from "./audit-i18n";

interface AuditLivePanelProps {
  liveConnected: boolean;
  liveItems: AuditLog[];
}

/**
 * mod-audit: canlı SSE audit akışı paneli (Daxa). En yeni kayıt üstte;
 * bağlantı durumu + sayaç başlıkta. Veri/EventSource page.tsx'te yönetilir.
 */
export function AuditLivePanel({ liveConnected, liveItems }: AuditLivePanelProps) {
  return (
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
  );
}
