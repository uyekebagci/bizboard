"use client";

/**
 * v1.7.x (UI Fix WP 8b961444 TODO 1d5d526b): Verecekler sayfası —
 * Alacaklar'ın muadili. PAYABLE direction'lı debt'leri counterpart bazlı
 * agregate eder.
 *
 * <p>Veri: GET /debts (user-scoped) + client-side filtre direction=PAYABLE
 * ve settled=false. Counterpart bazlı grupla; tutar DESC default sıralama.</p>
 *
 * <p>"+ Verecek Ekle" butonu CounterpartDebtModal'ı direction=PAYABLE
 * ile açar.</p>
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, HandCoins, Plus, CalendarClock, Eye, EyeOff,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { maskAmount, cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Debt, Counterpart, Business } from "@/types";
import { CounterpartDebtModal } from "@/components/debts/CounterpartDebtModal";
import { DarkSelect } from "@/components/shared/DarkSelect";

type SortMode = "amount_desc" | "due_asc" | "name_asc";

/** İşletme filtresi (salt-görüntü) — Alacaklar ile simetrik. */
const ALL_BUSINESSES = "ALL";

interface PayableAggregate {
  counterpart_id: string | null;
  counterpart_name: string;
  total_amount: number;
  currency: string;
  last_due_date: string | null;
  count: number;
  /** Tenant binding — işletme filtresi için (Debt.business_id'den türetilir). */
  business_id: string | null;
}

