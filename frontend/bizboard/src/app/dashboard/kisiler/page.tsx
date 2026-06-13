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
import { ArrowLeft, Loader2, UserPlus, CircleUserRound } from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="v2-icon-btn v2-press"
            aria-label="Geri don"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="v2-display text-xl">Kişiler</h1>
            <p className="text-xs text-[rgb(var(--v2-muted))]">Gerçek kişi karşı tarafları (TCKN bazlı)</p>
          </div>
        </div>
        <Link
          href="/dashboard/counterparts"
          className="v2-btn v2-btn--ink v2-press text-xs"
        >
          <UserPlus size={14} />
          Yeni
        </Link>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : list.length === 0 ? (
        <div className="v2-card p-8 text-center">
          <CircleUserRound size={32} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-[rgb(var(--v2-ink))] font-medium">Henüz kişi yok</p>
          <p className="text-[rgb(var(--v2-muted))] text-sm mt-1">
            Karşı Firmalar sayfasından "Tür: Kişi" seçerek ekleyebilirsiniz.
          </p>
        </div>
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
