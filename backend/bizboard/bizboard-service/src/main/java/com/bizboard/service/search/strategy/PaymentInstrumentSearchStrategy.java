package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.PaymentInstrument;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.PaymentInstrumentSearchRepository;
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
 * v2.2.0 — PaymentInstrument (çek/senet) arama stratejisi (spec §4, v1.7+).
 *
 * <p>Tenant-scope: business.id IN (L3). Aranabilir: counterpart adı, çek no,
 * keşideci banka/şube, senet seri, açıklama. Tutar/tarih(vade)/durum filtreleri.</p>
 */
@Component
@RequiredArgsConstructor
public class PaymentInstrumentSearchStrategy implements EntitySearchStrategy {

    private final PaymentInstrumentSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.PAYMENT_INSTRUMENT;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        ParsedQuery.Range amt = q.getAmountRange();
        ParsedQuery.DateRange dr = q.getDateRange();
        String status = q.getStatuses().isEmpty() ? null : q.getStatuses().get(0);

        List<PaymentInstrument> rows = repository.search(
                ctx.accessibleBusinessIds(), hasText, hasText ? term : "%",
                amt != null ? amt.getMin() : null,
                amt != null ? amt.getMax() : null,
                dr != null ? dr.getFrom() : null,
                dr != null ? dr.getTo() : null,
                status,
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        LocalDate today = LocalDate.now();
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (PaymentInstrument pi : rows) {
            String cpName = pi.getCounterpart() != null ? pi.getCounterpart().getName() : "(çek/senet)";
            String title = (pi.getInstrumentType() != null ? pi.getInstrumentType() + " · " : "") + cpName;
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("amount", pi.getAmount());
            meta.put("status", pi.getStatus());
            if (pi.getChequeNumber() != null) meta.put("chequeNo", pi.getChequeNumber());
            if (pi.getNoteSerial() != null) meta.put("noteSerial", pi.getNoteSerial());
            if (pi.getDrawerBank() != null) meta.put("bankName", pi.getDrawerBank());
            if (pi.getDueDate() != null) meta.put("date", pi.getDueDate());
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(pi.getId())
                    .title(title)
                    .snippet(SearchTerms.highlight(cpName, q))
                    .businessId(pi.getBusiness() != null ? pi.getBusiness().getId() : null)
                    .businessName(pi.getBusiness() != null ? pi.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(cpName, terms, pi.getDueDate(), today))
                    .url("/dashboard/cekler?focus=" + pi.getId())
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<PaymentInstrument> rows = repository.suggest(
                ctx.accessibleBusinessIds(), pattern, PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (PaymentInstrument pi : rows) {
            String cpName = pi.getCounterpart() != null ? pi.getCounterpart().getName() : "Çek/Senet";
            out.add(Suggestion.builder()
                    .type(type())
                    .id(pi.getId())
                    .label(cpName + (pi.getChequeNumber() != null ? " · " + pi.getChequeNumber() : ""))
                    .businessId(pi.getBusiness() != null ? pi.getBusiness().getId() : null)
                    .businessName(pi.getBusiness() != null ? pi.getBusiness().getName() : null)
                    .url("/dashboard/cekler?focus=" + pi.getId())
                    .build());
        }
        return out;
    }
}
