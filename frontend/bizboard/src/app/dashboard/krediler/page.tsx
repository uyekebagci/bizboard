"use client";

/**
 * v1.1 — Krediler sayfası (salt görüntü).
 *
 * <p>Kredi = Verilen/Alınan Borç (LoanService) tarafından üretilen {@link Debt}
 * kaydı. Mevcut veri üzerinde görüntüleme yapar; YENİ finansal hesap/mutasyon
 * YOKTUR. Backend {@code GET /loans} (konsolide) ve
 * {@code GET /businesses/{id}/loans} uçları kredi-kaynaklı borçların alt
 * kümesini döner (description öneki "Verilen borç:" / "Alınan borç:").</p>
 *
 * <p>Yön ayrımı: <b>Verilen Kredi</b> = ALACAK (RECEIVABLE) — bize geri
 * ödenecek; <b>Alınan Kredi</b> = VERECEK (PAYABLE) — biz geri ödeyeceğiz.</p>
 *
 * <p>İşletme filtresi + yön/durum filtresi + özet kartlar. Tutar sansürü (göz)
 * mevcut Alacaklar/Verecekler ile aynı desen (localStorage persist). Çift tema:
 * yalnızca semantic surface-/brand- sınıfları kullanılır.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Landmark, Eye, EyeOff, ArrowDownLeft, ArrowUpRight,
  CalendarClock, TrendingUp, TrendingDown, Wallet,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { formatCurrency, maskAmount, cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useBusinesses } from "@/hooks/useBusinesses";
import { DarkSelect } from "@/components/shared/DarkSelect";
import type { Debt } from "@/types";

type DirFilter = "ALL" | "RECEIVABLE" | "PAYABLE";
type StatusFilter = "ALL" | "OPEN" | "SETTLED";
type SortMode = "created_desc" | "amount_desc" | "due_asc";

const ALL_BUSINESSES = "ALL";
const CENSOR_KEY = "cati-krediler-censor";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Vade durumu: bugüne göre gecikmiş / yaklaşan etiketi (salt gösterim). */
function dueBadge(dueIso: string | null | undefined, settled: boolean): {
  label: string; cls: string;
} | null {
  if (settled || !dueIso) return null;
  const due = new Date(dueIso);
  if (isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)} gün gecikti`, cls: "bg-red-500/15 text-red-300 border-red-500/30" };
  }
  if (diffDays <= 7) {
    return { label: `${diffDays} gün kaldı`, cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  }
  return null;
}

export default function KredilerPage() {
  const router = useRouter();
  const { refreshKey } = useAppStore();
  const { businesses } = useBusinesses();

  const [rows, setRows] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [businessFilter, setBusinessFilter] = useState<string>(ALL_BUSINESSES);
  const [dirFilter, setDirFilter] = useState<DirFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [sortMode, setSortMode] = useState<SortMode>("created_desc");
  const [censored, setCensored] = useState(false);

  useEffect(() => {
    try { setCensored(localStorage.getItem(CENSOR_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  function toggleCensor() {
    setCensored((c) => {
      const next = !c;
      try { localStorage.setItem(CENSOR_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // Konsolide uç — kullanıcının erişebildiği tüm işletmeler. İşletme
        // filtresi client tarafında business_id eşlemesiyle uygulanır (salt görüntü).
        const data = await api.get<Debt[]>("/loans");
        if (alive) { setRows(data || []); setError(null); }
      } catch (e) {
        if (alive) setError(getErrorMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    let list = rows.slice();
    if (businessFilter !== ALL_BUSINESSES) {
      list = list.filter((d) => d.business_id === businessFilter);
    }
    if (dirFilter !== "ALL") {
      list = list.filter((d) => d.direction === dirFilter);
    }
    if (statusFilter === "OPEN") list = list.filter((d) => !d.is_settled);
    else if (statusFilter === "SETTLED") list = list.filter((d) => d.is_settled);

    list.sort((a, b) => {
      if (sortMode === "amount_desc") return b.amount - a.amount;
      if (sortMode === "due_asc") {
        const av = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bv = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        return av - bv;
      }
      // created_desc
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [rows, businessFilter, dirFilter, statusFilter, sortMode]);

  // Özet — yalnız açık (settled=false) kredileri baz alır (canlı pozisyon).
  const summary = useMemo(() => {
    let given = 0, taken = 0, givenCount = 0, takenCount = 0;
    for (const d of filtered) {
      if (d.is_settled) continue;
      if (d.direction === "RECEIVABLE") { given += d.amount; givenCount++; }
      else { taken += d.amount; takenCount++; }
    }
    return { given, taken, givenCount, takenCount, net: given - taken };
  }, [filtered]);

  return (
    <div className="space-y-5 pb-24">
      {/* ── Header ───────────────────────────────────────────── */}
      <section className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600"
          title="Geri" aria-label="Geri">
          <ArrowLeft size={18} className="text-surface-100" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Landmark size={20} className="text-brand-400 shrink-0" />
          <h1 className="text-xl font-bold text-surface-100 truncate">Krediler</h1>
        </div>
        <button onClick={toggleCensor}
          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300"
          title={censored ? "Tutarları göster" : "Tutarları gizle"}
          aria-label={censored ? "Tutarları göster" : "Tutarları gizle"}>
          {censored ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </section>

      <p className="text-xs text-surface-400 -mt-2">
        Verilen/Alınan Borç kayıtları. <span className="text-emerald-300">Verilen</span> = bize geri ödenecek (alacak),{" "}
        <span className="text-red-300">Alınan</span> = biz geri ödeyeceğiz (verecek). Salt görüntü.
      </p>

      {/* ── Özet kartlar ─────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SummaryCard
          label="Verilen Kredi (Alacak)" value={summary.given} count={summary.givenCount}
          tone="positive" icon={<TrendingUp size={14} />} censored={censored} />
        <SummaryCard
          label="Alınan Kredi (Verecek)" value={summary.taken} count={summary.takenCount}
          tone="negative" icon={<TrendingDown size={14} />} censored={censored} />
        <SummaryCard
          label="Net Pozisyon" value={summary.net}
          tone={summary.net > 0 ? "positive" : summary.net < 0 ? "negative" : "neutral"}
          icon={<Wallet size={14} />} censored={censored} primary signed />
      </section>

      {/* ── Filtreler ────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <DarkSelect
          value={businessFilter}
          onChange={(v) => setBusinessFilter(v)}
          aria-label="İşletme"
          searchable
          options={[
            { value: ALL_BUSINESSES, label: "Tüm İşletmeler" },
            ...businesses.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        <DarkSelect
          value={dirFilter}
          onChange={(v) => setDirFilter(v as DirFilter)}
          aria-label="Yön"
          options={[
            { value: "ALL", label: "Tüm Yönler" },
            { value: "RECEIVABLE", label: "Verilen (Alacak)" },
            { value: "PAYABLE", label: "Alınan (Verecek)" },
          ]}
        />
        <DarkSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          aria-label="Durum"
          options={[
            { value: "OPEN", label: "Açık" },
            { value: "SETTLED", label: "Kapanmış" },
            { value: "ALL", label: "Tümü" },
          ]}
        />
        <DarkSelect
          value={sortMode}
          onChange={(v) => setSortMode(v as SortMode)}
          aria-label="Sıralama"
          options={[
            { value: "created_desc", label: "En yeni" },
            { value: "amount_desc", label: "Tutar (büyük→küçük)" },
            { value: "due_asc", label: "Vade (yakın→uzak)" },
          ]}
        />
      </section>

      {/* ── Liste ────────────────────────────────────────────── */}
      <section>
        {loading ? (
          <div className="glass-card p-8 text-center text-surface-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Yükleniyor...
          </div>
        ) : error ? (
          <div className="glass-card p-8 text-center text-red-300 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-8 text-center text-surface-400 text-sm">
            Bu filtrede kredi kaydı yok.
          </div>
        ) : (
          <div className="glass-card divide-y divide-surface-700">
            {filtered.map((d) => (
              <LoanRow key={d.id} loan={d} censored={censored}
                onOpenCounterpart={(cpId) => router.push(`/dashboard/counterparts/${cpId}`)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label, value, count, tone, icon, censored, primary, signed,
}: {
  label: string; value: number; count?: number;
  tone: "positive" | "negative" | "neutral"; icon: React.ReactNode;
  censored: boolean; primary?: boolean; signed?: boolean;
}) {
  const color = tone === "positive" ? "text-emerald-300"
    : tone === "negative" ? "text-red-300" : "text-surface-100";
  const display = signed
    ? (value < 0 ? "−" : value > 0 ? "+" : "") + maskAmount(Math.abs(value), censored, "TRY")
    : maskAmount(Math.abs(value), censored, "TRY");
  return (
    <div className={cn("card p-3", primary && "ring-1 ring-brand-500/40 bg-brand-900/20")}>
      <div className="flex items-center gap-1.5 text-[10px] text-surface-400 uppercase mb-1">
        {icon} {label}
      </div>
      <p className={cn("text-lg font-bold num", color)}>{display}</p>
      {count !== undefined && (
        <p className="text-[10px] text-surface-500 mt-0.5">{count} açık kayıt</p>
      )}
    </div>
  );
}

function LoanRow({
  loan, censored, onOpenCounterpart,
}: {
  loan: Debt; censored: boolean;
  onOpenCounterpart: (counterpartId: string) => void;
}) {
  const isGiven = loan.direction === "RECEIVABLE"; // verilen kredi → alacak
  const tone = isGiven ? "positive" : "negative";
  const name = loan.counterpart_name || loan.counterparty || "—";
  const badge = dueBadge(loan.due_date, loan.is_settled);
  const clickable = !!loan.counterpart_id;

  return (
    <div
      className={cn(
        "p-3 flex items-center gap-3",
        clickable && "cursor-pointer hover:bg-surface-800/40",
      )}
      onClick={clickable ? () => onOpenCounterpart(loan.counterpart_id!) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenCounterpart(loan.counterpart_id!); }
      } : undefined}
    >
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
        tone === "positive" ? "bg-emerald-500/15" : "bg-red-500/15")}>
        {isGiven
          ? <ArrowUpRight size={16} className="text-emerald-300" />
          : <ArrowDownLeft size={16} className="text-red-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-surface-100 truncate">
          {name}
          <span className={cn("ml-2 text-[10px] px-1.5 py-0.5 rounded border",
            isGiven
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              : "bg-red-500/15 text-red-300 border-red-500/30")}>
            {isGiven ? "Verilen" : "Alınan"}
          </span>
          {loan.is_settled && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-300">
              Kapandı
            </span>
          )}
          {badge && (
            <span className={cn("ml-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border", badge.cls)}>
              <CalendarClock size={10} /> {badge.label}
            </span>
          )}
        </p>
        <p className="text-[11px] text-surface-400 truncate">
          {loan.business_name}
          {` · Vade: ${formatDate(loan.due_date)}`}
          {` · Kayıt: ${formatDate(loan.created_at)}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <span className={cn("text-sm font-semibold num whitespace-nowrap",
          tone === "positive" ? "text-emerald-300" : "text-red-300")}>
          {isGiven ? "+" : "−"}{maskAmount(loan.amount, censored, loan.currency || "TRY")}
        </span>
      </div>
    </div>
  );
}
