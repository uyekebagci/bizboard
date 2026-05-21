package com.bizboard.api.controller;

import com.bizboard.common.dto.BankAccountDetailDto;
import com.bizboard.common.dto.BankAccountDto;
import com.bizboard.common.dto.BankAccountToggleRequest;
import com.bizboard.common.dto.CreateBankAccountRequest;
import com.bizboard.common.dto.UpdateBankAccountRequest;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BankAccountService;
import com.bizboard.service.BusinessAccessGuard;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * v1.6.20 (WP-3): Banka hesabı listeleme endpoint'i.
 * v1.6.22 (WP-5): aktif/pasif toggle endpoint'i eklendi.
 * v1.6.23.19 (Security WP 667d8a71): multi-tenant filter zorunlu — USER yalnız
 *   erişebildiği işletme(ler)in hesaplarını görür; ADMIN tüm hesaplara erişir.
 * v1.6.23.19 (UI Fix WP 8b961444): {@code GET /bank-accounts/{id}} detay
 *   aggregate endpoint'i eklendi (hesap info + son 10 tx + bekleyen POS +
 *   30 günlük bakiye trendi).
 */
@RestController
@RequestMapping("/bank-accounts")
@RequiredArgsConstructor
public class BankAccountController {

    private final BankAccountRepository repository;
    private final BankAccountService service;
    private final BusinessAccessGuard accessGuard;

    @GetMapping
    public ResponseEntity<List<BankAccountDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        // v1.6.23.19 (Security WP TODO 809834ef): multi-tenant filter.
        List<UUID> allowed = accessGuard.accessibleBusinessIds(principal.getId());
        if (allowed.isEmpty()) {
            return ResponseEntity.ok(List.of());
        }
        List<BankAccount> all = includeInactive
                ? repository.findByBusinessIdInOrderByActiveDescNameAsc(allowed)
                : repository.findByActiveTrueAndBusinessIdInOrderByNameAsc(allowed);
        return ResponseEntity.ok(all.stream().map(BankAccountService::toDto).toList());
    }

    /**
     * v1.6.23.19 (UI Fix WP 8b961444): hesap detay aggregate.
     *
     * <p>Response: hesap info + son N tx + bekleyen POS + 30 günlük bakiye
     * trendi. Access check service tarafında (404 yerine 403 fırlatır;
     * cross-tenant fish'i engeller — leakage yok).</p>
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> detail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestParam(name = "recent_limit", defaultValue = "10") int recentLimit,
            @RequestParam(name = "trend_days", defaultValue = "30") int trendDays) {
        try {
            BankAccountDetailDto detail = service.getDetail(id, principal.getId(),
                    recentLimit, trendDays);
            return ResponseEntity.ok(detail);
        } catch (IllegalArgumentException e) {
            // Hesap bulunamadı
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", e.getMessage()));
        } catch (SecurityException e) {
            // Erişim yok — info sızdırmamak için 404 dönüyoruz (existence reveal kapalı).
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "Hesap bulunamadi"));
        }
    }

    /**
     * v1.6.22 (WP-5): aktif/pasif toggle. Pasif yaparken bakiye 0 değilse
     * 409 dönülür (force=true ile zorla geçilebilir).
     *
     * <p>v1.6.23.22 (Security WP TODO a96dd1b5): admin-only kısıt kaldırıldı.
     * Service tarafında {@code assertCanAccessBusiness} ile tenant izolasyonu
     * zaten var — USER kendi işletmesindeki hesabı toggle edebilir.</p>
     */
    @PatchMapping("/{id}/active")
    public ResponseEntity<?> toggleActive(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody BankAccountToggleRequest req) {
        try {
            return ResponseEntity.ok(service.toggleActive(id, req, principal.getId()));
        } catch (IllegalStateException e) {
            // Bakiye 0 değil ve force=false → 409
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(java.util.Map.of("error", e.getMessage()));
        } catch (SecurityException e) {
            // Cross-tenant — existence reveal kapalı.
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "Hesap bulunamadi"));
        }
    }

    /**
     * v1.6.23.4 (BUG-3 fix): Yeni banka hesabı oluştur.
     *
     * <p>v1.6.23.22 (Security WP TODO a96dd1b5): admin-only kısıt kaldırıldı.
     * Service tarafında {@code business_id} zorunlu + actor'ın o işletmeye
     * erişimi {@code assertCanAccessBusiness} ile kontrol edilir; cross-tenant
     * yaratma engellenir.</p>
     *
     * <p>Validation servis tarafında:
     * <ul>
     *   <li>business_id + name + type zorunlu</li>
     *   <li>type=CASH_HOLDER → holder_person_id zorunlu (counterpart.kind=PERSON)</li>
     *   <li>currency default TRY, opening_balance default 0</li>
     * </ul>
     */
    @PostMapping
    public ResponseEntity<?> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateBankAccountRequest req) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.create(req, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(java.util.Map.of("error", "Access denied"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("error", e.getMessage()));
        }
    }

    /**
     * v1.6.23.4 (BUG-3 fix): Partial update. Yalnız name/bank_name/iban/notes
     * değiştirilebilir; type/currency/holder/active immutable
     * (active için ayrı PATCH /{id}/active var).
     *
     * <p>v1.6.23.22 (Security WP TODO a96dd1b5): admin-only kısıt kaldırıldı.
     * Tenant izolasyonu service tarafında.</p>
     */
    @PatchMapping("/{id}")
    public ResponseEntity<?> update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateBankAccountRequest req) {
        try {
            return ResponseEntity.ok(service.update(id, req, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "Hesap bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("error", e.getMessage()));
        }
    }
}
