package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.FixedCost;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.FixedCostSearchRepository;
import com.bizboard.service.search.AccessContext;
import com.bizboard.service.search.EntitySearchStrategy;
import com.bizboard.service.search.SearchRanker;
import com.bizboard.service.search.SearchTerms;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * v2.2.0 — FixedCost (sabit gider) arama stratejisi (spec §4).
 *
 * <p>Tenant-scope: business.id IN (L3). Aranabilir: name (label), type
 * (category). Tutar aralığı + {@code kategori:} filtresi.</p>
 */
@Component
@RequiredArgsConstructor
public class FixedCostSearchStrategy implements EntitySearchStrategy {

    private final FixedCostSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.FIXED_COST;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        ParsedQuery.Range amt = q.getAmountRange();
        String categoryLike = q.getCategories().isEmpty()
                ? null : "%" + q.getCategories().get(0).toLowerCase() + "%";
        List<FixedCost> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                amt != null ? amt.getMin() : null,
                amt != null ? amt.getMax() : null,
                categoryLike, PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (FixedCost f : rows) {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("amount", f.getAmount());
            if (f.getType() != null) meta.put("category", f.getType());
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(f.getId())
                    .title(f.getName())
                    .snippet(SearchTerms.highlight(f.getName(), q))
                    .businessId(f.getBusiness() != null ? f.getBusiness().getId() : null)
                    .businessName(f.getBusiness() != null ? f.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(f.getName(), terms, null, null))
                    .url(fixedCostUrl(f))
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<FixedCost> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (FixedCost f : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(f.getId())
                    .label(f.getName())
                    .businessId(f.getBusiness() != null ? f.getBusiness().getId() : null)
                    .businessName(f.getBusiness() != null ? f.getBusiness().getName() : null)
                    .url(fixedCostUrl(f))
                    .build());
        }
        return out;
    }

    private String fixedCostUrl(FixedCost f) {
        return f.getBusiness() != null
                ? "/business/" + f.getBusiness().getId() + "?tab=fixed_costs"
                : "/dashboard/businesses";
    }
}
