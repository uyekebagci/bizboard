"use client";

/**
 * v1.6.6: Alacaklar sayfası — counterpart bazlı açık (settled=false) RECEIVABLE özeti.
 *
 * Veri: GET /api/receivables (v1.6.5)
 *
 * Sütunlar: Kişi/Firma, Tutar (₺), Tip(ler), Vade.
 * Default sıralama: tutar DESC (backend zaten DESC döner; client ayrıca sort opsiyonu sağlar).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HandCoins, Plus, CalendarClock, Eye, EyeOff,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency, maskAmount, cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { ReceivableAggregate, ReceivableTypeBreakdown, Counterpart, Business } from "@/types";
import { CounterpartDebtModal } from "@/components/debts/CounterpartDebtModal";
import { FreetextDebtDetailModal } from "@/components/debts/FreetextDebtDetailModal";
import { NotesModule } from "@/components/business/NotesModule";
import { ExchangeRateBar } from "@/components/debts/ExchangeRateBar";
import { CurrencyEquivalentLine } from "@/components/debts/CurrencyEquivalentLine";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { useExchangeRates } from "@/hooks/useExchangeRates";

type SortMode = "amount_desc" | "due_asc" | "name_asc";
type TabMode = "all" | "overdue";

/** Bugünün başlangıcı (saat 00:00:00) — gecikme hesabı için. */
function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Son vade geçmiş mi? (last_due_date < bugün && last_due_date mevcut) */
function isOverdue(r: ReceivableAggregate): boolean {
  if (!r.last_due_date) return false;
  return new Date(r.last_due_date) < todayStart();
}

