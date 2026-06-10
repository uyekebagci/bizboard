"use client";

/**
 * v1.6.4: Nakit sayfası — işletme bazlı nakit bakiye listesi.
 *
 * Veri: GET /api/cash/businesses (NAKIT gelir − NAKIT gider)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  Loader2,
  Plus,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useRouter } from "next/navigation";
import type { CashBusinessBalance } from "@/types";

export default function NakitPage() {
  const router = useRouter();
  const [balances, setBalances] = useState<CashBusinessBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<CashBusinessBalance[]>("/cash/businesses").catch(() => []);
        setBalances(data || []);
      } catch (err) {
        logger.error("api", "Cash data fetch failed", undefined, err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const total = balances.reduce((a, b) => a + (b.balance || 0), 0);

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Banknote size={20} className="text-emerald-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-100">Nakit</h1>
            <p className="text-xs text-surface-400">
              Isletmelerin nakit bakiye dagilimi
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-emerald-400" />
        </div>
      ) : (
        <>
          {/* Total */}
          <section className="glass-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Wallet size={22} className="text-emerald-300" />
              </div>
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wider">
                  Toplam Nakit
                </p>
                <p className="text-2xl font-bold text-emerald-300">
                  {formatCurrency(total, "TRY")}
                </p>
              </div>
            </div>
          </section>

          {/* Per-business list */}
          {balances.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Banknote size={32} className="mx-auto text-surface-500 mb-2" />
              <p className="text-surface-300 font-medium">Henuz nakit bakiye yok</p>
              <p className="text-surface-400 text-sm mt-1">
                Islem eklerken &quot;Odeme Yontemi&quot; olarak Nakit seciniz.
              </p>
              <Link
                href="/dashboard/add-transaction?payment_method=NAKIT&type=income"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                Nakit Islem Ekle
              </Link>
            </div>
          ) : (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-surface-200">Isletme Bakiyeleri</h2>
              <div className="glass-card divide-y divide-surface-700">
                {balances.map((b) => (
                  <Link
                    key={b.business_id}
                    href={`/business/${b.business_id}`}
                    className="flex items-center justify-between p-4 hover:bg-surface-700 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-surface-100">{b.business_name}</p>
                      <p className="text-xs text-surface-400 mt-0.5">{b.currency}</p>
                    </div>
                    <p className="text-base font-semibold text-emerald-300">
                      {formatCurrency(b.balance, b.currency)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
