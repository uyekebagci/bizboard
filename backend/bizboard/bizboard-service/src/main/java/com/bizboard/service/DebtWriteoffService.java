package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateDebtWriteoffRequest;
import com.bizboard.common.dto.DebtWriteoffDto;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.DebtWriteoff;
import com.bizboard.common.entity.User;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.DebtWriteoffRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WP a9da4e9d (Beta v1.1 · Borçlar): borçtan ödeme almadan manuel düşürme.
 *
 * <p><b>ADMIN ONLY.</b> Servis seviyesinde role check; controller'da da
 * defense-in-depth.</p>
 *
 * <h3>Etki sınırı</h3>
 * <ul>
 *   <li>debt.remaining_amount düşer; PARTIAL/PAID status'a geçer.</li>
 *   <li>debt_writeoffs tablosuna kayıt eklenir.</li>
 *   <li>counterpart cari hesap statement'ına yansır (running balance event).</li>
 *   <li>Transaction tablosuna YAZILMAZ. KONSOLİDE NET, sub-cash income,
 *       closure ve tüm tx tabanlı raporlar ETKİLENMEZ.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DebtWriteoffService {

    private final DebtWriteoffRepository repository;
    private final DebtRepository debtRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final CounterpartLedgerService counterpartLedger;

    /** ADMIN guard helper — controller + service iki seviye. */
    private void assertAdmin(User actor) {
        if (actor == null || !"admin".equalsIgnoreCase(actor.getRole())) {
            throw new SecurityException("Bu işlem için yönetici yetkisi gerekli");
        }
    }

    @Transactional
    public DebtWriteoffDto writeOff(UUID debtId, CreateDebtWriteoffRequest req, UUID actorUserId) {
        if (req == null || req.getAmount() == null || req.getAmount().signum() <= 0) {
            throw new IllegalArgumentException("Silme tutarı pozitif olmalı");
        }
        User actor = userRepository.findById(actorUserId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi"));
        assertAdmin(actor);

        Debt debt = debtRepository.findById(debtId)
                .orElseThrow(() -> new IllegalArgumentException("Borç bulunamadı: " + debtId));
        if (debt.getBusiness() == null) {
            throw new IllegalArgumentException("Borç business'a bağlı değil");
        }
        accessGuard.assertCanAccessBusiness(actorUserId, debt.getBusiness().getId());

        String status = debt.getStatus() != null ? debt.getStatus() : "OPEN";
        if ("PAID".equals(status) || "CANCELLED".equals(status)) {
            throw new IllegalArgumentException(
                    "Borç durumu '" + status + "' — silme yapılamaz");
        }
        if (debt.getCounterpartRef() == null) {
            throw new IllegalArgumentException(
                    "Bu borcun bir counterpart referansı yok; silme yalnız normalized borçlarda yapılabilir");
        }

        BigDecimal remaining = debt.getRemainingAmount() != null
                ? debt.getRemainingAmount() : debt.getAmount();
        if (req.getAmount().compareTo(remaining) > 0) {
            throw new IllegalArgumentException(
                    "Silme tutarı kalan borçtan fazla olamaz (kalan: " + remaining + ")");
        }

        // Apply: remaining'i düş, status güncelle
        BigDecimal newRemaining = remaining.subtract(req.getAmount());
        debt.setRemainingAmount(newRemaining);
        if (newRemaining.signum() == 0) {
            debt.setStatus("PAID");
            debt.setSettled(true);
            if (debt.getSettledAt() == null) debt.setSettledAt(java.time.LocalDateTime.now());
        } else if (newRemaining.compareTo(debt.getAmount()) < 0) {
            debt.setStatus("PARTIAL");
            debt.setSettled(false);
        }
        debtRepository.save(debt);

        DebtWriteoff w = DebtWriteoff.builder()
                .business(debt.getBusiness())
                .counterpart(debt.getCounterpartRef())
                .debt(debt)
                .amount(req.getAmount())
                .reason(req.getReason() != null && !req.getReason().isBlank()
                        ? req.getReason().trim() : null)
                .writtenOffBy(actorUserId)
                .build();
        w = repository.save(w);

        // Cari ledger recompute (running balance, statement vs.)
        counterpartLedger.recomputeIfPresent(debt.getCounterpartRef().getId());

        // Audit log — KRITIK admin aksiyonu
        auditLogService.recordEntityAction(
                AuditAction.DEBT_WRITEOFF,
                actorUserId, actor.getUsername(),
                "DEBT_WRITEOFF", w.getId(),
                debt.getCounterparty() + " — " + req.getAmount() + " " + debt.getCurrency()
                        + " borç silindi" + (w.getReason() != null ? " (" + w.getReason() + ")" : ""),
                Map.of(
                        "businessId", debt.getBusiness().getId(),
                        "debtId", debt.getId(),
                        "counterpartId", debt.getCounterpartRef().getId(),
                        "amount", req.getAmount(),
                        "reason", w.getReason() != null ? w.getReason() : "",
                        "debtRemainingAfter", newRemaining,
                        "debtStatusAfter", debt.getStatus()));
        log.info("[debt-writeoff] debt={} amount={} by={} remaining_after={}",
                debt.getId(), req.getAmount(), actor.getUsername(), newRemaining);

        return toDto(w, debt, actor);
    }

    /**
     * DELETE /debt-writeoffs/{id} — reverse. ADMIN ONLY.
     * Kalan tutarı geri ekler, status'u OPEN/PARTIAL'a geri çevirir.
     * v1.1 MVP: backend hazır, UI v1.2'de eklenecek.
     */
    @Transactional
    public void reverseWriteoff(UUID writeoffId, UUID actorUserId) {
        User actor = userRepository.findById(actorUserId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi"));
        assertAdmin(actor);

        DebtWriteoff w = repository.findById(writeoffId)
                .orElseThrow(() -> new IllegalArgumentException("Writeoff bulunamadı"));
        accessGuard.assertCanAccessBusiness(actorUserId,
                w.getBusiness() != null ? w.getBusiness().getId() : null);

        Debt debt = w.getDebt();
        BigDecimal restored = (debt.getRemainingAmount() != null
                ? debt.getRemainingAmount() : BigDecimal.ZERO).add(w.getAmount());
        debt.setRemainingAmount(restored);
        if (restored.compareTo(debt.getAmount()) >= 0) {
            debt.setStatus("OPEN");
            debt.setSettled(false);
            debt.setSettledAt(null);
        } else {
            debt.setStatus("PARTIAL");
            debt.setSettled(false);
            debt.setSettledAt(null);
        }
        debtRepository.save(debt);
        repository.delete(w);
        if (debt.getCounterpartRef() != null) {
            counterpartLedger.recomputeIfPresent(debt.getCounterpartRef().getId());
        }

        auditLogService.recordEntityAction(
                AuditAction.DEBT_WRITEOFF_REVERSE,
                actorUserId, actor.getUsername(),
                "DEBT_WRITEOFF", writeoffId,
                debt.getCounterparty() + " — " + w.getAmount() + " silme geri alındı",
                Map.of(
                        "debtId", debt.getId(),
                        "amount", w.getAmount(),
                        "debtRemainingAfter", restored,
                        "debtStatusAfter", debt.getStatus()));
        log.info("[debt-writeoff-reverse] writeoff={} restored={}", writeoffId, restored);
    }

    @Transactional(readOnly = true)
    public List<DebtWriteoffDto> listByCounterpart(UUID counterpartId, UUID actorUserId) {
        // Access check: counterpart'ın business'ına erişim — repository'den counterpart'ı çekip
        // business kontrolü yapacağız. Basitleştirmek için writeoff'ların business'ından kontrol.
        List<DebtWriteoff> items = repository.findByCounterpart_IdOrderByWrittenOffAtDesc(counterpartId);
        if (items.isEmpty()) return List.of();
        UUID bizId = items.get(0).getBusiness() != null ? items.get(0).getBusiness().getId() : null;
        accessGuard.assertCanReadBusiness(actorUserId, bizId);
        return items.stream().map(w -> toDto(w, w.getDebt(),
                userRepository.findById(w.getWrittenOffBy()).orElse(null))).toList();
    }

    private DebtWriteoffDto toDto(DebtWriteoff w, Debt debt, User byUser) {
        return DebtWriteoffDto.builder()
                .id(w.getId())
                .businessId(w.getBusiness() != null ? w.getBusiness().getId() : null)
                .counterpartId(w.getCounterpart() != null ? w.getCounterpart().getId() : null)
                .counterpartName(w.getCounterpart() != null ? w.getCounterpart().getName() : null)
                .debtId(debt != null ? debt.getId() : null)
                .amount(w.getAmount())
                .reason(w.getReason())
                .writtenOffBy(w.getWrittenOffBy())
                .writtenOffByName(byUser != null ? byUser.getUsername() : null)
                .writtenOffAt(w.getWrittenOffAt())
                .debtRemainingAfter(debt != null ? debt.getRemainingAmount() : null)
                .debtStatusAfter(debt != null ? debt.getStatus() : null)
                .build();
    }
}
