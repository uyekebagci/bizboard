package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.SubCashSearchRepository;
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
 * v2.2.0 — SubCash (alt kasa) arama stratejisi (spec §4, v1.7+).
 *
 * <p>Alt kasa = {@code bank_accounts type=SUB_CASH}. Tenant-scope: business.id IN
 * (L3). Aranabilir: name. BankAccount strategy SUB_CASH'i hariç tuttuğu için
 * duplicate yok.</p>
 */
@Component
@RequiredArgsConstructor
public class SubCashSearchStrategy implements EntitySearchStrategy {

    private final SubCashSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.SUB_CASH;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<BankAccount> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (BankAccount b : rows) {
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(b.getId())
                    .title(b.getName())
                    .snippet(SearchTerms.highlight(b.getName(), q))
                    .businessId(b.getBusiness() != null ? b.getBusiness().getId() : null)
                    .businessName(b.getBusiness() != null ? b.getBusiness().getName() : null)
                    .rank(SearchRanker.score(b.getName(), terms, null, null))
                    .url("/dashboard/nakit?focus=" + b.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<BankAccount> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (BankAccount b : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(b.getId())
                    .label(b.getName())
                    .businessId(b.getBusiness() != null ? b.getBusiness().getId() : null)
                    .businessName(b.getBusiness() != null ? b.getBusiness().getName() : null)
                    .url("/dashboard/nakit?focus=" + b.getId())
                    .build());
        }
        return out;
    }
}
