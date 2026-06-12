package com.bizboard.service;

import com.bizboard.common.dto.AuditLogDto;
import com.bizboard.common.entity.AuditLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Realtime SSE (Server-Sent Events) audit akışı.
 *
 * <p>Admin viewer canlı bağlanır ({@code GET /admin/audit/stream}); her yeni
 * audit kaydı bağlı tüm emitter'lara {@code audit} event'i olarak yayınlanır.
 * Bağlantı kurulduğunda bir {@code connected} event'i gönderilir.</p>
 *
 * <p><b>Dayanıklılık:</b></p>
 * <ul>
 *   <li>Emitter'lar {@link ConcurrentHashMap} ile thread-safe tutulur.</li>
 *   <li>completion/timeout/error callback'leri emitter'ı registry'den temizler
 *       (sızıntı yok).</li>
 *   <li>Yayında hata alan emitter anında çıkarılır; bir client'ın kopması
 *       diğerlerini etkilemez.</li>
 *   <li>Periyodik heartbeat (comment frame) — proxy/idle-timeout'a karşı.</li>
 *   <li>{@link #publish} asla exception fırlatmaz — audit yazımını ASLA bozmaz.</li>
 * </ul>
 *
 * <p>Çok-instance dağıtımda her instance yalnız kendi bağlı client'larına
 * yayınlar; tam global canlı akış için ileride pub/sub (Redis) köprüsü gerekir.
 * Mevcut tek-instance dağıtımda yeterlidir.</p>
 */
@Slf4j
@Service
public class AuditStreamService {

    /** SSE bağlantısı zaman aşımı: 30 dk. (Sonra client otomatik yeniden bağlanır.) */
    private static final long EMITTER_TIMEOUT_MS = 30L * 60L * 1000L;
    /** Aynı anda izin verilen azami canlı bağlantı (kaynak koruması). */
    private static final int MAX_EMITTERS = 50;

    private final Map<Long, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final AtomicLong idGen = new AtomicLong();

    /**
     * Yeni bir SSE bağlantısı oluşturur ve registry'ye ekler.
     * @return controller'ın döndüreceği {@link SseEmitter}
     */
    public SseEmitter subscribe() {
        if (emitters.size() >= MAX_EMITTERS) {
            // Sessiz reddetmek yerine kısa-ömürlü, anında biten emitter dön.
            SseEmitter full = new SseEmitter(1000L);
            try {
                full.send(SseEmitter.event().name("error")
                        .data(Map.of("message", "Azami canlı bağlantı sayısına ulaşıldı")));
                full.complete();
            } catch (IOException ignored) {
                // best-effort
            }
            return full;
        }

        long id = idGen.incrementAndGet();
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        emitter.onCompletion(() -> emitters.remove(id));
        emitter.onTimeout(() -> {
            emitters.remove(id);
            emitter.complete();
        });
        emitter.onError(e -> emitters.remove(id));
        emitters.put(id, emitter);

        try {
            emitter.send(SseEmitter.event().name("connected")
                    .data(Map.of("message", "Canlı audit akışı bağlandı", "active", emitters.size())));
        } catch (IOException e) {
            emitters.remove(id);
            emitter.completeWithError(e);
        }
        log.debug("[audit-stream] subscribed id={} active={}", id, emitters.size());
        return emitter;
    }

    /**
     * Yeni bir audit kaydını tüm bağlı client'lara yayınlar. Best-effort:
     * hata fırlatmaz, kopan emitter'ı temizler.
     */
    public void publish(AuditLog saved) {
        if (emitters.isEmpty() || saved == null) {
            return;
        }
        AuditLogDto dto;
        try {
            dto = AuditLogMapper.toDto(saved);
        } catch (Exception e) {
            log.debug("[audit-stream] dto map failed (ignored): {}", e.getMessage());
            return;
        }
        emitters.forEach((id, emitter) -> {
            try {
                emitter.send(SseEmitter.event().name("audit").id(String.valueOf(saved.getId())).data(dto));
            } catch (Exception e) {
                emitters.remove(id);
                try {
                    emitter.complete();
                } catch (Exception ignored) {
                    // already broken
                }
            }
        });
    }

    /** Proxy/idle-timeout'a karşı periyodik heartbeat (yorum frame'i). */
    @Scheduled(fixedRate = 25_000)
    public void heartbeat() {
        if (emitters.isEmpty()) {
            return;
        }
        emitters.forEach((id, emitter) -> {
            try {
                emitter.send(SseEmitter.event().comment("hb"));
            } catch (Exception e) {
                emitters.remove(id);
                try {
                    emitter.complete();
                } catch (Exception ignored) {
                    // already broken
                }
            }
        });
    }

    /** Aktif bağlantı sayısı (teşhis/metrik). */
    public int activeConnections() {
        return emitters.size();
    }
}
