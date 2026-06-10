package com.bizboard.service.search;

import com.bizboard.common.search.SearchEntityType;

import java.util.Set;

/**
 * v2.2.0 — arama isteği opsiyonları (spec §9.1 sayfalama + sort + tip filtresi).
 *
 * @param page    0-indexli sayfa
 * @param size    sayfa boyutu (entity başına 50 hard-cap, spec T4)
 * @param sort    {@link Sort} sıralama tercihi
 * @param typeFilter UI facet checkbox'larından gelen ek tip filtresi (query'deki
 *                   {@code tip:} ile birleşir; boş = tüm tipler)
 */
public record SearchOptions(int page, int size, Sort sort, Set<SearchEntityType> typeFilter) {

    public static final int MAX_SIZE_PER_ENTITY = 50;

    public enum Sort { RELEVANCE, DATE, AMOUNT }

    public static SearchOptions defaults() {
        return new SearchOptions(0, 20, Sort.RELEVANCE, Set.of());
    }

    public SearchOptions {
        if (size <= 0 || size > MAX_SIZE_PER_ENTITY) size = 20;
        if (page < 0) page = 0;
        if (sort == null) sort = Sort.RELEVANCE;
        if (typeFilter == null) typeFilter = Set.of();
    }
}
