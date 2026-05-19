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
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Kişiler</h1>
            <p className="text-xs text-surface-400">Gerçek kişi karşı tarafları (TCKN bazlı)</p>
          </div>
        </div>
        <Link
          href="/dashboard/counterparts"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
        >
          <UserPlus size={14} />
          Yeni
        </Link>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="card p-8 text-center">
          <CircleUserRound size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Henüz kişi yok</p>
          <p className="text-surface-400 text-sm mt-1">
            Karşı Firmalar sayfasından "Tür: Kişi" seçerek ekleyebilirsiniz.
          </p>
        </div>
      ) : (
        <section className="card divide-y divide-surface-700">
          {list.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/counterparts/${p.id}`}
              className="block p-4 hover:bg-surface-700 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CircleUserRound size={18} className="text-surface-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
                    <p className="text-[11px] text-surface-400 truncate">
                      {p.contact_phone || p.tax_id || "—"}
                    </p>
                  </div>
                </div>
                <p className={`text-sm font-semibold shrink-0 ${
                  (p.current_balance ?? 0) > 0 ? "text-emerald-300" :
                  (p.current_balance ?? 0) < 0 ? "text-red-300" : "text-surface-400"
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
