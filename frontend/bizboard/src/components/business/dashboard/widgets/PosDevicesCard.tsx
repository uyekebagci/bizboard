"use client";

// ───────────────────────── 3. POS CİHAZLARI ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)

import Link from "next/link";
import { useState } from "react";
import { CreditCard, ChevronRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { Widget } from "@/components/v2";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { Footer } from "./shared";
import { PosDeviceModalDetail } from "./PosDeviceModalDetail";

export function PosDevicesCard({ d, compact }: { d: ConsolidatedDashboard; compact?: boolean }) {
  // v1.6.23.16 (TODO d0ccb7f0): tıkla → modal
  const [showDetail, setShowDetail] = useState(false);
  // v1.6.23.17: modal içinde cihaz seçilince in-place detay (geri = liste).
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const selectedDevice = selectedDeviceId
    ? d.pos_devices.find((dev) => dev.device_id === selectedDeviceId) || null
    : null;
  const devs = d.pos_devices;
  if (devs.length === 0) {
    return (
      <Widget title="POS Cihazları" icon={CreditCard}>
        <p className="text-xs text-[rgb(var(--v2-muted))] py-1">Aktif POS cihazı yok.</p>
      </Widget>
    );
  }
  // Beta v1.1: POS Hacmi mantığı — sadece amount toplamı, komisyon/kâr yok.
  // WP b446c696: gelir/gider ayrı + net (gelir − gider).
  const totalIncomeGross = devs.reduce((a, x) => a + (x.today_income_gross ?? x.today_gross ?? 0), 0);
  const totalExpenseGross = devs.reduce((a, x) => a + (x.today_expense_gross ?? 0), 0);
  const totalNetVolume = totalIncomeGross - totalExpenseGross;
  const unsettled = devs.reduce((a, x) => a + x.unsettled_count, 0);
  const totalTx = devs.reduce((a, x) => a + x.tx_count, 0);

  return (
    <>
    <Widget
      title="POS Cihazları (Bugün)"
      icon={CreditCard}
      flush
      onClick={() => setShowDetail(true)}
      ariaLabel="POS cihazları detayını aç"
      actions={
        unsettled > 0 ? (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {unsettled} bekliyor
          </span>
        ) : undefined
      }
    >
      <div className="divide-y divide-[rgb(var(--v2-border))]">
        {devs.map((dev) => (
          <div key={dev.device_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-surface-100 truncate">{dev.device_name}</p>
              <p className="text-[11px] text-surface-400">{dev.tx_count} çekim
                {dev.unsettled_count > 0 && (
                  <span className="ml-1.5 text-amber-300">· {dev.unsettled_count} hesaba düşmedi</span>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              {/* Beta v1.1: sadece günlük hacim — komisyon/kâr satırı kaldırıldı. */}
              <p className="text-sm font-semibold text-surface-100">{formatCurrency(dev.today_gross, "TRY")}</p>
            </div>
          </div>
        ))}
      </div>
      <Footer
        left={`${totalTx} çekim`}
        right={
          <span className="space-x-2">
            {/* WP b446c696 (Beta v1.1 Hotfix): gelir/gider/net ayrı. */}
            <span>
              Gelir <span className="text-emerald-300 font-semibold">{formatCurrency(totalIncomeGross, "TRY")}</span>
            </span>
            {totalExpenseGross > 0 && (
              <>
                <span className="text-surface-600">·</span>
                <span>
                  Gider <span className="text-rose-300 font-semibold">−{formatCurrency(totalExpenseGross, "TRY")}</span>
                </span>
                <span className="text-surface-600">·</span>
                <span>
                  Net <span className={cn(
                    "font-bold",
                    totalNetVolume >= 0 ? "text-emerald-300" : "text-rose-300",
                  )}>{formatCurrency(Math.abs(totalNetVolume), "TRY")}</span>
                </span>
              </>
            )}
          </span>
        }
      />
    </Widget>
    <WidgetDetailModal
      open={showDetail}
      onClose={() => { setShowDetail(false); setSelectedDeviceId(null); }}
      title={selectedDevice ? selectedDevice.device_name : "POS Cihazları — Detay"}
      subtitle={
        selectedDevice
          ? `${selectedDevice.tx_count} bugünkü çekim · ${selectedDevice.unsettled_count} bekleyen`
          : `${devs.length} cihaz · ${totalTx} bugünkü çekim · ${unsettled} bekleyen`
      }
      size="lg"
      headerAction={
        selectedDevice ? (
          <button
            type="button"
            onClick={() => setSelectedDeviceId(null)}
            className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-200 flex items-center gap-1"
          >
            ← Cihaz Listesi
          </button>
        ) : (
          <Link
            href="/dashboard/pos-cihazlari"
            onClick={() => { setShowDetail(false); setSelectedDeviceId(null); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white"
          >
            Tüm POS Sayfası →
          </Link>
        )
      }
    >
      {selectedDevice ? (
        // v1.6.23.17: cihaz detay görünümü — modal içinde inline
        <PosDeviceModalDetail
          device={selectedDevice}
          onClose={() => { setShowDetail(false); setSelectedDeviceId(null); }}
        />
      ) : (
        <>
          <p className="text-xs text-surface-400 mb-3">
            Her cihaza tıklayarak detayını bu modal üzerinde görebilirsin (sayfa değişimi yok).
          </p>
          <div className="space-y-2">
            {devs.map((dev) => (
              <button
                key={dev.device_id}
                type="button"
                onClick={() => setSelectedDeviceId(dev.device_id)}
                className="w-full text-left block p-3 rounded-lg border border-surface-700 hover:border-indigo-500/40 hover:bg-surface-700/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-100">{dev.device_name}</p>
                    <p className="text-[11px] text-surface-400 mt-0.5">
                      {dev.tx_count} bugünkü çekim
                      {dev.unsettled_count > 0 && (
                        <span className="ml-1.5 text-amber-300">· {dev.unsettled_count} hesaba düşmedi</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-surface-100">{formatCurrency(dev.today_gross, "TRY")} brüt</p>
                    <p className="text-[10px] text-emerald-300">{formatCurrency(dev.today_net, "TRY")} net</p>
                  </div>
                  <ChevronRight size={14} className="text-surface-400" />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </WidgetDetailModal>
    </>
  );
}
