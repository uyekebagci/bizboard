"use client";

/**
 * v1.6.20 (WP-3): Kişi yönetim mini-sayfası — counterpart kind=PERSON.
 *
 * /counterparts ana sayfasında PERSON ve FIRM birlikte; burada yalnız PERSON
 * kayıtları liste şeklinde gösterilir. Detaya tıkla → counterpart detay.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, CircleUserRound } from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { formatCurrency } from "@/lib/utils";
import type { Counterpart } from "@/types";

export default function KisilerPage() {
  const router = useRouter();
  const [list, setList] = useState<Counterpart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const r = await api.get<Counterpart[]>("/counterparts?kind=PERSON");
        if (alive) setList(r || []);
      } catch (err) {
        logger.error("api", "kisiler fetch failed", undefined, err);
        if (alive) setError("Liste yuklenemedi");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Kişiler"
        subtitle="Gerçek kişi karşı tarafları (TCKN bazlı)"
        icon={CircleUserRound}
        actions={
          <Link
            href="/dashboard/counterparts"
            className="v2-btn v2-btn--ink v2-press text-xs"
          >
            <UserPlus size={14} />
            Yeni
          </Link>
        }
      />

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">{error}</div>
      )}

      {loading ? (
        <ListSkeleton rows={6} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={CircleUserRound}
          title="Henüz kişi yok"
          description="Karşı Firmalar sayfasından 'Tür: Kişi' seçerek ekleyebilirsiniz."
        />
      ) : (
        <section className="v2-card divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
          {list.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/counterparts/${p.id}`}
              className="block p-4 hover:bg-[rgb(var(--v2-sunken))] transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CircleUserRound size={18} className="text-[rgb(var(--v2-muted))] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate">{p.name}</p>
                    <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate">
                      {p.contact_phone || p.tax_id || "—"}
                    </p>
                  </div>
                </div>
                <p className={`num text-sm font-semibold shrink-0 ${
                  (p.current_balance ?? 0) > 0 ? "text-accent-strong dark:text-accent" :
                  (p.current_balance ?? 0) < 0 ? "text-status-danger" : "text-[rgb(var(--v2-muted))]"
                }`}>
                  {formatCurrency(p.current_balance ?? 0, "TRY")}
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
