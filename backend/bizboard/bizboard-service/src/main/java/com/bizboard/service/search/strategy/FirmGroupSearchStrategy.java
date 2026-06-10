package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.BusinessGroup;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.FirmGroupSearchRepository;
import com.bizboard.service.search.AccessContext;
import com.bizboard.service.search.EntitySearchStrategy;
import com.bizboard.service.search.SearchRanker;
import com.bizboard.service.search.SearchTerms;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * v2.2.0 — FirmGroup (firma grubu) arama stratejisi (spec §4, v1.7+).
 *
 * <p><b>Erişim:</b> {@code business_groups} kullanıcıya bağlı; her kullanıcı
 * yalnız kendi gruplarını görür ({@code user.id = ctx.userId}). Bu doğal
 * izolasyon olduğundan business-scope kontrolü (hasNoAccess) uygulanmaz —
 * kullanıcının grubu yoksa zaten boş döner.</p>
 */
@Component
@RequiredArgsConstructor
public class FirmGroupSearchStrategy implements EntitySearchStrategy {

    private final FirmGroupSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.FIRM_GROUP;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.userId() == null) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<BusinessGroup> rows = repository.search(
                ctx.userId(), hasText, hasText ? term : "%",
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (BusinessGroup g : rows) {
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(g.getId())
                    .title(g.getName())
                    .snippet(SearchTerms.highlight(g.getName(), q))
                    .rank(SearchRanker.score(g.getName(), terms, null, null))
                    .url("/dashboard/businesses")
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.userId() == null) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<BusinessGroup> rows = repository.suggest(
                ctx.userId(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (BusinessGroup g : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(g.getId())
                    .label(g.getName())
                    .url("/dashboard/businesses")
                    .build());
        }
        return out;
    }
}
