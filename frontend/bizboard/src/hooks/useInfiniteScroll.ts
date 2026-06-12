"use client";

/**
 * PERF (perf/frontend-pagination): IntersectionObserver tabanlı sonsuz-kaydırma
 * sentinel'i. Listenin sonuna konan görünmez bir element viewport'a yaklaşınca
 * {@code onLoadMore} tetiklenir.
 *
 * <p>Yeni bağımlılık YOK — native {@code IntersectionObserver} kullanılır.
 * {@code rootMargin} ile kullanıcı dibe varmadan, biraz önceden bir sonraki
 * sayfa yüklenir (akıcı, "boş bekleme" hissi olmaz).</p>
 *
 * <p>Kullanım:</p>
 * <pre>
 *   const setSentinel = useInfiniteScroll(loadMore, hasNext);
 *   ...
 *   {hasNext && <div ref={setSentinel} />}
 * </pre>
 *
 * <p>Sentinel node'u {@code useState} ile tutulur — böylece sentinel DOM'a
 * sonradan girdiğinde (örn. {@code hasNext} true olunca) observer yeniden
 * bağlanır; mount sırası sorun çıkarmaz.</p>
 */

import { useEffect, useRef, useState } from "react";

export function useInfiniteScroll(
  onLoadMore: () => void,
  enabled: boolean,
  rootMargin = "400px",
) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!node || !enabled || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, enabled, rootMargin]);

  return setNode;
}
