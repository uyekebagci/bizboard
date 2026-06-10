package com.bizboard.service.search;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.SearchQueryException;
import com.bizboard.common.search.SearchResult;
import com.bizboard.common.search.Suggestion;
import com.bizboard.service.AuditLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * v2.2.0 — {@link SearchService} implementasyonu (spec §8, L5+L6).
 *
 * <p>Strategy'ler Spring tarafından inject edilir (her {@code EntitySearchStrategy}
 * bean'i). Yeni entity strategy'si eklendiğinde bu sınıf değişmez — liste otomatik
 * genişler (Open/Closed).</p>
 */
@Slf4j
@Service
public class SearchServiceImpl implements SearchService {

    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private final SearchQueryParser parser;
    private final SearchAccessResolver accessResolver;
    private final AuditLogService auditLogService;
    private final Map<SearchEntityType, EntitySearchStrategy> strategies;

    public SearchServiceImpl(SearchQueryParser parser,
                             SearchAccessResolver accessResolver,
                             AuditLogService auditLogService,
                             List<EntitySearchStrategy> strategyBeans) {
        this.parser = parser;
        this.accessResolver = accessResolver;
        this.auditLogService = auditLogService;
        this.strategies = strategyBeans.stream()
                .collect(Collectors.toMap(EntitySearchStrategy::type, s -> s, (a, b) -> a,
                        () -> new LinkedHashMap<>()));
    }

    @Override
    public SearchResult search(UUID userId, String rawQuery, SearchOptions options) {
        long start = System.currentTimeMillis();
        SearchOptions opts = options != null ? options : SearchOptions.defaults();

        ParsedQuery query = parseOrAudit(userId, rawQuery);
        AccessContext ctx = accessResolver.resolve(userId);

        if (query.isEmpty() || ctx.hasNoAccess()) {
            long took = System.currentTimeMillis() - start;
            audit(userId, rawQuery, 0, ctx);
            return SearchResult.builder().total(0).tookMs(took)
                    .facets(SearchResult.Facets.empty()).build();
        }

        Set<SearchEntityType> targetTypes = resolveTargetTypes(query, opts);
        int perEntity = Math.min(opts.size() <= 0 ? 20 : opts.size(),
                SearchOptions.MAX_SIZE_PER_ENTITY);

        List<SearchHit> all = new ArrayList<>();
        for (SearchEntityType type : targetTypes) {
            EntitySearchStrategy strategy = strategies.get(type);
            if (strategy == null) continue;
            try {
                all.addAll(strategy.search(query, ctx, perEntity));
            } catch (Exception e) {
                // Bir strategy patlarsa diğerlerini durdurma; sonuç eksik ama güvenli.
                log.warn("[search] strategy {} failed: {}", type, e.getMessage());
            }
        }

        sort(all, opts.sort());
        SearchResult.Facets facets = computeFacets(all);

        int from = Math.min(opts.page() * opts.size(), all.size());
        int to = Math.min(from + opts.size(), all.size());
        List<SearchHit> pageItems = all.subList(from, to);

        long took = System.currentTimeMillis() - start;
        audit(userId, rawQuery, all.size(), ctx);

        return SearchResult.builder()
                .total(all.size())
                .items(new ArrayList<>(pageItems))
                .facets(facets)
                .tookMs(took)
                .build();
    }

    @Override
    public List<Suggestion> suggest(UUID userId, String prefix, int limit) {
        if (prefix == null || prefix.trim().length() < 2) return List.of();
        AccessContext ctx = accessResolver.resolve(userId);
        if (ctx.hasNoAccess()) return List.of();
        int cap = limit <= 0 || limit > 10 ? 10 : limit;
        int perEntity = Math.max(2, cap / 3);

        List<Suggestion> out = new ArrayList<>();
        for (EntitySearchStrategy strategy : strategies.values()) {
            if (out.size() >= cap) break;
            try {
                out.addAll(strategy.suggest(prefix.trim(), ctx, perEntity));
            } catch (Exception e) {
                log.warn("[suggest] strategy {} failed: {}", strategy.type(), e.getMessage());
            }
        }
        return out.size() > cap ? out.subList(0, cap) : out;
    }

