package com.bizboard.api.controller;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.BusinessAccessGuard;
import com.bizboard.service.ai.AiProperties;
import com.bizboard.service.ai.AnomalyDetectionService;
import com.bizboard.service.ai.EmbeddingService;
import com.bizboard.service.ai.RagService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * AI modülü (v1.1): business-scoped AI endpoint'leri. Tüm rotalar
 * authenticated; her mutate/read {@link BusinessAccessGuard} ile tenant
 * doğrulamasından geçer (arch-rules §1.2/§1.3). Erişim yoksa: read → 404,
 * mutate → 403 (guard fırlatır, GlobalExceptionHandler map'ler).
 *
 * <ul>
 *   <li>{@code POST /api/ai/businesses/{businessId}/chat} — RAG sorgusu</li>
 *   <li>{@code POST /api/ai/businesses/{businessId}/reindex} — embedding yeniden-üret (admin)</li>
 *   <li>{@code GET  /api/ai/businesses/{businessId}/anomaly-config} — anomali opt-in durumu</li>
 *   <li>{@code PUT  /api/ai/businesses/{businessId}/anomaly-config} — anomali opt-in aç/kapa (admin)</li>
 *   <li>{@code GET  /api/ai/status} — modül durumu (key/feature)</li>
 * </ul>
 *
 * <p><b>Graceful:</b> anahtar/pgvector yoksa endpoint'ler 500 atmaz; servisler
 * kibar/boş cevap döner.</p>
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final RagService ragService;
    private final EmbeddingService embeddingService;
    private final AnomalyDetectionService anomalyService;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final AiProperties props;

    // ───────────────── DTO'lar ─────────────────

    public record ChatRequest(@NotBlank String question) {}

    public record ChatResponse(String answer, boolean ai_used, int context_count) {}

    public record ReindexResponse(int stored) {}

    public record AnomalyConfig(@NotNull Boolean enabled) {}

    public record StatusResponse(boolean enabled, boolean llm_available,
                                 boolean embedding_available, boolean rag_enabled,
                                 boolean anomaly_enabled) {}

    // ───────────────── chat (RAG) ─────────────────

    @PostMapping("/businesses/{businessId}/chat")
    public ResponseEntity<ChatResponse> chat(
            @PathVariable UUID businessId,
            @org.springframework.web.bind.annotation.RequestBody ChatRequest body,
            @AuthenticationPrincipal UserPrincipal principal) {

        // READ erişimi: erişim yoksa 404 (varlık sızdırma yok).
        accessGuard.assertCanReadBusiness(principal.getId(), businessId);

        String question = body == null ? null : body.question();
        RagService.RagAnswer ans = ragService.answer(businessId, question);

        // Audit (best-effort, soru + context sayısı; cevap metni saklanmaz).
        auditLogService.recordEntityAction(
                AuditAction.AI_RAG_QUERY, principal.getId(), principal.getUsername(),
                "BUSINESS", businessId,
                "AI RAG sorgusu çalıştırıldı",
                Map.of(
                        "businessId", businessId.toString(),
                        "questionLength", String.valueOf(question == null ? 0 : question.length()),
                        "contextCount", String.valueOf(ans.contextCount()),
                        "aiUsed", String.valueOf(ans.aiUsed())),
                null);

        return ResponseEntity.ok(new ChatResponse(ans.answer(), ans.aiUsed(), ans.contextCount()));
    }

    // ───────────────── reindex (mutate, admin) ─────────────────

    @PostMapping("/businesses/{businessId}/reindex")
    public ResponseEntity<ReindexResponse> reindex(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {

        // MUTATE: erişim yoksa 403; ayrıca admin-only (yeniden-indeks maliyetli).
        accessGuard.assertCanAccessBusiness(principal.getId(), businessId);
        if (!accessGuard.isAdmin(principal.getId())) {
            throw new SecurityException("Yeniden-indeksleme admin yetkisi gerektirir");
        }

        int stored = embeddingService.reindexBusiness(businessId);

        auditLogService.recordEntityAction(
                AuditAction.AI_REINDEX, principal.getId(), principal.getUsername(),
                "BUSINESS", businessId,
                "AI embedding yeniden-üretildi (saklanan=" + stored + ")",
                Map.of("businessId", businessId.toString(), "stored", String.valueOf(stored)),
                null);

        return ResponseEntity.ok(new ReindexResponse(stored));
    }

    // ───────────────── anomali opt-in config ─────────────────

    @GetMapping("/businesses/{businessId}/anomaly-config")
    public ResponseEntity<AnomalyConfig> getAnomalyConfig(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        accessGuard.assertCanReadBusiness(principal.getId(), businessId);
        return ResponseEntity.ok(new AnomalyConfig(anomalyService.isEnabledForBusiness(businessId)));
    }

    @PutMapping("/businesses/{businessId}/anomaly-config")
    public ResponseEntity<AnomalyConfig> setAnomalyConfig(
            @PathVariable UUID businessId,
            @org.springframework.web.bind.annotation.RequestBody AnomalyConfig body,
            @AuthenticationPrincipal UserPrincipal principal) {
        accessGuard.assertCanAccessBusiness(principal.getId(), businessId);
        if (!accessGuard.isAdmin(principal.getId())) {
            throw new SecurityException("Anomali ayarı admin yetkisi gerektirir");
        }
        boolean enabled = body != null && Boolean.TRUE.equals(body.enabled());
        boolean result = anomalyService.setEnabledForBusiness(businessId, enabled, principal.getId());
        return ResponseEntity.ok(new AnomalyConfig(result));
    }

    // ───────────────── module status ─────────────────

    @GetMapping("/status")
    public ResponseEntity<StatusResponse> status(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(new StatusResponse(
                props.isEnabled(),
                props.isLlmEnabled(),
                props.isEmbeddingEnabled(),
                props.getRag().isEnabled(),
                props.getAnomaly().isEnabled()));
    }
}
