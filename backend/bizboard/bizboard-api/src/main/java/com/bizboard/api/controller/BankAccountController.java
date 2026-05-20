package com.bizboard.api.controller;

import com.bizboard.common.dto.BankAccountDto;
import com.bizboard.common.dto.BankAccountToggleRequest;
import com.bizboard.common.dto.CreateBankAccountRequest;
import com.bizboard.common.dto.UpdateBankAccountRequest;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BankAccountService;
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
 */
@RestController
@RequestMapping("/bank-accounts")
@RequiredArgsConstructor
public class BankAccountController {

    private final BankAccountRepository repository;
    private final BankAccountService service;

    @GetMapping
    public ResponseEntity<List<BankAccountDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        List<BankAccount> all = includeInactive
                ? repository.findAllByOrderByActiveDescNameAsc()
                : repository.findByActiveTrueOrderByNameAsc();
        return ResponseEntity.ok(all.stream().map(BankAccountService::toDto).toList());
    }

    /**
     * v1.6.22 (WP-5): aktif/pasif toggle. Pasif yaparken bakiye 0 değilse
     * 409 dönülür (force=true ile zorla geçilebilir).
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
        }
    }

    /**
     * v1.6.23.4 (BUG-3 fix): Yeni banka hesabı oluştur. Admin-only.
     *
     * <p>Validation servis tarafında:
     * <ul>
     *   <li>name + type zorunlu</li>
     *   <li>type=CASH_HOLDER → holder_person_id zorunlu (counterpart.kind=PERSON)</li>
     *   <li>currency default TRY, opening_balance default 0</li>
     * </ul>
     */
    @PostMapping
    public ResponseEntity<BankAccountDto> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateBankAccountRequest req) {
        if (!"admin".equalsIgnoreCase(principal.getRole())) {
            throw new SecurityException("Sadece admin banka hesabı oluşturabilir");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(req, principal.getId()));
    }

    /**
     * v1.6.23.4 (BUG-3 fix): Partial update. Yalnız name/bank_name/iban/notes
     * değiştirilebilir; type/currency/holder/active immutable
     * (active için ayrı PATCH /{id}/active var).
     */
    @PatchMapping("/{id}")
    public ResponseEntity<BankAccountDto> update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateBankAccountRequest req) {
        if (!"admin".equalsIgnoreCase(principal.getRole())) {
            throw new SecurityException("Sadece admin banka hesabı güncelleyebilir");
        }
        return ResponseEntity.ok(service.update(id, req, principal.getId()));
    }
}
