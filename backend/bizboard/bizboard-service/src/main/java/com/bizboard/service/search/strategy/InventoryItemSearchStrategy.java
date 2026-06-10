package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.InventoryItem;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.InventoryItemSearchRepository;
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
 * v2.2.0 — InventoryItem (envanter) arama stratejisi (spec §4).
 *
 * <p>Tenant-scope: business.id IN (L3). Aranabilir: name, sku, serial_number,
 * brand, model. {@code kategori:} → category.</p>
 */
@Component
@RequiredArgsConstructor
public class InventoryItemSearchStrategy implements EntitySearchStrategy {

    private final InventoryItemSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.INVENTORY_ITEM;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        String categoryLike = q.getCategories().isEmpty()
                ? null : "%" + q.getCategories().get(0).toLowerCase() + "%";
        List<InventoryItem> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                categoryLike, PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (InventoryItem i : rows) {
            Map<String, Object> meta = new LinkedHashMap<>();
            if (i.getCategory() != null) meta.put("category", i.getCategory());
            if (i.getSku() != null) meta.put("sku", i.getSku());
            if (i.getBrand() != null) meta.put("brand", i.getBrand());
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(i.getId())
                    .title(i.getName())
                    .snippet(SearchTerms.highlight(i.getName(), q))
                    .businessId(i.getBusiness() != null ? i.getBusiness().getId() : null)
                    .businessName(i.getBusiness() != null ? i.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(i.getName(), terms, null, null))
                    .url("/dashboard/inventory?focus=" + i.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<InventoryItem> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (InventoryItem i : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(i.getId())
                    .label(i.getName())
                    .businessId(i.getBusiness() != null ? i.getBusiness().getId() : null)
                    .businessName(i.getBusiness() != null ? i.getBusiness().getName() : null)
                    .url("/dashboard/inventory?focus=" + i.getId())
                    .build());
        }
        return out;
    }
}
