package com.bizboard.service;

import com.bizboard.common.dto.FinanceOverviewDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.FixedCost;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.FixedCostRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Finans modülü servisi.
 * Aylık trendler, kategori kırılımları, nakit akışı ve işletme bazlı
 * finansal analizleri hesaplar.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FinanceService {

    private final TransactionRepository transactionRepository;
    private final FixedCostRepository fixedCostRepository;
    private final BusinessAccessGuard accessGuard;

    private static final String[] TURKISH_MONTHS = {
            "", "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
            "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"
    };

    // ─── Ana Finans Özeti ───────────────────────────────────────────────

    /**
     * v1.6.15+: `days` parametresi opsiyonel — set ise periyot son N gün olarak
     * hesaplanır, monthly trend skip edilir (daily_cash_flow zaten son 30 gün
     * sağlıyor). days=null/0 → eski months mantığı.
     */
    @Transactional(readOnly = true)
    public FinanceOverviewDto getFinanceOverview(UUID userId, int months) {
        return getFinanceOverview(userId, months, null);
    }

    @Transactional(readOnly = true)
    public FinanceOverviewDto getFinanceOverview(UUID userId, int months, Integer days) {
        List<Business> businesses = getAccessibleBusinesses(userId);
        if (businesses.isEmpty()) {
            return emptyOverview();
        }

        List<UUID> businessIds = businesses.stream().map(Business::getId).toList();
        LocalDate today = LocalDate.now();
        boolean dailyMode = days != null && days > 0;

        // ─── Seçilen dönem ─────────────────────────────────────────────
        // dailyMode → curStart = today-(days-1)..today
        // months=0 → tüm zamanlar (eski mantık)
        // months>0 → curStart = ayın 1'i, N ay geri
        LocalDate curStart;
        if (dailyMode) {
            curStart = today.minusDays(days - 1L);
        } else if (months <= 0) {
            // Tüm zamanlar: en eski tarihi bul (işletme, sabit gider, işlem)
            LocalDate earliestBiz = businesses.stream()
                    .filter(b -> b.getCreatedAt() != null)
                    .map(b -> b.getCreatedAt().toLocalDate())
                    .min(LocalDate::compareTo)
                    .orElse(today);

            List<FixedCost> allFixedCosts = new ArrayList<>();
            for (UUID bizId : businessIds) {
                allFixedCosts.addAll(fixedCostRepository
                        .findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(bizId));
            }
            LocalDate earliestFixed = allFixedCosts.stream()
                    .filter(fc -> fc.getCreatedAt() != null)
                    .map(fc -> fc.getCreatedAt().toLocalDate())
                    .min(LocalDate::compareTo)
                    .orElse(today);

            List<Transaction> allTx = transactionRepository.findByBusinessIdInAndDateBetween(
                    businessIds, LocalDate.of(2000, 1, 1), today);
            LocalDate earliestTx = allTx.stream().map(Transaction::getDate)
                    .min(LocalDate::compareTo).orElse(today);

            // En eski tarihi al ve ayın 1'ine yuvarla
            LocalDate earliest = earliestBiz;
            if (earliestFixed.isBefore(earliest)) earliest = earliestFixed;
            if (earliestTx.isBefore(earliest)) earliest = earliestTx;
            curStart = YearMonth.from(earliest).atDay(1);
        } else {
            curStart = YearMonth.from(today).minusMonths(months - 1).atDay(1);
        }
        LocalDate curEnd = today;

        // Önceki dönem (aynı uzunlukta, seçilen dönemden hemen önce)
        long daysBetween = java.time.temporal.ChronoUnit.DAYS.between(curStart, curEnd) + 1;
        LocalDate prevEnd = curStart.minusDays(1);
        LocalDate prevStart = prevEnd.minusDays(daysBetween - 1);

        List<Transaction> curTransactions = transactionRepository
                .findByBusinessIdInAndDateBetween(businessIds, curStart, curEnd);
        List<Transaction> prevTransactions = transactionRepository
                .findByBusinessIdInAndDateBetween(businessIds, prevStart, prevEnd);

        BigDecimal curIncome = sumByDirection(curTransactions, TransactionDirection.INCOME);
        BigDecimal curExpense = sumByDirection(curTransactions, TransactionDirection.EXPENSE);
        BigDecimal prevIncome = sumByDirection(prevTransactions, TransactionDirection.INCOME);
        BigDecimal prevExpense = sumByDirection(prevTransactions, TransactionDirection.EXPENSE);

        // Sabit giderler: her işletme için kendi oluşturulma tarihinden itibaren hesapla
        BigDecimal curFixedCost = BigDecimal.ZERO;
        BigDecimal prevFixedCost = BigDecimal.ZERO;
        for (Business biz : businesses) {
            BigDecimal bizMonthlyFixed = calculateFixedCostForBusiness(biz.getId());
            if (bizMonthlyFixed.compareTo(BigDecimal.ZERO) == 0) continue;

            // İşletmenin sabit gider dönemi: oluşturulma tarihinden bugüne
            LocalDate bizStart = biz.getCreatedAt() != null
                    ? biz.getCreatedAt().toLocalDate() : curStart;
            // Seçilen dönemin başlangıcı ile işletme başlangıcından hangisi daha geçse onu al
            LocalDate effectiveStart = bizStart.isAfter(curStart) ? bizStart : curStart;
            if (!effectiveStart.isAfter(curEnd)) {
                int curMonths = (int) java.time.temporal.ChronoUnit.MONTHS.between(
                        YearMonth.from(effectiveStart), YearMonth.from(curEnd)) + 1;
                curFixedCost = curFixedCost.add(bizMonthlyFixed.multiply(BigDecimal.valueOf(curMonths)));
            }

            // Önceki dönem
            LocalDate prevEffective = bizStart.isAfter(prevStart) ? bizStart : prevStart;
            if (!prevEffective.isAfter(prevEnd)) {
                int prevMonths = (int) java.time.temporal.ChronoUnit.MONTHS.between(
                        YearMonth.from(prevEffective), YearMonth.from(prevEnd)) + 1;
                prevFixedCost = prevFixedCost.add(bizMonthlyFixed.multiply(BigDecimal.valueOf(prevMonths)));
            }
        }

        BigDecimal curTotalExpense = curExpense.add(curFixedCost);
        BigDecimal prevTotalExpense = prevExpense.add(prevFixedCost);
        BigDecimal curNetProfit = curIncome.subtract(curExpense);
        BigDecimal prevNetProfit = prevIncome.subtract(prevExpense);

        FinanceOverviewDto.PeriodData currentPeriod = FinanceOverviewDto.PeriodData.builder()
                .income(curIncome)
                .expense(curExpense)
                .netProfit(curNetProfit)
                .fixedCost(curFixedCost)
                .totalExpenseWithFixed(curTotalExpense)
                .netProfitWithFixed(curIncome.subtract(curTotalExpense))
                .transactionCount(curTransactions.size())
                .incomeChangePct(pctChange(curIncome, prevIncome))
                .expenseChangePct(pctChange(curExpense, prevExpense))
                .profitChangePct(pctChange(curNetProfit, prevNetProfit))
                .build();

        FinanceOverviewDto.PeriodData previousPeriod = FinanceOverviewDto.PeriodData.builder()
                .income(prevIncome)
                .expense(prevExpense)
                .netProfit(prevNetProfit)
                .fixedCost(prevFixedCost)
                .totalExpenseWithFixed(prevTotalExpense)
                .netProfitWithFixed(prevIncome.subtract(prevTotalExpense))
                .transactionCount(prevTransactions.size())
                .build();

        // ─── Aylık Trend ──────────────────────────────────────────────
        // v1.6.15+: dailyMode'da monthly trend boş döner — frontend daily_cash_flow
        // üzerinden günlük bar chart render eder.
        List<FinanceOverviewDto.MonthData> monthlyTrend;
        if (dailyMode) {
            monthlyTrend = List.of();
        } else {
            int trendMonths = months <= 0
                    ? (int) java.time.temporal.ChronoUnit.MONTHS.between(
                            YearMonth.from(curStart), YearMonth.from(curEnd)) + 1
                    : months;
            monthlyTrend = buildMonthlyTrend(businessIds, trendMonths);
        }

        // ─── Kategori Kırılımı (seçilen dönem) ────────────────────────
        List<FinanceOverviewDto.CategoryData> expenseByCategory =
                buildCategoryBreakdown(curTransactions, TransactionDirection.EXPENSE);
        List<FinanceOverviewDto.CategoryData> incomeByCategory =
                buildCategoryBreakdown(curTransactions, TransactionDirection.INCOME);

        // ─── İşletme Kırılımı ─────────────────────────────────────────
        List<FinanceOverviewDto.BusinessFinance> businessBreakdown =
                buildBusinessBreakdown(businesses, curTransactions, businessIds);

        // ─── En Yüksek İşlemler (seçilen dönem) ───────────────────────
        List<FinanceOverviewDto.TopTransaction> topExpenses =
                buildTopTransactions(curTransactions, TransactionDirection.EXPENSE, 5);
        List<FinanceOverviewDto.TopTransaction> topIncomes =
                buildTopTransactions(curTransactions, TransactionDirection.INCOME, 5);

        // ─── Günlük Nakit Akışı ──────────────────────────────────────
        // v1.6.15+: dailyMode'da kullanıcı son N günü ister — bar chart için
        // en az 30 gün gönder ki seçilen N + arka plan doğal görünsün.
        int cashFlowDays;
        if (dailyMode) {
            cashFlowDays = Math.max(days, 30);
        } else {
            cashFlowDays = months <= 0 ? 90 : Math.min(months * 30, 90);
        }
        List<FinanceOverviewDto.DailyCashFlow> dailyCashFlow =
                buildDailyCashFlow(businessIds, cashFlowDays);

        return FinanceOverviewDto.builder()
                .currentPeriod(currentPeriod)
                .previousPeriod(previousPeriod)
                .monthlyTrend(monthlyTrend)
                .expenseByCategory(expenseByCategory)
                .incomeByCategory(incomeByCategory)
                .businessBreakdown(businessBreakdown)
                .topExpenses(topExpenses)
                .topIncomes(topIncomes)
                .dailyCashFlow(dailyCashFlow)
                .build();
    }

    // ─── Aylık Trend Hesaplama ──────────────────────────────────────────

    private List<FinanceOverviewDto.MonthData> buildMonthlyTrend(List<UUID> businessIds, int months) {
        List<FinanceOverviewDto.MonthData> trend = new ArrayList<>();
        LocalDate today = LocalDate.now();

        for (int i = months - 1; i >= 0; i--) {
            YearMonth ym = YearMonth.from(today).minusMonths(i);
            LocalDate start = ym.atDay(1);
            LocalDate end = i == 0 ? today : ym.atEndOfMonth();

            List<Transaction> txList = transactionRepository
                    .findByBusinessIdInAndDateBetween(businessIds, start, end);

            BigDecimal income = sumByDirection(txList, TransactionDirection.INCOME);
            BigDecimal expense = sumByDirection(txList, TransactionDirection.EXPENSE);
            BigDecimal fixedCost = i == 0 ? calculateTotalFixedCost(businessIds) : calculateTotalFixedCost(businessIds);

            trend.add(FinanceOverviewDto.MonthData.builder()
                    .year(ym.getYear())
                    .month(ym.getMonthValue())
                    .label(TURKISH_MONTHS[ym.getMonthValue()])
                    .income(income)
                    .expense(expense)
                    .netProfit(income.subtract(expense))
                    .fixedCost(fixedCost)
                    .transactionCount(txList.size())
                    .build());
        }

        return trend;
    }

    // ─── Kategori Kırılımı ──────────────────────────────────────────────

    private List<FinanceOverviewDto.CategoryData> buildCategoryBreakdown(
            List<Transaction> transactions, TransactionDirection direction) {

        // v1.7.0-beta (Bankalar WP TODO d0567538): TRANSFER tx dışla.
        List<Transaction> filtered = transactions.stream()
                .filter(t -> t.getKind() != com.bizboard.common.enums.TransactionKind.TRANSFER)
                .filter(t -> t.getDirection() == direction)
                .toList();

        BigDecimal total = filtered.stream()
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Kategoriye göre grupla
        Map<String, List<Transaction>> grouped = filtered.stream()
                .collect(Collectors.groupingBy(t ->
                        t.getCategory() != null ? t.getCategory().getName() : "Kategorisiz"));

        List<FinanceOverviewDto.CategoryData> result = new ArrayList<>();
        for (Map.Entry<String, List<Transaction>> entry : grouped.entrySet()) {
            BigDecimal catAmount = entry.getValue().stream()
                    .map(Transaction::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal pct = total.compareTo(BigDecimal.ZERO) > 0
                    ? catAmount.multiply(BigDecimal.valueOf(100)).divide(total, 1, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            // İlk işlemin kategorisinden icon ve color al
            Transaction firstTx = entry.getValue().get(0);
            Category cat = firstTx.getCategory();

            result.add(FinanceOverviewDto.CategoryData.builder()
                    .name(entry.getKey())
                    .icon(cat != null ? cat.getIcon() : null)
                    .color(cat != null ? cat.getColor() : null)
                    .amount(catAmount)
                    .percentage(pct)
                    .transactionCount(entry.getValue().size())
                    .build());
        }

        // Büyükten küçüğe sırala
        result.sort((a, b) -> b.getAmount().compareTo(a.getAmount()));
        return result;
    }

    // ─── İşletme Bazlı Kırılım ─────────────────────────────────────────

    private List<FinanceOverviewDto.BusinessFinance> buildBusinessBreakdown(
            List<Business> businesses, List<Transaction> transactions, List<UUID> businessIds) {

        Map<UUID, List<Transaction>> byBusiness = transactions.stream()
                .collect(Collectors.groupingBy(t -> t.getBusiness().getId()));

        List<FinanceOverviewDto.BusinessFinance> result = new ArrayList<>();

        for (Business biz : businesses) {
            List<Transaction> bizTx = byBusiness.getOrDefault(biz.getId(), List.of());
            BigDecimal income = sumByDirection(bizTx, TransactionDirection.INCOME);
            BigDecimal expense = sumByDirection(bizTx, TransactionDirection.EXPENSE);
            BigDecimal netProfit = income.subtract(expense);
            BigDecimal fixedCost = calculateFixedCostForBusiness(biz.getId());

            BigDecimal profitMargin = income.compareTo(BigDecimal.ZERO) > 0
                    ? netProfit.multiply(BigDecimal.valueOf(100)).divide(income, 1, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            result.add(FinanceOverviewDto.BusinessFinance.builder()
                    .businessId(biz.getId())
                    .businessName(biz.getName())
                    .color(biz.getColor())
                    .income(income)
                    .expense(expense)
                    .netProfit(netProfit)
                    .fixedCost(fixedCost)
                    .profitMargin(profitMargin)
                    .transactionCount(bizTx.size())
                    .build());
        }

        // Gelire göre büyükten küçüğe
        result.sort((a, b) -> b.getIncome().compareTo(a.getIncome()));
        return result;
    }

    // ─── En Yüksek İşlemler ─────────────────────────────────────────────

    private List<FinanceOverviewDto.TopTransaction> buildTopTransactions(
            List<Transaction> transactions, TransactionDirection direction, int limit) {

        return transactions.stream()
                // v1.7.0-beta (TODO d0567538): TRANSFER tx dışla
                .filter(t -> t.getKind() != com.bizboard.common.enums.TransactionKind.TRANSFER)
                .filter(t -> t.getDirection() == direction)
                .sorted((a, b) -> b.getAmount().compareTo(a.getAmount()))
                .limit(limit)
                .map(t -> FinanceOverviewDto.TopTransaction.builder()
                        .id(t.getId())
                        .businessName(t.getBusiness().getName())
                        .description(t.getDescription())
                        .categoryName(t.getCategory() != null ? t.getCategory().getName() : "Kategorisiz")
                        .amount(t.getAmount())
                        .date(t.getDate().toString())
                        .direction(t.getDirection().name().toLowerCase(java.util.Locale.ENGLISH))
                        .build())
                .toList();
    }

    // ─── Günlük Nakit Akışı ─────────────────────────────────────────────

    private List<FinanceOverviewDto.DailyCashFlow> buildDailyCashFlow(
            List<UUID> businessIds, int days) {

        LocalDate today = LocalDate.now();
        LocalDate start = today.minusDays(days - 1);

        List<Transaction> transactions = transactionRepository
                .findByBusinessIdInAndDateBetween(businessIds, start, today);

        // Güne göre grupla
        Map<LocalDate, List<Transaction>> byDay = transactions.stream()
                .collect(Collectors.groupingBy(Transaction::getDate));

        List<FinanceOverviewDto.DailyCashFlow> result = new ArrayList<>();
        BigDecimal cumulative = BigDecimal.ZERO;

        for (int i = 0; i < days; i++) {
            LocalDate date = start.plusDays(i);
            List<Transaction> dayTx = byDay.getOrDefault(date, List.of());

            BigDecimal income = sumByDirection(dayTx, TransactionDirection.INCOME);
            BigDecimal expense = sumByDirection(dayTx, TransactionDirection.EXPENSE);
            BigDecimal net = income.subtract(expense);
            cumulative = cumulative.add(net);

            result.add(FinanceOverviewDto.DailyCashFlow.builder()
                    .date(date.toString())
                    .income(income)
                    .expense(expense)
                    .net(net)
                    .cumulative(cumulative)
                    .build());
        }

        return result;
    }

    // ─── Yardımcı Metodlar ──────────────────────────────────────────────

    private BigDecimal sumByDirection(List<Transaction> transactions, TransactionDirection dir) {
        // v1.6.23.8 (TODO ad8afc6f): POS tx için net (= amount − commission) kullan.
        // "Net kar" hesabı fiilen banka hesabına düşen tutarı yansıtmalı.
        // v1.7.0-beta (Bankalar WP TODO d0567538): TRANSFER tx dışla — gelir/gider
        // değil, hesaplar arası taşıma.
        return transactions.stream()
                .filter(t -> t.getKind() != com.bizboard.common.enums.TransactionKind.TRANSFER)
                .filter(t -> t.getDirection() == dir)
                .map(SummaryService::effectiveAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal pctChange(BigDecimal current, BigDecimal previous) {
        if (previous.compareTo(BigDecimal.ZERO) == 0) {
            return current.compareTo(BigDecimal.ZERO) > 0
                    ? BigDecimal.valueOf(100)
                    : BigDecimal.ZERO;
        }
        return current.subtract(previous)
                .multiply(BigDecimal.valueOf(100))
                .divide(previous.abs(), 1, RoundingMode.HALF_UP);
    }

    private BigDecimal calculateTotalFixedCost(List<UUID> businessIds) {
        BigDecimal total = BigDecimal.ZERO;
        for (UUID bizId : businessIds) {
            total = total.add(calculateFixedCostForBusiness(bizId));
        }
        return total;
    }

    private BigDecimal calculateFixedCostForBusiness(UUID businessId) {
        List<FixedCost> activeCosts = fixedCostRepository
                .findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(businessId);

        BigDecimal totalMonthly = BigDecimal.ZERO;
        for (FixedCost fc : activeCosts) {
            BigDecimal monthly = switch (fc.getFrequency() != null
                    ? fc.getFrequency().toUpperCase(java.util.Locale.ENGLISH) : "MONTHLY") {
                case "DAILY" -> fc.getAmount().multiply(BigDecimal.valueOf(30));
                case "WEEKLY" -> fc.getAmount().multiply(BigDecimal.valueOf(4.33))
                        .setScale(2, RoundingMode.HALF_UP);
                case "YEARLY" -> fc.getAmount().divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP);
                default -> fc.getAmount();
            };
            totalMonthly = totalMonthly.add(monthly);
        }
        return totalMonthly;
    }

    /** R2 DRY: erişilebilir işletmeler tek kaynaktan ({@link BusinessAccessGuard}). */
    private List<Business> getAccessibleBusinesses(UUID userId) {
        return accessGuard.accessibleBusinesses(userId);
    }

    private FinanceOverviewDto emptyOverview() {
        FinanceOverviewDto.PeriodData emptyPeriod = FinanceOverviewDto.PeriodData.builder()
                .income(BigDecimal.ZERO)
                .expense(BigDecimal.ZERO)
                .netProfit(BigDecimal.ZERO)
                .fixedCost(BigDecimal.ZERO)
                .totalExpenseWithFixed(BigDecimal.ZERO)
                .netProfitWithFixed(BigDecimal.ZERO)
                .transactionCount(0)
                .build();

        return FinanceOverviewDto.builder()
                .currentPeriod(emptyPeriod)
                .previousPeriod(emptyPeriod)
                .monthlyTrend(List.of())
                .expenseByCategory(List.of())
                .incomeByCategory(List.of())
                .businessBreakdown(List.of())
                .topExpenses(List.of())
                .topIncomes(List.of())
                .dailyCashFlow(List.of())
                .build();
    }
}
