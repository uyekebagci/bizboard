package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.Debt;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.DebtSearchRepository;
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
 * v2.2.0 — Debt (borç/alacak) arama stratejisi (spec §4, §8.1).
 *
 * <p>Tenant-scope: business.id IN (L3). {@code durum:odenmemis} → OPEN status.
 * Tutar/tarih aralık filtreleri desteklenir.</p>
 */
@Component
@RequiredArgsConstructor
public class DebtSearchStrategy implements EntitySearchStrategy {

    private final DebtSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.DEBT;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        ParsedQuery.Range amt = q.getAmountRange();
        ParsedQuery.DateRange dr = q.getDateRange();
        String status = mapStatus(q);

        List<Debt> rows = repository.search(
                ctx.accessibleBusinessIds(),
                hasText, hasText ? term : "%",
                amt != null ? amt.getMin() : null,
                amt != null ? amt.getMax() : null,
                dr != null ? dr.getFrom() : null,
                dr != null ? dr.getTo() : null,
                status,
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        LocalDate today = LocalDate.now();
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (Debt d : rows) {
            String title = d.getCounterparty() != null ? d.getCounterparty() : "(borç)";
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("amount", d.getAmount());
            meta.put("remaining", d.getRemainingAmount());
            meta.put("status", d.getStatus());
            meta.put("direction", d.getDirection() != null ? d.getDirection().name() : null);
            if (d.getDueDate() != null) meta.put("date", d.getDueDate());
            if (d.getDescription() != null) meta.put("note", d.getDescription());
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(d.getId())
                    .title(title)
                    .snippet(SearchTerms.highlight(title, q))
                    .businessId(d.getBusiness() != null ? d.getBusiness().getId() : null)
                    .businessName(d.getBusiness() != null ? d.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(title, terms, d.getDueDate(), today))
                    .url("/dashboard/alacaklar?focus=" + d.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<Debt> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (Debt d : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(d.getId())
                    .label(d.getCounterparty())
                    .businessId(d.getBusiness() != null ? d.getBusiness().getId() : null)
                    .businessName(d.getBusiness() != null ? d.getBusiness().getName() : null)
                    .url("/dashboard/alacaklar?focus=" + d.getId())
                    .build());
        }
        return out;
    }

    /** {@code durum:odenmemis|acik|open} → OPEN; {@code odendi|kapali|settled} → SETTLED. */
    private String mapStatus(ParsedQuery q) {
        if (q.getStatuses().isEmpty()) return null;
        String s = q.getStatuses().get(0);
        return switch (s) {
            case "odenmemis", "ödenmemiş", "acik", "açık", "open" -> "open";
            case "odendi", "ödendi", "kapali", "kapalı", "settled" -> "settled";
            default -> s; // ham değer (LOWER eşitlik); eşleşmezse boş sonuç
        };
    }
}
