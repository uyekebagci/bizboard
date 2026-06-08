package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateDebtRequest;
import com.bizboard.common.dto.DebtDto;
import com.bizboard.common.dto.DebtSummaryDto;
import com.bizboard.common.dto.UpdateDebtRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DebtService {

    private final DebtRepository debtRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final BusinessAccessGuard accessGuard;
    private final CounterpartRepository counterpartRepository;
    private final CounterpartLedgerService counterpartLedger;
    private final DebtAuditMetaBuilder debtAuditMetaBuilder;

    // ─── İşletmeye ait borçları getir ──────────────────────────

    @Transactional(readOnly = true)
    public List<DebtDto> getDebtsForBusiness(UUID businessId, UUID userId) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
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
        accessGuard.assertCanAccessBusiness(userId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        DebtDirection direction = DebtDirection.valueOf(
                request.getDirection().toUpperCase(java.util.Locale.ENGLISH));

        // v1.5.1: counterpart_id verilmişse normalize ref kur; counterparty string'i
        // counterpart.name ile auto-fill et (frontend her ikisini de geçmek zorunda
        // kalmasın). Eski client'lar yine sadece string ile create eder.
        Counterpart counterpart = null;
        String counterpartyName = request.getCounterparty();
        if (request.getCounterpartId() != null) {
            counterpart = counterpartRepository.findById(request.getCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException("Karsi firma bulunamadi"));
            if (counterpartyName == null || counterpartyName.isBlank()) {
                counterpartyName = counterpart.getName();
            }
        }

        // v1.6.5: receivable_type validation + normalize (yalnız RECEIVABLE için).
        String receivableType = null;
        String receivableTypeOther = null;
        if (direction == DebtDirection.RECEIVABLE && request.getReceivableType() != null
                && !request.getReceivableType().isBlank()) {
            receivableType = normalizeReceivableType(request.getReceivableType());
            if ("DIGER".equals(receivableType)) {
                if (request.getReceivableTypeOther() == null || request.getReceivableTypeOther().isBlank()) {
                    throw new IllegalArgumentException(
                            "receivable_type=DIGER icin receivable_type_other zorunludur");
                }
                receivableTypeOther = request.getReceivableTypeOther().trim();
                if (receivableTypeOther.length() > 120) {
                    receivableTypeOther = receivableTypeOther.substring(0, 120);
                }
            }
        }

        Debt debt = Debt.builder()
                .business(business)
                .direction(direction)
                .counterparty(counterpartyName)
                .counterpartRef(counterpart)
                .amount(request.getAmount())
                // v1.7.x WP fbb2ef55: yeni debt → remaining=amount, status=OPEN
                .remainingAmount(request.getAmount())
                .status("OPEN")
                .currency(request.getCurrency() != null ? request.getCurrency() : business.getCurrency())
                .instrumentType(request.getInstrumentType())
                .receivableType(receivableType)
                .receivableTypeOther(receivableTypeOther)
                // v1.6.22 (WP-5): çek + reminder alanları
                .chequeDueDate(request.getChequeDueDate())
                .chequeCollectorBank((request.getChequeCollectorBank() == null || request.getChequeCollectorBank().isBlank() ? null : request.getChequeCollectorBank().trim()))
                .chequeNo((request.getChequeNo() == null || request.getChequeNo().isBlank() ? null : request.getChequeNo().trim()))
                .reminderDate(request.getReminderDate())
                .reminderNote((request.getReminderNote() == null || request.getReminderNote().isBlank() ? null : request.getReminderNote().trim()))
                .dueDate(request.getDueDate())
                .description(request.getDescription())
                .documentUrl(request.getDocumentUrl())
                .adminOnly(request.getAdminOnly() != null && request.getAdminOnly())
                .createdBy(user)
                .build();

        debt = debtRepository.save(debt);
        log.info("Borc olusturuldu: {} - {} {} TL ({}) isletme={}",
                direction, counterpartyName, request.getAmount(),
                request.getInstrumentType(), business.getName());

        Map<String, Object> meta = new java.util.HashMap<>();
        meta.put("businessId", businessId);
        meta.put("amount", request.getAmount());
        meta.put("direction", direction.name());
        meta.put("currency", debt.getCurrency());
        meta.put("counterparty", counterpartyName);
        if (counterpart != null) {
            meta.put("counterpartId", counterpart.getId());
        }
        auditLogService.recordEntityAction(
                AuditAction.DEBT_CREATE,
                user.getId(), user.getUsername(),
                "DEBT", debt.getId(),
                business.getName() + " — " + direction.name() + " " + request.getAmount() + " (" + counterpartyName + ")",
                meta);

        if (counterpart != null) {
            counterpartLedger.recomputeIfPresent(counterpart.getId());
        }

        return toDto(debt);
    }

    // ─── Borç düzenle (WP a9da4e9d) ───────────────────────────
    /** Bireysel borç düzenleme (partial update); değişen alanlar audit'e eski→yeni yazılır. */
    @Transactional
    public DebtDto updateDebt(UUID debtId, UpdateDebtRequest req, UUID userId) {
        Debt debt = debtRepository.findById(debtId)
                .orElseThrow(() -> new IllegalArgumentException("Borc bulunamadi"));
        accessGuard.assertCanAccessBusiness(userId, debt.getBusiness().getId());
        User actor = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (debt.isAdminOnly() && !"admin".equalsIgnoreCase(actor.getRole())) {
            throw new SecurityException("Bu borcu sadece admin duzenleyebilir");
        }
        BigDecimal oldAmount = debt.getAmount(); // mutate öncesi — audit için
        LocalDate oldDueDate = debt.getDueDate();
        String oldDescription = debt.getDescription();
        if (req.getAmount() != null) {
            debt.setAmount(req.getAmount());
            debtAuditMetaBuilder.recomputeRemainingForAmount(debt, req.getAmount());
        }
        if (req.getDueDate() != null) debt.setDueDate(req.getDueDate());
        if (req.getDescription() != null) debt.setDescription(req.getDescription());
        debt = debtRepository.save(debt);
        log.info("Borc duzenlendi: {} - {} duzenleyen={}",
                debt.getDirection(), debt.getCounterparty(), actor.getFullName());
        if (debt.getCounterpartRef() != null) {
            counterpartLedger.recomputeIfPresent(debt.getCounterpartRef().getId());
        }
        auditLogService.recordEntityAction(
                AuditAction.DEBT_UPDATE,
                actor.getId(), actor.getUsername(),
                "DEBT", debt.getId(),
                debt.getBusiness().getName() + " — " + debt.getDirection().name()
                        + " (" + debt.getCounterparty() + ") duzenlendi",
                debtAuditMetaBuilder.buildUpdateMeta(debt, oldAmount, oldDueDate, oldDescription, req));
        return toDto(debt);
    }

    // ─── Borç sil ─────────────────────────────────────────────

    @Transactional
    public void deleteDebt(UUID debtId, UUID userId) {
        Debt debt = debtRepository.findById(debtId)
                .orElseThrow(() -> new IllegalArgumentException("Borc bulunamadi"));

        accessGuard.assertCanAccessBusiness(userId, debt.getBusiness().getId());

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // admin_only borçları sadece admin silebilir
        if (debt.isAdminOnly() && !"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Bu borcu sadece admin silebilir");
        }

        UUID businessId = debt.getBusiness().getId();
        String businessName = debt.getBusiness().getName();
        String counterparty = debt.getCounterparty();
        BigDecimal amount = debt.getAmount();
        String currency = debt.getCurrency();
        String direction = debt.getDirection().name();
        UUID counterpartId = debt.getCounterpartRef() != null ? debt.getCounterpartRef().getId() : null;

        debtRepository.delete(debt);
        log.info("Borc silindi: {} - {} {} TL silen={}",
                direction, counterparty, amount, user.getFullName());

        if (counterpartId != null) {
            counterpartLedger.recomputeIfPresent(counterpartId);
        }

        auditLogService.recordEntityAction(
                AuditAction.DEBT_DELETE,
                user.getId(), user.getUsername(),
                "DEBT", debtId,
                businessName + " — " + direction + " " + amount + " " + currency + " (" + counterparty + ") silindi",
                Map.of(
                        "businessId", businessId,
                        "amount", amount,
                        "direction", direction,
                        "currency", currency,
                        "counterparty", counterparty
                ));
    }

    // ─── Tahsil et / Öde ──────────────────────────────────────

    @Transactional
    public DebtDto settleDebt(UUID debtId, UUID userId) {
        Debt debt = debtRepository.findById(debtId)
                .orElseThrow(() -> new IllegalArgumentException("Borc bulunamadi"));

        accessGuard.assertCanAccessBusiness(userId, debt.getBusiness().getId());

        User actor = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // admin_only borçları sadece admin settle edebilir — silmedeki ile aynı kural
        if (debt.isAdminOnly() && !"admin".equalsIgnoreCase(actor.getRole())) {
            throw new SecurityException("Bu borcu sadece admin settle edebilir");
        }

        debt.setSettled(true);
        debt.setSettledAt(LocalDateTime.now());
        debt = debtRepository.save(debt);

        log.info("Borc kapatildi: {} - {} {} TL",
                debt.getDirection(), debt.getCounterparty(), debt.getAmount());

        auditLogService.recordEntityAction(
                AuditAction.DEBT_SETTLED,
                actor.getId(), actor.getUsername(),
                "DEBT", debt.getId(),
                debt.getBusiness().getName() + " — " + debt.getDirection().name() + " " + debt.getAmount() + " " + debt.getCurrency() + " (" + debt.getCounterparty() + ") kapatildi",
                Map.of(
                        "businessId", debt.getBusiness().getId(),
                        "amount", debt.getAmount(),
                        "direction", debt.getDirection().name(),
                        "currency", debt.getCurrency(),
                        "counterparty", debt.getCounterparty()
                ));

        if (debt.getCounterpartRef() != null) {
            counterpartLedger.recomputeIfPresent(debt.getCounterpartRef().getId());
        }

        return toDto(debt);
    }

    // ─── İşletme borç özeti ───────────────────────────────────

    @Transactional(readOnly = true)
    public DebtSummaryDto getBusinessDebtSummary(UUID businessId, UUID userId) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
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

    /**
     * v1.7.0.x (BUG fix): Parsiyel ödeme sonrası ana sayfa Borç/Alacak widget'ı
     * eski (orijinal) tutarı gösteriyordu — pendingReceivable/Payable formülü
     * "amount - settled_amount" idi, parsiyel ödemeleri görmüyordu.
     *
     * Yeni model: PaymentService.applyAllocation() debt.remaining_amount'ı
     * günceller (parsiyel veya tam ödeme). pending* artık doğrudan
     * remaining_amount'tan toplanır (null fallback amount). settled debt'lerin
     * remaining'i 0'a düşer veya settled=true filtresi ile dışlanır.
     */
    private DebtSummaryDto buildSummary(List<Debt> debts) {
        BigDecimal totalReceivable = BigDecimal.ZERO;
        BigDecimal totalPayable = BigDecimal.ZERO;
        BigDecimal settledReceivable = BigDecimal.ZERO;
        BigDecimal settledPayable = BigDecimal.ZERO;
        BigDecimal pendingReceivable = BigDecimal.ZERO;
        BigDecimal pendingPayable = BigDecimal.ZERO;
        int receivableCount = 0;
        int payableCount = 0;

        for (Debt d : debts) {
            BigDecimal amount = d.getAmount() != null ? d.getAmount() : BigDecimal.ZERO;
            BigDecimal remaining = d.getRemainingAmount() != null
                    ? d.getRemainingAmount() : amount;
            if (d.getDirection() == DebtDirection.RECEIVABLE) {
                totalReceivable = totalReceivable.add(amount);
                receivableCount++;
                if (d.isSettled()) {
                    settledReceivable = settledReceivable.add(amount);
                } else {
                    pendingReceivable = pendingReceivable.add(remaining);
                }
            } else {
                totalPayable = totalPayable.add(amount);
                payableCount++;
                if (d.isSettled()) {
                    settledPayable = settledPayable.add(amount);
                } else {
                    pendingPayable = pendingPayable.add(remaining);
                }
            }
        }

        return DebtSummaryDto.builder()
                .totalReceivable(totalReceivable)
                .totalPayable(totalPayable)
                .netBalance(pendingReceivable.subtract(pendingPayable))
                .settledReceivable(settledReceivable)
                .settledPayable(settledPayable)
                .pendingReceivable(pendingReceivable)
                .pendingPayable(pendingPayable)
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
        Counterpart cp = d.getCounterpartRef();
        return DebtDto.builder()
                .id(d.getId())
                .businessId(d.getBusiness().getId())
                .businessName(d.getBusiness().getName())
                .direction(d.getDirection().name())
                .counterparty(d.getCounterparty())
                .counterpartId(cp != null ? cp.getId() : null)
                .counterpartName(cp != null ? cp.getName() : null)
                .amount(d.getAmount())
                .currency(d.getCurrency())
                .instrumentType(d.getInstrumentType())
                .receivableType(d.getReceivableType())
                .receivableTypeOther(d.getReceivableTypeOther())
                // v1.6.22 (WP-5): çek + reminder alanları
                .chequeDueDate(d.getChequeDueDate())
                .chequeCollectorBank(d.getChequeCollectorBank())
                .chequeNo(d.getChequeNo())
                .reminderDate(d.getReminderDate())
                .reminderNote(d.getReminderNote())
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

    // v1.6.5: izin verilen alacak tipleri.
    private static final java.util.Set<String> ALLOWED_RECEIVABLE_TYPES =
            java.util.Set.of("SENET", "CEK", "ALTIN", "NAKIT", "DIGER");

    /**
     * v1.6.5: serbest metin → kanonik tip. Kabul edilmeyen değer
     * IllegalArgumentException atar. Boş/null caller tarafında zaten elimine.
     */
    private static String normalizeReceivableType(String raw) {
        String upper = raw.trim().toUpperCase(java.util.Locale.ENGLISH);
        // Çekirdek değer haritalama: Türkçe karakter normalize.
        upper = upper.replace("Ç", "C").replace("Ğ", "G").replace("İ", "I")
                     .replace("Ö", "O").replace("Ş", "S").replace("Ü", "U");
        if (!ALLOWED_RECEIVABLE_TYPES.contains(upper)) {
            throw new IllegalArgumentException(
                    "Gecersiz receivable_type. Izin verilen: SENET, CEK, ALTIN, NAKIT, DIGER");
        }
        return upper;
    }
}
