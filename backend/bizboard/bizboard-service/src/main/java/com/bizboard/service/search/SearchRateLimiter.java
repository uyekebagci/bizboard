package com.bizboard.service.search;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * v2.2.0 — kullanıcı-başına sliding-window rate limiter (spec §12, L7).
 *
 * <p>In-memory; tek-instance Sevalla deploy'una göre ({@link com.bizboard.service.LoginRateLimiter}
 * ile aynı desen). Multi-instance gerekirse Redis'e geçilir.</p>
 *
 * <p>Limitler (env override):</p>
 * <ul>
 *   <li>{@code search}: 30 req/dk/user</li>
 *   <li>{@code suggest}: 60 req/dk/user</li>
 *   <li>{@code saved} (POST): 10 req/dk/user</li>
 * </ul>
 *
 * <p>Aşıldığında {@link RateLimitExceededException} → controller 429 +
 * {@code Retry-After} döner (spec §12).</p>
 */
@Slf4j
@Component
public class SearchRateLimiter {

    public enum Scope { SEARCH, SUGGEST, SAVED }

    private static final Duration WINDOW = Duration.ofMinutes(1);

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();
    private final int searchLimit;
    private final int suggestLimit;
    private final int savedLimit;

    public SearchRateLimiter(
            @Value("${app.search.rate.search-per-min:30}") int searchLimit,
            @Value("${app.search.rate.suggest-per-min:60}") int suggestLimit,
            @Value("${app.search.rate.saved-per-min:10}") int savedLimit) {
        this.searchLimit = searchLimit;
        this.suggestLimit = suggestLimit;
        this.savedLimit = savedLimit;
    }

    /** Limit aşılırsa {@link RateLimitExceededException} fırlatır. */
    public void check(UUID userId, Scope scope) {
        if (userId == null) return;
        int limit = limitFor(scope);
        String key = userId + ":" + scope;
        Instant now = Instant.now();
        Instant cutoff = now.minus(WINDOW);

        Deque<Instant> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(cutoff)) {
                q.pollFirst();
            }
            if (q.size() >= limit) {
                long retryAfter = Math.max(1,
                        Duration.between(cutoff, q.peekFirst()).toSeconds());
                log.warn("[search-limit] user {} scope {} exceeded ({} >= {})",
                        userId, scope, q.size(), limit);
                throw new RateLimitExceededException(retryAfter);
            }
            q.addLast(now);
        }
    }

    private int limitFor(Scope scope) {
        return switch (scope) {
            case SEARCH -> searchLimit;
            case SUGGEST -> suggestLimit;
            case SAVED -> savedLimit;
        };
    }

    /** 429 sinyali — controller {@code Retry-After} header'ı ile döner. */
    public static class RateLimitExceededException extends RuntimeException {
        private final long retryAfterSeconds;
        public RateLimitExceededException(long retryAfterSeconds) {
            super("Çok fazla istek. " + retryAfterSeconds + " sn sonra tekrar deneyin.");
            this.retryAfterSeconds = retryAfterSeconds;
        }
        public long getRetryAfterSeconds() { return retryAfterSeconds; }
    }
}
