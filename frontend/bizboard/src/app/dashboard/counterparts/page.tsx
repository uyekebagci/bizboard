"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Pencil, Trash2, X, Search, ArrowRight,
  CircleUserRound, Package, RefreshCw, Loader2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/errors";
import { isValidTaxId } from "@/lib/taxId";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { Counterpart, CounterpartRole, Business } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { CurrencyEquivalentLine } from "@/components/debts/CurrencyEquivalentLine";
import { InfiniteScrollSentinel } from "@/components/shared/InfiniteScrollSentinel";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/shared/Skeleton";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useAppStore } from "@/lib/store";

const PAGE_SIZE = 40;

// ── Role helpers ─────────────────────────────────────────
const ROLES: { value: CounterpartRole; label: string; badge: string; icon: typeof CircleUserRound }[] = [
  { value: "CUSTOMER", label: "Müşteri", badge: "bg-accent/15 text-accent-strong dark:text-accent", icon: CircleUserRound },
  { value: "SUPPLIER", label: "Tedarikçi", badge: "bg-accent/15 text-accent-strong dark:text-accent", icon: Package },
  { value: "BOTH", label: "Her ikisi", badge: "bg-status-warning/15 text-status-warning", icon: RefreshCw },
  { value: "OTHER", label: "Diğer", badge: "bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))]", icon: Users },
];

function roleMeta(r: CounterpartRole) {
  return ROLES.find((x) => x.value === r) ?? ROLES[3];
}

interface FormState {
  name: string;
  tax_id: string;
  tax_office: string;
  role: CounterpartRole;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  payment_terms_days: string; // string form input; number'a parse'lanır
  notes: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    tax_id: "",
    tax_office: "",
    role: "CUSTOMER",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    address: "",
    payment_terms_days: "0",
    notes: "",
  };
}

function formFromCp(c: Counterpart): FormState {
  return {
    name: c.name,
    tax_id: c.tax_id ?? "",
    tax_office: c.tax_office ?? "",
    role: c.role,
    contact_name: c.contact_name ?? "",
    contact_phone: c.contact_phone ?? "",
    contact_email: c.contact_email ?? "",
    address: c.address ?? "",
    payment_terms_days: String(c.payment_terms_days ?? 0),
    notes: c.notes ?? "",
  };
}

