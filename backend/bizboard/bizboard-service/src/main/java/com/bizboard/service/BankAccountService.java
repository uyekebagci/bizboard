package com.bizboard.service;

import com.bizboard.common.dto.BankAccountDto;
import com.bizboard.common.dto.BankAccountToggleRequest;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/**
 * v1.6.22 (WP-5): BankAccount aktif/pasif toggle servisi.
 *
 * <p>Pasif yapılırken bakiye 0 değilse {@link IllegalStateException}
 * ({@code force=true} ile zorla geçilebilir). Audit log her toggle'ı izler.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BankAccountService {

    private final BankAccountRepository repository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;

    @Transactional
    public BankAccountDto toggleActive(UUID id, BankAccountToggleRequest req, UUID actorUserId) {
        BankAccount a = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hesap bulunamadi: " + id));
        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;

        boolean newActive = Boolean.TRUE.equals(req.getIsActive());
        boolean force = Boolean.TRUE.equals(req.getForce());

        if (!newActive && a.isActive()) {
            // Pasife geçiş — bakiye 0 değilse uyar (force=true atlatır)
            BigDecimal balance = a.getCurrentBalance() != null ? a.getCurrentBalance() : BigDecimal.ZERO;
            if (balance.signum() != 0 && !force) {
                throw new IllegalStateException(
                        "Hesap bakiyesi 0 değil (" + balance.toPlainString() + " "
                                + (a.getCurrency() != null ? a.getCurrency() : "TRY")
                                + "); pasif yapmak için force=true gerek.");
            }
        }

        boolean changed = a.isActive() != newActive;
        a.setActive(newActive);
        if (changed) {
            a = repository.save(a);
            auditLogService.recordEntityAction(
                    newActive ? "BANK_ACCOUNT_ACTIVATED" : "BANK_ACCOUNT_DEACTIVATED",
                    actorUserId, actor != null ? actor.getUsername() : null,
                    "BANK_ACCOUNT", a.getId(),
                    a.getName() + " — " + (newActive ? "aktif" : "pasif")
                            + (force ? " (force)" : ""),
                    Map.of(
                            "name", a.getName(),
                            "type", a.getType() != null ? a.getType().name() : "?",
                            "active", newActive,
                            "force", force));
            log.info("BankAccount {} -> active={} force={}", a.getId(), newActive, force);
        }
        return toDto(a);
    }

    public static BankAccountDto toDto(BankAccount b) {
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
