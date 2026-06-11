package com.bizboard.service.notification;

import com.bizboard.service.search.SearchRateLimiter;
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
 * MAN-1 (design §3.3): admin manuel gönderim için per-admin sliding-window
 * rate limiter. Varsayılan 10 istek/dakika/admin.
 *
 * <p>{@link SearchRateLimiter} ile aynı in-memory desen (tek-instance Sevalla).
 * Limit aşılınca {@link SearchRateLimiter.RateLimitExceededException} fırlatır —
 * mevcut 429 controller handler'ı tekrar kullanılır (yeni exception tipi yok).</p>
 */
@Slf4j
@Component
public class AdminNotificationRateLimiter {

    private static final Duration WINDOW = Duration.ofMinutes(1);

    private final Map<UUID, Deque<Instant>> hits = new ConcurrentHashMap<>();
    private final int manualSendLimit;

    public AdminNotificationRateLimiter(
            @Value("${app.notifications.admin.manual-send-per-min:10}") int manualSendLimit) {
        this.manualSendLimit = manualSendLimit;
    }

    /** Limit aşılırsa {@link SearchRateLimiter.RateLimitExceededException} (→ 429). */
    public void checkManualSend(UUID adminUserId) {
        if (adminUserId == null) return;
        Instant now = Instant.now();
        Instant cutoff = now.minus(WINDOW);

        Deque<Instant> q = hits.computeIfAbsent(adminUserId, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(cutoff)) {
                q.pollFirst();
            }
            if (q.size() >= manualSendLimit) {
                long retryAfter = Math.max(1,
                        Duration.between(cutoff, q.peekFirst()).toSeconds());
                log.warn("[admin-notif-limit] admin {} manuel gönderim limiti aşıldı ({} >= {})",
                        adminUserId, q.size(), manualSendLimit);
                throw new SearchRateLimiter.RateLimitExceededException(retryAfter);
            }
            q.addLast(now);
        }
    }
}
