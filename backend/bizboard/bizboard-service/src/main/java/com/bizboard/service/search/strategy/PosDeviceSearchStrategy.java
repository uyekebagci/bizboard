package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.PosDevice;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.PosDeviceSearchRepository;
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
 * v2.2.0 — PosDevice (POS cihazı) arama stratejisi (spec §4, v1.7+).
 *
 * <p>Tenant-scope: business.id IN (L3). Aranabilir: name, bank_name, owner
 * counterpart adı.</p>
 */
@Component
@RequiredArgsConstructor
public class PosDeviceSearchStrategy implements EntitySearchStrategy {

    private final PosDeviceSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.POS_DEVICE;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<PosDevice> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (PosDevice p : rows) {
            Map<String, Object> meta = new LinkedHashMap<>();
            if (p.getBankName() != null) meta.put("bankName", p.getBankName());
            if (p.getOwnerCounterpart() != null) meta.put("owner", p.getOwnerCounterpart().getName());
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(p.getId())
                    .title(p.getName())
                    .snippet(SearchTerms.highlight(p.getName(), q))
                    .businessId(p.getBusiness() != null ? p.getBusiness().getId() : null)
                    .businessName(p.getBusiness() != null ? p.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(p.getName(), terms, null, null))
                    .url("/dashboard/pos-cihazlari?focus=" + p.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<PosDevice> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (PosDevice p : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(p.getId())
                    .label(p.getName())
                    .businessId(p.getBusiness() != null ? p.getBusiness().getId() : null)
                    .businessName(p.getBusiness() != null ? p.getBusiness().getName() : null)
                    .url("/dashboard/pos-cihazlari?focus=" + p.getId())
                    .build());
        }
        return out;
    }
}
