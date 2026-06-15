package com.bizboard.service;

import com.bizboard.common.dto.PeriodSummaryDto;
import com.bizboard.common.dto.PortfolioActivityDto;
import com.bizboard.common.dto.PortfolioComparisonDto;
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
    // C-1 güvenlik fix: tek-işletme özetinde cross-tenant erişimi kapatmak için guard.
    private final BusinessAccessGuard accessGuard;

    // ─── Tek İşletme Özeti (Esnek Dönem) ────────────────────────────────

    @Transactional(readOnly = true)
    public PeriodSummaryDto getBusinessSummary(UUID userId, UUID businessId, String period,
                                               LocalDate from, LocalDate to) {
        // C-1: diğer guard'lı read'lerle aynı — ilk satırda erişim kontrolü.
        accessGuard.assertCanReadBusiness(userId, businessId);
        DateRange range = resolveDateRange(period, from, to);

        List<Transaction> transactions = transactionRepository
                .findByBusinessIdAndDateBetween(businessId, range.start, range.end);

        boolean isClosed = isClosedPeriod(range.end);

        // Sabit giderleri dönem gün sayısına göre oranla
        BigDecimal fixedCostTotal = calculateFixedCostForPeriod(businessId, range.start, range.end);

        return buildPeriodSummary(businessId, period != null ? period : "custom",
                range.start, range.end, transactions, isClosed, fixedCostTotal);
    }

    /**
     * Tier 3 (EVT-2): SİSTEM aktörü için işletme özeti — kullanıcı erişim guard'ı
     * YOK (zamanlanmış {@code PeriodicSummaryService} tarafından çağrılır; alıcı
     * filtresi dispatch katmanında / opt-in konfigürasyonunda zaten uygulanır).
     *
     * <p>Mevcut {@link #buildPeriodSummary} hesaplama mantığını birebir yeniden
     * kullanır (Σ tutarlılığı korunur; TRANSFER/LOAN dışlanır, POS profit semantiği,
     * sabit gider oranlaması). HİÇBİR yeni hesap yolu eklemez.</p>
     *
     * @param businessId hedef işletme
     * @param period     etiket ("weekly"/"monthly"); yalnız DTO {@code period} alanına yazılır
     * @param from       dönem başı (dahil)
     * @param to         dönem sonu (dahil)
     */
    @Transactional(readOnly = true)
    public PeriodSummaryDto getBusinessSummaryForSystem(UUID businessId, String period,
                                                        LocalDate from, LocalDate to) {
        List<Transaction> transactions = transactionRepository
                .findByBusinessIdAndDateBetween(businessId, from, to);
        boolean isClosed = isClosedPeriod(to);
        BigDecimal fixedCostTotal = calculateFixedCostForPeriod(businessId, from, to);
        return buildPeriodSummary(businessId, period != null ? period : "custom",
                from, to, transactions, isClosed, fixedCostTotal);
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

    // ─── Portfolio Günlük Aktivite Serisi (Bar-chart) ───────────────────

    /**
     * Erişilebilir işletmelerin son {@code days} gün GÜN BAZINDA gelir/gider/net
     * serisi — dashboard "Haftalık Hareket" bar-chart'ı için.
     *
     * <p>Salt-okunur, additive: mevcut {@link #getPortfolioSummary} ve konsolide
     * net hesabını DEĞİŞTİRMEZ. Net hesabı {@link PosIncomeCalculator} ile
     * (TRANSFER/LOAN dışlanır, POS tam tutar) yapılır → konsolide net ile
     * tutarlı. Tenant-scope: yalnızca {@code accessGuard.accessibleBusinesses}.</p>
     *
     * @param userId aktör
     * @param days   gün sayısı (sınır-doğrulama: 1..31, default 7); bugün dahil
     */
    @Transactional(readOnly = true)
    public PortfolioActivityDto getPortfolioActivity(UUID userId, Integer days) {
        int safeDays = clampDays(days);
        LocalDate today = LocalDate.now();
        LocalDate start = today.minusDays(safeDays - 1L);

        List<Business> businesses = getAccessibleBusinesses(userId);
        if (businesses.isEmpty()) {
            return PortfolioActivityDto.builder()
                    .from(start)
                    .to(today)
                    .businessCount(0)
                    .days(emptyDaySeries(start, today))
                    .build();
        }

        List<UUID> businessIds = businesses.stream().map(Business::getId).toList();
        List<Transaction> txs = transactionRepository
                .findByBusinessIdInAndDateBetween(businessIds, start, today);

        // Gün bazında işaretli net topla (income +, expense −, TRANSFER/LOAN 0).
        Map<LocalDate, BigDecimal[]> byDay = new HashMap<>();
        for (Transaction t : txs) {
            LocalDate d = t.getDate();
            if (d == null) continue;
            BigDecimal[] acc = byDay.computeIfAbsent(d,
                    k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal amount = PosIncomeCalculator.effectiveAmount(t);
            if (amount.signum() == 0) continue;
            if (t.getDirection() == TransactionDirection.INCOME) {
                acc[0] = acc[0].add(amount);
            } else if (t.getDirection() == TransactionDirection.EXPENSE) {
                acc[1] = acc[1].add(amount);
            }
        }

        List<PortfolioActivityDto.DayPoint> points = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(today); d = d.plusDays(1)) {
            BigDecimal[] acc = byDay.getOrDefault(d,
                    new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal income = acc[0];
            BigDecimal expense = acc[1];
            points.add(PortfolioActivityDto.DayPoint.builder()
                    .date(d)
                    .income(income)
                    .expense(expense)
                    .net(income.subtract(expense))
                    .build());
        }

        return PortfolioActivityDto.builder()
                .from(start)
                .to(today)
                .businessCount(businesses.size())
                .days(points)
                .build();
    }

    private static int clampDays(Integer days) {
        if (days == null) return 7;
        return Math.min(Math.max(days, 1), 31);
    }

    private static List<PortfolioActivityDto.DayPoint> emptyDaySeries(LocalDate start, LocalDate end) {
        List<PortfolioActivityDto.DayPoint> points = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            points.add(PortfolioActivityDto.DayPoint.builder()
                    .date(d)
                    .income(BigDecimal.ZERO)
                    .expense(BigDecimal.ZERO)
                    .net(BigDecimal.ZERO)
                    .build());
        }
        return points;
    }

    // ─── Portfolio Dönem Karşılaştırması (Delta %) ──────────────────────

    /**
     * Seçili dönemin gelir/gider/net toplamını ÖNCEKİ eşdeğer dönemle
     * karşılaştırır — dashboard MetricCard delta yüzdeleri için.
     *
     * <p>Önceki dönem: seçili dönemle AYNI uzunlukta, hemen öncesinde biten
     * pencere. Yüzde değişim önceki 0 ise {@code null} (tanımsız; FE uydurma
     * yüzde göstermez). Net hesabı {@link PosIncomeCalculator} ile (TRANSFER/LOAN
     * dışlanır) → konsolide net ile tutarlı. Salt-okunur, additive,
     * tenant-scope.</p>
     *
     * @param userId aktör
     * @param period periyot etiketi; {@code from/to} verilirse custom
     * @param from   custom dönem başı (opsiyonel)
     * @param to     custom dönem sonu (opsiyonel)
     */
    @Transactional(readOnly = true)
    public PortfolioComparisonDto getPortfolioComparison(UUID userId, String period,
                                                          LocalDate from, LocalDate to) {
        DateRange current = resolveDateRange(period, from, to);
        // Önceki eşdeğer pencere: aynı uzunluk, current.start'tan hemen önce biter.
        long span = java.time.temporal.ChronoUnit.DAYS.between(current.start, current.end);
        LocalDate prevEnd = current.start.minusDays(1);
        LocalDate prevStart = prevEnd.minusDays(span);

        List<Business> businesses = getAccessibleBusinesses(userId);
        String periodLabel = (period == null || period.isBlank())
                ? (from != null && to != null ? "custom" : "daily")
                : period.toLowerCase(java.util.Locale.ENGLISH);

        if (businesses.isEmpty()) {
            PortfolioComparisonDto.Window emptyCurrent = window(current.start, current.end,
                    BigDecimal.ZERO, BigDecimal.ZERO);
            PortfolioComparisonDto.Window emptyPrev = window(prevStart, prevEnd,
                    BigDecimal.ZERO, BigDecimal.ZERO);
            return PortfolioComparisonDto.builder()
                    .period(periodLabel)
                    .businessCount(0)
                    .current(emptyCurrent)
                    .previous(emptyPrev)
                    .incomeDeltaPct(null)
                    .expenseDeltaPct(null)
                    .netDeltaPct(null)
                    .build();
        }

        List<UUID> businessIds = businesses.stream().map(Business::getId).toList();

        BigDecimal[] cur = sumWindow(businessIds, current.start, current.end);
        BigDecimal[] prev = sumWindow(businessIds, prevStart, prevEnd);

        PortfolioComparisonDto.Window currentWindow = window(current.start, current.end, cur[0], cur[1]);
        PortfolioComparisonDto.Window previousWindow = window(prevStart, prevEnd, prev[0], prev[1]);

        return PortfolioComparisonDto.builder()
                .period(periodLabel)
                .businessCount(businesses.size())
                .current(currentWindow)
                .previous(previousWindow)
                .incomeDeltaPct(deltaPct(cur[0], prev[0]))
                .expenseDeltaPct(deltaPct(cur[1], prev[1]))
                .netDeltaPct(deltaPct(currentWindow.getNet(), previousWindow.getNet()))
                .build();
    }

    /** İşletmeler toplamı tek pencere için [income, expense] magnitude. */
    private BigDecimal[] sumWindow(List<UUID> businessIds, LocalDate start, LocalDate end) {
        List<Transaction> txs = transactionRepository
                .findByBusinessIdInAndDateBetween(businessIds, start, end);
        return new BigDecimal[]{
                sumByDirection(txs, TransactionDirection.INCOME),
                sumByDirection(txs, TransactionDirection.EXPENSE)
        };
    }

    private static PortfolioComparisonDto.Window window(LocalDate from, LocalDate to,
                                                        BigDecimal income, BigDecimal expense) {
        return PortfolioComparisonDto.Window.builder()
                .from(from)
                .to(to)
                .income(income)
                .expense(expense)
                .net(income.subtract(expense))
                .build();
    }

    /**
     * Yüzde değişim: (current − previous) / |previous| × 100, 1 ondalık.
     * Önceki 0 ise tanımsız → {@code null} (FE uydurma yüzde göstermez).
     */
    private static BigDecimal deltaPct(BigDecimal current, BigDecimal previous) {
        if (previous == null || previous.signum() == 0) {
            return null;
        }
        BigDecimal cur = current != null ? current : BigDecimal.ZERO;
        return cur.subtract(previous)
                .multiply(BigDecimal.valueOf(100))
                .divide(previous.abs(), 1, java.math.RoundingMode.HALF_UP);
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
        // v1.7.0-beta (Bankalar WP TODO d0567538): TRANSFER tx dışla.
        // Çatı v1.2: LOAN (verilen/alınan borç) tx dışla — gelir/gider DEĞİL,
        // bilanço hareketi (kasa ↔ alacak/verecek). Net Kâr/gelir-gider raporuna
        // girmemeli (karşılığı Alacaklar/Verecekler'de gösterilir).
        return transactions.stream()
                .filter(t -> t.getKind() != com.bizboard.common.enums.TransactionKind.TRANSFER
                        && t.getKind() != com.bizboard.common.enums.TransactionKind.LOAN)
                .filter(t -> t.getDirection() == dir)
                .map(SummaryService::effectiveAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Income raporlarında "fiilen elde edilen para" — bir işlemin yöne göre
     * toplanan büyüklüğü.
     *
     * <p>Bug a1d58d6e/a90a8d42 fix: bu metod eskiden POS gelirini KÂR (our − bank)
     * olarak, null-rate POS'u 0 olarak sayıyordu; oysa Beta v1.1 (commit 888edc6,
     * kullanıcı isteği: "kaç liralık POS işlem yaptıysam o kadar gözüksün gelir
     * olarak") POS gelirini TAM tutar saymaya geçmişti. Konsolide net tam-tutar,
     * bu metod kâr verince consolidated ile summary net tutarsızdı. Artık her ikisi
     * de {@link PosIncomeCalculator}'a bağlı — POS dahil tüm income/expense tam
     * {@code amount}; TRANSFER/LOAN → 0.</p>
     */
    static BigDecimal effectiveAmount(Transaction t) {
        return PosIncomeCalculator.effectiveAmount(t);
    }

    private Map<String, Map<String, BigDecimal>> buildCategoryBreakdown(List<Transaction> transactions) {
        // Bug a1d58d6e/a90a8d42 fix: kategori dağılımı da total_income tanımıyla
        // hizalı — POS dahil GELİR/GİDER tam tutar ({@link PosIncomeCalculator}).
        // (Eski yorum "POS = PROFIT" idi; Beta v1.1 tam-tutar modeliyle geçersiz.)
        Map<String, Map<String, BigDecimal>> breakdown = new HashMap<>();

        for (Transaction t : transactions) {
            // Çatı v1.2: TRANSFER/LOAN gelir-gider kategorisi DEĞİL — pie'a girmez.
            if (t.getKind() == com.bizboard.common.enums.TransactionKind.TRANSFER
                    || t.getKind() == com.bizboard.common.enums.TransactionKind.LOAN) {
                continue;
            }
            // Bug fix: kategori soft-delete'tir (active=false) ama tx FK'sı durur.
            // Çözülemeyen (null/pasif) kategori "Diğer"e toplanır — silinmiş kategori
            // kırılımda ayrı satır göstermesin (tutar kaybolmaz).
            String catName = resolveCategoryName(t);
            String dirKey = t.getDirection() == TransactionDirection.INCOME ? "income" : "expense";

            BigDecimal value = effectiveAmount(t);
            // Gider tarafı POS değilse normal akış (effectiveAmount=amount).
            // POS gider yok (POS sadece gelir) ama defansif: signum=0 ise hiç ekleme.
            if (value == null || value.signum() == 0) continue;

            breakdown.computeIfAbsent(catName, k -> new HashMap<>());
            breakdown.get(catName).merge(dirKey, value, BigDecimal::add);
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

    /** R2 DRY: erişilebilir işletmeler tek kaynaktan ({@link BusinessAccessGuard}). */
    private List<Business> getAccessibleBusinesses(UUID userId) {
        return accessGuard.accessibleBusinesses(userId);
    }
}
