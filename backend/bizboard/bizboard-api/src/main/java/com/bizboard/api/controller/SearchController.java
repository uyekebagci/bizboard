package com.bizboard.api.controller;

import com.bizboard.common.dto.SaveSearchRequest;
import com.bizboard.common.dto.SavedSearchDto;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchResult;
import com.bizboard.common.search.Suggestion;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.search.SavedSearchService;
import com.bizboard.service.search.SearchOptions;
import com.bizboard.service.search.SearchRateLimiter;
import com.bizboard.service.search.SearchService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * v2.2.0 Advanced Search — REST API (spec §9, L1+L5+L7).
 *
 * <p>L1: tüm endpoint'ler authenticated (SecurityConfig {@code anyRequest
 * authenticated}). L5: yalnızca {@link SearchService} çağrılır — ad-hoc repo
 * araması yok. L7: {@link SearchRateLimiter} ile per-user limit.</p>
 *
 * <p>Not (spec §9.1 path): spec {@code /api/v2/search} der; Çatı'da context-path
 * yok, mevcut endpoint'ler kök seviyede ({@code /counterparts} vb.). Tutarlılık
 * için bu modül kök {@code /search} altına yerleşir.</p>
 */
@RestController
@RequestMapping("/search")
@RequiredArgsConstructor
public class SearchController {

    private final SearchService searchService;
    private final SavedSearchService savedSearchService;
    private final SearchRateLimiter rateLimiter;

    @GetMapping
    public ResponseEntity<SearchResult> search(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "q", required = false, defaultValue = "") String q,
            @RequestParam(name = "types", required = false) List<String> types,
            @RequestParam(name = "page", required = false, defaultValue = "0") int page,
            @RequestParam(name = "size", required = false, defaultValue = "20") int size,
            @RequestParam(name = "sort", required = false, defaultValue = "RELEVANCE") String sort) {
        rateLimiter.check(principal.getId(), SearchRateLimiter.Scope.SEARCH);
        SearchOptions opts = new SearchOptions(page, size, parseSort(sort), parseTypes(types));
        return ResponseEntity.ok(searchService.search(principal.getId(), q, opts));
    }

    @GetMapping("/suggest")
    public ResponseEntity<List<Suggestion>> suggest(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "q", required = false, defaultValue = "") String q,
            @RequestParam(name = "limit", required = false, defaultValue = "10") int limit) {
        rateLimiter.check(principal.getId(), SearchRateLimiter.Scope.SUGGEST);
        return ResponseEntity.ok(searchService.suggest(principal.getId(), q, limit));
    }

    @GetMapping("/facets")
    public ResponseEntity<SearchResult.Facets> facets(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "q", required = false, defaultValue = "") String q) {
        rateLimiter.check(principal.getId(), SearchRateLimiter.Scope.SEARCH);
        return ResponseEntity.ok(searchService.facets(principal.getId(), q));
    }

    // ── Kayıtlı aramalar (spec §9.1) ─────────────────────────────────────────

    @GetMapping("/saved")
    public ResponseEntity<List<SavedSearchDto>> savedList(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(savedSearchService.list(principal.getId()));
    }

    @PostMapping("/saved")
    public ResponseEntity<SavedSearchDto> savedCreate(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SaveSearchRequest req) {
        rateLimiter.check(principal.getId(), SearchRateLimiter.Scope.SAVED);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(savedSearchService.create(principal.getId(), req));
    }

    @PatchMapping("/saved/{id}")
    public ResponseEntity<SavedSearchDto> savedUpdate(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody SaveSearchRequest req) {
        return ResponseEntity.ok(savedSearchService.update(principal.getId(), id, req));
    }

    @DeleteMapping("/saved/{id}")
    public ResponseEntity<Void> savedDelete(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        savedSearchService.delete(principal.getId(), id);
        return ResponseEntity.noContent().build();
    }

    // ── 429 (L7, spec §12) ───────────────────────────────────────────────────

    @ExceptionHandler(SearchRateLimiter.RateLimitExceededException.class)
    public ResponseEntity<Map<String, Object>> handleRateLimit(
            SearchRateLimiter.RateLimitExceededException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(Map.of(
                        "message", ex.getMessage(),
                        "retryAfterSeconds", ex.getRetryAfterSeconds()));
    }

    // ── helpers ──

    private SearchOptions.Sort parseSort(String sort) {
        try {
            return SearchOptions.Sort.valueOf(sort.trim().toUpperCase());
        } catch (Exception e) {
            return SearchOptions.Sort.RELEVANCE;
        }
    }

    private Set<SearchEntityType> parseTypes(List<String> types) {
        if (types == null || types.isEmpty()) return Set.of();
        Set<SearchEntityType> out = new LinkedHashSet<>();
        for (String t : types) {
            SearchEntityType.fromAlias(t).ifPresent(out::add);
        }
        return out;
    }
}
