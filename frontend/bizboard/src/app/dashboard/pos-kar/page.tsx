"use client";

/**
 * Ledger v2 (Faz C, §3.5 / §6 / TODO 7): POS Kâr — işlem girişi + kâr-payı +
 * T+1 yatış (ort.komisyon) ekranı.
 *
 * - Üstte: "POS İşlem Gir" + yatış bekleyen gün+cihaz uyarısı (kaçak adayı).
 * - POS işlem listesi: brüt/oran/cihaz/durum + kâr-payı bacakları (provisional/T+1).
 * - Yatış finalize: bekleyen gün+cihaz için yatan tutar gir → ort.komisyon kesinleşir.
 *
 * Çift tema; modal'lar portal'lı.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Sparkles, Clock, ShieldAlert, Plus, RotateCcw, Banknote,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useBusinesses } from "@/hooks/useBusinesses";
import { usePosDeals } from "@/hooks/usePosDeals";
import { usePosSettlements } from "@/hooks/usePosSettlements";
import { api } from "@/lib/api/client";
import { PosDealModal } from "@/components/posdeal/PosDealModal";
import { SettlementModal } from "@/components/posdeal/SettlementModal";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type {
  PosDeal, PosDeviceListItem, Counterpart, PosSettlementBatch,
} from "@/types";

export default function PosKarPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isAdmin = profile?.role === "admin";
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;

  const { deals, loading, error, create, preview, reverse } = usePosDeals(businessId);
  const { pending, finalize } = usePosSettlements(businessId);

  const [devices, setDevices] = useState<PosDeviceListItem[]>([]);
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [showDeal, setShowDeal] = useState(false);
  const [settleTarget, setSettleTarget] = useState<PosSettlementBatch | null>(null);

  useEffect(() => {
    api.get<PosDeviceListItem[]>("/pos-devices").then(setDevices).catch(() => setDevices([]));
    api.get<Counterpart[]>("/counterparts").then(setCounterparts).catch(() => setCounterparts([]));
  }, []);

  async function handleReverse(dealId: string) {
    if (!window.confirm("Bu POS işlemini geri al? Tüm kâr-payı posting'leri silinecek.")) return;
    try { await reverse(dealId); toast.success("POS işlemi geri alındı"); }
    catch (err) { toast.error(err); }
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors">
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">POS Kâr</h1>
          <p className="text-xs text-surface-400">işlem girişi · kâr-payı şelalesi · T+1 yatış</p>
        </div>
        <button onClick={() => setShowDeal(true)}
          className="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold
                     flex items-center gap-1.5 shrink-0">
          <Plus size={15} /> İşlem Gir
        </button>
      </div>

      {/* Yatış bekleyen (kaçak adayı) */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Clock size={14} className="text-amber-300" /> Yatış Bekleyen (T+1 ort.komisyon)
          </div>
          <div className="glass-card divide-y divide-surface-700">
            {pending.map((p) => (
              <div key={`${p.settle_date}-${p.pos_device_id}`}
                className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    {new Date(p.settle_date).toLocaleDateString("tr-TR")} · {p.pos_device_name}
                  </p>
                  <p className="text-[11px] text-surface-400">
                    Brüt {formatCurrency(p.gross_total, "TRY")} · {p.deal_count} işlem
                  </p>
                </div>
                <button onClick={() => setSettleTarget(p)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-600/30
                             text-xs flex items-center gap-1 hover:bg-emerald-600/30 shrink-0">
                  <Banknote size={12} /> Yatış Gir
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {/* POS işlem listesi */}
      {loading && deals.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : deals.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Sparkles size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Henüz POS işlemi yok</p>
          <p className="text-xs text-surface-400 mt-1">"İşlem Gir" ile başla.</p>
        </div>
      ) : (
        <section className="space-y-2">
          <div className="glass-card divide-y divide-surface-700">
            {deals.map((d) => (
              <PosDealRow key={d.id} deal={d} isAdmin={isAdmin} onReverse={() => handleReverse(d.id)} />
            ))}
          </div>
        </section>
      )}

      <PosDealModal open={showDeal} devices={devices} counterparts={counterparts}
        onClose={() => setShowDeal(false)} create={create} preview={preview}
        onCreated={() => { /* hook refresh içinde */ }} />
      <SettlementModal batch={settleTarget} devices={devices}
        onClose={() => setSettleTarget(null)} finalize={finalize} />
    </div>
  );
}

function PosDealRow({ deal, isAdmin, onReverse }: {
  deal: PosDeal; isAdmin: boolean; onReverse: () => void;
}) {
  const reversed = deal.status === "REVERSED";
  return (
    <div className={cn("p-4", reversed && "opacity-50")}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white num">
              {formatCurrency(deal.gross_amount, "TRY")}
            </p>
            <span className="text-[11px] text-surface-400">%{deal.customer_rate}</span>
            <StatusBadge status={deal.status} />
          </div>
          <p className="text-[11px] text-surface-400 mt-0.5">
            {deal.pos_device_name}
            {deal.owner_company_name && <> · {deal.owner_company_name}</>}
            {" · "}{new Date(deal.deal_date).toLocaleDateString("tr-TR")}
            {deal.referrer_name && <> · getiren: {deal.referrer_name}</>}
          </p>
        </div>
        {isAdmin && !reversed && (
          <button onClick={onReverse}
            className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300 shrink-0"
            title="Geri al">
            <RotateCcw size={13} />
          </button>
        )}
      </div>
      {/* Kâr-payı bacakları */}
      {deal.shares.length > 0 && !reversed && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {deal.shares.map((s, i) => (
            <span key={i} className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-lg border flex items-center gap-1",
              s.provisional
                ? "bg-amber-500/10 text-amber-300 border-amber-500/25"
                : "bg-surface-700/60 text-surface-300 border-surface-600",
            )}>
              {s.operator_name ?? "Şirket"}: {formatCurrency(s.amount, "TRY")}
              {s.provisional && <Clock size={8} />}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "FINALIZED"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : status === "PROVISIONAL"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
      : status === "REVERSED"
        ? "bg-red-500/15 text-red-300 border-red-500/25"
        : "bg-surface-700 text-surface-300 border-surface-600";
  const label = status === "FINALIZED" ? "KESİN"
    : status === "PROVISIONAL" ? "T+1 BEKLİYOR"
      : status === "REVERSED" ? "GERİ ALINDI" : status;
  return (
    <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border", cls)}>
      {label}
    </span>
  );
}
