"use client";

/**
 * Vergi Takvimi Modülü — TR vergi son tarihleri sayfası.
 *
 * Veri: GET /tax-calendar?from=&to= (default bugün → +N gün).
 *
 * Görünüm: yaklaşan vergi son tarihleri kart listesi (vade ASC). Her kart vergi
 * türü + dönem + kalan gün gösterir; yaklaşan (≤7 gün) vurgulanır, geçmiş soluk.
 * Aralık chip'leri (30/60/90 gün). Glass tasarım dili (.glass-card).
 *
 * Bildirim: backend cron (TaxDeadlineReminderScheduler) 7/3/1 gün önce admin'lere
 * uyarı atar; bu sayfa o uyarıların {actionUrl} hedefidir.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, CalendarClock, AlertTriangle, Landmark, ReceiptText,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { TaxDeadline } from "@/types";

const RANGE_CHIPS = [30, 60, 90] as const;

/** Tür → renk teması (statik class'lar — JIT purge güvenli). */
const TYPE_THEME: Record<string, { wrap: string; text: string }> = {
  KDV: { wrap: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-300" },
  MUHTASAR: { wrap: "bg-sky-500/15 border-sky-500/30", text: "text-sky-300" },
  BA_BS: { wrap: "bg-amber-500/15 border-amber-500/30", text: "text-amber-300" },
  GECICI_VERGI: { wrap: "bg-violet-500/15 border-violet-500/30", text: "text-violet-300" },
  KURUMLAR_VERGISI: { wrap: "bg-rose-500/15 border-rose-500/30", text: "text-rose-300" },
  GELIR_VERGISI: { wrap: "bg-indigo-500/15 border-indigo-500/30", text: "text-indigo-300" },
};

function themeFor(type: string) {
  return TYPE_THEME[type] ?? { wrap: "bg-surface-600/40 border-surface-500/40", text: "text-surface-200" };
}

function formatTrDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Kalan gün → TR rozet metni + renk. */
function countdown(days: number): { label: string; tone: string } {
  if (days < 0) return { label: `${Math.abs(days)} gün geçti`, tone: "text-surface-400 bg-surface-700 border-surface-600" };
  if (days === 0) return { label: "BUGÜN", tone: "text-red-200 bg-red-500/20 border-red-500/40" };
  if (days === 1) return { label: "YARIN", tone: "text-orange-200 bg-orange-500/20 border-orange-500/40" };
  if (days <= 7) return { label: `${days} gün`, tone: "text-amber-200 bg-amber-500/15 border-amber-500/30" };
  return { label: `${days} gün`, tone: "text-surface-200 bg-surface-700 border-surface-600" };
}

export default function VergiTakvimiPage() {
  const router = useRouter();
  const [list, setList] = useState<TaxDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(60);

  async function refresh(targetDays: number) {
    setLoading(true);
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + targetDays * 86400_000).toISOString().slice(0, 10);
      const r = await api.get<TaxDeadline[]>(`/tax-calendar?from=${from}&to=${to}`);
      setList(r || []);
      setError(null);
    } catch (err) {
      logger.error("api", "tax-calendar fetch failed", undefined, err);
      setError("Vergi takvimi yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // Yaklaşan (≤7 gün, geçmemiş) son tarih sayısı — özet kart.
  const upcoming = useMemo(
    () => list.filter((d) => d.days_until >= 0 && d.days_until <= 7).length,
    [list],
  );
  const nextDeadline = useMemo(
    () => list.find((d) => d.days_until >= 0) ?? null,
    [list],
  );

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
          aria-label="Geri"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
            <Landmark size={20} className="text-brand-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-100 h-display">Vergi Takvimi</h1>
            <p className="text-xs text-surface-400">TR vergi son tarihleri (GİB takvimi)</p>
          </div>
        </div>
      </div>

      {/* Özet kartlar */}
      <section className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Kayıt</p>
          <p className="mt-1 text-lg font-bold text-surface-100">{list.length}</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Yaklaşan (≤7g)</p>
          <p className={cn("mt-1 text-lg font-bold", upcoming > 0 ? "text-amber-300" : "text-surface-400")}>
            {upcoming}
          </p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">İlk Son Tarih</p>
          <p className="mt-1 text-sm font-semibold text-surface-100 truncate">
            {nextDeadline ? formatTrDate(nextDeadline.due_date) : "—"}
          </p>
        </div>
      </section>

      {/* Aralık chip'leri */}
      <div className="flex gap-2">
        {RANGE_CHIPS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              days === d
                ? "bg-brand-500/20 border-brand-400 text-brand-200"
                : "bg-surface-700 border-surface-600 text-surface-300 hover:text-surface-100",
            )}
          >
            {d} gün
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-brand-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CalendarClock size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">{days} gün içinde vergi son tarihi yok</p>
        </div>
      ) : (
        <section className="glass-card divide-y divide-surface-700">
          {list.map((d, i) => {
            const theme = themeFor(d.obligation_type);
            const cd = countdown(d.days_until);
            const isVat = d.obligation_type === "KDV";
            return (
              <div
                key={`${d.obligation_type}-${d.due_date}-${i}`}
                className={cn(
                  "p-4 flex items-start justify-between gap-3",
                  d.days_until >= 0 && d.days_until <= 7 && "bg-amber-500/5",
                  d.days_until < 0 && "opacity-60",
                )}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center shrink-0", theme.wrap)}>
                    <ReceiptText size={16} className={theme.text} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-surface-100 truncate">{d.label}</p>
                    <p className="text-xs text-surface-400 truncate">{d.description}</p>
                    <p className="mt-1 text-xs text-surface-300">
                      <span className="num">{formatTrDate(d.due_date)}</span>
                      <span className="mx-1.5 text-surface-600">·</span>
                      <span className="text-surface-400">{d.period} dönemi</span>
                    </p>
                    {isVat && d.days_until >= 0 && (
                      <p className="mt-1.5 text-[11px] text-emerald-300/90">
                        Ön hazırlık: KDV&apos;ye tabi işlem toplamını ve indirilecek KDV&apos;yi kontrol edin.
                      </p>
                    )}
                  </div>
                </div>
                <span className={cn(
                  "shrink-0 text-[10px] font-semibold uppercase px-2 py-1 rounded-full border whitespace-nowrap",
                  cd.tone,
                )}>
                  {cd.label}
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
