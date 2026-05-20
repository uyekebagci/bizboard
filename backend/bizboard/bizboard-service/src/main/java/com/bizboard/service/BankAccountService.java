package com.bizboard.service;

import com.bizboard.common.dto.BankAccountDto;
import com.bizboard.common.dto.BankAccountToggleRequest;
import com.bizboard.common.dto.CreateBankAccountRequest;
import com.bizboard.common.dto.UpdateBankAccountRequest;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * v1.6.22 (WP-5): BankAccount aktif/pasif toggle servisi.
 *
 * <p>Pasif yapılırken bakiye 0 değilse {@link IllegalStateException}
 * ({@code force=true} ile zorla geçilebilir). Audit log her toggle'ı izler.</p>
 *
 * <p>v1.6.23.4: create / update endpoint'leri eklendi (BUG-3 fix). Yeni
 * banka hesabı eklemek için artık SQL gerekmiyor.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BankAccountService {

    private final BankAccountRepository repository;
    private final UserRepository userRepository;
    private final CounterpartRepository counterpartRepository;
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

    // ───────────────────────── CREATE (v1.6.23.4) ─────────────────────────

    /**
     * Yeni banka hesabı oluşturur. Admin-only (servisin çağıran controller
     * authorization kontrolü yapmalı).
     */
    @Transactional
    public BankAccountDto create(CreateBankAccountRequest req, UUID actorUserId) {
        // Type validation
        BankAccountType type;
        try {
            type = BankAccountType.valueOf(req.getType().trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Gecersiz type: '" + req.getType() + "' — CHECKING / SAVINGS / CASH / CASH_HOLDER olmali");
        }

        // CASH_HOLDER → holder_person zorunlu + counterpart.kind=PERSON kontrolü
        Counterpart holder = null;
        if (type == BankAccountType.CASH_HOLDER) {
            if (req.getHolderPersonId() == null) {
                throw new IllegalArgumentException(
                        "type=CASH_HOLDER icin holder_person_id zorunlu");
            }
            holder = counterpartRepository.findById(req.getHolderPersonId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "holder_person_id bulunamadi: " + req.getHolderPersonId()));
            // Kind kontrolü — Counterpart.kind enum (CounterpartKind: PERSON/FIRM)
            com.bizboard.common.enums.CounterpartKind k = holder.getKind();
            if (k != com.bizboard.common.enums.CounterpartKind.PERSON) {
                throw new IllegalArgumentException(
                        "holder counterpart.kind 'PERSON' olmali (gonderilen: " + k + ")");
            }
        } else if (req.getHolderPersonId() != null) {
            // Non-CASH_HOLDER için holder verilmiş — sessiz yoksay (yine de log'la)
            log.warn("[bank-account-create] type={} olmasina ragmen holder_person_id gonderildi — yoksayildi",
                    type);
        }

        BigDecimal opening = req.getOpeningBalance() != null
                ? req.getOpeningBalance() : BigDecimal.ZERO;

        BankAccount entity = BankAccount.builder()
                .name(req.getName().trim())
                .type(type)
                .bankName(req.getBankName())
                .iban(req.getIban())
                .currency(req.getCurrency() != null ? req.getCurrency().trim() : "TRY")
                .holderPerson(holder)
                .currentBalance(opening)
                .active(true)
                .notes(req.getNotes())
                .build();
        entity = repository.save(entity);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        Map<String, Object> meta = new HashMap<>();
        meta.put("name", entity.getName());
        meta.put("type", entity.getType().name());
        meta.put("bankName", entity.getBankName());
        meta.put("openingBalance", opening);
        if (holder != null) meta.put("holderPersonId", holder.getId());
        auditLogService.recordEntityAction(
                "BANK_ACCOUNT_CREATED",
                actorUserId, actor != null ? actor.getUsername() : null,
                "BANK_ACCOUNT", entity.getId(),
                entity.getName() + " olusturuldu (" + entity.getType() + ")",
                meta);
        log.info("BankAccount created: id={} name='{}' type={}", entity.getId(), entity.getName(), type);

        return toDto(entity);
    }

    // ───────────────────────── UPDATE (v1.6.23.4) ─────────────────────────

    /**
     * Banka hesabını partial-update eder. Yalnızca: name, bank_name, iban, notes.
     * type / currency / holder_person immutable; aktif/pasif için
     * {@code PATCH /bank-accounts/{id}/active} kullanin.
     */
    @Transactional
    public BankAccountDto update(UUID id, UpdateBankAccountRequest req, UUID actorUserId) {
        BankAccount a = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hesap bulunamadi: " + id));
        Map<String, Object> changes = new HashMap<>();

        if (req.getName() != null && !req.getName().equals(a.getName())) {
            changes.put("name", Map.of("from", a.getName(), "to", req.getName()));
            a.setName(req.getName().trim());
        }
        if (req.getBankName() != null && !req.getBankName().equals(a.getBankName())) {
            changes.put("bankName", Map.of(
                    "from", a.getBankName() != null ? a.getBankName() : "",
                    "to", req.getBankName()));
            a.setBankName(req.getBankName());
        }
        if (req.getIban() != null && !req.getIban().equals(a.getIban())) {
            changes.put("iban", Map.of(
                    "from", a.getIban() != null ? a.getIban() : "",
                    "to", req.getIban()));
            a.setIban(req.getIban());
        }
        if (req.getNotes() != null && !req.getNotes().equals(a.getNotes())) {
            changes.put("notes_updated", true);
            a.setNotes(req.getNotes());
        }

        if (changes.isEmpty()) {
            return toDto(a);
        }
        a = repository.save(a);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        auditLogService.recordEntityAction(
                "BANK_ACCOUNT_UPDATED",
                actorUserId, actor != null ? actor.getUsername() : null,
                "BANK_ACCOUNT", a.getId(),
                a.getName() + " — " + changes.size() + " alan guncellendi",
                Map.of("changes", changes));
        log.info("BankAccount updated: id={} fields={}", a.getId(), changes.keySet());
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
