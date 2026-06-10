package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.Transaction;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.TransactionSearchRepository;
import com.bizboard.service.search.AccessContext;
import com.bizboard.service.search.EntitySearchStrategy;
import com.bizboard.service.search.SearchRanker;
import com.bizboard.service.search.SearchTerms;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * v2.2.0 — İşlem (transaction) arama stratejisi (spec §4, §8.1).
 *
 * <p>Tenant-scope: {@code business.id IN ctx.accessibleBusinessIds} (L3).
 * Amount maskelenmez (Normal sensitivity). Recency-boost'lu re-rank uygulanır.</p>
 */
@Component
@RequiredArgsConstructor
public class TransactionSearchStrategy implements EntitySearchStrategy {

    private final TransactionSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.TRANSACTION;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        ParsedQuery.Range amt = q.getAmountRange();
        ParsedQuery.DateRange dr = q.getDateRange();
        String categoryLike = q.getCategories().isEmpty()
                ? null : "%" + q.getCategories().get(0).toLowerCase() + "%";

        List<Transaction> rows = repository.search(
                ctx.accessibleBusinessIds(),
                hasText,
                hasText ? term : "%",
                amt != null ? amt.getMin() : null,
                amt != null ? amt.getMax() : null,
                dr != null ? dr.getFrom() : null,
                dr != null ? dr.getTo() : null,
                categoryLike,
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        LocalDate today = LocalDate.now();
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (Transaction t : rows) {
            String desc = t.getDescription() != null ? t.getDescription() : "(açıklama yok)";
            String categoryName = t.getCategory() != null ? t.getCategory().getName() : null;
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("amount", t.getAmount());
            meta.put("direction", t.getDirection() != null ? t.getDirection().name() : null);
            if (categoryName != null) meta.put("category", categoryName);
            meta.put("date", t.getDate());

            hits.add(SearchHit.builder()
                    .type(type())
                    .id(t.getId())
                    .title(desc)
                    .snippet(SearchTerms.highlight(desc, q))
                    .businessId(t.getBusiness() != null ? t.getBusiness().getId() : null)
                    .businessName(t.getBusiness() != null ? t.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(desc, terms, t.getDate(), today))
                    .url("/dashboard/transactions?focus=" + t.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<Transaction> rows = repository.suggest(
                ctx.accessibleBusinessIds(), "%" + pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (Transaction t : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(t.getId())
                    .label(t.getDescription())
                    .businessId(t.getBusiness() != null ? t.getBusiness().getId() : null)
                    .businessName(t.getBusiness() != null ? t.getBusiness().getName() : null)
                    .url("/dashboard/transactions?focus=" + t.getId())
                    .build());
        }
        return out;
    }
}
