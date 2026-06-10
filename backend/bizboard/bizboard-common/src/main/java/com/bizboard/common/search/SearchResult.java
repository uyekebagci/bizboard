package com.bizboard.common.search;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * v2.2.0 — birleşik arama yanıtı (spec §9.2).
 */
@Data
@Builder
public class SearchResult {

    private long total;
    @Builder.Default
    private List<SearchHit> items = List.of();
    @Builder.Default
    private Facets facets = Facets.empty();
    private long tookMs;
    @Builder.Default
    private List<String> warnings = List.of();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Facets {
        @Builder.Default
        private Map<String, Long> byType = Map.of();
        @Builder.Default
        private Map<String, Long> byBusiness = Map.of();
        @Builder.Default
        private Map<String, Long> byCategory = Map.of();
        @Builder.Default
        private List<DateBucket> byDateBucket = List.of();

        public static Facets empty() {
            return Facets.builder().build();
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DateBucket {
        private String month; // "2026-01"
        private long count;
    }
}
