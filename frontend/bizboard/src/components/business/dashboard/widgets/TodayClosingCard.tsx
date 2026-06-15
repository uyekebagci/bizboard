"use client";

// ───────────────────────── 2. BUGÜNÜN KASA DURUMU ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)
// UI v2 (Daxa) geçiş: tek-tip Widget kabuğu. Açık/kapalı durumu artık
// kabuk rengiyle değil header'daki durum rozetiyle gösterilir; "Günü Kapat"
// + OTO rozeti standart sağ-üst aksiyon slotuna taşındı.

import { useState } from "react";
import { CalendarClock, Lock, Sunrise } from "lucide-react";
import type { ConsolidatedDashboard } from "@/types";
import { Widget } from "@/components/v2";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { Stat, DetailRow } from "./shared";
import { useDayOpen } from "@/hooks/useDayOpen";
import { OpenDayModal } from "@/components/dayclose/OpenDayModal";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * "Bugünün Kasa Durumu" widget'ı. Karar A: YALNIZ DAY_CYCLE modülü AÇIK
 * işletmede render edilir (parent {@code ConsolidatedWidgets} gate'ler). Modül
 * açık olduğundan burada gün-açılış UI'sı entegre: durum rozeti (AÇILMADI/
 * AÇIK/KAPALI) + "Günü Kapat" yanına "Gün Açılışı" butonu (OpenDayModal).
 */
export function TodayClosingCard({ d, onCloseDay }: { d: ConsolidatedDashboard; onCloseDay?: () => void }) {
  const t = d.today_closing;
  // v1.6.23.15 (TODO d0ccb7f0): tıklanabilir → detay modal
  const [showDetail, setShowDetail] = useState(false);

  // Gün Açılışı (DAY_CYCLE): birleşik durum + "Gün Açılışı" butonu/rozeti.
  const isAdmin = useAppStore((s) => s.profile?.role === "admin");
  const { preview: openPreview, status: dayStatus, refresh: refreshOpen } = useDayOpen(d.business_id);
  const [showOpen, setShowOpen] = useState(false);
  const lifecycle = dayStatus?.lifecycle_status ?? "UNOPENED";
  const dayOpen = lifecycle === "OPEN";

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
            {/* Gün durumu rozeti (DAY_CYCLE) */}
            <DayBadge status={lifecycle} />
            {t.is_auto && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border border-[rgb(var(--v2-border))]">
                OTO
              </span>
            )}
            {/* Gün Açılışı — gün AÇIK değilse "Günü Kapat" yanında. */}
            {!dayOpen && !t.closed && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowOpen(true); }}
                className="v2-btn v2-btn--accent v2-press !px-3 !py-1.5 !text-xs flex items-center gap-1"
                title="Günü aç — devir + yuvarlama modal'ı açılır"
              >
                <Sunrise size={12} /> Gün Açılışı
              </button>
            )}
            {t.closed ? (
              <span className="v2-chip-accent">Kapandı</span>
            ) : onCloseDay ? (
              // v1.6.23.13 (TODO ca443172): küçük secondary buton — modal confirm görevi görüyor.
              <button
                onClick={(e) => { e.stopPropagation(); onCloseDay(); }}
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

      {/* Gün Açılışı modal (devir + yuvarlama). Açılınca consolidated +
          gün-durumu yenilenir. */}
      <OpenDayModal
        preview={showOpen ? openPreview : null}
        businessId={d.business_id}
        isAdmin={isAdmin}
        onClose={() => setShowOpen(false)}
        onOpened={() => { void refreshOpen(); }}
      />
    </>
  );
}

/** Birleşik gün durumu rozeti (DAY_CYCLE): AÇILMADI / AÇIK / KAPALI. */
function DayBadge({ status }: { status: string }) {
  const open = status === "OPEN";
  const closed = status === "CLOSED";
  const cls = closed
    ? "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] border-[rgb(var(--v2-border))]"
    : "bg-accent/15 text-accent-strong dark:text-accent border-accent/30";
  const label = open ? "AÇIK" : closed ? "KAPALI" : "AÇILMADI";
  return (
    <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border", cls)}>
      {label}
    </span>
  );
}
