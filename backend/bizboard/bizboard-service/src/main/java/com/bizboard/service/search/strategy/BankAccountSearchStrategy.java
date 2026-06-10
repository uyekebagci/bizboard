package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.SearchPermission;
import com.bizboard.common.search.SensitiveMask;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.BankAccountSearchRepository;
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
 * v2.2.0 — BankAccount arama stratejisi (spec §4, §8.1).
 *
 * <p>Tenant-scope: business.id IN (L3). <b>IBAN hassas</b> (BANK_FULL_VIEW):
 * yetki yoksa maskeli; {@code iban:} ile arama eşleşse de tam IBAN sızmaz (L8).</p>
 */
@Component
@RequiredArgsConstructor
public class BankAccountSearchStrategy implements EntitySearchStrategy {

    private final BankAccountSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.BANK_ACCOUNT;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<BankAccount> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                q.getIban(), PageRequest.of(0, Math.min(limit, 50)));

        boolean canSeeIban = ctx.can(SearchPermission.BANK_FULL_VIEW);
        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (BankAccount b : rows) {
            Map<String, Object> meta = new LinkedHashMap<>();
            if (b.getBankName() != null) meta.put("bankName", b.getBankName());
            if (b.getIban() != null && !b.getIban().isBlank()) {
                meta.put("iban", canSeeIban ? b.getIban() : SensitiveMask.iban(b.getIban()));
                meta.put("ibanMasked", !canSeeIban);
            }
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(b.getId())
                    .title(b.getName())
                    .snippet(SearchTerms.highlight(b.getName(), q))
                    .businessId(b.getBusiness() != null ? b.getBusiness().getId() : null)
                    .businessName(b.getBusiness() != null ? b.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(b.getName(), terms, null, null))
                    .url("/dashboard/hesaplar?focus=" + b.getId())
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
                    .url("/dashboard/hesaplar?focus=" + b.getId())
                    .build());
        }
        return out;
    }
}
