"use client";

// v1.6.23.17 (TODO d0ccb7f0 expansion): POS device detay — modal içinde inline.
// /pos-cihazlari/[id] sayfasının kompakt versiyonu.
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { Info, Stat2, TxMiniRow } from "./shared";

export function PosDeviceModalDetail({
  device,
  onClose,
}: {
  device: ConsolidatedDashboard["pos_devices"][number];
  onClose: () => void;
}) {
  type DeviceInfo = {
    id: string; name: string; is_active: boolean;
    default_rate?: number | null; last_used_rate?: number | null;
    owner_counterpart_name?: string | null; bank_name?: string | null;
  };
  type Tx = {
    id: string; date: string; amount: number;
    pos_net?: number | null; pos_settled?: boolean | null;
    settled_bank_account_name?: string | null; description?: string | null;
    currency: string;
  };
  type Analytics = {
    totals: {
      gross: number; commission: number; net: number;
      tx_count: number; settled_count: number; unsettled_count: number;
    };
  };

  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [d, an, tx] = await Promise.all([
          import("@/lib/api/client").then(({ api }) =>
            api.get<DeviceInfo>(`/pos-devices/${device.device_id}`),
          ),
          import("@/lib/api/client").then(({ api }) =>
            api.get<Analytics>(`/pos-devices/analytics?deviceId=${device.device_id}`).catch(() => null),
          ),
          import("@/lib/api/client").then(({ api }) =>
            api.get<Tx[]>(`/pos-devices/${device.device_id}/transactions`).catch(() => []),
          ),
        ]);
        if (!alive) return;
        setInfo(d);
        setAnalytics(an);
        setTxs(tx || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [device.device_id]);

  const unsettledTxs = useMemo(() => txs.filter((t) => !t.pos_settled), [txs]);

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <span className="text-sm text-surface-400">Yükleniyor...</span>
      </div>
    );
  }
  if (!info) {
    return <div className="py-8 text-center text-sm text-surface-400">Cihaz bulunamadı</div>;
  }

  const t = analytics?.totals;
  return (
    <div className="space-y-4">
      {/* Cihaz info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Info label="Sahibi" value={info.owner_counterpart_name || "—"} />
        <Info label="Banka" value={info.bank_name || "—"} />
        <Info label="Varsayılan oran" value={info.default_rate != null ? `%${info.default_rate}` : "—"} />
        <Info label="Durum" value={info.is_active ? "Aktif" : "Pasif"} tone={info.is_active ? "pos" : "neg"} />
      </div>

      {/* Analytics totals — Beta v1.1: sadece hacim + settled bilgisi. */}
      {t && (
        <div className="grid grid-cols-2 gap-2">
          <Stat2 label="Hacim" value={formatCurrency(t.gross, "TRY")} tone="pos" />
          <Stat2 label="Settled / Bekleyen" value={`${t.settled_count} / ${t.unsettled_count}`} />
        </div>
      )}

      {/* Bekleyen tahsilatlar */}
      {unsettledTxs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wider mb-2">
            Bekleyen Tahsilatlar ({unsettledTxs.length})
          </h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {unsettledTxs.slice(0, 10).map((tx) => (
              <TxMiniRow key={tx.id} tx={tx} />
            ))}
            {unsettledTxs.length > 10 && (
              <p className="text-[11px] text-surface-400 text-center pt-1">
                + {unsettledTxs.length - 10} daha (tam liste detay sayfasında)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Son tx'ler */}
      <div>
        <h4 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-2">
          Son İşlemler ({txs.length} toplam)
        </h4>
        {txs.length === 0 ? (
          <p className="text-xs text-surface-500 text-center py-4">Bu cihaz için işlem yok</p>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {txs.slice(0, 15).map((tx) => (
              <TxMiniRow key={tx.id} tx={tx} />
            ))}
            {txs.length > 15 && (
              <p className="text-[11px] text-surface-400 text-center pt-1">
                + {txs.length - 15} daha
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-surface-700 flex justify-end">
        <Link
          href={`/dashboard/pos-cihazlari/${device.device_id}`}
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white"
        >
          Tam Detay Sayfasına Git →
        </Link>
      </div>
    </div>
  );
}
