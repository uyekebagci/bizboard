package com.bizboard.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Username bazlı login brute-force koruması.
 *
 * <p>In-memory; tek-instance Sevalla deploy'una göre boyutlandırıldı. Multi-instance
 * gerekirse Redis'e geçişin yolu açık — interface tek metoduyla mock'lanabilir.
 * Multi-instance v2 iş paketinde değerlendirilecek.</p>
 *
 * <p><b>Politika</b> (env override mümkün):</p>
 * <ul>
 *   <li>{@code app.auth.login.window-seconds} (default 300) içinde
 *       {@code app.auth.login.max-failures} (default 5) başarısız deneme yaparsa</li>
 *   <li>kullanıcı {@code app.auth.login.lockout-seconds} (default 900) süreyle kilitlenir</li>
 *   <li>başarılı bir login, sayaç ve kilidi sıfırlar</li>
 * </ul>
 *
 * <p>Anahtar olarak lowercase username kullanılır. IP bazlı limit eklenmedi —
 * X-Forwarded-For ile değişebilir; audit log'a IP zaten düşüyor, forensik için
 * yeterli. Tek hedef saldırgan farklı kullanıcı adları denerse o ayrı kullanıcılar
 * için ayrı sayaçlar üretir; bu bilinen sınırlama.</p>
 */
@Slf4j
@Component
public class LoginRateLimiter {

    private record Bucket(int failCount, Instant windowStart, Instant lockedUntil) {}

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final int maxFailures;
    private final Duration window;
    private final Duration lockout;

    public LoginRateLimiter(
            @Value("${app.auth.login.max-failures:5}") int maxFailures,
            @Value("${app.auth.login.window-seconds:300}") int windowSeconds,
            @Value("${app.auth.login.lockout-seconds:900}") int lockoutSeconds) {
        this.maxFailures = maxFailures;
        this.window = Duration.ofSeconds(windowSeconds);
        this.lockout = Duration.ofSeconds(lockoutSeconds);
    }

    /** Kullanıcı şu an kilitli mi? */
    public boolean isLocked(String username) {
        if (username == null) return false;
        Bucket b = buckets.get(key(username));
        if (b == null || b.lockedUntil() == null) return false;
        if (Instant.now().isBefore(b.lockedUntil())) return true;
        // Lockout doldu — temizle.
        buckets.remove(key(username));
        return false;
    }

    /** Kilit zamanı kalanı (saniye), kilitli değilse 0. UX/log için. */
    public long secondsUntilUnlock(String username) {
        if (username == null) return 0;
        Bucket b = buckets.get(key(username));
        if (b == null || b.lockedUntil() == null) return 0;
        long secs = Duration.between(Instant.now(), b.lockedUntil()).toSeconds();
        return Math.max(0, secs);
    }

    /** Başarısız deneme kaydet; gerekirse kilitle. */
    public void recordFailure(String username) {
        if (username == null) return;
        Instant now = Instant.now();
        buckets.compute(key(username), (k, prev) -> {
            if (prev == null || Duration.between(prev.windowStart(), now).compareTo(window) >= 0) {
                // Pencere yenisi.
                return new Bucket(1, now, null);
            }
            int newCount = prev.failCount() + 1;
            Instant locked = newCount >= maxFailures ? now.plus(lockout) : prev.lockedUntil();
            if (locked != null && (prev.lockedUntil() == null || !locked.equals(prev.lockedUntil()))) {
                log.warn("[login-limit] user '{}' locked out after {} failures (until {})",
                        username, newCount, locked);
            }
            return new Bucket(newCount, prev.windowStart(), locked);
        });
    }

    /** Başarılı login — sayaç ve kilidi sıfırla. */
    public void recordSuccess(String username) {
        if (username == null) return;
        buckets.remove(key(username));
    }

    private static String key(String username) {
        return username.toLowerCase(Locale.ENGLISH);
    }

    /** Login akışı kilitli kullanıcı için bunu fırlatır → controller 429 döner. */
    public static class TooManyAttemptsException extends RuntimeException {
        private final long retryAfterSeconds;
        public TooManyAttemptsException(long retryAfterSeconds) {
            super("Too many failed login attempts. Retry after " + retryAfterSeconds + "s");
            this.retryAfterSeconds = retryAfterSeconds;
        }
        public long getRetryAfterSeconds() { return retryAfterSeconds; }
    }
}
