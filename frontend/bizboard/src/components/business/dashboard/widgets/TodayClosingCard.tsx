"use client";

// ───────────────────────── 2. BUGÜNÜN KASA DURUMU ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)
// UI v2 (Daxa) geçiş: tek-tip Widget kabuğu. Açık/kapalı durumu artık
// kabuk rengiyle değil header'daki durum rozetiyle gösterilir; "Günü Kapat"
// + OTO rozeti standart sağ-üst aksiyon slotuna taşındı.

import { useState } from "react";
import { CalendarClock, Lock } from "lucide-react";
import type { ConsolidatedDashboard } from "@/types";
import { Widget } from "@/components/v2";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { Stat, DetailRow } from "./shared";

export function TodayClosingCard({ d, onCloseDay }: { d: ConsolidatedDashboard; onCloseDay?: () => void }) {
  const t = d.today_closing;
  // v1.6.23.15 (TODO d0ccb7f0): tıklanabilir → detay modal
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <Widget
        title="Bugünün Kasa Durumu"
        icon={t.closed ? Lock : CalendarClock}
        onClick={() => setShowDetail(true)}
        ariaLabel="Bugünün kasa durumu detayını aç"
        className="h-full"
        actions={
          <>
            {t.is_auto && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border border-[rgb(var(--v2-border))]">
                OTO
              </span>
            )}
            {t.closed ? (
              <span className="v2-chip-accent">Kapandı</span>
            ) : onCloseDay ? (
              // v1.6.23.13 (TODO ca443172): küçük secondary buton — modal confirm görevi görüyor.
              <button
                onClick={onCloseDay}
                className="v2-btn v2-btn--accent v2-press !px-3 !py-1.5 !text-xs"
                title="Günü kapat — fiziksel sayım modal'ı açılır"
              >
                Günü Kapat
              </button>
            ) : null}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Stat label="Açılış" value={t.opening_balance} />
          <Stat label="Hesaplanan" value={t.computed_closing} bold />
          <Stat label="Gelen" value={t.incoming} tone="positive" />
          <Stat label="Giden" value={-t.outgoing} tone="negative" />
          {t.actual_balance != null && (
            <>
              <Stat label="Sayım" value={t.actual_balance} />
              {t.difference != null && t.difference !== 0 && (
                <Stat
                  label="Fark"
                  value={t.difference}
                  tone={t.difference < 0 ? "negative" : "positive"}
                />
              )}
            </>
          )}
        </div>
      </Widget>
      {/* v1.6.23.15 (TODO d0ccb7f0): Bugünün kasa detayı modal */}
      <WidgetDetailModal
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title="Bugünün Kasa Durumu — Detay"
        subtitle={t.closed ? "Kapanmış (final)" : "Açık (gün içi)"}
        size="md"
      >
        <div className="space-y-3 text-sm text-surface-200">
          <DetailRow label="Açılış Bakiyesi" value={t.opening_balance} tone="neutral" />
          <DetailRow label="Bugün Gelen (NAKIT in)" value={t.incoming} tone="pos" />
          <DetailRow label="Bugün Giden (NAKIT out)" value={-Math.abs(t.outgoing)} tone="neg" />
          <div className="pt-2 border-t border-surface-700">
            <DetailRow
              label="Hesaplanan Kapanış"
              value={t.computed_closing}
              tone="neutral"
              bold
            />
            {t.actual_balance != null && (
              <>
                <DetailRow label="Fiziksel Sayım" value={t.actual_balance} tone="neutral" bold />
                {t.difference != null && t.difference !== 0 && (
                  <DetailRow
                    label="Fark (sayım − hesap)"
                    value={t.difference}
                    tone={t.difference < 0 ? "neg" : "pos"}
                  />
                )}
              </>
            )}
          </div>
          <p className="text-[11px] text-surface-400 pt-2">
            Formül: opening_balance + NAKIT income − NAKIT expense = computed_closing.
            Fiziksel sayım girilince fark hesaplanır.
          </p>
        </div>
      </WidgetDetailModal>
    </>
  );
}
