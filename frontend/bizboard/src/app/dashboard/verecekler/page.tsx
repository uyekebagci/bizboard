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
  HandCoins, Plus, CalendarClock, Eye, EyeOff,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { maskAmount, cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Debt, Counterpart, Business } from "@/types";
import { CounterpartDebtModal } from "@/components/debts/CounterpartDebtModal";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";

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
  const { refreshKey, triggerRefresh } = useAppStore();
  const [rows, setRows] = useState<PayableAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  // UX-08: ağ hatasını sessiz yutma yerine kullanıcıya göster + tekrar dene.
  const [loadError, setLoadError] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("amount_desc");
  // UX-10: Kart/Tablo görünüm tercihi (localStorage'da kalıcı).
  const { mode: viewMode, setMode: setViewMode } = useViewMode("verecekler", "card");
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
      setLoadError(false);
      try {
        // v1.7.x net-balance: PAYABLE debt'leri counterpart bazlı grupla,
        // sonra counterpart entity'sinin current_balance'ı ile NET'le.
        // current_balance < 0 ise (= net borçluyuz) bu counterpart'ı göster,
        // abs(balance) tutar olarak. RECEIVABLE varsa zaten karşılıklı düşülmüş olur.
        // UX-08: ana veri (/debts) başarısız olursa hata-state; counterparts
        // yardımcı (net'leme) — boş düşse de liste gross olarak çalışır.
        const debtsRes = await api.get<Debt[]>("/debts")
          .then((r) => ({ ok: true as const, data: r || [] }))
          .catch((e) => ({ ok: false as const, error: e }));
        if (!debtsRes.ok) {
          logger.error("api", "Payables fetch failed", undefined, debtsRes.error);
          setRows([]);
          setLoadError(true);
          return;
        }
        const debts = debtsRes.data;
        const allCps = await api.get<Counterpart[]>("/counterparts").catch(() => [] as Counterpart[]);
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
        setLoadError(true);
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
      {/* Header — UX-07 paylaşılan PageHeader. */}
      <PageHeader
        title="Verecekler"
        subtitle="Açık (ödenmemiş) verecekler — kişi/firma bazlı özet"
        icon={HandCoins}
        iconClassName="bg-status-danger/15 border-status-danger/30 text-status-danger"
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-status-danger text-white v2-press text-sm font-semibold transition-all hover:opacity-90"
          >
            <Plus size={16} aria-hidden="true" />
            Verecek Ekle
          </button>
        }
      />

      {/* İşletme filtresi (salt-görüntü) — Alacaklar ile simetrik. */}
      {!loading && businesses.length > 1 && (
        <section className="flex items-center gap-2">
          <label className="text-xs text-[rgb(var(--v2-muted))] shrink-0">İşletme:</label>
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
                "v2-card p-3 text-left transition-colors",
                g.key === "_none"
                  ? "cursor-default opacity-80"
                  : "v2-lift hover:border-status-danger/40 cursor-pointer",
              )}
              title={g.key === "_none" ? undefined : `${g.name} vereceklerini göster`}
            >
              <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate" title={g.name}>{g.name}</p>
              <p className={cn("mt-0.5 text-sm font-semibold text-status-danger", censorCls)}>
                {maskAmount(g.total, censored, "TRY")}
              </p>
              <p className="text-[10px] text-[rgb(var(--v2-muted))]">{g.count} kişi/firma</p>
            </button>
          ))}
        </section>
      )}

      {loading ? (
        // UX-08: ilk yükleme = skeleton (spinner yerine).
        <ListSkeleton rows={6} />
      ) : loadError ? (
        // UX-08: ağ hatasını boş-durumdan ayır + tekrar dene.
        <ErrorState
          description="Verecekler yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin."
          onRetry={triggerRefresh}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Açık verecek yok"
          description={'Yukarıdaki "+ Verecek Ekle" butonu ile yeni bir verecek kaydı oluşturabilirsin.'}
          action={
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-status-danger text-white v2-press text-sm font-semibold transition-all hover:opacity-90"
            >
              <Plus size={16} aria-hidden="true" />
              Verecek Ekle
            </button>
          }
        />
      ) : visibleRows.length === 0 ? (
        // İşletme filtresi aktif ama bu işletmede açık verecek yok.
        <EmptyState
          icon={HandCoins}
          title="Bu işletmede açık verecek yok"
          action={
            <button
              onClick={() => setBusinessFilter(ALL_BUSINESSES)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl v2-sunken hover:border-accent/50 v2-press text-[rgb(var(--v2-ink))] text-sm font-semibold transition-colors"
            >
              Tüm İşletmeleri Göster
            </button>
          }
        />
      ) : (
        <>
          {/* Totals */}
          <section className="grid grid-cols-2 gap-3">
            <div className="v2-card p-4">
              <p className="v2-eyebrow text-[11px]">Toplam Verecek</p>
              <div className="mt-1 flex items-center gap-2">
                <p className={cn("text-2xl font-bold text-status-danger", censorCls)}>
                  {maskAmount(total, censored, "TRY")}
                </p>
                {/* Sansür toggle (privacy) — maskelenen tutarın hemen yanında. */}
                <button
                  onClick={toggleCensor}
                  aria-pressed={censored}
                  title={censored ? "Tutarları göster" : "Tutarları gizle"}
                  aria-label={censored ? "Tutarları göster" : "Tutarları gizle"}
                  className="v2-icon-btn v2-press shrink-0 w-8 h-8"
                >
                  {censored ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="v2-card p-4">
              <p className="v2-eyebrow text-[11px]">Açık Kayıt</p>
              <p className="mt-1 text-2xl font-bold text-[rgb(var(--v2-ink))]">{totalCount}</p>
              <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
                {visibleRows.length} farklı kişi/firma
              </p>
            </div>
          </section>

          {/* Sort chips + UX-10 Kart/Tablo toggle */}
          <section className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[rgb(var(--v2-muted))]">Sırala:</span>
              <div className="flex gap-2">
                {([
                  { v: "amount_desc", label: "Tutar (çok→az)" },
                  { v: "due_asc", label: "Vade (yakın→uzak)" },
                  { v: "name_asc", label: "İsim (A-Z)" },
                ] as { v: SortMode; label: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setSortMode(opt.v)}
                    aria-pressed={sortMode === opt.v}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                      sortMode === opt.v
                        ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                        : "v2-sunken text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          </section>

          {/* List — UX-10: viewMode'a göre kart-satır veya yoğun tablo. */}
          {viewMode === "table" ? (
            <section className="v2-card v2-table-wrap">
              <table className="v2-table">
                <thead>
                  <tr>
                    <th scope="col">Kişi / Firma</th>
                    <th scope="col">Son Vade</th>
                    <th scope="col" className="v2-td-num">Tutar</th>
                    <th scope="col" className="v2-td-num">Kayıt</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const key = r.counterpart_id || `name:${r.counterpart_name}`;
                    const href = r.counterpart_id ? `/dashboard/counterparts/${r.counterpart_id}` : null;
                    return (
                      <tr
                        key={key}
                        className={href ? "cursor-pointer" : ""}
                        onClick={href ? () => router.push(href) : undefined}
                      >
                        <td className="font-medium text-[rgb(var(--v2-ink))] max-w-[220px] truncate">
                          {r.counterpart_name || "Bilinmiyor"}
                        </td>
                        <td className="text-xs text-[rgb(var(--v2-muted))] whitespace-nowrap">
                          {r.last_due_date
                            ? new Date(r.last_due_date).toLocaleDateString("tr-TR", {
                                day: "2-digit", month: "2-digit", year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className={cn("num v2-td-num font-semibold text-status-danger whitespace-nowrap", censorCls)}>
                          {maskAmount(r.total_amount, censored, r.currency)}
                        </td>
                        <td className="num v2-td-num text-[rgb(var(--v2-muted))]">{r.count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ) : (
          <section className="v2-card divide-y divide-[rgb(var(--v2-border))]">
            {sorted.map((r) => {
              const key = r.counterpart_id || `name:${r.counterpart_name}`;
              const href = r.counterpart_id ? `/dashboard/counterparts/${r.counterpart_id}` : null;
              const Inner = (
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[rgb(var(--v2-ink))] truncate">
                      {r.counterpart_name || "Bilinmiyor"}
                    </p>
                    {r.last_due_date && (
                      <p className="mt-1.5 text-[11px] text-[rgb(var(--v2-muted))] flex items-center gap-1">
                        <CalendarClock size={11} />
                        Son vade: {new Date(r.last_due_date).toLocaleDateString("tr-TR", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-base font-semibold text-status-danger", censorCls)}>
                      {maskAmount(r.total_amount, censored, r.currency)}
                    </p>
                    <p className="text-[11px] text-[rgb(var(--v2-muted))]">{r.count} kayıt</p>
                  </div>
                </div>
              );
              return href ? (
                <Link key={key} href={href} className="block transition-colors hover:bg-[rgb(var(--v2-sunken))]">
                  {Inner}
                </Link>
              ) : (
                <div key={key}>{Inner}</div>
              );
            })}
          </section>
          )}
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
