"use client";

import { Clock, User as UserIcon } from "lucide-react";
import type { AuditLog } from "@/types";
import {
  actionLabel,
  entityTypeLabel,
  localizeDetail,
  formatDt,
  relativeTime,
  HIGHLIGHT_BADGES,
} from "./audit-i18n";

interface AuditRowProps {
  row: AuditLog;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Tek denetim (audit) satırı — Daxa timeline görünümü.
 * Türkçe aksiyon/detail/entity etiketleri (immutable kayıt değişmez; sadece görüntü).
 * Genişletildiğinde ham kaydı (trace/ip/metadata) JSON olarak gösterir.
 */
export function AuditRow({ row, expanded, onToggle }: AuditRowProps) {
  const badge = row.highlight_type ? HIGHLIGHT_BADGES[row.highlight_type] : null;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[rgb(var(--v2-sunken))] transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-[rgb(var(--v2-sunken))] grid place-items-center shrink-0 mt-0.5">
          <Clock size={14} className="text-[rgb(var(--v2-muted))]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
              {actionLabel(row.action)}
            </span>
            {badge && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
          {row.detail && (
            <p className="text-[13px] text-[rgb(var(--v2-muted))] mt-0.5 break-words">
              {localizeDetail(row.detail)}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[11px] text-[rgb(var(--v2-muted))]">
            <span className="inline-flex items-center gap-1">
              <UserIcon size={11} /> {row.actor_username ?? "Sistem"}
            </span>
            <span className="opacity-50">·</span>
            <span title={formatDt(row.occurred_at)}>{relativeTime(row.occurred_at)}</span>
            {row.entity_type && (
              <>
                <span className="opacity-50">·</span>
                <span className="truncate">{entityTypeLabel(row.entity_type)}</span>
              </>
            )}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="bg-[rgb(var(--v2-sunken))] px-4 py-3 text-xs">
          <pre className="whitespace-pre-wrap break-all text-[rgb(var(--v2-muted))]">
            {JSON.stringify(
              {
                id: row.id,
                action: row.action,
                occurred_at: formatDt(row.occurred_at),
                trace_id: row.trace_id,
                actor_user_id: row.actor_user_id,
                business_id: row.business_id,
                entity_id: row.entity_id,
                ip: row.ip,
                user_agent: row.user_agent,
                metadata: row.metadata,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
