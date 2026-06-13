"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Business, InventoryItem } from "@/types";
import {
  ALL_TAB, STATUS_LABELS, getCategoriesForBusinessType,
} from "@/components/inventory/constants";
import type { CategoryDef } from "@/components/inventory/constants";
import { InventoryRow } from "@/components/inventory/InventoryRow";
import { InventoryDetailModal } from "@/components/inventory/InventoryDetailModal";
import { CreateInventoryModal } from "@/components/inventory/CreateInventoryModal";
import { InfiniteScrollSentinel } from "@/components/shared/InfiniteScrollSentinel";
import { usePaginatedList } from "@/hooks/usePaginatedList";

const PAGE_SIZE = 40;

// ══════════════════════════════════════════════════════════
// Ana Sayfa
// ══════════════════════════════════════════════════════════

export default function InventoryPageWrapper() {
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}

function InventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshKey, triggerRefresh } = useAppStore();

  const presetBusiness = searchParams.get("business") || "";

  const [businesses, setBusinesses] = useState<Business[]>([]);

  const [activeCategory, setActiveCategory] = useState("ALL");
  const [filterBusiness, setFilterBusiness] = useState(presetBusiness);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Performans (perf/frontend-quickwins): stabil satır handler'ı — memo'lu
  // InventoryRow'un gereksiz re-render'ını önler (referans değişmez).
  const handleSelectItem = useCallback((item: InventoryItem) => setDetailItem(item), []);

  // PERF (perf/frontend-pagination): envanter artık server-pagination ile sayfalı
  // çekilir. business_id + category SERVER-SIDE param (BE DB'de uygular);
  // status + arama CLIENT-SIDE (BE bu uçta desteklemiyor) — yüklenen sayfalar üstünde.
  const {
    items,
    totalElements,
    loading,
    loadingMore,
    hasNext,
    loadMore,
  } = usePaginatedList<InventoryItem>(
    (page, size) => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("size", String(size));
      if (filterBusiness) p.set("business_id", filterBusiness);
      if (activeCategory !== "ALL") p.set("category", activeCategory);
      return `/portfolio/inventory?${p.toString()}`;
    },
    [filterBusiness, activeCategory, refreshKey],
    { size: PAGE_SIZE, label: "Inventory" },
  );

  // İşletme listesi — items'tan bağımsız (tek sefer / refreshKey).
  useEffect(() => {
    let alive = true;
    api.get<Business[]>("/businesses")
      .then((r) => { if (alive) setBusinesses(r || []); })
      .catch((err) => logger.error("api", "Inventory businesses fetch error", undefined, err));
    return () => { alive = false; };
  }, [refreshKey]);

  const selectedBiz = businesses.find((b) => b.id === filterBusiness);
  const availableCategories = useMemo(() => {
    if (selectedBiz) {
      return [ALL_TAB, ...getCategoriesForBusinessType(undefined /* v1.6.2: BusinessType.category kaldırıldı */)];
    }
    const seen = new Set<string>();
    const merged: CategoryDef[] = [ALL_TAB];
    for (const biz of businesses) {
      for (const cat of getCategoriesForBusinessType(undefined /* v1.6.2: BusinessType.category kaldırıldı */)) {
        if (!seen.has(cat.key)) { seen.add(cat.key); merged.push(cat); }
      }
    }
    return merged;
  }, [selectedBiz, businesses]);

  useEffect(() => {
    if (activeCategory !== "ALL" && !availableCategories.find((c) => c.key === activeCategory)) {
      setActiveCategory("ALL");
    }
  }, [availableCategories, activeCategory]);

  // category artık server-side; burada yalnız client-side status + arama
  // (BE bu ikisini desteklemiyor) — yüklenmiş sayfalar üzerinde.
  const hasClientFilter = Boolean(filterStatus || searchQuery);
  const filtered = useMemo(() => {
    if (!hasClientFilter) return items;
    return items.filter((item) => {
      if (filterStatus && item.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = [item.name, item.brand, item.model, item.serial_number,
          item.company_barcode, item.assigned_to, item.location]
          .some((v) => v?.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [items, filterStatus, searchQuery, hasClientFilter]);

  // "X kalem": client-filtre yokken gerçek toplam (total_elements);
  // client-filtre varken yüklenmiş eşleşme sayısı.
  const totalCount = hasClientFilter ? filtered.length : totalElements;
  const brokenCount = filtered.filter((i) => i.status === "BROKEN").length;
  // Akıllı reorder: backend needs_reorder (eşik = manuel ya da minimum+lead tamponu). (WP f4fe6d82)
  const lowStockCount = filtered.filter((i) => i.needs_reorder).length;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors">
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-surface-100">Envanter Yönetimi</h1>
            <p className="text-xs text-surface-400">{totalCount} kalem</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} /> Ekle
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1.5 py-1">
        {availableCategories.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                isActive ? "bg-brand-600 text-white shadow-sm" : "bg-surface-700 text-surface-300 hover:bg-surface-600"
              )}
            >
              <Icon size={16} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Uyarı Barı */}
      {(brokenCount > 0 || lowStockCount > 0) && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-xs">
          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
          <div className="flex gap-3">
            {brokenCount > 0 && <span className="text-amber-400 font-medium">{brokenCount} arızalı</span>}
            {lowStockCount > 0 && <span className="text-red-600 font-medium">{lowStockCount} düşük stok</span>}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ara... (ad, marka, seri no, lokasyon)"
            className="field field-sm py-2.5 pl-9 pr-4" />
        </div>
        <select value={filterBusiness} onChange={(e) => setFilterBusiness(e.target.value)}
          className="field-sm py-2 text-xs">
          <option value="">Tüm İşletmeler</option>
          {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="field-sm py-2 text-xs">
          <option value="">Tüm Durumlar</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-surface-600 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-surface-400 text-sm">
            {items.length === 0 ? "Henüz envanter kalemi yok" : "Filtreye uygun kalem bulunamadı"}
          </p>
          {hasClientFilter && hasNext && (
            <div className="mt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Yükleniyor..." : "Daha fazla kalem ara"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="glass-card divide-y divide-surface-700 overflow-hidden">
            {filtered.map((item) => (
              <InventoryRow key={item.id} item={item} onSelect={handleSelectItem} showBusiness={!filterBusiness} />
            ))}
          </div>
          <InfiniteScrollSentinel
            hasNext={hasNext}
            loadingMore={loadingMore}
            loadMore={loadMore}
            loadedCount={items.length}
            totalCount={totalElements}
          />
        </>
      )}

      {/* Detail Modal */}
      {detailItem && (
        <InventoryDetailModal item={detailItem} onClose={() => setDetailItem(null)}
          onUpdated={() => { setDetailItem(null); triggerRefresh(); }} />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateInventoryModal businesses={businesses} presetBusinessId={filterBusiness}
          onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); triggerRefresh(); }} />
      )}
    </div>
  );
}
