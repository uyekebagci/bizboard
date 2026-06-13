"use client";

/**
 * v2.2.0 Advanced Search — özel arama sayfası (spec §10.2, §10.5, §10.6).
 *
 * - Üst arama input (URL `?q=` ile senkron) + sort + Cmd/Ctrl+S kaydet.
 * - Faceted sidebar (tip checkbox'ları + işletme/kategori/tarih + kayıtlı/son).
 * - Sonuç listesi + pagination, snippet highlight, maskeli alan.
 * - Boş input → ileri seviye arama yardım kartı.
 *
 * Çift tema (dark default + light) — Daxa v2 token'ları.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2, Save } from "lucide-react";
import {
  searchApi,
  type SearchEntityType,
  type SearchResult,
  type SearchSort,
} from "@/lib/api/search";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { SearchResultItem } from "@/components/search/SearchResultItem";
import { SearchFacets } from "@/components/search/SearchFacets";
import { SavedSearchesPanel, pushRecent } from "@/components/search/SavedSearchesPanel";
import { SearchHelpCard } from "@/components/search/SearchHelpCard";
import { DarkSelect } from "@/components/shared/DarkSelect";

const PAGE_SIZE = 20;

function SearchPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const [input, setInput] = useState(initialQ);
  const [activeQuery, setActiveQuery] = useState(initialQ);
  const [types, setTypes] = useState<SearchEntityType[]>([]);
  const [sort, setSort] = useState<SearchSort>("RELEVANCE");
  const [page, setPage] = useState(0);

  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const runSearch = useCallback(
    async (q: string, t: SearchEntityType[], s: SearchSort, p: number) => {
      if (!q.trim()) {
        setResult(null);
        return;
      }
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await searchApi.search({
          q: q.trim(),
          types: t.length ? t : undefined,
          page: p,
          size: PAGE_SIZE,
          sort: s,
        });
        if (seq === reqSeq.current) setResult(res);
      } catch (e) {
        if (seq === reqSeq.current) {
          setError(getErrorMessage(e));
          setResult(null);
        }
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    []
  );

  // İlk yük + query/type/sort/page değişiminde ara.
  useEffect(() => {
    if (activeQuery.trim()) {
      void runSearch(activeQuery, types, sort, page);
    }
  }, [activeQuery, types, sort, page, runSearch]);

  // Cmd/Ctrl+S → kaydet (spec §10.5).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveCurrent();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuery]);

  function submit(q: string) {
    const trimmed = q.trim();
    setActiveQuery(trimmed);
    setPage(0);
    if (trimmed) pushRecent(trimmed);
    router.replace(`/dashboard/search?q=${encodeURIComponent(trimmed)}`);
  }

  function runFromPanel(q: string) {
    setInput(q);
    submit(q);
  }

  async function saveCurrent() {
    if (!activeQuery.trim()) {
      toast.error("Önce bir arama yapın.");
      return;
    }
    const name = window.prompt("Kayıtlı arama adı:", activeQuery.trim());
    if (!name?.trim()) return;
    try {
      await searchApi.savedCreate({ name: name.trim(), query: activeQuery.trim() });
      toast.success("Arama kaydedildi.");
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  function toggleType(type: SearchEntityType) {
    setPage(0);
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Üst arama satırı */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-3 mb-6"
      >
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))] pointer-events-none"
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ara... (örn. tip:transaction kategori:KIRA tutar:>5000)"
            className="field !pl-10 w-full"
            aria-label="Arama"
            autoFocus
          />
        </div>
        <DarkSelect
          value={sort}
          onChange={(v) => { setPage(0); setSort(v as SearchSort); }}
          options={[
            { value: "RELEVANCE", label: "Alaka" },
            { value: "DATE", label: "Tarih" },
            { value: "AMOUNT", label: "Tutar" },
          ]}
          className="w-32"
        />
        <button
          type="button"
          onClick={saveCurrent}
          className="btn-secondary !px-3"
          title="Aramayı kaydet (Cmd/Ctrl+S)"
          aria-label="Aramayı kaydet"
        >
          <Save size={16} />
        </button>
      </form>

      {!activeQuery.trim() ? (
        <SearchHelpCard onExample={runFromPanel} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6">
          {/* Faceted sidebar */}
          <aside className="v2-card !rounded-xl p-4 space-y-6 h-fit lg:sticky lg:top-20">
            {result && (
              <SearchFacets
                facets={result.facets}
                selectedTypes={types}
                onToggleType={toggleType}
              />
            )}
            <div className="border-t border-[rgb(var(--v2-border))] pt-4">
              <SavedSearchesPanel currentQuery={activeQuery} onRun={runFromPanel} />
            </div>
          </aside>

          {/* Sonuçlar */}
          <main>
            {loading && (
              <div className="flex items-center justify-center py-16 text-[rgb(var(--v2-muted))]">
                <Loader2 className="animate-spin mr-2" size={20} /> Aranıyor...
              </div>
            )}

            {error && !loading && (
              <div className="v2-card !rounded-xl p-4 text-sm text-red-500 dark:text-red-400">{error}</div>
            )}

            {!loading && !error && result && (
              <>
                <p className="text-sm text-[rgb(var(--v2-muted))] mb-3">
                  {result.total} sonuç
                  <span className="opacity-50"> · {result.tookMs} ms</span>
                </p>
                {result.items.length === 0 ? (
                  <div className="v2-card !rounded-xl p-8 text-center text-[rgb(var(--v2-muted))]">
                    Eşleşen sonuç bulunamadı.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {result.items.map((hit) => (
                      <SearchResultItem key={`${hit.type}-${hit.id}`} hit={hit} />
                    ))}
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="btn-secondary !px-3 !py-1.5 text-sm disabled:opacity-40"
                    >
                      Önceki
                    </button>
                    <span className="text-sm text-[rgb(var(--v2-muted))]">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="btn-secondary !px-3 !py-1.5 text-sm disabled:opacity-40"
                    >
                      Sonraki
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[rgb(var(--v2-muted))]">Yükleniyor...</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