export default function CounterpartsPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<CounterpartRole | "ALL">("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Counterpart | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Counterpart | null>(null);

  // v1.7.x bug-fix: counterpart create için business_id zorunlu (backend).
  // Sayfa açılırken kullanıcının erişebildiği business'ları çek; tek varsa
  // otomatik seç, çoksa modal'da dropdown göster.
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("");

  // v1.7.x: business filter + grup görünümü (default: birden fazla business
  // varsa business-bazlı gruplama, tek varsa düz liste).
  const [businessFilter, setBusinessFilter] = useState<string>("ALL");
  const [groupBy, setGroupBy] = useState<"business" | "none">("business");
  // UX-10: düz liste için Kart/Tablo görünüm tercihi (localStorage'da kalıcı).
  const { mode: viewMode, setMode: setViewMode } = useViewMode("counterparts", "card");

  // WP currency-display: güncel kur (USD + gram altın karşılığı) + "Kuru Güncelle".
  // Mevcut mekanizma (ExchangeRateBar ile aynı endpoint) — yeni mantık icat edilmez.
  const { triggerRefresh } = useAppStore();
  const { usdRate, goldRate, refreshing, onCooldown, refresh } = useExchangeRates();

  useEffect(() => {
    api.get<Business[]>("/businesses")
      .then((r) => {
        setBusinesses(r || []);
        if ((r || []).length === 1) setSelectedBusinessId(r[0].id);
        // Tek business varsa gruplama anlamsız
        if ((r || []).length <= 1) setGroupBy("none");
      })
      .catch(() => { /* silent */ });
  }, []);

  // PERF (perf/frontend-pagination): cari listesi artık server-pagination ile
  // sayfalı çekilir. role + businessFilter SERVER-SIDE param (BE DB'de uygular);
  // search CLIENT-SIDE (BE bu uçta desteklemiyor) — yüklenen sayfalar üzerinde.
  // businessFilter !== "ALL" → BE yalnız o işletmeyi döndürür (gruplama zaten
  // kapalı); "ALL" → tüm işletmeler sayfalı, gruplama yüklenen kayıtlar üzerinde.
  const {
    items: list,
    totalElements,
    loading,
    loadingMore,
    hasNext,
    loadMore,
    error: pageError,
    reload: reloadList,
  } = usePaginatedList<Counterpart>(
    (page, size) => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("size", String(size));
      if (roleFilter !== "ALL") p.set("role", roleFilter);
      if (businessFilter !== "ALL") p.set("businessId", businessFilter);
      return `/counterparts?${p.toString()}`;
    },
    [roleFilter, businessFilter],
    { size: PAGE_SIZE, label: "Counterparts" },
  );

  async function fetchList() {
    reloadList();
  }

  const hasSearch = Boolean(search.trim());
  const filtered = useMemo(() => {
    // businessFilter artık server-side; burada yalnız client-side search.
    if (!hasSearch) return list;
    const q = search.toLocaleLowerCase("tr");
    return list.filter(
      (c) =>
        c.name.toLocaleLowerCase("tr").includes(q) ||
        (c.tax_id && c.tax_id.includes(search.trim()))
    );
  }, [list, search, hasSearch]);

  // WP currency-display: Cari Hesap toplam tutarı — net cari bakiyelerin toplamı
  // (filtreye saygı duyar). İşaretli: pozitif = net alacaklı, negatif = net borçlu.
  const netTotal = useMemo(
    () => filtered.reduce((a, c) => a + (c.current_balance ?? 0), 0),
    [filtered],
  );

  // v1.7.x: gruplama — businessId → counterpart[]
  const grouped = useMemo(() => {
    if (groupBy !== "business" || businessFilter !== "ALL") return null;
    const map = new Map<string, Counterpart[]>();
    for (const c of filtered) {
      const k = c.business_id || "_no_business";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    // Business sırası — businesses listesindeki sıra + bilinmeyen sona
    const ordered: Array<{ businessId: string; businessName: string; items: Counterpart[] }> = [];
    for (const b of businesses) {
      const items = map.get(b.id);
      if (items && items.length > 0) {
        ordered.push({ businessId: b.id, businessName: b.name, items });
      }
    }
    const noBiz = map.get("_no_business");
    if (noBiz && noBiz.length > 0) {
      ordered.push({ businessId: "_no_business", businessName: "İşletme bağlantısı yok", items: noBiz });
    }
    return ordered;
  }, [filtered, groupBy, businessFilter, businesses]);

  // Performans (perf/frontend-quickwins): kart artık React.memo'lu
  // `CounterpartCard` (dosya altında). Liste arama/filtre yazarken sık
  // re-render oluyor; stabil handler'lar + memo ile değişmeyen kartlar atlanır.
  // Handler'lar useCallback ile stabil referans alır (counterpart'ı geri verir).
  const handleOpen = useCallback(
    (c: Counterpart) => router.push(`/dashboard/counterparts/${c.id}`),
    [router],
  );
  const handleEdit = useCallback((c: Counterpart) => setEditing(c), []);
  const handleDeleteConfirm = useCallback((c: Counterpart) => setDeleteConfirm(c), []);

  // v1.7.x: hem grouped hem flat list aynı card markup'ını kullansın
  const renderCard = useCallback(
    (c: Counterpart) => (
      <CounterpartCard
        key={c.id}
        counterpart={c}
        onOpen={handleOpen}
        onEdit={handleEdit}
        onDelete={handleDeleteConfirm}
      />
    ),
    [handleOpen, handleEdit, handleDeleteConfirm],
  );

  async function handleDelete(id: string) {
    try {
      await api.delete(`/counterparts/${id}`);
      toast.info("Cari silindi");
      setDeleteConfirm(null);
      fetchList();
    } catch (e) {
      // 409 mesajını göster — silinmedi
      setError(getErrorMessage(e));
      setDeleteConfirm(null);
      toast.error(e);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header — UX-07 paylaşılan PageHeader. */}
      <PageHeader
        title="Karşı Firmalar"
        subtitle="Müşteri, tedarikçi ve diğer dış paydaşların cari hesabı"
        icon={Users}
        size="lg"
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="v2-btn v2-btn--ink v2-press text-sm shrink-0"
          >
            <Plus size={16} aria-hidden="true" />
            Yeni
          </button>
        }
      />

      {(error || pageError) && (
        <div className="p-4 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">
          {error || pageError}
        </div>
      )}

      {/* WP currency-display: Cari toplam + USD/gram-altın karşılığı + Kuru Güncelle.
          Toplam tutarın ALTINA daha küçük fontla karşılıklar (alacaklar deseniyle aynı). */}
      {!loading && filtered.length > 0 && (
        <section className="v2-card p-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="v2-eyebrow">
              {netTotal >= 0 ? "Toplam Net Alacak" : "Toplam Net Verecek"}
              {hasNext && <span className="text-[rgb(var(--v2-muted))]/70 normal-case"> (yüklenen)</span>}
            </p>
            {/* İşaret-bazlı renk: pozitif (alacaklı) → yeşil; 0 → nötr; negatif → uyarı. */}
            <p className={cn(
              "num mt-1 text-2xl font-bold",
              netTotal > 0 ? "text-accent-strong dark:text-accent"
                : netTotal < 0 ? "text-status-danger"
                : "text-[rgb(var(--v2-ink))]",
            )}>
              {formatCurrency(Math.abs(netTotal), "TRY")}
            </p>
            {/* TL toplamın altında USD + gram altın karşılığı. */}
            <CurrencyEquivalentLine
              tryTotal={Math.abs(netTotal)}
              usdRate={usdRate}
              goldRate={goldRate}
            />
          </div>
          {/* "Kuru Güncelle" — mevcut mekanizma (canlı kur çek + bakiyeleri recompute).
              Cooldown'lu (arka arkaya basışı engelle); başarınca cari listesini tazele. */}
          <button
            type="button"
            onClick={() => refresh(() => { triggerRefresh(); fetchList(); })}
            disabled={refreshing || onCooldown}
            title={onCooldown ? "Az önce güncellendi — biraz bekleyin" : "Canlı kuru çek ve bakiyeleri güncelle"}
            className="v2-btn v2-btn--ink v2-press text-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Kuru Güncelle
          </button>
        </section>
      )}

      {/* Filters */}
      <section className="v2-card p-3 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim veya vergi no ara..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-sm text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
            />
          </div>
          {/* v1.7.x: business filter (sadece >1 business varsa) */}
          {businesses.length > 1 && (
            <div className="min-w-[200px]">
              <DarkSelect
                value={businessFilter}
                onChange={setBusinessFilter}
                placeholder="Tüm İşletmeler"
                searchable={businesses.length > 6}
                options={[
                  { value: "ALL", label: "Tüm İşletmeler" },
                  ...businesses.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 v2-sunken p-1 rounded-xl overflow-x-auto">
            {(["ALL", ...ROLES.map((r) => r.value)] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r as CounterpartRole | "ALL")}
                aria-pressed={roleFilter === r}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  roleFilter === r
                    ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                    : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
                )}
              >
                {r === "ALL" ? "Tümü" : roleMeta(r as CounterpartRole).label}
              </button>
            ))}
          </div>
          {/* v1.7.x: grup görünümü toggle (sadece >1 business + ALL filter) */}
          {businesses.length > 1 && businessFilter === "ALL" && (
            <div className="ml-auto flex items-center gap-1 text-[11px]">
              <span className="text-[rgb(var(--v2-muted))]">Görünüm:</span>
              <div className="flex items-center gap-1 v2-sunken p-1 rounded-xl">
                <button
                  onClick={() => setGroupBy("business")}
                  aria-pressed={groupBy === "business"}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium",
                    groupBy === "business"
                      ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                      : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
                  )}
                >
                  İşletmeye Göre
                </button>
                <button
                  onClick={() => setGroupBy("none")}
                  aria-pressed={groupBy === "none"}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium",
                    groupBy === "none"
                      ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                      : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
                  )}
                >
                  Düz Liste
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* UX-10: düz liste görünümünde Kart/Tablo toggle (gruplamada gizli). */}
      {!loading && filtered.length > 0 && !grouped && (
        <div className="flex items-center justify-end">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>
      )}

      {/* List */}
      {loading ? (
        <CardSkeleton count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={list.length === 0 ? "Henüz karşı firma yok" : "Aramaya uyan kayıt bulunamadı"}
          description={
            list.length === 0
              ? '"Yeni" butonu ile ilk karşı firma kaydını ekleyebilirsin.'
              : undefined
          }
          action={
            // arama eşleşmesi yok ama daha fazla sayfa var → manuel yükle.
            hasSearch && hasNext ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 rounded-xl v2-sunken hover:border-accent/50 text-[rgb(var(--v2-ink))] text-xs font-medium transition-colors disabled:opacity-50 v2-press"
              >
                {loadingMore ? "Yükleniyor..." : "Daha fazla kayıt ara"}
              </button>
            ) : undefined
          }
        />
      ) : grouped ? (
        // v1.7.x: business-bazlı gruplama
        <>
          <div className="space-y-4">
            {grouped.map((g) => (
              <section key={g.businessId}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-1 h-4 bg-accent rounded-full" />
                  <h3 className="text-xs font-semibold text-[rgb(var(--v2-ink))] uppercase tracking-wider">
                    {g.businessName}
                  </h3>
                  <span className="text-[10px] text-[rgb(var(--v2-muted))]">({g.items.length})</span>
                  <div className="flex-1 border-b border-[rgb(var(--v2-border))] ml-2" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {g.items.map((c) => renderCard(c))}
                </div>
              </section>
            ))}
          </div>
          <InfiniteScrollSentinel
            hasNext={hasNext}
            loadingMore={loadingMore}
            loadMore={loadMore}
            loadedCount={list.length}
            totalCount={totalElements}
          />
        </>
      ) : viewMode === "table" ? (
        <>
          {/* UX-10: yoğun "Excel-vari" tablo — sağ-hizalı .num cari bakiye. */}
          <div className="v2-card v2-table-wrap">
            <table className="v2-table">
              <thead>
                <tr>
                  <th scope="col">İsim</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Vergi No</th>
                  <th scope="col" className="v2-td-num">Cari Bakiye</th>
                  <th scope="col" className="v2-td-num w-16"><span className="sr-only">İşlem</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const m = roleMeta(c.role);
                  const bal = c.current_balance ?? 0;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleOpen(c)}
                      className="cursor-pointer"
                    >
                      <td className="font-medium text-[rgb(var(--v2-ink))] max-w-[220px] truncate">
                        {c.name}
                      </td>
                      <td className="text-xs text-[rgb(var(--v2-muted))] whitespace-nowrap">{m.label}</td>
                      <td className="num text-xs text-[rgb(var(--v2-muted))] whitespace-nowrap">
                        {c.tax_id || "—"}
                      </td>
                      <td
                        className={cn(
                          "num v2-td-num font-semibold whitespace-nowrap",
                          bal > 0 ? "text-accent-strong dark:text-accent"
                            : bal < 0 ? "text-status-danger"
                            : "text-[rgb(var(--v2-muted))]",
                        )}
                      >
                        {formatCurrency(Math.abs(bal), "TRY")}
                        {bal !== 0 && (
                          <span className="ml-1 text-[10px] font-normal text-[rgb(var(--v2-muted))]">
                            {bal > 0 ? "alacak" : "verecek"}
                          </span>
                        )}
                      </td>
                      <td className="v2-td-num">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(c); }}
                            aria-label={`${c.name} düzenle`}
                            title="Düzenle"
                            className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-sunken))] transition-all"
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(c); }}
                            aria-label={`${c.name} sil`}
                            title="Sil"
                            className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-status-danger hover:bg-status-danger/10 transition-all"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <InfiniteScrollSentinel
            hasNext={hasNext}
            loadingMore={loadingMore}
            loadMore={loadMore}
            loadedCount={list.length}
            totalCount={totalElements}
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((c) => renderCard(c))}
          </div>
          <InfiniteScrollSentinel
            hasNext={hasNext}
            loadingMore={loadingMore}
            loadMore={loadMore}
            loadedCount={list.length}
            totalCount={totalElements}
          />
        </>
      )}

      {/* Create */}
      {showCreate && (
        <CounterpartFormModal
          title="Yeni Karşı Firma"
          initial={emptyForm()}
          businesses={businesses}
          selectedBusinessId={selectedBusinessId}
          onBusinessChange={setSelectedBusinessId}
          requireBusiness
          onClose={() => setShowCreate(false)}
          onSubmit={async (f) => {
            if (!selectedBusinessId) {
              throw new ApiError(400, "BUSINESS-REQUIRED",
                "Bu counterpart hangi işletmeye ait olacak? Lütfen seç.", undefined);
            }
            // v1.6.23.12 (WP 3c8401f6 / TODO d72cfde9):
            // Counterpart yaratıldıktan sonra opsiyonel "telefon ekle" prompt.
            const created = await api.post<{ id: string; name: string }>(
              "/counterparts",
              { ...toPayload(f), business_id: selectedBusinessId },
            );
            toast.success("Cari oluşturuldu");
            setShowCreate(false);
            fetchList();
            if (typeof window !== "undefined" && created?.id) {
              const wantsPhone = window.confirm(
                `"${created.name}" firması oluşturuldu.\n\nBu firmaya telefon eklemek ister misin?`,
              );
              if (wantsPhone) {
                window.location.href = `/dashboard/telefonlar?counterpart_id=${created.id}`;
              }
            }
          }}
        />
      )}

      {/* Edit */}
      {editing && (
        <CounterpartFormModal
          title="Karşı Firmayı Düzenle"
          initial={formFromCp(editing)}
          onClose={() => setEditing(null)}
          onSubmit={async (f) => {
            await api.put(`/counterparts/${editing.id}`, toPayload(f));
            toast.success("Cari güncellendi");
            setEditing(null);
            fetchList();
          }}
        />
      )}

      {/* Delete */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="v2-card shadow-v2-hover p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-[rgb(var(--v2-ink))] mb-2">
              Karşı Firmayı Sil
            </h3>
            <p className="text-sm text-[rgb(var(--v2-muted))] mb-6">
              <strong className="text-[rgb(var(--v2-ink))]">{deleteConfirm.name}</strong> kaydini
              silmek istediğinden emin misin? Bağlı borç varsa silme reddedilir.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl font-semibold text-[rgb(var(--v2-ink))] v2-sunken hover:border-accent/50 transition-colors v2-press text-sm"
              >
                İptal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="px-4 py-2 rounded-xl bg-status-danger hover:opacity-90 text-white font-semibold text-sm v2-press"
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Cari kartı — React.memo (perf/frontend-quickwins)
// Markup, eski inline `renderCard` ile birebir aynı. Tek fark: prop'lardan
// gelen stabil handler'lar (onOpen/onEdit/onDelete) sayesinde parent
// re-render'larında değişmeyen kartlar yeniden çizilmez.
// ─────────────────────────────────────────────────────────

const CounterpartCard = memo(function CounterpartCard({
  counterpart: c,
  onOpen,
  onEdit,
  onDelete,
}: {
  counterpart: Counterpart;
  onOpen: (c: Counterpart) => void;
  onEdit: (c: Counterpart) => void;
  onDelete: (c: Counterpart) => void;
}) {
  const m = roleMeta(c.role);
  const Icon = m.icon;
  const balance = c.current_balance ?? 0;
  return (
    <div
      onClick={() => onOpen(c)}
      className="v2-card v2-lift p-4 cursor-pointer transition-all active:scale-[0.98] group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", m.badge)}>
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[rgb(var(--v2-ink))] text-sm leading-tight truncate">
              {c.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", m.badge)}>
                {m.label}
              </span>
              {c.tax_id && (
                <span className="text-[10px] text-[rgb(var(--v2-muted))]">{c.tax_id}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className={cn(
            "num text-sm font-bold whitespace-nowrap",
            balance > 0 ? "text-accent-strong dark:text-accent" : balance < 0 ? "text-status-danger" : "text-[rgb(var(--v2-muted))]"
          )}>
            {formatCurrency(balance)}
          </div>
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(c); }}
              className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-sunken))]"
              aria-label="Düzenle"
              title="Düzenle"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(c); }}
              className="p-1.5 rounded-lg text-[rgb(var(--v2-muted))] hover:text-status-danger hover:bg-status-danger/10"
              aria-label="Sil"
              title="Sil"
            >
              <Trash2 size={14} />
            </button>
            <ArrowRight size={14} className="text-[rgb(var(--v2-muted))] ml-1" />
          </div>
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────
// Form modal
// ─────────────────────────────────────────────────────────

