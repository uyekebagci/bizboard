"use client";

/**
 * v1.6.4: Nakit sayfası — işletme bazlı nakit bakiye listesi.
 *
 * Veri: GET /api/cash/businesses (NAKIT gelir − NAKIT gider)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
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
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";

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
      <PageHeader
        title="Nakit"
        subtitle="İşletmelerin nakit bakiye dağılımı"
        icon={Banknote}
        fallbackHref="/dashboard"
      />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          {/* Total */}
          <section className="v2-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center">
                <Wallet size={22} className="text-accent-strong dark:text-accent" />
              </div>
              <div>
                <p className="v2-eyebrow">Toplam Nakit</p>
                <p className="text-2xl font-bold text-accent-strong dark:text-accent num">
                  {formatCurrency(total, "TRY")}
                </p>
              </div>
            </div>
          </section>

          {/* Per-business list */}
          {balances.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="Henüz nakit bakiye yok"
              description={'İşlem eklerken "Ödeme Yöntemi" olarak Nakit seçiniz.'}
              action={
                <Link
                  href="/dashboard/add-transaction?payment_method=NAKIT&type=income"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-accent-ink text-sm font-medium transition-colors hover:opacity-90"
                >
                  <Plus size={16} />
                  Nakit İşlem Ekle
                </Link>
              }
            />
          ) : (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">İşletme Bakiyeleri</h2>
              <div className="v2-card divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
                {balances.map((b) => (
                  <Link
                    key={b.business_id}
                    href={`/business/${b.business_id}`}
                    className="flex items-center justify-between p-4 hover:bg-[rgb(var(--v2-sunken))] transition-colors"
                  >
                    <div>
                      <p className="font-medium text-[rgb(var(--v2-ink))]">{b.business_name}</p>
                      <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">{b.currency}</p>
                    </div>
                    <p className="text-base font-semibold text-accent-strong dark:text-accent num">
                      {formatCurrency(b.balance || 0, b.currency)}
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
