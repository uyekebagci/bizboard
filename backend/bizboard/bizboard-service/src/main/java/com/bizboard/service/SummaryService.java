package com.bizboard.service;

import com.bizboard.common.dto.PeriodSummaryDto;
import com.bizboard.common.dto.PortfolioSummaryDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.ClosedPeriodSummary;
import com.bizboard.common.entity.FixedCost;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.ClosedPeriodSummaryRepository;
import com.bizboard.repository.FixedCostRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Tüm özet hesaplamaları doğrudan transactions tablosundan yapar.
 * Data consistency her zaman garantidir — hiçbir cache/denormalized tablo kullanılmaz.
 *
 * Kapanmış dönemler (geçmiş aylar) closed_period_summaries tablosuna arşivlenir.
 * Bu arşiv kayıt defteri niteliğindedir ve ay bitiminde otomatik oluşturulur.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SummaryService {

    private final TransactionRepository transactionRepository;
    private final BusinessRepository businessRepository;
    private final ClosedPeriodSummaryRepository closedPeriodSummaryRepository;
    private final FixedCostRepository fixedCostRepository;
    private final UserRepository userRepository;

    // ─── Tek İşletme Özeti (Esnek Dönem) ────────────────────────────────

    @Transactional(readOnly = true)
    public PeriodSummaryDto getBusinessSummary(UUID businessId, String period,
                                               LocalDate from, LocalDate to) {
        DateRange range = resolveDateRange(period, from, to);

        List<Transaction> transactions = transactionRepository
                .findByBusinessIdAndDateBetween(businessId, range.start, range.end);

        boolean isClosed = isClosedPeriod(range.end);

        // Sabit giderleri dönem gün sayısına göre oranla
        BigDecimal fixedCostTotal = calculateFixedCostForPeriod(businessId, range.start, range.end);

        return buildPeriodSummary(businessId, period != null ? period : "custom",
                range.start, range.end, transactions, isClosed, fixedCostTotal);
    }

    // ─── Portfolio Özeti (Tüm İşletmeler) ───────────────────────────────

    @Transactional(readOnly = true)
    public PortfolioSummaryDto getPortfolioSummary(UUID userId, String period,
                                                    LocalDate from, LocalDate to) {
        List<Business> businesses = getAccessibleBusinesses(userId);
        if (businesses.isEmpty()) {
            return emptyPortfolio(0);
        }

        DateRange range = resolveDateRange(period, from, to);
        List<UUID> businessIds = businesses.stream().map(Business::getId).toList();

        List<Transaction> allTransactions = transactionRepository
                .findByBusinessIdInAndDateBetween(businessIds, range.start, range.end);

        // İşletmelere göre grupla
        Map<UUID, List<Transaction>> byBusiness = allTransactions.stream()
                .collect(Collectors.groupingBy(t -> t.getBusiness().getId()));

        BigDecimal totalIncome = BigDecimal.ZERO;
        BigDecimal totalExpense = BigDecimal.ZERO;
        BigDecimal totalFixedCost = BigDecimal.ZERO;
        List<PortfolioSummaryDto.BusinessSummary> businessSummaries = new ArrayList<>();

        for (Business biz : businesses) {
            List<Transaction> bizTx = byBusiness.getOrDefault(biz.getId(), List.of());

            BigDecimal income = sumByDirection(bizTx, TransactionDirection.INCOME);
            BigDecimal expense = sumByDirection(bizTx, TransactionDirection.EXPENSE);
            BigDecimal fixedCost = calculateFixedCostForPeriod(biz.getId(), range.start, range.end);
            BigDecimal profit = income.subtract(expense);

            totalIncome = totalIncome.add(income);
            totalExpense = totalExpense.add(expense);
            totalFixedCost = totalFixedCost.add(fixedCost);

            businessSummaries.add(PortfolioSummaryDto.BusinessSummary.builder()
                    .businessId(biz.getId())
                    .income(income)
                    .expense(expense)
                    .profit(profit)
                    .fixedCost(fixedCost)
                    .build());
        }

        BigDecimal totalExpenseWithFixed = totalExpense.add(totalFixedCost);

        return PortfolioSummaryDto.builder()
                .totalIncome(totalIncome)
                .totalExpense(totalExpense)
                .netProfit(totalIncome.subtract(totalExpense))
                .businessCount(businesses.size())
                .fixedCostTotal(totalFixedCost)
                .totalExpenseWithFixed(totalExpenseWithFixed)
                .netProfitWithFixed(totalIncome.subtract(totalExpenseWithFixed))
                .businesses(businessSummaries)
                .build();
    }

    // ─── Ay Sonu Kapanış (Kayıt Defteri) ────────────────────────────────

    /**
     * Her ayın 1'inde gece 00:05'te çalışır.
     * Bir önceki ayı tüm işletmeler için kapatır ve arşiv kaydı oluşturur.
     */
    @Scheduled(cron = "0 5 0 1 * *")
    @Transactional
    public void closeMonth() {
        LocalDate today = LocalDate.now();
        int year = today.getMonthValue() == 1 ? today.getYear() - 1 : today.getYear();
        int month = today.getMonthValue() == 1 ? 12 : today.getMonthValue() - 1;

        log.info("Ay sonu kapanisi baslatiliyor: {}/{}", year, month);
        closeMonthForAll(year, month);
        log.info("Ay sonu kapanisi tamamlandi: {}/{}", year, month);
    }

    /**
     * Belirli bir ay için tüm işletmelerin kapanışını yapar.
     * Manuel olarak da çağrılabilir (admin endpoint vs.)
     */
    @Transactional
    public void closeMonthForAll(int year, int month) {
        YearMonth ym = YearMonth.of(year, month);
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();

        List<Business> allBusinesses = businessRepository.findAll();

        for (Business business : allBusinesses) {
            List<Transaction> transactions = transactionRepository
                    .findByBusinessIdAndDateBetween(business.getId(), start, end);

            BigDecimal income = sumByDirection(transactions, TransactionDirection.INCOME);
            BigDecimal expense = sumByDirection(transactions, TransactionDirection.EXPENSE);
            Map<String, Map<String, BigDecimal>> breakdown = buildCategoryBreakdown(transactions);

            // Mevcut kayıt var mı?
            Optional<ClosedPeriodSummary> existing = closedPeriodSummaryRepository
                    .findByBusinessIdAndYearAndMonth(business.getId(), year, month);

            if (transactions.isEmpty()) {
                // İşlem yoksa ve kayıt varsa sil
                existing.ifPresent(closedPeriodSummaryRepository::delete);
                continue;
            }

            if (existing.isPresent()) {
                // Güncelle
                ClosedPeriodSummary summary = existing.get();
                summary.setTotalIncome(income);
                summary.setTotalExpense(expense);
                summary.setNetProfit(income.subtract(expense));
                summary.setTransactionCount(transactions.size());
                summary.setBreakdownByCategory(breakdown);
                summary.setClosedAt(LocalDateTime.now());
                closedPeriodSummaryRepository.save(summary);
            } else {
                // Yeni oluştur
                ClosedPeriodSummary summary = ClosedPeriodSummary.builder()
                        .business(business)
                        .year(year)
                        .month(month)
                        .periodStart(start)
                        .periodEnd(end)
                        .totalIncome(income)
                        .totalExpense(expense)
                        .netProfit(income.subtract(expense))
                        .transactionCount(transactions.size())
                        .breakdownByCategory(breakdown)
                        .closedAt(LocalDateTime.now())
                        .build();
                closedPeriodSummaryRepository.save(summary);
            }

            log.info("Kapatildi: {} - {}/{} | Gelir: {} Gider: {} Net: {}",
                    business.getName(), year, month, income, expense, income.subtract(expense));
        }
    }

    // ─── Yardımcı Metodlar ──────────────────────────────────────────────

    private PeriodSummaryDto buildPeriodSummary(UUID businessId, String period,
                                                 LocalDate start, LocalDate end,
                                                 List<Transaction> transactions,
                                                 boolean isClosed,
                                                 BigDecimal fixedCostTotal) {
        BigDecimal income = sumByDirection(transactions, TransactionDirection.INCOME);
        BigDecimal expense = sumByDirection(transactions, TransactionDirection.EXPENSE);
        Map<String, Map<String, BigDecimal>> breakdown = buildCategoryBreakdown(transactions);

        BigDecimal totalExpenseWithFixed = expense.add(fixedCostTotal);

        return PeriodSummaryDto.builder()
                .businessId(businessId)
                .period(period)
                .periodStart(start)
                .periodEnd(end)
                .totalIncome(income)
                .totalExpense(expense)
                .netProfit(income.subtract(expense))
                .transactionCount(transactions.size())
                .closed(isClosed)
                .breakdownByCategory(breakdown)
                .fixedCostTotal(fixedCostTotal)
                .totalExpenseWithFixed(totalExpenseWithFixed)
                .netProfitWithFixed(income.subtract(totalExpenseWithFixed))
                .build();
    }

    /**
     * Belirtilen dönem için sabit giderlerin oransal toplamını hesaplar.
     *
     * Mantık:
     * - Dönem tam bir takvim ayını kapsıyorsa → direkt aylık toplamı döndür
     * - Dönem birden fazla tam ayı kapsıyorsa → ay sayısı × aylık toplam
     * - Kısmi dönemlerde → aylık / ayın_gün_sayısı × dönem_gün_sayısı
     *
     * Böylece aylık görünümde widget ile özet arasında tutarsızlık olmaz.
     */
    private BigDecimal calculateFixedCostForPeriod(UUID businessId, LocalDate start, LocalDate end) {
        List<FixedCost> activeCosts = fixedCostRepository
                .findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(businessId);

        if (activeCosts.isEmpty()) {
            return BigDecimal.ZERO;
        }

        // Toplam aylık sabit gider
        BigDecimal totalMonthly = BigDecimal.ZERO;
        for (FixedCost fc : activeCosts) {
            BigDecimal monthly = switch (fc.getFrequency() != null
                    ? fc.getFrequency().toUpperCase(java.util.Locale.ENGLISH) : "MONTHLY") {
                case "DAILY" -> fc.getAmount().multiply(BigDecimal.valueOf(30));
                case "WEEKLY" -> fc.getAmount().multiply(BigDecimal.valueOf(4.33))
                        .setScale(2, java.math.RoundingMode.HALF_UP);
                case "YEARLY" -> fc.getAmount().divide(BigDecimal.valueOf(12), 2,
                        java.math.RoundingMode.HALF_UP);
                default -> fc.getAmount(); // MONTHLY
            };
            totalMonthly = totalMonthly.add(monthly);
        }

        // Tam takvim ayı veya ay içi kısmi dönem (ayın 1'inden bugüne)
        // Her iki durumda da tam aylık sabit gideri göster
        boolean isWithinSingleMonth = start.getDayOfMonth() == 1
                && !end.isBefore(start)
                && YearMonth.from(start).equals(YearMonth.from(end));

        if (isWithinSingleMonth) {
            return totalMonthly;
        }

        // Tam çoklu ay kontrolü (örn: çeyreklik = 3 ay, yıllık = 12 ay)
        if (start.getDayOfMonth() == 1) {
            LocalDate check = start;
            int fullMonths = 0;
            while (!check.isAfter(end)) {
                LocalDate monthEnd = check.plusMonths(1).minusDays(1);
                if (monthEnd.isAfter(end)) break;
                fullMonths++;
                check = check.plusMonths(1);
            }
            // Kalan kısmi günler
            LocalDate remainStart = start.plusMonths(fullMonths);
            if (fullMonths > 0 && !remainStart.isAfter(end)) {
                long remainDays = java.time.temporal.ChronoUnit.DAYS.between(remainStart, end) + 1;
                int daysInRemainMonth = remainStart.lengthOfMonth();
                BigDecimal partialCost = totalMonthly
                        .multiply(BigDecimal.valueOf(remainDays))
                        .divide(BigDecimal.valueOf(daysInRemainMonth), 2, java.math.RoundingMode.HALF_UP);
                return totalMonthly.multiply(BigDecimal.valueOf(fullMonths)).add(partialCost);
            }
            if (fullMonths > 0) {
                return totalMonthly.multiply(BigDecimal.valueOf(fullMonths));
            }
        }

        // Kısmi dönem: ayın gerçek gün sayısına göre oranla
        int daysInMonth = start.lengthOfMonth();
        long periodDays = java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1;

        BigDecimal dailyCost = totalMonthly.divide(BigDecimal.valueOf(daysInMonth), 4,
                java.math.RoundingMode.HALF_UP);

        return dailyCost.multiply(BigDecimal.valueOf(periodDays))
                .setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private BigDecimal sumByDirection(List<Transaction> transactions, TransactionDirection dir) {
        return transactions.stream()
                .filter(t -> t.getDirection() == dir)
                .map(SummaryService::effectiveAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * v1.6.23.8 (TODO ad8afc6f): POS tx için net (= amount − commission) kullan.
     * "Net kar" hesabı kullanıcının fiilen elde ettiği parayı yansıtmalı; bankanın
     * aldığı komisyon income'a dahil edilmemeli. NAKIT/HESAPDAN: amount direkt.
     */
    static BigDecimal effectiveAmount(Transaction t) {
        if (t == null || t.getAmount() == null) return BigDecimal.ZERO;
        if (!"POS".equalsIgnoreCase(t.getPaymentMethod())) return t.getAmount();
        java.math.BigDecimal rate = t.getAppliedPosRate() != null
                ? t.getAppliedPosRate()
                : (t.getPosRate() != null ? t.getPosRate() : BigDecimal.ZERO);
        if (rate.signum() == 0) return t.getAmount();
        BigDecimal commission = t.getAmount().multiply(rate)
                .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        return t.getAmount().subtract(commission);
    }

    private Map<String, Map<String, BigDecimal>> buildCategoryBreakdown(List<Transaction> transactions) {
        Map<String, Map<String, BigDecimal>> breakdown = new HashMap<>();

        for (Transaction t : transactions) {
            String catName = t.getCategory() != null ? t.getCategory().getName() : "Kategorisiz";
            String dirKey = t.getDirection() == TransactionDirection.INCOME ? "income" : "expense";

            breakdown.computeIfAbsent(catName, k -> new HashMap<>());
            breakdown.get(catName).merge(dirKey, t.getAmount(), BigDecimal::add);
        }

        return breakdown;
    }

    private boolean isClosedPeriod(LocalDate endDate) {
        return endDate.isBefore(LocalDate.now().withDayOfMonth(1));
    }

    /**
     * v1.6.7+: Sistem geneli varsayılan periyot. Daha önce "monthly" idi; günlük
     * bakış kullanıcı için daha aktüel ve POS/NAKIT akışları günlük net cüzdan
     * görünümü ister. İstemci açıkça {@code ?period=monthly|weekly|...} geçerse
     * ona göre hesaplama yapılır — sadece DEFAULT değişti, geriye uyumluluk korunur.
     */
    private static final String DEFAULT_PERIOD = "daily";

    /**
     * period parametresine göre tarih aralığını çözer.
     * Eğer from/to verilmişse onları kullanır (custom).
     * Yoksa period'a göre hesaplar.
     */
    private DateRange resolveDateRange(String period, LocalDate from, LocalDate to) {
        if (from != null && to != null) {
            return new DateRange(from, to);
        }

        LocalDate today = LocalDate.now();

        if (period == null || period.isBlank()) {
            period = DEFAULT_PERIOD;
        }

        return switch (period.toLowerCase(java.util.Locale.ENGLISH)) {
            case "daily" -> new DateRange(today, today);
            case "weekly" -> new DateRange(
                    today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)),
                    today
            );
            case "monthly" -> new DateRange(
                    today.withDayOfMonth(1),
                    today
            );
            case "quarterly" -> {
                int quarterStartMonth = ((today.getMonthValue() - 1) / 3) * 3 + 1;
                yield new DateRange(
                        LocalDate.of(today.getYear(), quarterStartMonth, 1),
                        today
                );
            }
            case "yearly" -> new DateRange(
                    LocalDate.of(today.getYear(), 1, 1),
                    today
            );
            // v1.6.7+: bilinmeyen periyot → yeni default (daily).
            default -> new DateRange(today, today);
        };
    }

    private PortfolioSummaryDto emptyPortfolio(int businessCount) {
        return PortfolioSummaryDto.builder()
                .totalIncome(BigDecimal.ZERO)
                .totalExpense(BigDecimal.ZERO)
                .netProfit(BigDecimal.ZERO)
                .businessCount(businessCount)
                .businesses(List.of())
                .build();
    }

    private record DateRange(LocalDate start, LocalDate end) {}

    /**
     * Kullanıcının accessible_businesses sütununa göre erişebildiği işletmeleri döndürür.
     */
    private List<Business> getAccessibleBusinesses(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String accessible = user.getAccessibleBusinesses();

        if ("admin".equalsIgnoreCase(user.getRole())
                || (accessible != null && "all".equalsIgnoreCase(accessible.trim()))) {
            return businessRepository.findAll();
        }

        if (accessible != null && !accessible.isBlank()) {
            List<UUID> ids = Arrays.stream(accessible.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(UUID::fromString)
                    .toList();
            return businessRepository.findByIdIn(ids);
        }

        // Fallback: eski owner/member ilişkisi
        return businessRepository.findAllAccessibleByUser(userId);
    }
}