/** Kaç gün gecikmiş (tamsayı, >= 1). last_due_date mevcut + geçmiş ise döner. */
function overdueDays(r: ReceivableAggregate): number | null {
  if (!r.last_due_date) return null;
  const diff = todayStart().getTime() - new Date(r.last_due_date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return days >= 1 ? days : null;
}

/**
 * İşletme filtresi (salt-görüntü): "ALL" = tüm erişilebilir işletmeler (mevcut
 * konsolide görünüm), aksi takdirde tek bir işletmenin business_id'si. Filtre
 * counterpart.business_id eşleşmesiyle yapılır — yeni endpoint/hesap yok.
 */
const ALL_BUSINESSES = "ALL";

/**
 * Aggregate satırına eklediğimiz tenant bilgisi. ReceivableAggregate'in kendisi
 * business_id taşımadığından, counterpart_id → Counterpart.business_id eşlemesiyle
 * çözülür. Legacy free-text satırlar (counterpart_id yok) çözülemez → sadece
 * "Tüm İşletmeler" görünümünde listelenir.
 */
type ScopedReceivable = ReceivableAggregate & { _business_id: string | null };

export default function AlacaklarPage() {
  const router = useRouter();
  const { refreshKey, triggerRefresh } = useAppStore();
  const [rows, setRows] = useState<ScopedReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  // UX-08: ağ hatasını sessiz yutma yerine kullanıcıya göster + tekrar dene.
  const [loadError, setLoadError] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("amount_desc");
  // Sekme: "Tümü" | "Vadesi Geçen"
  const [tabMode, setTabMode] = useState<TabMode>("all");
  // UX-10: Kart/Tablo görünüm tercihi (localStorage'da kalıcı).
  const { mode: viewMode, setMode: setViewMode } = useViewMode("alacaklar", "card");
  // İşletme filtresi (salt-görüntü). "ALL" → konsolide; aksi → tek işletme.
  const [businessFilter, setBusinessFilter] = useState<string>(ALL_BUSINESSES);
  // v1.7.x (UI Fix WP TODO 2c83bc5c): + Alacak Ekle modal
  const [showAddModal, setShowAddModal] = useState(false);
  // counterpart_id olmayan satırlar: tıklanınca detay+sil modalı aç.
  const [freetextRow, setFreetextRow] = useState<string | null>(null);
  // Sansür (privacy): göz ikonu ile tutarları blur'la. localStorage persist, default GÖRÜNÜR.
  const [censored, setCensored] = useState(false);
  useEffect(() => {
    try { setCensored(localStorage.getItem("cati-alacaklar-censor") === "1"); } catch { /* ignore */ }
  }, []);
  function toggleCensor() {
    setCensored((prev) => {
      const next = !prev;
      try { localStorage.setItem("cati-alacaklar-censor", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }
  // Sansürlüyken kopyalamayı da engelle (maskeli `*` zaten gerçek değeri taşımaz).
  const censorCls = censored ? "select-none" : "";
  // WP a9da4e9d: Alacaklar sayfasına notlar — businessId resolve (tek işletme
  // ise direkt; çoklu ise selector). DGR tek işletme → selector görünmez.
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [notesBusinessId, setNotesBusinessId] = useState<string>("");

  useEffect(() => {
    async function load() {
      setLoadError(false);
      try {
        // v1.7.x net-balance fix:
        // /receivables gross RECEIVABLE breakdown verir; ama counterpart'ta
        // karşı PAYABLE varsa karşılıklı net'leme gerekli. Counterpart entity'sinin
        // current_balance'ı zaten net (R − P) tutuyor; onu otoritatif kabul edip
        // total_amount'u override ediyoruz. Net <= 0 olan counterpart'lar burada
        // gözükmez (artık Verecekler tarafında).
        // UX-08: ana veri (/receivables) başarısız olursa hata-state; counterparts
        // yalnız net'leme/işletme eşlemesi için yardımcı (boş düşse de liste çalışır).
        const recvRes = await api.get<ReceivableAggregate[]>("/receivables")
          .then((r) => ({ ok: true as const, data: r || [] }))
          .catch((e) => ({ ok: false as const, error: e }));
        if (!recvRes.ok) {
          logger.error("api", "Receivables fetch failed", undefined, recvRes.error);
          setRows([]);
          setLoadError(true);
          return;
        }
        const recv = recvRes.data;
        const allCps = await api.get<Counterpart[]>("/counterparts").catch(() => [] as Counterpart[]);
        const balanceById = new Map<string, number>();
        // counterpart_id → business_id eşlemesi (işletme filtresi için, salt-görüntü).
        const businessById = new Map<string, string | null>();
        for (const c of (allCps || [])) {
          balanceById.set(c.id, c.current_balance ?? 0);
          businessById.set(c.id, c.business_id ?? null);
        }

        const netted: ScopedReceivable[] = [];
        for (const r of (recv || [])) {
          const net = r.counterpart_id ? (balanceById.get(r.counterpart_id) ?? r.total_amount) : r.total_amount;
          if (net > 0) {
            netted.push({
              ...r,
              total_amount: net,
              _business_id: r.counterpart_id ? (businessById.get(r.counterpart_id) ?? null) : null,
            });
          }
        }
        setRows(netted);
      } catch (err) {
        logger.error("api", "Receivables fetch failed", undefined, err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  // WP a9da4e9d: notlar için işletme listesi (tek ise auto-select).
  useEffect(() => {
    api.get<Business[]>("/businesses")
      .then((r) => {
        const list = r || [];
        setBusinesses(list);
        if (list.length >= 1) setNotesBusinessId((prev) => prev || list[0].id);
      })
      .catch(() => { /* sessiz — notlar bölümü görünmez */ });
  }, []);

  // İşletme filtresi (salt-görüntü): "ALL" → tüm satırlar; aksi → yalnız seçilen
  // işletmeye ait counterpart'lardan gelenler. Legacy free-text satırlar
  // (_business_id === null) tek-işletme görünümünde gizlenir (sızıntı önleme +
  // yanlış atıf önleme).
  const visibleRows = useMemo(() => {
    if (businessFilter === ALL_BUSINESSES) return rows;
    return rows.filter((r) => r._business_id === businessFilter);
  }, [rows, businessFilter]);

  const total = visibleRows.reduce((a, r) => a + (r.total_amount || 0), 0);
  const totalCount = visibleRows.reduce((a, r) => a + (r.count || 0), 0);

  // Vadesi geçen satırlar (sadece son_vade < bugün olanlar).
  const overdueRows = useMemo(() => visibleRows.filter(isOverdue), [visibleRows]);
  const overdueTotal = overdueRows.reduce((a, r) => a + (r.total_amount || 0), 0);

  // Aktif sekmeye göre hangi satırlar gösterilecek.
  const tabRows = tabMode === "overdue" ? overdueRows : visibleRows;

  // WP currency-display: TL toplamın USD + gram altın karşılığı için güncel kur.
  const { usdRate, goldRate } = useExchangeRates();

  // İşletme başına alacak özeti (breakdown) — yalnız "Tüm İşletmeler" + >1 işletme
  // varken anlamlı. Salt-görüntü: mevcut net tutarları işletmeye göre toplar.
  const businessBreakdown = useMemo(() => {
    if (businessFilter !== ALL_BUSINESSES || businesses.length <= 1) return null;
    const nameById = new Map(businesses.map((b) => [b.id, b.name]));
    const sums = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const key = r._business_id ?? "_none";
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
    const out = [...tabRows];
    // Vadesi Geçen sekmesinde: en çok geciken üstte (en eski vade = en büyük gecikme).
    if (tabMode === "overdue") {
      out.sort((a, b) => {
        const ax = a.last_due_date ? new Date(a.last_due_date).getTime() : Number.POSITIVE_INFINITY;
        const bx = b.last_due_date ? new Date(b.last_due_date).getTime() : Number.POSITIVE_INFINITY;
        return ax - bx; // en eski vade (en küçük timestamp) → en çok gecikmiş → üste
      });
      return out;
    }
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
  }, [tabRows, sortMode, tabMode]);

  return (
    <div className="space-y-5 pb-24">
      {/* Header — UX-07 paylaşılan PageHeader. */}
      <PageHeader
        title="Alacaklar"
        subtitle="Açık (tahsil edilmemiş) alacakların kişi bazlı özeti"
        icon={HandCoins}
        iconClassName="bg-status-warning/15 border-status-warning/30 text-status-warning"
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="v2-btn v2-btn--ink v2-press flex items-center gap-1.5 text-sm"
          >
            <Plus size={16} aria-hidden="true" />
            Alacak Ekle
          </button>
        }
      />

      {/* WP a9da4e9d (USD+Altın): güncel kur + "Anlık Güncelle". */}
      <ExchangeRateBar onRefreshed={triggerRefresh} />

      {/* İşletme filtresi (salt-görüntü) — yalnız >1 işletme varken anlamlı.
          Counterparts sayfasıyla aynı desen: DarkSelect + "Tüm İşletmeler". */}
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

      {/* İşletme başına özet (breakdown) — "Tüm İşletmeler" görünümünde,
          her işletmenin açık alacak toplamını gösterir. Tıklanınca o işletmeye
          filtreler. Salt-görüntü. */}
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
                  : "v2-lift hover:border-status-warning/40 cursor-pointer",
              )}
              title={g.key === "_none" ? undefined : `${g.name} alacaklarını göster`}
            >
              <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate" title={g.name}>{g.name}</p>
              <p className={cn("mt-0.5 text-sm font-semibold text-status-warning", censorCls)}>
                {maskAmount(g.total, censored, "TRY")}
              </p>
              <p className="text-[10px] text-[rgb(var(--v2-muted))]">{g.count} kişi/firma</p>
            </button>
          ))}
        </section>
      )}

      {/* Sekme: Tümü | Vadesi Geçen — yalnız veri yüklenince göster. */}
      {!loading && !loadError && rows.length > 0 && (
        <section className="flex items-center gap-2">
          {([
            { v: "all" as TabMode, label: "Tümü" },
            { v: "overdue" as TabMode, label: "Vadesi Geçen" },
          ]).map((tab) => {
            const isActive = tabMode === tab.v;
            const badgeCount = tab.v === "overdue" ? overdueRows.length : visibleRows.length;
            const badgeTotal = tab.v === "overdue" ? overdueTotal : total;
            const hasOverdue = tab.v === "overdue" && overdueRows.length > 0;
            return (
              <button
                key={tab.v}
                type="button"
                onClick={() => setTabMode(tab.v)}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  isActive
                    ? tab.v === "overdue" && hasOverdue
                      ? "bg-status-danger/16 text-status-danger font-semibold"
                      : "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                    : "v2-sunken text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
                )}
              >
                <span>{tab.label}</span>
                {badgeCount > 0 ? (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    tab.v === "overdue" && hasOverdue
                      ? isActive
                        ? "bg-status-danger/20 text-status-danger"
                        : "bg-status-danger/12 text-status-danger"
                      : isActive
                        ? "bg-accent/20 text-accent-strong dark:text-accent"
                        : "bg-[rgb(var(--v2-border))] text-[rgb(var(--v2-muted))]",
                  )}>
                    {badgeCount}
                    {tab.v === "overdue" && (
                      <span className={censorCls}> · {maskAmount(badgeTotal, censored, "TRY")}</span>
                    )}
                  </span>
                ) : tab.v === "overdue" ? (
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] bg-[rgb(var(--v2-border))] text-[rgb(var(--v2-muted))]">0</span>
                ) : null}
              </button>
            );
          })}
        </section>
      )}

      {loading ? (
        // UX-08: ilk yükleme = skeleton (spinner yerine).
        <ListSkeleton rows={6} />
      ) : loadError ? (
        // UX-08: ağ hatasını boş-durumdan ayır + tekrar dene.
        <ErrorState
          description="Alacaklar yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin."
          onRetry={triggerRefresh}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Açık alacağınız yok"
          description={'Yukarıdaki "+ Alacak Ekle" butonu ile yeni bir alacak kaydı oluşturabilirsiniz.'}
          action={
            <button
              onClick={() => setShowAddModal(true)}
              className="v2-btn v2-btn--ink v2-press inline-flex items-center gap-1.5 text-sm"
            >
              <Plus size={16} aria-hidden="true" />
              Alacak Ekle
            </button>
          }
        />
      ) : visibleRows.length === 0 ? (
        // İşletme filtresi aktif ama seçilen işletmede açık alacak yok.
        // Selector yukarıda görünür kalır; kullanıcı başka işletme seçebilir.
        <EmptyState
          icon={HandCoins}
          title="Bu işletmede açık alacak yok"
          action={
            <button
              onClick={() => setBusinessFilter(ALL_BUSINESSES)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl v2-sunken hover:border-accent/50 v2-press text-[rgb(var(--v2-ink))] text-sm font-semibold transition-colors"
            >
              Tüm İşletmeleri Göster
            </button>
          }
        />
      ) : tabMode === "overdue" && overdueRows.length === 0 ? (
        // Vadesi Geçen sekmesi açık ama gecikmiş alacak yok.
        <EmptyState
          icon={CalendarClock}
          title="Vadesi geçen alacak yok"
          description="Tüm açık alacakların son vadesi henüz geçmemiş."
          action={
            <button
              onClick={() => setTabMode("all")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl v2-sunken hover:border-accent/50 v2-press text-[rgb(var(--v2-ink))] text-sm font-semibold transition-colors"
            >
              Tümünü Göster
            </button>
          }
        />
      ) : (
        // UI: lg+ iki kolon — SOL toplam+liste, SAĞ notlar (sticky, kendi içinde scroll).
        // <lg tek kolon: notlar listenin altına iner (DOM sırası: sol → sağ).
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
          {/* SOL kolon: toplamlar + sıralama + borç listesi */}
          <div className="space-y-5 min-w-0">
            {/* Totals */}
            <section className="grid grid-cols-2 gap-3">
              <div className="v2-card p-4">
                <p className="v2-eyebrow text-[11px]">Toplam Alacak</p>
                <div className="mt-1 flex items-center gap-2">
                  {/* Ek istek: alacaklı (pozitif) → accent; 0 → nötr; negatif → danger.
                      İşaret-bazlı renk, çift tema uyumlu (accent/danger hem dark hem light okunaklı). */}
                  <p className={cn(
                    "text-2xl font-bold",
                    total > 0 ? "text-accent-strong dark:text-accent"
                      : total < 0 ? "text-status-danger"
                      : "text-[rgb(var(--v2-ink))]",
                    censorCls,
                  )}>
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
                {/* WP currency-display: TL toplamın altında USD + gram altın karşılığı. */}
                <CurrencyEquivalentLine
                  tryTotal={Math.abs(total)}
                  usdRate={usdRate}
                  goldRate={goldRate}
                  censored={censored}
                />
              </div>
              <div className="v2-card p-4">
                <p className="v2-eyebrow text-[11px]">Açık Kayıt</p>
                <p className="mt-1 text-2xl font-bold text-[rgb(var(--v2-ink))]">
                  {totalCount}
                </p>
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
                      <th scope="col">Tip</th>
                      <th scope="col">Son Vade</th>
                      <th scope="col" className="v2-td-num">Tutar</th>
                      <th scope="col" className="v2-td-num">Kayit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => {
                      const key = r.counterpart_id || `name:${r.counterpart_name}`;
                      const href = r.counterpart_id ? `/dashboard/counterparts/${r.counterpart_id}` : null;
                      const rowCls = href || !r.counterpart_id ? "cursor-pointer hover:bg-[rgb(var(--v2-sunken))]" : "";
                      return (
                        <tr
                          key={key}
                          className={rowCls}
                          onClick={
                            href
                              ? () => router.push(href)
                              : !r.counterpart_id
                              ? () => setFreetextRow(r.counterpart_name)
                              : undefined
                          }
                        >
                          <td className="font-medium text-[rgb(var(--v2-ink))] max-w-[200px] truncate">
                            {r.counterpart_name || "Bilinmiyor"}
                          </td>
                          <td className="text-xs text-[rgb(var(--v2-muted))] max-w-[160px] truncate">
                            {r.receivable_types.map((b) => b.label || b.type).join(", ") || "—"}
                          </td>
                          <td className="text-xs text-[rgb(var(--v2-muted))] whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span>
                                {r.last_due_date
                                  ? new Date(r.last_due_date).toLocaleDateString("tr-TR", {
                                      day: "2-digit", month: "2-digit", year: "numeric",
                                    })
                                  : "—"}
                              </span>
                              {overdueDays(r) !== null && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-status-danger/12 text-status-danger border border-status-danger/25 w-fit">
                                  {overdueDays(r)} gün gecikti
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={cn("num v2-td-num font-semibold text-status-warning whitespace-nowrap", censorCls)}>
                            {maskAmount(r.total_amount, censored, "TRY")}
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
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {r.receivable_types.map((b, i) => (
                          <TypeBadge key={`${b.type}-${i}`} breakdown={b} currency={r.currency} censored={censored} />
                        ))}
                      </div>
                      {r.last_due_date && (
                        <p className="mt-1.5 text-[11px] text-[rgb(var(--v2-muted))] flex items-center gap-1">
                          <CalendarClock size={11} />
                          Son vade: {new Date(r.last_due_date).toLocaleDateString("tr-TR", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </p>
                      )}
                      {overdueDays(r) !== null && (
                        <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-status-danger/12 text-status-danger border border-status-danger/25">
                          {overdueDays(r)} gün gecikti
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {/* total_amount güncel TL net toplam → her zaman ₺ (USD sembolü bug fix). */}
                      <p className={cn("text-base font-semibold text-status-warning", censorCls)}>
                        {maskAmount(r.total_amount, censored, "TRY")}
                      </p>
                      <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                        {r.count} kayıt
                      </p>
                    </div>
                  </div>
                );
                return href ? (
                  <Link key={key} href={href} className="block transition-colors hover:bg-[rgb(var(--v2-sunken))]">
                    {Inner}
                  </Link>
                ) : (
                  <button
                    key={key}
                    type="button"
                    className="w-full text-left transition-colors hover:bg-[rgb(var(--v2-sunken))]"
                    onClick={() => setFreetextRow(r.counterpart_name)}
                    title="Kayıtları görüntüle / sil"
                  >
                    {Inner}
                  </button>
                );
              })}
            </section>
            )}
          </div>

          {/* SAĞ kolon: Alacaklara ÖZEL notlar (scope=RECEIVABLES). lg+ sticky +
              kendi içinde scroll → ne kadar not olursa olsun sayfa aşağı uzamaz.
              DGR tek işletme → seçici gizli; çoklu işletmede basit seçici. */}
          {notesBusinessId && (
            <section className="space-y-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto no-scrollbar">
              {businesses.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[rgb(var(--v2-muted))]">Notlar — İşletme:</label>
                  <select
                    value={notesBusinessId}
                    onChange={(e) => setNotesBusinessId(e.target.value)}
                    className="w-auto py-1.5 px-3 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-sm text-[rgb(var(--v2-ink))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <NotesModule businessId={notesBusinessId} scope="RECEIVABLES" />
            </section>
          )}
        </div>
      )}

      {/* v1.7.x (UI Fix WP TODO 2c83bc5c): + Alacak Ekle modal */}
      {showAddModal && (
        <CounterpartDebtModal
          direction="RECEIVABLE"
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* counterpart_id olmayan satır detay + sil modalı */}
      {freetextRow && (
        <FreetextDebtDetailModal
          counterpartName={freetextRow}
          onClose={() => setFreetextRow(null)}
        />
      )}
    </div>
  );
}

function TypeBadge({
  breakdown,
  currency,
  censored,
}: {
  breakdown: ReceivableTypeBreakdown;
  currency: string;
  censored?: boolean;
}) {
  const labelMap: Record<string, string> = {
    SENET: "Senet",
    CEK: "Çek",
    ALTIN: "Altın",
    NAKIT: "Nakit",
    DIGER: breakdown.label || "Diğer",
    UNSPECIFIED: "Belirtilmemiş",
  };
  const colorMap: Record<string, string> = {
    SENET: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    CEK: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    ALTIN: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    NAKIT: "bg-accent/15 text-accent-strong dark:text-accent border-accent/30",
    DIGER: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    UNSPECIFIED: "v2-sunken text-[rgb(var(--v2-muted))]",
  };
  const cls = colorMap[breakdown.type] || colorMap.UNSPECIFIED;
  const label = labelMap[breakdown.type] || breakdown.type;
  // breakdown.amount güncel TL toplam → her zaman ₺ (USD sembolü bug fix).
  void currency;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}
      title={censored ? label : `${label}: ${formatCurrency(breakdown.amount, "TRY")} (${breakdown.count} kayıt)`}
    >
      <span>{label}</span>
      <span className="opacity-70">·</span>
      <span className={censored ? "select-none" : ""}>{maskAmount(breakdown.amount, !!censored, "TRY")}</span>
    </span>
  );
}
