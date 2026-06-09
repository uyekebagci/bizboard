package com.bizboard.api.controller;

import com.bizboard.common.dto.AuditLogDto;
import com.bizboard.common.dto.PagedResponseDto;
import com.bizboard.service.AuditLogQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Admin audit log viewer.
 *
 * <p>Path {@code /admin/audit-logs} → SecurityConfig'deki {@code /admin/**}
 * kuralı yalnız {@code ROLE_ADMIN}'e izin verir. Non-admin'ler 403 alır.</p>
 *
 * <p>Tüm filtre parametreleri opsiyonel; verilmediğinde tüm kayıtlar (yeni→eski)
 * döner. Default sayfa boyutu 50, maks 200.</p>
 */
@RestController
@RequestMapping("/admin/audit-logs")
@RequiredArgsConstructor
public class AdminAuditController {

    private final AuditLogQueryService auditLogQueryService;

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
    @GetMapping
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
}
