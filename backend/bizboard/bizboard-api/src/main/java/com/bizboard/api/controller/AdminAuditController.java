package com.bizboard.api.controller;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.AuditLogDto;
import com.bizboard.common.dto.PagedResponseDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.AuditAnonymizationService;
import com.bizboard.service.AuditChainService;
import com.bizboard.service.AuditExportService;
import com.bizboard.service.AuditLogQueryService;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.AuditStreamService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Admin audit log viewer + gelişmiş audit özellikleri (mod-audit, v1.1).
 *
 * <p>Tüm path'ler {@code /admin/**} → SecurityConfig'deki {@code ROLE_ADMIN}
 * kuralı ile korunur (admin-only; non-admin 403, anonymous 401). Audit kayıtları
 * sistem genelidir; cross-tenant sızıntı YOK çünkü erişim yalnız admin rolüne
 * açık. {@code businessId} bir <i>filtre</i>dir, tenant izolasyonu değildir.</p>
 *
 * <ul>
 *   <li>{@code GET  /admin/audit-logs}            — filtreli liste (mevcut)</li>
 *   <li>{@code GET  /admin/audit/verify-chain}    — tamper-proof zincir doğrula</li>
 *   <li>{@code POST /admin/audit/backfill-chain}  — geçmiş kayıtları zincirle (idempotent)</li>
 *   <li>{@code GET  /admin/audit/stream}          — canlı SSE audit akışı</li>
 *   <li>{@code GET  /admin/audit/export}          — CSV/JSON filtreli export</li>
 *   <li>{@code POST /admin/audit/anonymize}       — KVKK retention anonimleştirme</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminAuditController {

    private final AuditLogQueryService auditLogQueryService;
    private final AuditChainService auditChainService;
    private final AuditStreamService auditStreamService;
    private final AuditExportService auditExportService;
    private final AuditAnonymizationService auditAnonymizationService;
    private final AuditLogService auditLogService;

    /**
     * Filtreli arama. Parametre adları frontend admin/audit page'inin gönderdiği
     * snake_case alanları kabul eder: {@code actor_id}, {@code entity_type},
     * {@code action}, {@code from}, {@code to}.
     */
    /**
     * v1.6.16.1: Spring native {@code Page<T>} yerine {@link PagedResponseDto} döner —
     * frontend {@code types/index.ts#PagedResponse} ile birebir snake_case eşleşme.
     * Daha önce Page<T>'nin native {content, totalElements, totalPages, last}
     * çıktısı frontend'in beklediği {items, total_elements, total_pages, has_next}
     * ile uyuşmadığı için audit log paneli her zaman boş görünüyordu.
     */
    @GetMapping("/audit-logs")
    public ResponseEntity<PagedResponseDto<AuditLogDto>> search(
            @RequestParam(name = "actor_id", required = false) UUID actorId,
            @RequestParam(required = false) String action,
            @RequestParam(name = "entity_type", required = false) String entityType,
            // A2: business_id filtresi — metadata.businessId üzerinden (frontend zaten gönderiyor).
            @RequestParam(name = "business_id", required = false) UUID businessId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize);

        return ResponseEntity.ok(PagedResponseDto.of(
                auditLogQueryService.search(actorId, action, entityType, businessId, from, to, pageable)));
    }

    // ── Tamper-proof hash-chain ──────────────────────────────────────────────

    /**
     * Zinciri baştan sona doğrular. Zincir kırıksa (tahrifat/silme) valid=false
     * + kırılma noktası döner. Salt-okunur; DB'ye dokunmaz.
     */
    @GetMapping("/audit/verify-chain")
    public ResponseEntity<AuditChainService.ChainVerification> verifyChain() {
        return ResponseEntity.ok(auditChainService.verifyChain());
    }

    /**
     * Geçmiş kayıtları (chainSeq=null) mevcut zincirin ucuna ekler. Idempotent —
     * zaten zincirli kayıtlara dokunmaz. Audit'li (kim, kaç kayıt).
     */
    @PostMapping("/audit/backfill-chain")
    public ResponseEntity<AuditChainService.BackfillResult> backfillChain(
            @AuthenticationPrincipal UserPrincipal principal) {
        AuditChainService.BackfillResult result = auditChainService.backfillChain();
        auditLogService.recordEntityAction(
                AuditAction.AUDIT_CHAIN_BACKFILL,
                principal != null ? principal.getId() : null,
                principal != null ? principal.getUsername() : null,
                "AUDIT", null,
                "Audit hash-chain backfill — işlenen=" + result.processed()
                        + ", kalan-zincirsiz=" + result.remainingUnchained()
                        + ", zincir-ucu=" + result.tipSeq(),
                Map.of("processed", result.processed(),
                       "remainingUnchained", result.remainingUnchained(),
                       "tipSeq", result.tipSeq()));
        return ResponseEntity.ok(result);
    }

    // ── Realtime SSE stream ──────────────────────────────────────────────────

    /**
     * Canlı audit akışı. Tarayıcı {@code EventSource} ile bağlanır; her yeni
     * kayıt {@code audit} event'i olarak yayınlanır. EventSource header set
     * edemediği için JWT, JwtAuthenticationFilter'ın query-param fallback'i
     * ({@code ?access_token=}) ile geçirilir — yine {@code /admin/**} ROLE_ADMIN.
     */
    @GetMapping(value = "/audit/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return auditStreamService.subscribe();
    }

    // ── Export (CSV/JSON) ────────────────────────────────────────────────────

    /**
     * Filtreli export. {@code format=csv} (default) veya {@code format=json}.
     * Aynı filtre parametreleri search ile uyumlu. Azami
     * {@link AuditExportService#MAX_EXPORT_ROWS} satır.
     */
    @GetMapping("/audit/export")
    public ResponseEntity<String> export(
            @RequestParam(name = "format", defaultValue = "csv") String format,
            @RequestParam(name = "actor_id", required = false) UUID actorId,
            @RequestParam(required = false) String action,
            @RequestParam(name = "entity_type", required = false) String entityType,
            @RequestParam(name = "business_id", required = false) UUID businessId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {

        List<AuditLogDto> rows = auditExportService.fetch(actorId, action, entityType, businessId, from, to);
        boolean json = "json".equalsIgnoreCase(format);
        String body = json ? auditExportService.toJson(rows) : auditExportService.toCsv(rows);
        String ext = json ? "json" : "csv";
        String contentType = json
                ? MediaType.APPLICATION_JSON_VALUE
                : "text/csv;charset=UTF-8";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"audit-export-" + System.currentTimeMillis() + "." + ext + "\"")
                .body(body);
    }

    // ── KVKK anonymization ───────────────────────────────────────────────────

    /**
     * {@code days} günden eski kayıtların PII alanlarını anonimleştirir (kayıt
     * silinmez; zincir yeniden imzalanır). {@code days} verilmezse config
     * {@code app.audit.anonymize-after-days} kullanılır. Audit'li.
     */
    @PostMapping("/audit/anonymize")
    public ResponseEntity<AuditAnonymizationService.AnonymizeResult> anonymize(
            @RequestParam(name = "days", required = false) Long days,
            @AuthenticationPrincipal UserPrincipal principal) {
        long effectiveDays = (days != null) ? days : auditAnonymizationService.getAnonymizeAfterDays();
        AuditAnonymizationService.AnonymizeResult result =
                auditAnonymizationService.anonymizeOlderThan(effectiveDays);
        auditLogService.recordEntityAction(
                AuditAction.AUDIT_ANONYMIZED,
                principal != null ? principal.getId() : null,
                principal != null ? principal.getUsername() : null,
                "AUDIT", null,
                "KVKK audit anonimleştirme — gün>" + effectiveDays
                        + ", anonimleştirilen=" + result.anonymizedCount(),
                Map.of("days", effectiveDays,
                       "anonymizedCount", result.anonymizedCount()));
        return ResponseEntity.ok(result);
    }
}
