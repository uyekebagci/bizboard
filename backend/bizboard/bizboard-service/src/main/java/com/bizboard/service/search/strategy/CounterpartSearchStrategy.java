package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.SearchPermission;
import com.bizboard.common.search.SensitiveMask;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.CounterpartSearchRepository;
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
 * v2.2.0 — Counterpart (cari) arama stratejisi (spec §4, §8.1).
 *
 * <p>Tenant-scope: business.id IN (L3). VKN (tax_id) hassas — yetki yoksa maskeli
 * döner; {@code vkn:} ile arama eşleşse de tam değer sızmaz (L8, spec §14.2).</p>
 */
@Component
@RequiredArgsConstructor
public class CounterpartSearchStrategy implements EntitySearchStrategy {

    private final CounterpartSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.COUNTERPART;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<Counterpart> rows = repository.search(
                ctx.accessibleBusinessIds(),
                hasText, hasText ? term : "%",
                q.getTaxId(),
                PageRequest.of(0, Math.min(limit, 50)));

        boolean canSeeTax = ctx.can(SearchPermission.COUNTERPART_FULL_VIEW);
        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (Counterpart c : rows) {
            Map<String, Object> meta = new LinkedHashMap<>();
            if (c.getTaxId() != null && !c.getTaxId().isBlank()) {
                meta.put("taxId", canSeeTax ? c.getTaxId() : SensitiveMask.taxId(c.getTaxId()));
                meta.put("taxIdMasked", !canSeeTax);
            }
            if (c.getContactPhone() != null) meta.put("phone", c.getContactPhone());
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(c.getId())
                    .title(c.getName())
                    .snippet(SearchTerms.highlight(c.getName(), q))
                    .businessId(c.getBusiness() != null ? c.getBusiness().getId() : null)
                    .businessName(c.getBusiness() != null ? c.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(c.getName(), terms, null, null))
                    .url("/dashboard/counterparts?focus=" + c.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<Counterpart> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (Counterpart c : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(c.getId())
                    .label(c.getName())
                    .businessId(c.getBusiness() != null ? c.getBusiness().getId() : null)
                    .businessName(c.getBusiness() != null ? c.getBusiness().getName() : null)
                    .url("/dashboard/counterparts?focus=" + c.getId())
                    .build());
        }
        return out;
    }
}
