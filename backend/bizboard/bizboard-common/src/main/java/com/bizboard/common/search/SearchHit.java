package com.bizboard.common.search;

import lombok.Builder;
import lombok.Data;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * v2.2.0 — tek bir arama sonucu (spec §9.2 items[]).
 *
 * <p>{@code snippet} server tarafında {@code <mark>} ile highlight'lanır; frontend
 * yalnız {@code <mark>} whitelist'i ile güvenle render eder (spec §10.3).</p>
 */
@Data
@Builder
public class SearchHit {

    private SearchEntityType type;
    private UUID id;
    private String title;
    private String snippet;
    private UUID businessId;
    private String businessName;

    /** entity-tipine özel ek alanlar (amount, category, date, masked fields …). */
    @Builder.Default
    private Map<String, Object> metadata = new LinkedHashMap<>();

    /** re-rank skoru (yüksek = daha alakalı). */
    private double rank;

    /** FE deep-link (örn. {@code /dashboard/transactions?focus=...}). */
    private String url;
}
