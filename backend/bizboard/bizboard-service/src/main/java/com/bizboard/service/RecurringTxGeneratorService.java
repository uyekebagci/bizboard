package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.FixedCost;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.FixedCostRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * v1.5.9: tekrarlayan tx jeneratörü.
 *
 * <p>{@link FixedCost#isAutoGenerate()} bayraklı + aktif sabit giderler için her
 * ay'ın 1'i otomatik {@link Transaction} üretir. Tx metadata'sında
 * {@code source=RECURRING} + {@code recurring_for=YYYY-MM} alanları yer alır;
 * raporlama ve audit kaydı bu sayede manuel tx'lerden ayırabilir.</p>
 *
 * <p><b>Idempotency:</b> her FixedCost'un {@code lastAutoRun} alanı kullanılır;
 * aynı YYYY-MM içinde ikinci kez tetiklenirse atlanır. Manuel "Şimdi üret"
 * butonundan veya {@code @Scheduled} cron'dan tetiklenmesi farketmez — aynı
 * ay tek kayıt çıkar.</p>
 *
 * <p>Frequency desteği: MONTHLY → her ay tetiklenir; YEARLY → sadece Ocak;
 * QUARTERLY → Ocak/Nisan/Temmuz/Ekim. Diğer değerler MONTHLY varsayılır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RecurringTxGeneratorService {

    private final FixedCostRepository fixedCostRepository;
    private final TransactionRepository transactionRepository;
    private final AuditLogService auditLogService;

    public record GenerationResult(int processed, int created, int skipped) {}

    /**
     * Tüm autoGenerate=true + active=true FixedCost'lar için bu ay tx üret.
     * Çağıran scheduled task veya manuel admin endpoint.
     *
     * @param now      üretim zamanı (test edilebilirlik için parametrize)
     * @param actorUserId audit için aktör (manual run'da admin id, scheduled'da null)
     * @param actorUsername audit için kullanıcı adı (scheduled'da "system")
     */
    @Transactional
    public GenerationResult run(LocalDateTime now, UUID actorUserId, String actorUsername) {
        YearMonth currentMonth = YearMonth.from(now);
        LocalDate effectiveDate = currentMonth.atDay(1);
        int processed = 0, created = 0, skipped = 0;

        for (FixedCost fc : fixedCostRepository.findByAutoGenerateTrueAndActiveTrue()) {
            processed++;
            if (!shouldGenerate(fc, currentMonth)) {
                skipped++;
                continue;
            }

            // Idempotency: aynı ay daha önce üretildiyse atla.
            if (fc.getLastAutoRun() != null) {
                YearMonth lastMonth = YearMonth.from(fc.getLastAutoRun());
                if (lastMonth.equals(currentMonth)) {
                    skipped++;
                    continue;
                }
            }

            Map<String, Object> meta = new HashMap<>();
            meta.put("source", "RECURRING");
            meta.put("recurring_for", currentMonth.toString());
            meta.put("fixed_cost_id", fc.getId());
            meta.put("fixed_cost_type", fc.getType());

            Transaction tx = Transaction.builder()
                    .business(fc.getBusiness())
                    .direction(TransactionDirection.EXPENSE)
                    .amount(fc.getAmount())
                    .currency(fc.getBusiness() != null && fc.getBusiness().getCurrency() != null
                            ? fc.getBusiness().getCurrency() : "TRY")
                    .description(fc.getName() + " (" + currentMonth + " otomatik)")
                    .date(effectiveDate)
                    .metadata(meta)
                    .build();
            transactionRepository.save(tx);

            fc.setLastAutoRun(now);
            fixedCostRepository.save(fc);
            created++;

            // Audit: TRANSACTION_CREATE source=RECURRING ile düş
            Map<String, Object> auditMeta = new HashMap<>(meta);
            auditMeta.put("amount", fc.getAmount());
            auditMeta.put("businessId", fc.getBusiness().getId());
            auditMeta.put("direction", "EXPENSE");
            auditLogService.recordEntityAction(
                    AuditAction.TRANSACTION_CREATE,
                    actorUserId, actorUsername,
                    "TRANSACTION", tx.getId(),
                    "[RECURRING " + currentMonth + "] " + fc.getName() + " → "
                            + fc.getAmount() + " " + tx.getCurrency() + " (" + fc.getBusiness().getName() + ")",
                    auditMeta);
        }

        log.info("[recurring-tx] processed={} created={} skipped={} ym={}",
                processed, created, skipped, currentMonth);
        return new GenerationResult(processed, created, skipped);
    }

    private static boolean shouldGenerate(FixedCost fc, YearMonth ym) {
        String freq = fc.getFrequency() != null
                ? fc.getFrequency().toUpperCase(java.util.Locale.ENGLISH) : "MONTHLY";
        int month = ym.getMonthValue();
        return switch (freq) {
            case "YEARLY" -> month == 1;
            case "QUARTERLY" -> month == 1 || month == 4 || month == 7 || month == 10;
            default -> true; // MONTHLY ve bilinmeyenler her ay
        };
    }
}
