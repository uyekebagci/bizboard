package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.Vehicle;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.VehicleSearchRepository;
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
 * v2.2.0 — Vehicle (araç) arama stratejisi (spec §4).
 *
 * <p>Tenant-scope: business.id IN (L3). Aranabilir: plaka, marka, model.</p>
 */
@Component
@RequiredArgsConstructor
public class VehicleSearchStrategy implements EntitySearchStrategy {

    private final VehicleSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.VEHICLE;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<Vehicle> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (Vehicle v : rows) {
            String title = v.getPlateNumber();
            String detail = (v.getBrand() != null ? v.getBrand() + " " : "")
                    + (v.getModel() != null ? v.getModel() : "");
            Map<String, Object> meta = new LinkedHashMap<>();
            if (!detail.isBlank()) meta.put("model", detail.trim());
            if (v.getModelYear() != null) meta.put("year", v.getModelYear());
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(v.getId())
                    .title(title)
                    .snippet(SearchTerms.highlight(title, q))
                    .businessId(v.getBusiness() != null ? v.getBusiness().getId() : null)
                    .businessName(v.getBusiness() != null ? v.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(title, terms, null, null))
                    .url(vehicleUrl(v))
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<Vehicle> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (Vehicle v : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(v.getId())
                    .label(v.getPlateNumber())
                    .businessId(v.getBusiness() != null ? v.getBusiness().getId() : null)
                    .businessName(v.getBusiness() != null ? v.getBusiness().getName() : null)
                    .url(vehicleUrl(v))
                    .build());
        }
        return out;
    }

    /** Araç işletme detayındaki "vehicles" modülünde yönetilir. */
    private String vehicleUrl(Vehicle v) {
        return v.getBusiness() != null
                ? "/business/" + v.getBusiness().getId() + "?tab=vehicles"
                : "/dashboard/businesses";
    }
}
