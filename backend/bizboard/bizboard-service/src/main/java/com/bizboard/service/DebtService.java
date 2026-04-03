package com.bizboard.service;

import com.bizboard.common.dto.CreateDebtRequest;
import com.bizboard.common.dto.DebtDto;
import com.bizboard.common.dto.DebtSummaryDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DebtService {

    private final DebtRepository debtRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;

    // ─── İşletmeye ait borçları getir ──────────────────────────

    @Transactional(readOnly = true)
    public List<DebtDto> getDebtsForBusiness(UUID businessId, UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        List<Debt> debts;
        if ("admin".equalsIgnoreCase(user.getRole())) {
            debts = debtRepository.findByBusinessIdOrderByCreatedAtDesc(businessId);
        } else {
            debts = debtRepository.findByBusinessIdAndAdminOnlyFalseOrderByCreatedAtDesc(businessId);
        }

        return debts.stream().map(this::toDto).toList();
    }

    // ─── Tüm borçlar (sadece admin) ──────────────────────────

    @Transactional(readOnly = true)
    public List<DebtDto> getAllDebts(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (!"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Sadece admin tum borclari gorebilir");
        }

        return debtRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toDto)
                .toList();
    }

    // ─── Kullanıcının erişebildiği tüm borçlar ────────────────

    @Transactional(readOnly = true)
    public List<DebtDto> getDebtsForUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if ("admin".equalsIgnoreCase(user.getRole())) {
            return debtRepository.findAllByOrderByCreatedAtDesc().stream()
                    .map(this::toDto)
                    .toList();
        }

        String accessible = user.getAccessibleBusinesses();
        if (accessible == null || accessible.isBlank()) {
            return List.of();
        }

        List<UUID> businessIds = Arrays.stream(accessible.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(UUID::fromString)
                .toList();

        return debtRepository.findByBusinessIdInAndAdminOnlyFalseOrderByCreatedAtDesc(businessIds).stream()
                .map(this::toDto)
                .toList();
    }

    // ─── Borç oluştur ─────────────────────────────────────────

    @Transactional
    public DebtDto createDebt(UUID businessId, CreateDebtRequest request, UUID userId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        DebtDirection direction = DebtDirection.valueOf(
                request.getDirection().toUpperCase(java.util.Locale.ENGLISH));

        Debt debt = Debt.builder()
                .business(business)
                .direction(direction)
                .counterparty(request.getCounterparty())
                .amount(request.getAmount())
                .currency(request.getCurrency() != null ? request.getCurrency() : business.getCurrency())
                .instrumentType(request.getInstrumentType())
                .dueDate(request.getDueDate())
                .description(request.getDescription())
                .documentUrl(request.getDocumentUrl())
                .adminOnly(request.getAdminOnly() != null && request.getAdminOnly())
                .createdBy(user)
                .build();

        debt = debtRepository.save(debt);
        log.info("Borc olusturuldu: {} - {} {} TL ({}) isletme={}",
                direction, request.getCounterparty(), request.getAmount(),
                request.getInstrumentType(), business.getName());

        return toDto(debt);
    }

    // ─── Borç sil ─────────────────────────────────────────────

    @Transactional
    public void deleteDebt(UUID debtId, UUID userId) {
        Debt debt = debtRepository.findById(debtId)
                .orElseThrow(() -> new IllegalArgumentException("Borc bulunamadi"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // admin_only borçları sadece admin silebilir
        if (debt.isAdminOnly() && !"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Bu borcu sadece admin silebilir");
        }

        debtRepository.delete(debt);
        log.info("Borc silindi: {} - {} {} TL silen={}",
                debt.getDirection(), debt.getCounterparty(),
                debt.getAmount(), user.getFullName());
    }

    // ─── Tahsil et / Öde ──────────────────────────────────────

    @Transactional
    public DebtDto settleDebt(UUID debtId, UUID userId) {
        Debt debt = debtRepository.findById(debtId)
                .orElseThrow(() -> new IllegalArgumentException("Borc bulunamadi"));

        debt.setSettled(true);
        debt.setSettledAt(LocalDateTime.now());
        debt = debtRepository.save(debt);

        log.info("Borc kapatildi: {} - {} {} TL",
                debt.getDirection(), debt.getCounterparty(), debt.getAmount());

        return toDto(debt);
    }

    // ─── İşletme borç özeti ───────────────────────────────────

    @Transactional(readOnly = true)
    public DebtSummaryDto getBusinessDebtSummary(UUID businessId, UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        List<Debt> debts;
        if ("admin".equalsIgnoreCase(user.getRole())) {
            debts = debtRepository.findByBusinessIdOrderByCreatedAtDesc(businessId);
        } else {
            debts = debtRepository.findByBusinessIdAndAdminOnlyFalseOrderByCreatedAtDesc(businessId);
        }

        return buildSummary(debts);
    }

    // ─── Tüm borçların özeti (admin) ──────────────────────────

    @Transactional(readOnly = true)
    public DebtSummaryDto getAllDebtSummary(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        List<Debt> debts;
        if ("admin".equalsIgnoreCase(user.getRole())) {
            debts = debtRepository.findAllByOrderByCreatedAtDesc();
        } else {
            String accessible = user.getAccessibleBusinesses();
            if (accessible == null || accessible.isBlank()) {
                return emptySummary();
            }
            List<UUID> businessIds = Arrays.stream(accessible.split(","))
                    .map(String::trim).filter(s -> !s.isEmpty())
                    .map(UUID::fromString).toList();
            debts = debtRepository.findByBusinessIdInAndAdminOnlyFalseOrderByCreatedAtDesc(businessIds);
        }

        return buildSummary(debts);
    }

    // ─── Helpers ──────────────────────────────────────────────

    private DebtSummaryDto buildSummary(List<Debt> debts) {
        BigDecimal totalReceivable = BigDecimal.ZERO;
        BigDecimal totalPayable = BigDecimal.ZERO;
        BigDecimal settledReceivable = BigDecimal.ZERO;
        BigDecimal settledPayable = BigDecimal.ZERO;
        int receivableCount = 0;
        int payableCount = 0;

        for (Debt d : debts) {
            if (d.getDirection() == DebtDirection.RECEIVABLE) {
                totalReceivable = totalReceivable.add(d.getAmount());
                receivableCount++;
                if (d.isSettled()) {
                    settledReceivable = settledReceivable.add(d.getAmount());
                }
            } else {
                totalPayable = totalPayable.add(d.getAmount());
                payableCount++;
                if (d.isSettled()) {
                    settledPayable = settledPayable.add(d.getAmount());
                }
            }
        }

        return DebtSummaryDto.builder()
                .totalReceivable(totalReceivable)
                .totalPayable(totalPayable)
                .netBalance(totalReceivable.subtract(totalPayable))
                .settledReceivable(settledReceivable)
                .settledPayable(settledPayable)
                .pendingReceivable(totalReceivable.subtract(settledReceivable))
                .pendingPayable(totalPayable.subtract(settledPayable))
                .receivableCount(receivableCount)
                .payableCount(payableCount)
                .build();
    }

    private DebtSummaryDto emptySummary() {
        return DebtSummaryDto.builder()
                .totalReceivable(BigDecimal.ZERO)
                .totalPayable(BigDecimal.ZERO)
                .netBalance(BigDecimal.ZERO)
                .settledReceivable(BigDecimal.ZERO)
                .settledPayable(BigDecimal.ZERO)
                .pendingReceivable(BigDecimal.ZERO)
                .pendingPayable(BigDecimal.ZERO)
                .receivableCount(0)
                .payableCount(0)
                .build();
    }

    private DebtDto toDto(Debt d) {
        return DebtDto.builder()
                .id(d.getId())
                .businessId(d.getBusiness().getId())
                .businessName(d.getBusiness().getName())
                .direction(d.getDirection().name())
                .counterparty(d.getCounterparty())
                .amount(d.getAmount())
                .currency(d.getCurrency())
                .instrumentType(d.getInstrumentType())
                .dueDate(d.getDueDate())
                .settled(d.isSettled())
                .settledAt(d.getSettledAt())
                .description(d.getDescription())
                .documentUrl(d.getDocumentUrl())
                .adminOnly(d.isAdminOnly())
                .createdByName(d.getCreatedBy() != null ? d.getCreatedBy().getFullName() : null)
                .createdAt(d.getCreatedAt())
                .build();
    }
}
