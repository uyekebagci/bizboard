package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.MyCompany;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.SearchPermission;
import com.bizboard.common.search.SensitiveMask;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.MyCompanySearchRepository;
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
 * v2.2.0 — MyCompany (firmam) arama stratejisi (spec §4, §8.1).
 *
 * <p><b>Erişim farkı (T1):</b> MyCompany'nin business_id'si yoktur; erişim
 * {@code my_company_user_access} üzerinden. Admin tüm firmaları görür; normal
 * kullanıcı yalnız {@code ctx.accessibleMyCompanyIds}. VKN/MERSIS hassas
 * (MY_COMPANY_FULL_VIEW) → yetki yoksa maskeli (L8).</p>
 */
@Component
@RequiredArgsConstructor
public class MyCompanySearchStrategy implements EntitySearchStrategy {

    private final MyCompanySearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.MY_COMPANY;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        // Admin tüm firmalara erişir; normal kullanıcı yalnız erişim listesi.
        if (!ctx.admin() && (ctx.accessibleMyCompanyIds() == null
                || ctx.accessibleMyCompanyIds().isEmpty())) {
            return List.of();
        }
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        PageRequest pr = PageRequest.of(0, Math.min(limit, 50));
        List<MyCompany> rows = ctx.admin()
                ? repository.searchAll(hasText, hasText ? term : "%", q.getTaxId(), pr)
                : repository.searchScoped(ctx.accessibleMyCompanyIds(), hasText,
                        hasText ? term : "%", q.getTaxId(), pr);

        boolean canSeeFull = ctx.can(SearchPermission.MY_COMPANY_FULL_VIEW);
        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (MyCompany m : rows) {
            Map<String, Object> meta = new LinkedHashMap<>();
            if (m.getTaxId() != null && !m.getTaxId().isBlank()) {
                meta.put("taxId", canSeeFull ? m.getTaxId() : SensitiveMask.taxId(m.getTaxId()));
                meta.put("taxIdMasked", !canSeeFull);
            }
            if (m.getMersisNo() != null && !m.getMersisNo().isBlank()) {
                meta.put("mersis", canSeeFull ? m.getMersisNo() : SensitiveMask.mersis(m.getMersisNo()));
                meta.put("mersisMasked", !canSeeFull);
            }
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(m.getId())
                    .title(m.getLegalName())
                    .snippet(SearchTerms.highlight(m.getLegalName(), q))
                    .metadata(meta)
                    .rank(SearchRanker.score(m.getLegalName(), terms, null, null))
                    .url("/dashboard/firmalarim?focus=" + m.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        // Suggest tüm searchable string'i ararken aynı access scope'unu uygular.
        List<SearchHit> hits = search(
                ParsedQuery.builder().terms(List.of(prefix)).build(), ctx, limit);
        List<Suggestion> out = new ArrayList<>(hits.size());
        for (SearchHit h : hits) {
            out.add(Suggestion.builder()
                    .type(type()).id(h.getId()).label(h.getTitle())
                    .url(h.getUrl()).build());
        }
        return out;
    }
}
