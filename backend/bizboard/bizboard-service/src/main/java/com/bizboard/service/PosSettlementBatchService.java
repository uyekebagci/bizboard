package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.FinalizeSettlementRequest;
import com.bizboard.common.dto.PosSettlementBatchDto;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.PosDealStatus;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5 / §6 / TODO 2) — T+1 ortalama komisyon settlement.
 *
 * <p>Gün kapanışında o POS cihazına banka yatışı girilince:</p>
 * <pre>
 *   gross   = o gün o cihazdaki PosDeal brüt toplamı
 *   ort.komisyon (%) = (1 − deposited/gross) × 100
 * </pre>
 * <p>→ {@link PosSettlementBatch} finalize edilir → o günün deal'lerine bağlanır →
 * her deal için kâr-payı OWNER_COMMISSION (Tuncay) ort.komisyonla yeniden
 * hesaplanır: eski PROVISIONAL posting silinir (reversible) + FINAL posting
 * yazılır ({@link ProfitSharePostingService}).</p>
 *
 * <p><b>İdempotent (KARAR 2):</b> bir gün+cihaz için tek batch (UNIQUE); tekrar
 * finalize aynı sonuç (deal'ler yeniden FINAL postalanır, çift sayım yok —
 * postingService önce eskiyi siler). <b>FLAGGED bekleyen:</b> settle girilmeden
 * deal'ler PROVISIONAL kalır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosSettlementBatchService {

    private final PosSettlementBatchRepository batchRepository;
    private final PosDealRepository dealRepository;
    private final PosDeviceRepository posDeviceRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final ProfitSharePostingService postingService;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    // ──────────────────────────── FINALIZE ────────────────────────────

    /**
     * T+1 yatış finalize — ort.komisyon hesapla + OWNER_COMMISSION final adjust.
     */
    @Transactional
    public PosSettlementBatchDto finalizeSettlement(UUID userId, UUID businessId,
                                                    FinalizeSettlementRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        PosDevice device = posDeviceRepository.findById(req.getPosDeviceId())
                .orElseThrow(() -> new IllegalArgumentException("POS cihazı bulunamadı"));
        assertSameBusiness(device.getBusiness(), businessId);

        LocalDate date = req.getSettleDate();
        BigDecimal deposited = req.getDepositedAmount();
        if (deposited == null || deposited.signum() < 0) {
            throw new IllegalArgumentException("deposited_amount negatif olamaz");
        }

        BigDecimal gross = dealRepository.sumGrossForDeviceDay(businessId, device.getId(), date);
        if (gross == null || gross.signum() == 0) {
            throw new IllegalArgumentException(
                    "Bu gün+cihaz için POS işlemi (brüt) yok: " + date + " / " + device.getName());
        }
        if (deposited.compareTo(gross) > 0) {
            throw new IllegalArgumentException(
                    "Yatan (" + deposited + ") brütten (" + gross + ") büyük olamaz");
        }

        // ort.komisyon (%) = (1 − deposited/gross) × 100.
        BigDecimal avgCommission = BigDecimal.ONE
                .subtract(deposited.divide(gross, 8, RoundingMode.HALF_UP))
                .multiply(BigDecimal.valueOf(100))
                .setScale(4, RoundingMode.HALF_UP);

        BankAccount depositAccount = null;
        if (req.getDepositAccountId() != null) {
            depositAccount = bankAccountRepository.findById(req.getDepositAccountId())
                    .orElseThrow(() -> new IllegalArgumentException("Yatış hesabı bulunamadı"));
            assertSameBusiness(depositAccount.getBusiness(), businessId);
        }

        // Idempotent: gün+cihaz için tek batch.
        PosSettlementBatch batch = batchRepository
                .findByBusinessIdAndSettleDateAndPosDeviceId(businessId, date, device.getId())
                .orElseGet(() -> PosSettlementBatch.builder()
                        .business(business).settleDate(date).posDevice(device).build());
        batch.setGrossTotal(gross);
        batch.setDepositedAmount(deposited);
        batch.setAvgCommissionRate(avgCommission);
        batch.setDepositAccount(depositAccount);
        batch.setFinalized(true);
        batch.setFinalizedAt(LocalDateTime.now());
        batch.setFinalizedBy(userId);
        batch = batchRepository.save(batch);

        // O günün deal'lerini batch'e bağla + FINAL kâr-payı (ort.komisyonla) yaz.
        List<PosDeal> deals = dealRepository
                .findByBusinessIdAndPosDeviceIdAndDealDate(businessId, device.getId(), date);
        int finalized = 0;
        for (PosDeal deal : deals) {
            if (deal.getStatus() == PosDealStatus.REVERSED) continue;
            deal.setSettlementBatch(batch);
            deal.setStatus(PosDealStatus.FINALIZED);
            deal.setSettledAt(LocalDateTime.now());
            dealRepository.save(deal);
            // FINAL faz: OWNER_COMMISSION ort.komisyonla; eski provisional silinir.
            postingService.postSharesForDeal(deal, avgCommission, userId);
            finalized++;
        }

        Map<String, Object> meta = new HashMap<>();
        meta.put("settleDate", date.toString());
        meta.put("device", device.getName());
        meta.put("gross", gross);
        meta.put("deposited", deposited);
        meta.put("avgCommission", avgCommission);
        meta.put("dealsFinalized", finalized);
        auditLogService.recordEntityAction(
                AuditAction.POS_SETTLEMENT_FINALIZE, userId, user.getUsername(),
                "POS_SETTLEMENT_BATCH", batch.getId(),
                "POS yatış finalize: " + date + " " + device.getName()
                        + " — yatan=" + deposited + " brüt=" + gross
                        + " ort.kom=%" + avgCommission + " (" + finalized + " deal)",
                meta, AuditAction.HIGHLIGHT_PROFIT_SHARE);

        log.info("[pos-settle-batch] finalize date={} device={} gross={} deposited={} avgCom={} deals={}",
                date, device.getName(), gross, deposited, avgCommission, finalized);
        return toDto(batch, finalized);
    }

    // ──────────────────────────── QUERY ────────────────────────────

    @Transactional(readOnly = true)
    public List<PosSettlementBatchDto> list(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return batchRepository.findByBusinessIdOrderBySettleDateDesc(businessId)
                .stream()
                .map(b -> toDto(b, dealRepository.findBySettlementBatchId(b.getId()).size()))
                .toList();
    }

    /**
     * Yatış bekleyen (PROVISIONAL deal'li, batch'siz/finalize-değil) gün+cihaz
     * çiftleri — UI "yatış bekliyor" listesi (kaçak adayı).
     */
    @Transactional(readOnly = true)
    public List<PosSettlementBatchDto> pendingSettlements(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        List<PosDeal> pending = dealRepository.findPendingSettlement(businessId);
        Map<String, PosSettlementBatchDto.PosSettlementBatchDtoBuilder> grouped = new HashMap<>();
        Map<String, Integer> counts = new HashMap<>();
        Map<String, BigDecimal> grossSums = new HashMap<>();
        for (PosDeal d : pending) {
            String key = d.getDealDate() + "|" + d.getPosDevice().getId();
            grossSums.merge(key, d.getGrossAmount() != null ? d.getGrossAmount() : BigDecimal.ZERO,
                    BigDecimal::add);
            counts.merge(key, 1, Integer::sum);
            grouped.computeIfAbsent(key, k -> PosSettlementBatchDto.builder()
                    .settleDate(d.getDealDate())
                    .posDeviceId(d.getPosDevice().getId())
                    .posDeviceName(d.getPosDevice().getName())
                    .finalized(false)
                    .pendingDeposit(true));
        }
        return grouped.entrySet().stream().map(e -> {
            String key = e.getKey();
            return e.getValue()
                    .grossTotal(grossSums.get(key))
                    .dealCount(counts.get(key))
                    .build();
        }).toList();
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private void assertSameBusiness(Business owner, UUID businessId) {
        if (owner == null || !owner.getId().equals(businessId)) {
            throw new IllegalArgumentException("Kaynak farklı işletmeye ait (tenant ihlali)");
        }
    }

    private PosSettlementBatchDto toDto(PosSettlementBatch b, int dealCount) {
        boolean pendingDeposit = b.getDepositedAmount() == null
                && b.getGrossTotal() != null && b.getGrossTotal().signum() > 0;
        return PosSettlementBatchDto.builder()
                .id(b.getId())
                .settleDate(b.getSettleDate())
                .posDeviceId(b.getPosDevice() != null ? b.getPosDevice().getId() : null)
                .posDeviceName(b.getPosDevice() != null ? b.getPosDevice().getName() : null)
                .grossTotal(b.getGrossTotal())
                .depositedAmount(b.getDepositedAmount())
                .avgCommissionRate(b.getAvgCommissionRate())
                .finalized(b.isFinalized())
                .dealCount(dealCount)
                .pendingDeposit(pendingDeposit)
                .build();
    }
}
