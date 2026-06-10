package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreatePosDealRequest;
import com.bizboard.common.dto.PosDealDto;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.PosDealStatus;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5 / §6 / TODO 1+4) — POS işlem (deal) girişi + kâr-payı
 * şelalesi orkestrasyonu.
 *
 * <p>Akış (deal create):</p>
 * <ol>
 *   <li>Girdi doğrula (cihaz/oranlar/getiren tenant + müşteri_oranı ≥ banka oranı).</li>
 *   <li>{@link PosDeal} kaydet (status=PROVISIONAL).</li>
 *   <li>{@link ProfitSharePostingService} ile kâr-payı PROVISIONAL postala
 *       (aynı-gün RATE_SPREAD/MARGIN_PCT final; OWNER_COMMISSION tahmini).</li>
 *   <li>Audit.</li>
 * </ol>
 *
 * <p>OWNER_COMMISSION (Tuncay) finali T+1 settlement'ta ({@link PosSettlementBatchService}).</p>
 *
 * <p><b>STRICT:</b> tüm mutate guard'lı + audit; pay posting'leri Σ=0; operatör
 * kasası read-only (sistem postası).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosDealService {

    private final PosDealRepository dealRepository;
    private final PosDeviceRepository posDeviceRepository;
    private final CounterpartRepository counterpartRepository;
    private final BankAccountRepository bankAccountRepository;
    private final ProfitShareRuleRepository ruleRepository;
    private final ProfitShareEngine engine;
    private final ProfitSharePostingService postingService;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    // ──────────────────────────── CREATE ────────────────────────────

    @Transactional
    public PosDealDto createDeal(UUID userId, UUID businessId, CreatePosDealRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        PosDevice device = posDeviceRepository.findById(req.getPosDeviceId())
                .orElseThrow(() -> new IllegalArgumentException("POS cihazı bulunamadı"));
        assertSameBusiness(device.getBusiness(), businessId, "POS cihazı");

        BigDecimal gross = req.getGrossAmount();
        BigDecimal customerRate = req.getCustomerRate();
        if (gross == null || gross.signum() <= 0) {
            throw new IllegalArgumentException("gross_amount > 0 olmalı");
        }
        // Müşteri oranı banka oranından (defaultRate) düşük olamaz — negatif marj engeli.
        BigDecimal bankRate = device.getDefaultRate() != null ? device.getDefaultRate() : BigDecimal.ZERO;
        if (customerRate.compareTo(bankRate) < 0) {
            throw new IllegalArgumentException(
                    "customer_rate (" + customerRate + ") banka oranından (" + bankRate
                            + ") düşük olamaz — negatif marj");
        }

        Counterpart referrer = null;
        if (req.getReferrerCounterpartId() != null) {
            referrer = counterpartRepository.findById(req.getReferrerCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException("Getiren bulunamadı"));
            assertSameBusiness(referrer.getBusiness(), businessId, "Getiren");
        }
        BankAccount ownerAccount = null;
        if (req.getOwnerAccountId() != null) {
            ownerAccount = bankAccountRepository.findById(req.getOwnerAccountId())
                    .orElseThrow(() -> new IllegalArgumentException("Yatış hesabı bulunamadı"));
            assertSameBusiness(ownerAccount.getBusiness(), businessId, "Yatış hesabı");
        }

        LocalDate dealDate = req.getDealDate() != null ? req.getDealDate() : LocalDate.now();
        if (dealDate.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("deal_date gelecek tarih olamaz: " + dealDate);
        }

        PosDeal deal = PosDeal.builder()
                .business(business)
                .dealDate(dealDate)
                .grossAmount(gross)
                .customerRate(customerRate)
                .posDevice(device)
                .ownerAccount(ownerAccount)
                .referrerCounterpart(referrer)
                .status(PosDealStatus.PROVISIONAL)
                .createdBy(userId)
                .notes(req.getNotes())
                .build();
        deal = dealRepository.save(deal);

        // Kâr-payı PROVISIONAL postala (aynı-gün final + OWNER_COMMISSION tahmini).
        BigDecimal operatorShare = postingService.postSharesForDeal(deal, null, userId);

        Map<String, Object> meta = new HashMap<>();
        meta.put("dealId", deal.getId().toString());
        meta.put("gross", gross);
        meta.put("customerRate", customerRate);
        meta.put("device", device.getName());
        meta.put("operatorShareTotal", operatorShare);
        auditLogService.recordEntityAction(
                AuditAction.POS_DEAL_CREATE, userId, user.getUsername(),
                "POS_DEAL", deal.getId(),
                "POS işlem girildi: " + gross + " @ %" + customerRate + " (" + device.getName() + ")",
                meta, AuditAction.HIGHLIGHT_POS_DEAL);

        log.info("[pos-deal] created deal={} gross={} rate={} device={} opShare={}",
                deal.getId(), gross, customerRate, device.getName(), operatorShare);
        return toDto(deal, null);
    }

    // ──────────────────────────── REVERSE (admin) ────────────────────────────

    @Transactional
    public void reverseDeal(UUID userId, UUID dealId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!accessGuard.isAdmin(userId)) {
            throw new SecurityException("Sadece admin POS işlemini geri alabilir");
        }
        PosDeal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new IllegalArgumentException("POS işlemi bulunamadı"));
        accessGuard.assertCanAccessBusiness(userId, deal.getBusiness().getId());

        int reversed = postingService.reverseSharesForDeal(dealId);
        deal.setStatus(PosDealStatus.REVERSED);
        dealRepository.save(deal);

        auditLogService.recordEntityAction(
                AuditAction.POS_DEAL_REVERSE, userId, user.getUsername(),
                "POS_DEAL", dealId,
                "POS işlemi geri alındı — " + reversed + " kâr posting'i silindi",
                Map.of("dealId", dealId.toString(), "reversedEntries", reversed),
                AuditAction.HIGHLIGHT_POS_DEAL);
        log.info("[pos-deal] reversed deal={} entries={}", dealId, reversed);
    }

    // ──────────────────────────── QUERY ────────────────────────────

    @Transactional(readOnly = true)
    public List<PosDealDto> list(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return dealRepository.findByBusinessIdOrderByDealDateDescCreatedAtDesc(businessId)
                .stream().map(d -> toDto(d, batchAvgCommission(d))).toList();
    }

    @Transactional(readOnly = true)
    public PosDealDto get(UUID userId, UUID businessId, UUID dealId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        PosDeal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new IllegalArgumentException("POS işlemi bulunamadı"));
        assertSameBusiness(deal.getBusiness(), businessId, "POS işlemi");
        return toDto(deal, batchAvgCommission(deal));
    }

    /**
     * Bir deal için canlı kâr-payı önizleme (posting YAZMADAN). FE deal formu
     * "müşteri oranı değişince payları göster" için.
     */
    @Transactional(readOnly = true)
    public PosDealDto previewShares(UUID userId, UUID businessId, CreatePosDealRequest req) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));
        PosDevice device = posDeviceRepository.findById(req.getPosDeviceId())
                .orElseThrow(() -> new IllegalArgumentException("POS cihazı bulunamadı"));
        PosDeal probe = PosDeal.builder()
                .business(business)
                .dealDate(req.getDealDate() != null ? req.getDealDate() : LocalDate.now())
                .grossAmount(req.getGrossAmount())
                .customerRate(req.getCustomerRate())
                .posDevice(device)
                .status(PosDealStatus.PENDING)
                .build();
        return toDto(probe, null);
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private BigDecimal batchAvgCommission(PosDeal deal) {
        return deal.getSettlementBatch() != null
                ? deal.getSettlementBatch().getAvgCommissionRate() : null;
    }

    private void assertSameBusiness(Business owner, UUID businessId, String label) {
        if (owner == null || !owner.getId().equals(businessId)) {
            throw new IllegalArgumentException(label + " farklı işletmeye ait (tenant ihlali)");
        }
    }

    PosDealDto toDto(PosDeal d, BigDecimal avgCommission) {
        PosDevice device = d.getPosDevice();
        List<PosDealDto.ShareLegDto> shares = engine.computeShares(d, avgCommission).stream()
                .map(leg -> {
                    ProfitShareRule r = leg.rule();
                    Counterpart op = r.getOperatorCounterpart();
                    BankAccount tgt = r.getTargetSubCashAccount();
                    return PosDealDto.ShareLegDto.builder()
                            .ruleType(leg.type().name())
                            .operatorCounterpartId(op != null ? op.getId() : null)
                            .operatorName(op != null ? op.getName() : "Şirket")
                            .targetSubCashAccountId(tgt != null ? tgt.getId() : null)
                            .targetSubCashAccountName(tgt != null ? tgt.getName() : null)
                            .amount(leg.amount())
                            .provisional(leg.provisional())
                            .build();
                }).toList();

        return PosDealDto.builder()
                .id(d.getId())
                .dealDate(d.getDealDate())
                .grossAmount(d.getGrossAmount())
                .customerRate(d.getCustomerRate())
                .posDeviceId(device != null ? device.getId() : null)
                .posDeviceName(device != null ? device.getName() : null)
                .ownerCompanyName(device != null && device.getOwnerMyCompany() != null
                        ? device.getOwnerMyCompany().getLegalName() : null)
                .bankRate(device != null ? device.getDefaultRate() : null)
                .referrerCounterpartId(d.getReferrerCounterpart() != null
                        ? d.getReferrerCounterpart().getId() : null)
                .referrerName(d.getReferrerCounterpart() != null
                        ? d.getReferrerCounterpart().getName() : null)
                .ownerAccountId(d.getOwnerAccount() != null ? d.getOwnerAccount().getId() : null)
                .ownerAccountName(d.getOwnerAccount() != null ? d.getOwnerAccount().getName() : null)
                .settlementBatchId(d.getSettlementBatch() != null ? d.getSettlementBatch().getId() : null)
                .avgCommissionRate(avgCommission)
                .status(d.getStatus() != null ? d.getStatus().name() : null)
                .notes(d.getNotes())
                .shares(shares)
                .build();
    }
}
