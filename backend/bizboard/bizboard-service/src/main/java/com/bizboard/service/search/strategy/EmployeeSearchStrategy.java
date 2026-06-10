package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.Employee;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.SearchPermission;
import com.bizboard.common.search.SensitiveMask;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.EmployeeSearchRepository;
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
 * v2.2.0 — Employee (personel) arama stratejisi (spec §4, §8.1).
 *
 * <p>Tenant-scope: business.id IN (L3). <b>Maaş hassas</b> (HR_FULL_VIEW): yetki
 * yoksa gizli (🔒 rozet) — değer ASLA WHERE'de aranmaz, sadece maskeli sunulur
 * (L8, spec §4 maskeleme tablosu).</p>
 */
@Component
@RequiredArgsConstructor
public class EmployeeSearchStrategy implements EntitySearchStrategy {

    private final EmployeeSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.EMPLOYEE;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<Employee> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                PageRequest.of(0, Math.min(limit, 50)));

        boolean canSeeSalary = ctx.can(SearchPermission.HR_FULL_VIEW);
        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (Employee e : rows) {
            Map<String, Object> meta = new LinkedHashMap<>();
            if (e.getPosition() != null) meta.put("position", e.getPosition());
            if (canSeeSalary) {
                meta.put("salary", e.getSalary());
                meta.put("salaryMasked", false);
            } else {
                meta.put("salary", SensitiveMask.hidden());
                meta.put("salaryMasked", true);
            }
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(e.getId())
                    .title(e.getFullName())
                    .snippet(SearchTerms.highlight(e.getFullName(), q))
                    .businessId(e.getBusiness() != null ? e.getBusiness().getId() : null)
                    .businessName(e.getBusiness() != null ? e.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(e.getFullName(), terms, null, null))
                    .url("/dashboard/kisiler?focus=" + e.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<Employee> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (Employee e : rows) {
            out.add(Suggestion.builder()
                    .type(type())
                    .id(e.getId())
                    .label(e.getFullName())
                    .businessId(e.getBusiness() != null ? e.getBusiness().getId() : null)
                    .businessName(e.getBusiness() != null ? e.getBusiness().getName() : null)
                    .url("/dashboard/kisiler?focus=" + e.getId())
                    .build());
        }
        return out;
    }
}
