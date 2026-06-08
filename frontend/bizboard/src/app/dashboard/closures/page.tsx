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
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white inline-flex items-center gap-2">
              <CalendarClock size={18} className="text-emerald-400" />
              Gün Kapanışları
            </h1>
            <p className="text-xs text-surface-400">Geçmiş kapanış kayıtları</p>
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
        <div className="glass-card p-3">
          <label className="text-[10px] uppercase text-surface-400 mb-1 block">İşletme</label>
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600 text-white text-sm"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-surface-500" />
        </div>
      ) : closings.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CalendarClock size={28} className="mx-auto text-surface-500 mb-2" />
          <p className="text-sm text-surface-300">Henüz kapanış kaydı yok.</p>
        </div>
      ) : (
        <ul className="glass-card divide-y divide-surface-700">
          {closings.map((c) => {
            const diff = c.difference ?? 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/closure?business_id=${businessId}&date=${c.closing_date}`}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-surface-700/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{c.closing_date}</p>
                    <p className="text-[11px] text-surface-400">
                      Açılış {formatCurrency(c.opening_balance, "TRY")}
                      {" → "}
                      Kapanış {formatCurrency(c.actual_balance ?? c.computed_closing, "TRY")}
                      {diff !== 0 && (
                        <span className={diff > 0 ? "text-emerald-300" : "text-rose-300"}>
                          {" "}({diff > 0 ? "+" : ""}{formatCurrency(diff, "TRY")})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      {c.status}
                    </span>
                    <ChevronRight size={14} className="text-surface-400" />
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
