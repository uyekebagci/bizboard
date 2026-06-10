package com.bizboard.service.search;

import com.bizboard.common.search.SearchResult;
import com.bizboard.common.search.Suggestion;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 Advanced Search — merkezi servis (spec §8, L5).
 *
 * <p><b>TEK giriş noktası.</b> Tüm arama endpoint'leri yalnızca bu servisi
 * çağırır; controller'da ad-hoc {@code repository.findByX(...)} ile arama
 * yasaktır (spec §8). Servis sırasıyla: parse → access resolve → per-entity
 * strategy → merge + re-rank → mask → audit yapar.</p>
 */
public interface SearchService {

    /** Ana arama (spec §9.1 GET /search). */
    SearchResult search(UUID userId, String rawQuery, SearchOptions options);

    /** Autocomplete (spec §9.1 GET /search/suggest). */
    List<Suggestion> suggest(UUID userId, String prefix, int limit);

    /** Yalnız facet sayımları (spec §9.1 GET /search/facets). */
    SearchResult.Facets facets(UUID userId, String rawQuery);
}
