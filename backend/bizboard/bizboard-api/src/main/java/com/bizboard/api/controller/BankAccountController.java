package com.bizboard.api.controller;

import com.bizboard.common.dto.BankAccountDto;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * v1.6.20 (WP-3): Banka hesabı listeleme endpoint'i.
 * (CRUD WP-4 + admin paneli kapsamında — şimdilik read-only listeleme.)
 */
@RestController
@RequestMapping("/bank-accounts")
@RequiredArgsConstructor
public class BankAccountController {

    private final BankAccountRepository repository;

    @GetMapping
    public ResponseEntity<List<BankAccountDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        List<BankAccount> all = includeInactive
                ? repository.findAllByOrderByActiveDescNameAsc()
                : repository.findByActiveTrueOrderByNameAsc();
        return ResponseEntity.ok(all.stream().map(BankAccountController::toDto).toList());
    }

    static BankAccountDto toDto(BankAccount b) {
        return BankAccountDto.builder()
                .id(b.getId())
                .name(b.getName())
                .type(b.getType() != null ? b.getType().name() : null)
                .bankName(b.getBankName())
                .iban(b.getIban())
                .currency(b.getCurrency())
                .holderPersonId(b.getHolderPerson() != null ? b.getHolderPerson().getId() : null)
                .holderPersonName(b.getHolderPerson() != null ? b.getHolderPerson().getName() : null)
                .currentBalance(b.getCurrentBalance())
                .active(b.isActive())
                .notes(b.getNotes())
                .createdAt(b.getCreatedAt())
                .build();
    }
}