    @Override
    public SearchResult.Facets facets(UUID userId, String rawQuery) {
        SearchResult result = search(userId, rawQuery, SearchOptions.defaults());
        return result.getFacets();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private ParsedQuery parseOrAudit(UUID userId, String rawQuery) {
        try {
            return parser.parse(rawQuery);
        } catch (SearchQueryException e) {
            // Parser reddi (T5): denemeyi audit'le, sonra 400'e yükselt.
            auditLogService.recordEntityAction(
                    AuditAction.SEARCH_QUERY_REJECTED, userId, null,
                    "SEARCH", null, truncate(rawQuery),
                    Map.of("reason", e.getMessage() != null ? e.getMessage() : "rejected"));
            throw e;
        }
    }

    private Set<SearchEntityType> resolveTargetTypes(ParsedQuery query, SearchOptions opts) {
        // query'deki tip: + UI facet filtresi birleşir; ikisi de boşsa tüm tipler.
        Set<SearchEntityType> fromQuery = query.getTypes();
        Set<SearchEntityType> fromFacet = opts.typeFilter();
        if (!fromQuery.isEmpty() && !fromFacet.isEmpty()) {
            return fromQuery.stream().filter(fromFacet::contains)
                    .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
        }
        if (!fromQuery.isEmpty()) return fromQuery;
        if (!fromFacet.isEmpty()) return fromFacet;
        return strategies.keySet();
    }

    private void sort(List<SearchHit> hits, SearchOptions.Sort sort) {
        Comparator<SearchHit> cmp = switch (sort) {
            case DATE -> Comparator.comparing(
                    (SearchHit h) -> dateOf(h), Comparator.nullsLast(Comparator.reverseOrder()));
            case AMOUNT -> Comparator.comparing(
                    (SearchHit h) -> amountOf(h), Comparator.nullsLast(Comparator.reverseOrder()));
            case RELEVANCE -> Comparator.comparingDouble(SearchHit::getRank).reversed();
        };
        hits.sort(cmp);
    }

    private SearchResult.Facets computeFacets(List<SearchHit> hits) {
        Map<String, Long> byType = new LinkedHashMap<>();
        Map<String, Long> byBusiness = new LinkedHashMap<>();
        Map<String, Long> byCategory = new LinkedHashMap<>();
        Map<String, Long> byMonth = new LinkedHashMap<>();
        for (SearchHit h : hits) {
            byType.merge(h.getType().wireValue(), 1L, Long::sum);
            if (h.getBusinessName() != null) byBusiness.merge(h.getBusinessName(), 1L, Long::sum);
            Object cat = h.getMetadata().get("category");
            if (cat != null) byCategory.merge(cat.toString(), 1L, Long::sum);
            LocalDate d = dateOf(h);
            if (d != null) byMonth.merge(d.format(MONTH), 1L, Long::sum);
        }
        List<SearchResult.DateBucket> buckets = byMonth.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> SearchResult.DateBucket.builder().month(e.getKey()).count(e.getValue()).build())
                .toList();
        return SearchResult.Facets.builder()
                .byType(byType).byBusiness(byBusiness).byCategory(byCategory)
                .byDateBucket(buckets).build();
    }

    private LocalDate dateOf(SearchHit h) {
        Object d = h.getMetadata().get("date");
        return d instanceof LocalDate ld ? ld : null;
    }

    private java.math.BigDecimal amountOf(SearchHit h) {
        Object a = h.getMetadata().get("amount");
        return a instanceof java.math.BigDecimal bd ? bd : null;
    }

    private void audit(UUID userId, String rawQuery, int resultCount, AccessContext ctx) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("resultCount", resultCount);
        meta.put("accessibleBusinessIdsCount",
                ctx.admin() ? "all" : ctx.accessibleBusinessIds().size());
        auditLogService.recordEntityAction(
                AuditAction.SEARCH_QUERY, userId, null,
                "SEARCH", null, truncate(rawQuery), meta);
    }

    private String truncate(String s) {
        if (s == null) return null;
        return s.length() <= 256 ? s : s.substring(0, 256);
    }
}
