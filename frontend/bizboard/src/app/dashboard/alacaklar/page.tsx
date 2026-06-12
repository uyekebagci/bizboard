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
  ArrowLeft, Loader2, HandCoins, Plus, CalendarClock, Eye, EyeOff,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency, maskAmount, cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { ReceivableAggregate, ReceivableTypeBreakdown, Counterpart, Business } from "@/types";
import { CounterpartDebtModal } from "@/components/debts/CounterpartDebtModal";
import { NotesModule } from "@/components/business/NotesModule";
import { ExchangeRateBar } from "@/components/debts/ExchangeRateBar";
import { CurrencyEquivalentLine } from "@/components/debts/CurrencyEquivalentLine";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { useExchangeRates } from "@/hooks/useExchangeRates";

type SortMode = "amount_desc" | "due_asc" | "name_asc";

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
  const [sortMode, setSortMode] = useState<SortMode>("amount_desc");
  // İşletme filtresi (salt-görüntü). "ALL" → konsolide; aksi → tek işletme.
  const [businessFilter, setBusinessFilter] = useState<string>(ALL_BUSINESSES);
  // v1.7.x (UI Fix WP TODO 2c83bc5c): + Alacak Ekle modal
  const [showAddModal, setShowAddModal] = useState(false);
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
      try {
        // v1.7.x net-balance fix:
        // /receivables gross RECEIVABLE breakdown verir; ama counterpart'ta
        // karşı PAYABLE varsa karşılıklı net'leme gerekli. Counterpart entity'sinin
        // current_balance'ı zaten net (R − P) tutuyor; onu otoritatif kabul edip
        // total_amount'u override ediyoruz. Net <= 0 olan counterpart'lar burada
        // gözükmez (artık Verecekler tarafında).
        const [recv, allCps] = await Promise.all([
          api.get<ReceivableAggregate[]>("/receivables").catch(() => [] as ReceivableAggregate[]),
          api.get<Counterpart[]>("/counterparts").catch(() => [] as Counterpart[]),
        ]);
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
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <HandCoins size={20} className="text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-100">Alacaklar</h1>
            <p className="text-xs text-surface-400">
              Acik (tahsil edilmemis) alacaklarin kisi bazli ozeti
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
        >
          <Plus size={16} />
          Alacak Ekle
        </button>
      </div>

      {/* WP a9da4e9d (USD+Altın): güncel kur + "Anlık Güncelle". */}
      <ExchangeRateBar onRefreshed={triggerRefresh} />

      {/* İşletme filtresi (salt-görüntü) — yalnız >1 işletme varken anlamlı.
          Counterparts sayfasıyla aynı desen: DarkSelect + "Tüm İşletmeler". */}
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
                "glass-card p-3 text-left transition-colors",
                g.key === "_none"
                  ? "cursor-default opacity-80"
                  : "hover:border-amber-500/40 cursor-pointer",
              )}
              title={g.key === "_none" ? undefined : `${g.name} alacaklarını göster`}
            >
              <p className="text-[11px] text-surface-400 truncate" title={g.name}>{g.name}</p>
              <p className={cn("mt-0.5 text-sm font-semibold text-amber-300", censorCls)}>
                {maskAmount(g.total, censored, "TRY")}
              </p>
              <p className="text-[10px] text-surface-400">{g.count} kişi/firma</p>
            </button>
          ))}
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-amber-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <HandCoins size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Acik alacaginiz yok</p>
          <p className="text-surface-400 text-sm mt-1">
            Yukaridaki &quot;+ Alacak Ekle&quot; butonu ile yeni bir alacak kaydi olusturabilirsiniz.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
          >
            <Plus size={16} />
            Alacak Ekle
          </button>
        </div>
      ) : visibleRows.length === 0 ? (
        // İşletme filtresi aktif ama seçilen işletmede açık alacak yok.
        // Selector yukarıda görünür kalır; kullanıcı başka işletme seçebilir.
        <div className="glass-card p-8 text-center">
          <HandCoins size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Bu işletmede açık alacak yok</p>
          <button
            onClick={() => setBusinessFilter(ALL_BUSINESSES)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-semibold"
          >
            Tüm İşletmeleri Göster
          </button>
        </div>
      ) : (
        // UI: lg+ iki kolon — SOL toplam+liste, SAĞ notlar (sticky, kendi içinde scroll).
        // <lg tek kolon: notlar listenin altına iner (DOM sırası: sol → sağ).
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
          {/* SOL kolon: toplamlar + sıralama + borç listesi */}
          <div className="space-y-5 min-w-0">
            {/* Totals */}
            <section className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4">
                <p className="text-[11px] text-surface-400 uppercase tracking-wider">Toplam Alacak</p>
                <div className="mt-1 flex items-center gap-2">
                  {/* Ek istek: alacaklı (pozitif) → yeşil; 0 → nötr; negatif → uyarı (kırmızı).
                      İşaret-bazlı renk, çift tema uyumlu (emerald/red-300 hem dark hem light okunaklı). */}
                  <p className={cn(
                    "text-2xl font-bold",
                    total > 0 ? "text-emerald-400"
                      : total < 0 ? "text-red-400"
                      : "text-surface-200",
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
                    className="shrink-0 p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300 hover:text-surface-100 transition-colors"
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
              <div className="glass-card p-4">
                <p className="text-[11px] text-surface-400 uppercase tracking-wider">Acik Kayit</p>
                <p className="mt-1 text-2xl font-bold text-surface-100">
                  {totalCount}
                </p>
                <p className="text-[11px] text-surface-400 mt-0.5">
                  {visibleRows.length} farkli kisi/firma
                </p>
              </div>
            </section>

            {/* Sort chips */}
            <section className="flex items-center justify-between gap-2">
              <span className="text-xs text-surface-400">Sirala:</span>
              <div className="flex gap-2">
                {([
                  { v: "amount_desc", label: "Tutar (cok→az)" },
                  { v: "due_asc", label: "Vade (yakin→uzak)" },
                  { v: "name_asc", label: "Isim (A-Z)" },
                ] as { v: SortMode; label: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setSortMode(opt.v)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      sortMode === opt.v
                        ? "bg-amber-500/20 border-amber-400 text-amber-200"
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
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {r.receivable_types.map((b, i) => (
                          <TypeBadge key={`${b.type}-${i}`} breakdown={b} currency={r.currency} censored={censored} />
                        ))}
                      </div>
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
                      {/* total_amount güncel TL net toplam → her zaman ₺ (USD sembolü bug fix). */}
                      <p className={cn("text-base font-semibold text-amber-300", censorCls)}>
                        {maskAmount(r.total_amount, censored, "TRY")}
                      </p>
                      <p className="text-[11px] text-surface-400">
                        {r.count} kayit
                      </p>
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
          </div>

          {/* SAĞ kolon: Alacaklara ÖZEL notlar (scope=RECEIVABLES). lg+ sticky +
              kendi içinde scroll → ne kadar not olursa olsun sayfa aşağı uzamaz.
              DGR tek işletme → seçici gizli; çoklu işletmede basit seçici. */}
          {notesBusinessId && (
            <section className="space-y-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto no-scrollbar">
              {businesses.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-surface-400">Notlar — İşletme:</label>
                  <select
                    value={notesBusinessId}
                    onChange={(e) => setNotesBusinessId(e.target.value)}
                    className="field-sm py-1.5 w-auto"
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
    CEK: "Cek",
    ALTIN: "Altin",
    NAKIT: "Nakit",
    DIGER: breakdown.label || "Diger",
    UNSPECIFIED: "Belirtilmemis",
  };
  const colorMap: Record<string, string> = {
    SENET: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    CEK: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    ALTIN: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    NAKIT: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    DIGER: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    UNSPECIFIED: "bg-surface-600 text-surface-300 border-surface-500",
  };
  const cls = colorMap[breakdown.type] || colorMap.UNSPECIFIED;
  const label = labelMap[breakdown.type] || breakdown.type;
  // breakdown.amount güncel TL toplam → her zaman ₺ (USD sembolü bug fix).
  void currency;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}
      title={censored ? label : `${label}: ${formatCurrency(breakdown.amount, "TRY")} (${breakdown.count} kayit)`}
    >
      <span>{label}</span>
      <span className="opacity-70">·</span>
      <span className={censored ? "select-none" : ""}>{maskAmount(breakdown.amount, !!censored, "TRY")}</span>
    </span>
  );
}
