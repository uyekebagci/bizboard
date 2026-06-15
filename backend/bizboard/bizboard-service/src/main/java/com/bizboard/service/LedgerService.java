package com.bizboard.service;

import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.ClosedPeriodSummary;
import com.bizboard.common.entity.LedgerWaitListEntry;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.ClosedPeriodSummaryRepository;
import com.bizboard.repository.LedgerWaitListRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Kayıt Defteri (Ledger) Servisi
 *
 * Görevleri:
 * 1. Geriye dönük işlem değişikliklerini wait_list'ten alıp closed_period_summaries'i günceller
 * 2. Her sabah 03:30'da scheduled olarak çalışır
 * 3. Manuel olarak da tetiklenebilir (admin endpoint)
 * 4. Tüm geçmiş dönemleri sıfırdan yeniden hesaplayabilir (full reconciliation)
 *
 * Akış:
 *   İşlem eklendi/silindi (geçmiş aya ait)
 *     → TransactionService wait_list'e kayıt ekler
 *     → LedgerService 03:30'da wait_list'i tarar
 *     → Etkilenen her (business_id, year, month) için transactions tablosundan yeniden hesaplar
 *     → closed_period_summaries güncellenir (varsa update, yoksa insert)
 *     → wait_list kayıtları "processed" olarak işaretlenir
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LedgerService {

    private final LedgerWaitListRepository waitListRepository;
    private final ClosedPeriodSummaryRepository closedPeriodSummaryRepository;
    private final TransactionRepository transactionRepository;
    private final BusinessRepository businessRepository;

    // ─── Scheduled Job: Her sabah 03:30 ─────────────────────────────────

    /**
     * Her sabah 03:30'da çalışır.
     * Wait list'teki bekleyen kayıtları işler ve closed_period_summaries'i günceller.
     */
    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void processWaitList() {
        long pendingCount = waitListRepository.countByProcessedFalse();
        if (pendingCount == 0) {
            log.debug("Ledger wait list bos, islenecek kayit yok.");
            return;
        }

        log.info("Ledger wait list isleniyor: {} bekleyen kayit", pendingCount);

        // Etkilenen benzersiz dönemleri bul
        List<LedgerWaitListEntry> pendingEntries = waitListRepository
                .findByProcessedFalseOrderByCreatedAtAsc();

        // (businessId, year, month) bazında grupla
        Map<String, List<LedgerWaitListEntry>> groupedByPeriod = pendingEntries.stream()
                .collect(Collectors.groupingBy(
                        e -> e.getBusinessId() + "|" + e.getTargetYear() + "|" + e.getTargetMonth()
                ));

        int updatedPeriods = 0;

        for (Map.Entry<String, List<LedgerWaitListEntry>> entry : groupedByPeriod.entrySet()) {
            List<LedgerWaitListEntry> entries = entry.getValue();
            LedgerWaitListEntry sample = entries.get(0);

            UUID businessId = sample.getBusinessId();
            int year = sample.getTargetYear();
            int month = sample.getTargetMonth();

            try {
                recalculateAndUpdatePeriod(businessId, year, month);
                updatedPeriods++;

                // Bu gruptaki tüm kayıtları işlenmiş olarak işaretle
                LocalDateTime now = LocalDateTime.now();
                for (LedgerWaitListEntry e : entries) {
                    e.setProcessed(true);
                    e.setProcessedAt(now);
                }
                waitListRepository.saveAll(entries);

                log.info("Donem guncellendi: businessId={} {}/{}", businessId, year, month);
            } catch (Exception ex) {
                log.error("Donem guncellenirken hata: businessId={} {}/{}: {}",
                        businessId, year, month, ex.getMessage(), ex);
            }
        }

        log.info("Ledger wait list islendi: {} donem guncellendi, {} kayit islendi",
                updatedPeriods, pendingCount);
    }

    // ─── Wait List'e Kayıt Ekleme ───────────────────────────────────────

    /**
     * Geriye dönük bir işlem eklendiğinde çağrılır.
     */
    @Transactional
    public void addToWaitList(UUID businessId, int year, int month, UUID transactionId, String action) {
        LedgerWaitListEntry entry = LedgerWaitListEntry.builder()
                .businessId(businessId)
                .targetYear(year)
                .targetMonth(month)
                .transactionId(transactionId)
                .action(action)
                .build();

        waitListRepository.save(entry);
        log.info("Wait list'e eklendi: {} - businessId={} {}/{} txId={}",
                action, businessId, year, month, transactionId);
    }

    // ─── Tek Dönem Yeniden Hesaplama ────────────────────────────────────

    /**
     * Belirli bir (businessId, year, month) için closed_period_summaries'i
     * transactions tablosundan sıfırdan yeniden hesaplar.
     */
    @Transactional
    public void recalculateAndUpdatePeriod(UUID businessId, int year, int month) {
        YearMonth ym = YearMonth.of(year, month);
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();

        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found: " + businessId));

        // Transactions tablosundan gerçek verileri çek
        List<Transaction> transactions = transactionRepository
                .findByBusinessIdAndDateBetween(businessId, start, end);

        BigDecimal income = sumByDirection(transactions, TransactionDirection.INCOME);
        BigDecimal expense = sumByDirection(transactions, TransactionDirection.EXPENSE);
        BigDecimal netProfit = income.subtract(expense);
        Map<String, Map<String, BigDecimal>> breakdown = buildCategoryBreakdown(transactions);

        // Mevcut kayıt var mı kontrol et
        Optional<ClosedPeriodSummary> existing = closedPeriodSummaryRepository
                .findByBusinessIdAndYearAndMonth(businessId, year, month);

        if (transactions.isEmpty() && existing.isPresent()) {
            // Hiç transaction kalmadıysa kaydı sil
            closedPeriodSummaryRepository.delete(existing.get());
            log.info("Donem silindi (islem kalmadi): {} {}/{}", business.getName(), year, month);
            return;
        }

        if (transactions.isEmpty()) {
            // Hiç transaction yok ve kayıt da yok — yapacak bir şey yok
            return;
        }

        if (existing.isPresent()) {
            // Güncelle
            ClosedPeriodSummary summary = existing.get();
            summary.setTotalIncome(income);
            summary.setTotalExpense(expense);
            summary.setNetProfit(netProfit);
            summary.setTransactionCount(transactions.size());
            summary.setBreakdownByCategory(breakdown);
            summary.setClosedAt(LocalDateTime.now());
            closedPeriodSummaryRepository.save(summary);

            log.info("Donem guncellendi: {} {}/{} | Gelir:{} Gider:{} Net:{}",
                    business.getName(), year, month, income, expense, netProfit);
        } else {
            // Yeni kayıt oluştur
            ClosedPeriodSummary summary = ClosedPeriodSummary.builder()
                    .business(business)
                    .year(year)
                    .month(month)
                    .periodStart(start)
                    .periodEnd(end)
                    .totalIncome(income)
                    .totalExpense(expense)
                    .netProfit(netProfit)
                    .transactionCount(transactions.size())
                    .breakdownByCategory(breakdown)
                    .closedAt(LocalDateTime.now())
                    .build();
            closedPeriodSummaryRepository.save(summary);

            log.info("Donem olusturuldu: {} {}/{} | Gelir:{} Gider:{} Net:{}",
                    business.getName(), year, month, income, expense, netProfit);
        }
    }

    // ─── Tam Mutabakat (Full Reconciliation) ────────────────────────────

    /**
     * Tüm işletmelerin tüm geçmiş dönemlerini sıfırdan yeniden hesaplar.
     * Tehlikeli ama güçlü — data consistency'yi %100 garanti eder.
     * Manuel tetikleme veya ilk kurulum için kullanılır.
     */
    @Transactional
    public ReconciliationResult fullReconciliation() {
        log.info("Tam mutabakat baslatiliyor...");

        LocalDate today = LocalDate.now();
        YearMonth currentMonth = YearMonth.from(today);

        List<Business> allBusinesses = businessRepository.findAll();

        // Her işletme için en eski transaction'ı bul ve o aydan bugüne kadar tüm ayları tara
        int periodsProcessed = 0;
        int periodsCreated = 0;
        int periodsUpdated = 0;
        int periodsDeleted = 0;

        for (Business business : allBusinesses) {
            // İşletmenin tüm transaction'larını tarih bazlı kontrol et
            List<Transaction> allTx = transactionRepository
                    .findByBusinessIdOrderByDateDesc(business.getId(),
                            org.springframework.data.domain.PageRequest.of(0, Integer.MAX_VALUE));

            if (allTx.isEmpty()) continue;

            // En eski ve en yeni tarihi bul
            LocalDate earliest = allTx.stream()
                    .map(Transaction::getDate)
                    .min(LocalDate::compareTo)
                    .orElse(today);

            YearMonth startMonth = YearMonth.from(earliest);

            // Bu aydan bir önceki aya kadar (current month hariç — o hâlâ açık)
            YearMonth endMonth = currentMonth.minusMonths(1);

            YearMonth cursor = startMonth;
            while (!cursor.isAfter(endMonth)) {
                int year = cursor.getYear();
                int month = cursor.getMonthValue();

                boolean existed = closedPeriodSummaryRepository
                        .existsByBusinessIdAndYearAndMonth(business.getId(), year, month);

                recalculateAndUpdatePeriod(business.getId(), year, month);
                periodsProcessed++;

                // Sonuç tespiti
                boolean existsNow = closedPeriodSummaryRepository
                        .existsByBusinessIdAndYearAndMonth(business.getId(), year, month);

                if (!existed && existsNow) periodsCreated++;
                else if (existed && existsNow) periodsUpdated++;
                else if (existed && !existsNow) periodsDeleted++;

                cursor = cursor.plusMonths(1);
            }
        }

        // Bekleyen wait list'i de temizle
        List<LedgerWaitListEntry> pending = waitListRepository.findByProcessedFalseOrderByCreatedAtAsc();
        LocalDateTime now = LocalDateTime.now();
        for (LedgerWaitListEntry e : pending) {
            e.setProcessed(true);
            e.setProcessedAt(now);
        }
        waitListRepository.saveAll(pending);

        ReconciliationResult result = new ReconciliationResult(
                allBusinesses.size(), periodsProcessed, periodsCreated,
                periodsUpdated, periodsDeleted, pending.size()
        );

        log.info("Tam mutabakat tamamlandi: {}", result);
        return result;
    }

    // ─── Yardımcı Metodlar ──────────────────────────────────────────────

    private BigDecimal sumByDirection(List<Transaction> transactions, TransactionDirection dir) {
        // Bug a1d58d6e/a90a8d42 fix: ortak {@link PosIncomeCalculator} — POS dahil
        // tüm gelir/gider TAM tutar (Beta v1.1); konsolide/özet net ile tutarlı.
        // (Eski yorum "POS net = amount − commission" geçersiz.)
        return transactions.stream()
                .filter(t -> t.getDirection() == dir)
                .map(SummaryService::effectiveAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Map<String, Map<String, BigDecimal>> buildCategoryBreakdown(List<Transaction> transactions) {
        Map<String, Map<String, BigDecimal>> breakdown = new HashMap<>();
        for (Transaction t : transactions) {
            // Bug fix: kategori soft-delete'tir (active=false) ama tx FK'sı durur.
            // Çözülemeyen (null/pasif) kategori "Diğer"e toplanır — silinmiş kategori
            // kırılımda ayrı satır göstermesin (tutar kaybolmaz).
            String catName = resolveCategoryName(t);
            String dirKey = t.getDirection() == TransactionDirection.INCOME ? "income" : "expense";
            breakdown.computeIfAbsent(catName, k -> new HashMap<>());
            breakdown.get(catName).merge(dirKey, t.getAmount(), BigDecimal::add);
        }
        return breakdown;
    }

    /**
     * Kategori kırılımı görünen ad çözümü: tx'in kategorisi null VEYA pasif
     * (soft-delete) ise "Diğer" döner; aksi halde kategori adı.
     */
    private static String resolveCategoryName(Transaction t) {
        var cat = t.getCategory();
        if (cat != null && cat.isActive() && cat.getName() != null) {
            return cat.getName();
        }
        return "Diğer";
    }

    /**
     * Belirli bir tarih, geçmiş (kapanmış) bir döneme mi ait?
     */
    public boolean isClosedPeriod(LocalDate date) {
        YearMonth txMonth = YearMonth.from(date);
        YearMonth currentMonth = YearMonth.from(LocalDate.now());
        return txMonth.isBefore(currentMonth);
    }

    // ─── Result Record ──────────────────────────────────────────────────

    public record ReconciliationResult(
            int businessCount,
            int periodsProcessed,
            int periodsCreated,
            int periodsUpdated,
            int periodsDeleted,
            int waitListCleared
    ) {}
}