function toPayload(f: FormState) {
  const days = parseInt(f.payment_terms_days, 10);
  return {
    name: f.name,
    tax_id: f.tax_id || null,
    tax_office: f.tax_office || null,
    role: f.role,
    contact_name: f.contact_name || null,
    contact_phone: f.contact_phone || null,
    contact_email: f.contact_email || null,
    address: f.address || null,
    payment_terms_days: Number.isFinite(days) ? days : 0,
    notes: f.notes || null,
  };
}

interface FormModalProps {
  title: string;
  initial: FormState;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
  /** v1.7.x: create için zorunlu, edit'te gizli */
  businesses?: Business[];
  selectedBusinessId?: string;
  onBusinessChange?: (id: string) => void;
  requireBusiness?: boolean;
}

function CounterpartFormModal({
  title, initial, onClose, onSubmit,
  businesses = [], selectedBusinessId = "", onBusinessChange, requireBusiness = false,
}: FormModalProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taxIdInvalid = form.tax_id.length > 0 && !isValidTaxId(form.tax_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("İsim zorunlu");
      return;
    }
    if (taxIdInvalid) {
      setError("Geçersiz VKN (10 hane) veya TCKN (11 hane).");
      return;
    }
    if (requireBusiness && !selectedBusinessId) {
      setError("İşletme seçin (hangi işletmenin counterpart'ı olacağını belirtin).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Kaydetme başarısız";
      setError(msg);
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="v2-card shadow-v2-hover p-6 max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-[rgb(var(--v2-ink))]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="v2-icon-btn v2-press"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-status-danger/10 border border-status-danger/30 rounded-xl text-status-danger text-sm">
            {error}
          </div>
        )}

        {/* v1.7.x bug-fix: business picker — create modunda zorunlu */}
        {requireBusiness && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">İşletme *</label>
            {businesses.length === 0 ? (
              <div className="h-10 v2-sunken rounded-xl animate-pulse" />
            ) : businesses.length === 1 ? (
              <div className="px-3 py-2.5 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-sm text-[rgb(var(--v2-ink))]">
                {businesses[0].name}
              </div>
            ) : (
              <DarkSelect
                required
                value={selectedBusinessId}
                onChange={(v) => onBusinessChange?.(v)}
                placeholder="İşletme seçin"
                searchable={businesses.length > 6}
                options={businesses.map((b) => ({ value: b.id, label: b.name }))}
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="İsim *" colSpan="md:col-span-2">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Rol">
            <DarkSelect
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v as CounterpartRole })}
              options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Field>

          <Field label="Ödeme vadesi (gün)">
            <input
              type="number"
              min={0}
              value={form.payment_terms_days}
              onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="VKN / TCKN">
            <input
              value={form.tax_id}
              onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              placeholder="10 veya 11 hane"
              inputMode="numeric"
              maxLength={11}
              className={cn(inputClass, taxIdInvalid && "border-status-danger")}
            />
            {taxIdInvalid && (
              <p className="mt-1 text-xs text-status-danger">Geçersiz format / checksum</p>
            )}
          </Field>

          <Field label="Vergi dairesi">
            <input
              value={form.tax_office}
              onChange={(e) => setForm({ ...form, tax_office: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="İletişim ad-soyad">
            <input
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Telefon">
            <input
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="E-posta" colSpan="md:col-span-2">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Adres" colSpan="md:col-span-2">
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </Field>

          <Field label="Notlar" colSpan="md:col-span-2">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold text-[rgb(var(--v2-ink))] v2-sunken hover:border-accent/50 transition-colors v2-press text-sm"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="v2-btn v2-btn--ink v2-press text-sm disabled:opacity-50"
          >
            {submitting ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] text-sm placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all";

function Field({
  label,
  colSpan,
  children,
}: {
  label: string;
  colSpan?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={colSpan ?? ""}>
      <label className="block text-xs font-medium text-[rgb(var(--v2-muted))] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
