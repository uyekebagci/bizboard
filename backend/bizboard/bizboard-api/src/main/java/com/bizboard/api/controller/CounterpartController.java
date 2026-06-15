package com.bizboard.api.controller;

import com.bizboard.common.dto.CounterpartDto;
import com.bizboard.common.dto.CounterpartStatementDto;
import com.bizboard.common.dto.CreateCounterpartRequest;
import com.bizboard.common.dto.PagedResponseDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.CounterpartLedgerService;
import com.bizboard.service.CounterpartService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * "Karşı Firmalar" CRUD. {@code /counterparts/**} authenticated kullanıcılar
 * için açık. (Cari hesap ekstre endpoint'i v1.5.1'de geliyor.)
 */
@RestController
@RequestMapping("/counterparts")
@RequiredArgsConstructor
public class CounterpartController {

    private final CounterpartService service;
    private final CounterpartLedgerService ledgerService;

    /**
     * Karşı firma listesi — opsiyonel {@code role}/{@code kind}/{@code business_id} filtreli.
     *
     * <p><b>P0 GÜVENLİK (cross-tenant cari sızıntısı):</b> Bu endpoint hem
     * snake_case {@code business_id} hem camelCase {@code businessId} parametresini
     * KABUL EDER. Önceden yalnızca bare {@code businessId} (camelCase) bind ediliyordu;
     * bu API'nin baskın {@code business_id} (snake_case) konvansiyonuyla çağıran
     * istemcilerin filtresi SESSİZCE düşüyordu → tenant filtresi {@code null}'a düşüp
     * kullanıcının erişebildiği TÜM işletmelerin carileri dönüyordu (PARA-IZI
     * modalında DGR carileri görünmesi). İki ad da coalesce edilerek filtrenin
     * sessizce yutulması engellenir. Asıl izolasyon servis katmanında
     * {@code resolveAllowedBusinessIds} + {@code assertCanReadBusiness} ile zorlanır
     * (erişimsiz business_id istenirse 404, FE filtresine GÜVENİLMEZ).</p>
     *
     * <p>PERF (server-pagination, non-breaking): {@code page} parametresi GELMEZSE
     * eski davranış AYNEN korunur — {@code List<CounterpartDto>} JSON dizisi döner
     * (mevcut FE kırılmaz). {@code page} GELİRSE {@link PagedResponseDto} zarfı döner.
     * Filtreler/sıralama ({@code name ASC}) ikisinde de aynı. {@code size} clamp:
     * 1..200, default 50.</p>
     */
    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String kind,
            @RequestParam(value = "business_id", required = false) UUID businessId,
            @RequestParam(value = "businessId", required = false) UUID businessIdCamel,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {

        // Casing'den bağımsız tek tenant filtresi — hangisi gelirse o (snake öncelikli).
        UUID effectiveBusinessId = businessId != null ? businessId : businessIdCamel;

        if (page == null) {
            return ResponseEntity.ok(service.list(role, kind, effectiveBusinessId, principal.getId()));
        }

        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size == null ? 50 : size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize);
        return ResponseEntity.ok(PagedResponseDto.of(
                service.list(role, kind, effectiveBusinessId, principal.getId(), pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.get(id, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", "Karsi firma bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", e.getMessage()));
        }
    }

    /**
     * v1.6.20 (WP-3): Alt firmalar (children). Bir parent firmanın altındaki
     * tüm sub-firma'lar. Counterpart detay sayfası drill-down için.
     */
    @GetMapping("/{id}/children")
    public ResponseEntity<List<CounterpartDto>> children(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestParam(value = "business_id", required = false) UUID businessId,
            @RequestParam(value = "businessId", required = false) UUID businessIdCamel) {
        UUID effectiveBusinessId = businessId != null ? businessId : businessIdCamel;
        return ResponseEntity.ok(service.children(id, effectiveBusinessId, principal.getId()));
    }

    @PostMapping
    public ResponseEntity<?> create(
            @Valid @RequestBody CreateCounterpartRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.create(request, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(java.util.Map.of("message", "Access denied"));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(
            @PathVariable UUID id,
            @Valid @RequestBody CreateCounterpartRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.ok(service.update(id, request, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", "Karsi firma bulunamadi"));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            service.delete(id, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", "Karsi firma bulunamadi"));
        }
    }

    /**
     * Cari hesap ekstresi. {@code from}/{@code to} ISO tarih, opsiyonel.
     * {@code from} verilmezse counterpart'ın ilk borcundan, {@code to} verilmezse
     * bugüne kadar.
     */
    @GetMapping("/{id}/statement")
    public ResponseEntity<?> statement(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        // v1.6.23.20: counterpart erişim kontrolü — statement leak'i kapatır.
        try {
            service.get(id, principal.getId());
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", "Karsi firma bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", e.getMessage()));
        }
        return ResponseEntity.ok(ledgerService.getStatement(id, from, to));
    }
}

