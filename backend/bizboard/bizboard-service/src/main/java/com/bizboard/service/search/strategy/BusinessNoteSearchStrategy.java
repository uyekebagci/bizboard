package com.bizboard.service.search.strategy;

import com.bizboard.common.entity.BusinessNote;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;
import com.bizboard.repository.search.BusinessNoteSearchRepository;
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
 * v2.2.0 — BusinessNote (not) arama stratejisi (spec §4).
 *
 * <p>Tenant-scope: business.id IN (L3). <b>Ek güvenlik:</b> {@code admin_only}
 * notlar yalnız admin'e döner; normal kullanıcı göremez (repo {@code :isAdmin}).
 * Not içeriği uzun olabileceği için title kısaltılır.</p>
 */
@Component
@RequiredArgsConstructor
public class BusinessNoteSearchStrategy implements EntitySearchStrategy {

    private static final int TITLE_MAX = 80;

    private final BusinessNoteSearchRepository repository;

    @Override
    public SearchEntityType type() {
        return SearchEntityType.NOTE;
    }

    @Override
    public List<SearchHit> search(ParsedQuery q, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String term = SearchTerms.likePattern(q);
        boolean hasText = term != null;
        List<BusinessNote> rows = repository.search(
                ctx.accessibleBusinessIds(), ctx.admin(), hasText, hasText ? term : "%",
                PageRequest.of(0, Math.min(limit, 50)));

        List<String> terms = SearchTerms.allTerms(q);
        List<SearchHit> hits = new ArrayList<>(rows.size());
        for (BusinessNote n : rows) {
            String content = n.getContent() != null ? n.getContent() : "";
            String title = content.length() > TITLE_MAX ? content.substring(0, TITLE_MAX) + "…" : content;
            Map<String, Object> meta = new LinkedHashMap<>();
            if (n.isPinned()) meta.put("pinned", true);
            hits.add(SearchHit.builder()
                    .type(type())
                    .id(n.getId())
                    .title(title)
                    .snippet(SearchTerms.highlight(title, q))
                    .businessId(n.getBusiness() != null ? n.getBusiness().getId() : null)
                    .businessName(n.getBusiness() != null ? n.getBusiness().getName() : null)
                    .metadata(meta)
                    .rank(SearchRanker.score(content, terms, null, null))
                    .url(noteUrl(n))
                    .build());
        }
        return hits;
    }

    @Override
    public List<Suggestion> suggest(String prefix, AccessContext ctx, int limit) {
        if (ctx.hasNoAccess()) return List.of();
        String pattern = SearchTerms.prefixPattern(prefix);
        if (pattern == null) return List.of();
        List<BusinessNote> rows = repository.suggest(
                ctx.accessibleBusinessIds(), ctx.admin(), pattern,
                PageRequest.of(0, Math.min(limit, 10)));
        List<Suggestion> out = new ArrayList<>(rows.size());
        for (BusinessNote n : rows) {
            String content = n.getContent() != null ? n.getContent() : "";
            String label = content.length() > TITLE_MAX ? content.substring(0, TITLE_MAX) + "…" : content;
            out.add(Suggestion.builder()
                    .type(type())
                    .id(n.getId())
                    .label(label)
                    .businessId(n.getBusiness() != null ? n.getBusiness().getId() : null)
                    .businessName(n.getBusiness() != null ? n.getBusiness().getName() : null)
                    .url(noteUrl(n))
                    .build());
        }
        return out;
    }

    private String noteUrl(BusinessNote n) {
        return n.getBusiness() != null
                ? "/business/" + n.getBusiness().getId() + "?tab=notes"
                : "/dashboard/businesses";
    }
}
