package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.Business;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.BusinessSearchRepository;
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
 * v2.2.0 — Business (işletme) arama stratejisi (spec §4).
 *
 * <p><b>Erişim:</b> Business tenant'ın kendisi; scope {@code id IN
 * accessibleBusinessIds}. Aranabilir: name, business_type_name.</p>
 */
@Component
@RequiredArgsConstructor
public class BusinessSearchStrategy implements EntitySearchStrategy {

    private final BusinessSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.BUSINESS;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<Business> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (Business b : rows) {
            Map<String, Object> meta = new LinkedHashMap<>();
            if (b.getBusinessTypeName() != null) meta.put("type", b.getBusinessTypeName());
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(b.getId())
                    .title(b.getName())
                    .snippet(SearchTerms.highlight(b.getName(), q))
                    .businessId(b.getId())
                    .businessName(b.getName())
                    .metadata(meta)
                    .rank(SearchRanker.score(b.getName(), terms, null, null))
                    .url("/business/" + b.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<Business> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (Business b : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(b.getId())
                    .label(b.getName())
                    .businessId(b.getId())
                    .businessName(b.getName())
                    .url("/business/" + b.getId())
                    .build());
        }
        return out;
    }
}
