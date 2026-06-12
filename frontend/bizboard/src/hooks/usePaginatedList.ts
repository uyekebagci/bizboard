"use client";

/**
 * PERF (perf/frontend-pagination): ağır listeler için server-pagination +
 * infinite-scroll consume hook'u.
 *
 * <p>BE artık {@code /portfolio/transactions/all}, {@code /counterparts},
 * {@code /portfolio/inventory} uçlarında {@code ?page=&size=} destekliyor.
 * Param verilince zarf döner:</p>
 * <pre>{ items, total_elements, total_pages, has_next, page, size }</pre>
 * <p>(snake_case). Param yoksa eski tam-dizi davranışı korunur — bu hook ucu
 * HER ZAMAN {@code page+size} ile çağırır, yani tam-listeyi çekmeyiz.</p>
 *
 * <p>Davranış:</p>
 * <ul>
 *   <li><b>İlk yük:</b> sayfa 0 — hızlı (yalnız {@code size} kadar satır).</li>
 *   <li><b>Daha fazla:</b> {@code loadMore()} sentinel'den çağrılır; bir sonraki
 *       sayfayı çeker ve mevcut listeye ekler (accumulate).</li>
 *   <li><b>Server-side filtre değişimi:</b> {@code deps} dizisi değişince liste
 *       sıfırlanır ve sayfa 0'dan yeniden çekilir (BE filtreyi DB'de uygular).</li>
 *   <li><b>Yenileme:</b> {@code reload()} sayfa 0'dan baştan çeker (örn. silme
 *       sonrası).</li>
 * </ul>
 *
 * <p>Race-safety: her fetch çağrısı bir "epoch" alır; deps değişince epoch
 * artar ve eski (uçuştaki) cevaplar yok sayılır — eski filtrenin sonucu yeni
 * listeye karışmaz.</p>
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";

/** BE PagedResponseDto zarfı (snake_case). */
export interface PagedEnvelope<T> {
  items: T[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
  has_next: boolean;
}

export interface UsePaginatedListOptions {
  /** Sayfa boyutu (BE clamp: 1..200, default 50). Varsayılan 40. */
  size?: number;
  /** Hata log etiketi (logger context'i için). */
  label?: string;
  /** false → ilk yükü erteleme (örn. bağımlılık hazır değilken). Default true. */
  enabled?: boolean;
}

export interface UsePaginatedListResult<T> {
  /** Şu ana dek yüklenmiş tüm satırlar (sayfalar birikmiş halde). */
  items: T[];
  /** Server'daki TOPLAM kayıt sayısı (sayaçlar için). */
  totalElements: number;
  /** İlk sayfa yükleniyor mu (boş-state skeleton için). */
  loading: boolean;
  /** Sonraki sayfa yükleniyor mu (alt spinner için). */
  loadingMore: boolean;
  /** Daha fazla sayfa var mı (sentinel'i göster/gizle). */
  hasNext: boolean;
  /** Yük/sayfalama hatası (varsa). */
  error: string | null;
  /** Sonraki sayfayı yükle (IntersectionObserver sentinel'den çağrılır). */
  loadMore: () => void;
  /** Listeyi sayfa 0'dan baştan çek (örn. silme/oluşturma sonrası). */
  reload: () => void;
}

/**
 * @param buildPath sayfa numarasını alıp tam endpoint path'ini üretir
 *   (server-side filtreler de path'e dahil edilmeli). 0-index sayfa.
 * @param deps server-side filtre bağımlılıkları — değişince liste sıfırlanır.
 */
export function usePaginatedList<T>(
  buildPath: (page: number, size: number) => string,
  deps: ReadonlyArray<unknown>,
  options: UsePaginatedListOptions = {},
): UsePaginatedListResult<T> {
  const { size = 40, label = "usePaginatedList", enabled = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Son çekilen 0-index sayfa (loadMore bir sonrakini ister).
  const pageRef = useRef(0);
  // Race-guard: deps değişince artar; uçuştaki eski cevaplar yok sayılır.
  const epochRef = useRef(0);
  // Eş zamanlı çift loadMore'u engelle.
  const inflightRef = useRef(false);

  // buildPath referansı her render değişse de stabil tutmak için ref'le.
  const buildPathRef = useRef(buildPath);
  buildPathRef.current = buildPath;

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      const myEpoch = epochRef.current;

      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const env = await api.get<PagedEnvelope<T>>(
          buildPathRef.current(page, size),
        );
        // deps değiştiyse (epoch ilerlediyse) bu cevap bayat — yut.
        if (myEpoch !== epochRef.current) return;

        const rows = env?.items ?? [];
        setItems((prev) => (append ? [...prev, ...rows] : rows));
        setTotalElements(env?.total_elements ?? rows.length);
        setHasNext(Boolean(env?.has_next));
        pageRef.current = page;
        setError(null);
      } catch (err) {
        if (myEpoch !== epochRef.current) return;
        logger.error("api", `${label} fetch error`, { page }, err);
        setError("Liste yuklenemedi");
        if (!append) {
          setItems([]);
          setTotalElements(0);
          setHasNext(false);
        }
      } finally {
        if (myEpoch === epochRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
        inflightRef.current = false;
      }
    },
    [size, label],
  );

  // deps değişince: epoch++ → eski cevapları geçersiz kıl, sayfa 0'dan çek.
  useEffect(() => {
    epochRef.current += 1;
    pageRef.current = 0;
    inflightRef.current = false;
    if (!enabled) {
      setItems([]);
      setTotalElements(0);
      setHasNext(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasNext || inflightRef.current) return;
    void fetchPage(pageRef.current + 1, true);
  }, [loading, loadingMore, hasNext, fetchPage]);

  const reload = useCallback(() => {
    epochRef.current += 1;
    pageRef.current = 0;
    inflightRef.current = false;
    void fetchPage(0, false);
  }, [fetchPage]);

  return {
    items,
    totalElements,
    loading,
    loadingMore,
    hasNext,
    error,
    loadMore,
    reload,
  };
}