export default function VereceklerPage() {
  const router = useRouter();
  const { refreshKey } = useAppStore();
  const [rows, setRows] = useState<PayableAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("amount_desc");
  const [showAddModal, setShowAddModal] = useState(false);
  // İşletme filtresi (salt-görüntü) — Alacaklar ile simetrik.
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessFilter, setBusinessFilter] = useState<string>(ALL_BUSINESSES);
  // Sansür (privacy) — alacaklar ile aynı: ayrı localStorage anahtarı.
  const [censored, setCensored] = useState(false);
  useEffect(() => {
    try { setCensored(localStorage.getItem("cati-verecekler-censor") === "1"); } catch { /* ignore */ }
  }, []);
  function toggleCensor() {
    setCensored((prev) => {
      const next = !prev;
      try { localStorage.setItem("cati-verecekler-censor", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }
  // Sansürlüyken kopyalamayı da engelle (maskeli `*` zaten gerçek değeri taşımaz).
  const censorCls = censored ? "select-none" : "";

  useEffect(() => {
    async function load() {
      try {
        // v1.7.x net-balance: PAYABLE debt'leri counterpart bazlı grupla,
        // sonra counterpart entity'sinin current_balance'ı ile NET'le.
        // current_balance < 0 ise (= net borçluyuz) bu counterpart'ı göster,
        // abs(balance) tutar olarak. RECEIVABLE varsa zaten karşılıklı düşülmüş olur.
        const [debts, allCps] = await Promise.all([
          api.get<Debt[]>("/debts").catch(() => [] as Debt[]),
          api.get<Counterpart[]>("/counterparts").catch(() => [] as Counterpart[]),
        ]);
        const balanceById = new Map<string, number>();
        for (const c of (allCps || [])) balanceById.set(c.id, c.current_balance ?? 0);

        // PAYABLE'i grupla — last_due_date / count bilgisi için
        const open = (debts || []).filter((d) => d.direction === "PAYABLE" && !d.is_settled);
        const grouped = new Map<string, PayableAggregate>();
        for (const d of open) {
          const key = d.counterpart_id || `name:${(d.counterparty ?? "").toLowerCase()}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.total_amount += d.amount;
            existing.count += 1;
            if (d.due_date) {
              if (!existing.last_due_date || d.due_date > existing.last_due_date) {
                existing.last_due_date = d.due_date;
              }
            }
          } else {
            grouped.set(key, {
              counterpart_id: d.counterpart_id || null,
              counterpart_name: d.counterparty || "Bilinmiyor",
              total_amount: d.amount,
              currency: d.currency || "TRY",
              last_due_date: d.due_date,
              count: 1,
              // Debt.business_id doğrudan tenant binding taşır — işletme filtresi
              // için otoritatif (counterpart per-business).
              business_id: d.business_id || null,
            });
          }
        }

        // Net override: current_balance < 0 → abs olarak göster, > 0 → bu counterpart aslında
        // alacaklı tarafa düştü, Verecekler'den gizle.
        const netted: PayableAggregate[] = [];
        for (const r of grouped.values()) {
          const balance = r.counterpart_id ? balanceById.get(r.counterpart_id) : null;
          if (balance != null && balance < 0) {
            netted.push({ ...r, total_amount: Math.abs(balance) });
          } else if (balance == null) {
            // counterpart_id yok (legacy free-text). Gross olarak göster.
            netted.push(r);
          }
          // balance >= 0 ise: net borç kalmadı → gizle
        }
        setRows(netted);
      } catch (err) {
        logger.error("api", "Payables fetch failed", undefined, err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  // İşletme filtresi için işletme listesi (Alacaklar ile simetrik). Tenant-scope:
  // /businesses zaten kullanıcının erişebildiği işletmeleri döner.
  useEffect(() => {
    api.get<Business[]>("/businesses")
      .then((r) => setBusinesses(r || []))
      .catch(() => { /* sessiz — filtre görünmez, konsolide görünüm kalır */ });
  }, []);

  // İşletme filtresi (salt-görüntü): "ALL" → tüm satırlar; aksi → yalnız seçilen
  // işletmenin verecekleri. Legacy free-text satırlar Debt.business_id taşıdığından
  // burada da doğru işletmeye atfedilir.
  const visibleRows = useMemo(() => {
    if (businessFilter === ALL_BUSINESSES) return rows;
    return rows.filter((r) => r.business_id === businessFilter);
  }, [rows, businessFilter]);

  const total = visibleRows.reduce((a, r) => a + (r.total_amount || 0), 0);
  const totalCount = visibleRows.reduce((a, r) => a + (r.count || 0), 0);

  // İşletme başına verecek özeti (breakdown) — yalnız "Tüm İşletmeler" + >1 işletme.
  const businessBreakdown = useMemo(() => {
    if (businessFilter !== ALL_BUSINESSES || businesses.length <= 1) return null;
    const nameById = new Map(businesses.map((b) => [b.id, b.name]));
    const sums = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const key = r.business_id ?? "_none";
      const acc = sums.get(key) ?? { total: 0, count: 0 };
      acc.total += r.total_amount || 0;
      acc.count += 1;
      sums.set(key, acc);
    }
    const out: Array<{ key: string; name: string; total: number; count: number }> = [];
    for (const [key, v] of sums.entries()) {
      out.push({
        key,
        name: key === "_none" ? "İşletme bağlantısı yok" : (nameById.get(key) ?? "Bilinmeyen işletme"),
        total: v.total,
        count: v.count,
      });
    }
    out.sort((a, b) => b.total - a.total);
    return out.length > 1 ? out : null;
  }, [rows, businessFilter, businesses]);

  const sorted = useMemo(() => {
    const out = [...visibleRows];
    if (sortMode === "amount_desc") {
      out.sort((a, b) => b.total_amount - a.total_amount);
    } else if (sortMode === "due_asc") {
      out.sort((a, b) => {
        const ax = a.last_due_date ? new Date(a.last_due_date).getTime() : Number.POSITIVE_INFINITY;
        const bx = b.last_due_date ? new Date(b.last_due_date).getTime() : Number.POSITIVE_INFINITY;
        return ax - bx;
      });
    } else {
      out.sort((a, b) => a.counterpart_name.localeCompare(b.counterpart_name, "tr"));
    }
    return out;
  }, [visibleRows, sortMode]);

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
        <div className="flex items-center gap-2 flex-1">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <HandCoins size={20} className="text-red-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-100">Verecekler</h1>
            <p className="text-xs text-surface-400">
              Açık (ödenmemiş) verecekler — kişi/firma bazlı özet
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
        >
          <Plus size={16} />
          Verecek Ekle
        </button>
      </div>

      {/* İşletme filtresi (salt-görüntü) — Alacaklar ile simetrik. */}
      {!loading && businesses.length > 1 && (
        <section className="flex items-center gap-2">
          <label className="text-xs text-surface-400 shrink-0">İşletme:</label>
          <div className="min-w-[200px]">
            <DarkSelect
              value={businessFilter}
              onChange={setBusinessFilter}
              placeholder="Tüm İşletmeler"
              aria-label="İşletmeye göre filtrele"
              searchable={businesses.length > 6}
              options={[
                { value: ALL_BUSINESSES, label: "Tüm İşletmeler" },
                ...businesses.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </div>
        </section>
      )}

      {/* İşletme başına özet (breakdown) — "Tüm İşletmeler" görünümünde her
          işletmenin açık verecek toplamı. Tıklanınca o işletmeye filtreler. */}
      {!loading && businessFilter === ALL_BUSINESSES && businessBreakdown && (
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {businessBreakdown.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => g.key !== "_none" && setBusinessFilter(g.key)}
              disabled={g.key === "_none"}
              className={cn(
                "glass-card p-3 text-left transition-colors",
                g.key === "_none"
                  ? "cursor-default opacity-80"
                  : "hover:border-red-500/40 cursor-pointer",
              )}
              title={g.key === "_none" ? undefined : `${g.name} vereceklerini göster`}
            >
              <p className="text-[11px] text-surface-400 truncate" title={g.name}>{g.name}</p>
              <p className={cn("mt-0.5 text-sm font-semibold text-red-300", censorCls)}>
                {maskAmount(g.total, censored, "TRY")}
              </p>
              <p className="text-[10px] text-surface-400">{g.count} kişi/firma</p>
            </button>
          ))}
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-red-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <HandCoins size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Açık verecek yok</p>
          <p className="text-surface-400 text-sm mt-1">
            Yukarıdaki &quot;+ Verecek Ekle&quot; butonu ile yeni bir verecek kaydı oluşturabilirsin.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            <Plus size={16} />
            Verecek Ekle
          </button>
        </div>
      ) : visibleRows.length === 0 ? (
        // İşletme filtresi aktif ama bu işletmede açık verecek yok.
        <div className="glass-card p-8 text-center">
          <HandCoins size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Bu işletmede açık verecek yok</p>
          <button
            onClick={() => setBusinessFilter(ALL_BUSINESSES)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-semibold"
          >
            Tüm İşletmeleri Göster
          </button>
        </div>
      ) : (
        <>
          {/* Totals */}
          <section className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4">
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Toplam Verecek</p>
              <div className="mt-1 flex items-center gap-2">
                <p className={cn("text-2xl font-bold text-red-300", censorCls)}>
                  {maskAmount(total, censored, "TRY")}
                </p>
                {/* Sansür toggle (privacy) — maskelenen tutarın hemen yanında. */}
                <button
                  onClick={toggleCensor}
                  aria-pressed={censored}
                  title={censored ? "Tutarları göster" : "Tutarları gizle"}
                  aria-label={censored ? "Tutarları göster" : "Tutarları gizle"}
                  className="shrink-0 p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300 hover:text-surface-100 transition-colors"
                >
                  {censored ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] text-surface-400 uppercase tracking-wider">Açık Kayıt</p>
              <p className="mt-1 text-2xl font-bold text-surface-100">{totalCount}</p>
              <p className="text-[11px] text-surface-400 mt-0.5">
                {visibleRows.length} farklı kişi/firma
              </p>
            </div>
          </section>

          {/* Sort chips */}
          <section className="flex items-center justify-between gap-2">
            <span className="text-xs text-surface-400">Sırala:</span>
            <div className="flex gap-2">
              {([
                { v: "amount_desc", label: "Tutar (çok→az)" },
                { v: "due_asc", label: "Vade (yakın→uzak)" },
                { v: "name_asc", label: "İsim (A-Z)" },
              ] as { v: SortMode; label: string }[]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setSortMode(opt.v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    sortMode === opt.v
                      ? "bg-red-500/20 border-red-400 text-red-200"
                      : "bg-surface-700 border-surface-600 text-surface-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* List */}
          <section className="glass-card divide-y divide-surface-700">
            {sorted.map((r) => {
              const key = r.counterpart_id || `name:${r.counterpart_name}`;
              const href = r.counterpart_id ? `/dashboard/counterparts/${r.counterpart_id}` : null;
              const Inner = (
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-100 truncate">
                      {r.counterpart_name || "Bilinmiyor"}
                    </p>
                    {r.last_due_date && (
                      <p className="mt-1.5 text-[11px] text-surface-400 flex items-center gap-1">
                        <CalendarClock size={11} />
                        Son vade: {new Date(r.last_due_date).toLocaleDateString("tr-TR", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-base font-semibold text-red-300", censorCls)}>
                      {maskAmount(r.total_amount, censored, r.currency)}
                    </p>
                    <p className="text-[11px] text-surface-400">{r.count} kayıt</p>
                  </div>
                </div>
              );
              return href ? (
                <Link key={key} href={href} className="row-hover block transition-colors">
                  {Inner}
                </Link>
              ) : (
                <div key={key}>{Inner}</div>
              );
            })}
          </section>
        </>
      )}

      {/* v1.7.x (UI Fix WP TODO 1d5d526b): + Verecek Ekle modal */}
      {showAddModal && (
        <CounterpartDebtModal
          direction="PAYABLE"
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
