"use client";

/**
 * Beta v1.1: /dashboard/closures — geçmiş kapanışlar listesi.
 *
 * <p>Read-only list. Bir satıra tıklayınca /dashboard/closure?date=X
 * sayfası açılır (geçmiş read-only).</p>
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, CalendarClock, ChevronRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";

interface ClosingRow {
  id: string;
  closing_date: string;
  opening_balance: number;
  computed_closing: number;
  actual_balance: number | null;
  difference: number | null;
  status: string;
  description: string | null;
  closed_at: string | null;
}

export default function ClosuresListPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
  const [businessId, setBusinessId] = useState("");
  const [closings, setClosings] = useState<ClosingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>("/businesses")
      .then((bs) => {
        setBusinesses(bs || []);
        if (bs && bs.length > 0) setBusinessId(bs[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    // Backend pagination wrapper: {items, page, size, total_elements, ...}
    // Bazı sürümler doğrudan array de dönebilir — defansif handle.
    api.get<ClosingRow[] | { items: ClosingRow[] }>(`/closings?business_id=${businessId}`)
      .then((r) => {
        if (Array.isArray(r)) {
          setClosings(r);
        } else if (r && Array.isArray(r.items)) {
          setClosings(r.items);
        } else {
          setClosings([]);
        }
      })
      .catch(() => setClosings([]))
      .finally(() => setLoading(false));
  }, [businessId]);

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl bg-[rgb(var(--v2-sunken))] hover:opacity-80 transition-colors"
          >
            <ArrowLeft size={20} className="text-[rgb(var(--v2-muted))]" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--v2-ink))] inline-flex items-center gap-2">
              <CalendarClock size={18} className="text-accent" />
              Gün Kapanışları
            </h1>
            <p className="text-xs text-[rgb(var(--v2-muted))]">Geçmiş kapanış kayıtları</p>
          </div>
        </div>
        <Link
          href={`/dashboard/closure${businessId ? `?business_id=${businessId}` : ""}`}
          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
        >
          Bugünü Kapat
        </Link>
      </div>

      {businesses.length > 1 && (
        <div className="v2-card p-3">
          <label className="text-[10px] uppercase text-[rgb(var(--v2-muted))] mb-1 block">İşletme</label>
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="field field-sm py-2"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : closings.length === 0 ? (
        <div className="v2-card p-8 text-center">
          <CalendarClock size={28} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-sm text-[rgb(var(--v2-ink))]">Henüz kapanış kaydı yok.</p>
        </div>
      ) : (
        <ul className="v2-card divide-y divide-[rgb(var(--v2-border))]">
          {closings.map((c) => {
            const diff = c.difference ?? 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/closure?business_id=${businessId}&date=${c.closing_date}`}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[rgb(var(--v2-sunken))] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">{c.closing_date}</p>
                    <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                      Açılış {formatCurrency(c.opening_balance, "TRY")}
                      {" → "}
                      Kapanış {formatCurrency(c.actual_balance ?? c.computed_closing, "TRY")}
                      {diff !== 0 && (
                        <span className={diff > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>
                          {" "}({diff > 0 ? "+" : ""}{formatCurrency(diff, "TRY")})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      {c.status}
                    </span>
                    <ChevronRight size={14} className="text-[rgb(var(--v2-muted))]" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
