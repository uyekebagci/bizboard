package com.bizboard.service.report;

import com.bizboard.common.dto.CashFlowForecastDto;
import com.bizboard.common.dto.ForecastScenarioRequest;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.FixedCost;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.FixedCostRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.service.BusinessAccessGuard;
import com.bizboard.service.DebtAmountConverter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Raporlar v1.1 (R5/R6): 13-haftalık nakit-akış tahmini + what-if senaryo motoru.
 *
 * <p><b>READ-ONLY analitik — mevcut ledger/kasa sayılarını DEĞİŞTİRMEZ.</b>
 * Geçmiş hareketlerden (NAKIT+POS net akış; HESAPDAN/TRANSFER hariç —
 * ClosingCalculator semantiği) baz haftalık akış türetir, üzerine bilinen
 * vadeli kalemleri (açık alacak/verecek vade tarihi + çek vadesi) ve aktif
 * sabit giderleri (haftalık prorate) ekleyip ileriye projeksiyon yapar.</p>
 *
 * <p>What-if: {@link ForecastScenarioRequest} parametreleri (gelir/gider ±%,
 * ek haftalık gider, tek-seferlik gider) baz akışa uygulanır; sonuç hiçbir
 * yere kaydedilmez (saf hesaplama).</p>
 *
 * <p>Multi-tenant: businessId verilirse {@code assertCanReadBusiness}; null ise
 * {@code accessibleBusinessIds} ile erişilebilir tüm tenant'lar (arch-rules
 * §1.2/§1.3 — read guard).</p>
 */
@Service
@RequiredArgsConstructor
public class ForecastService {

    private final TransactionRepository transactionRepository;
    private final BankAccountRepository bankAccountRepository;
    private final DebtRepository debtRepository;
    private final FixedCostRepository fixedCostRepository;
    private final DebtAmountConverter amountConverter;
    private final BusinessAccessGuard accessGuard;

    /** Varsayılan projeksiyon ufku (hafta). */
    public static final int DEFAULT_WEEKS = 13;
    /** Baz akış için geçmişe bakış (hafta). */
    public static final int DEFAULT_LOOKBACK_WEEKS = 12;
    /** Min/max projeksiyon ufku. */
    private static final int MIN_WEEKS = 1;
    private static final int MAX_WEEKS = 52;
    /** What-if yüzde delta clamp sınırları (uçuk değerleri engelle). */
    private static final BigDecimal PCT_MIN = new BigDecimal("-100");
    private static final BigDecimal PCT_MAX = new BigDecimal("1000");
    /** Bir ayda ~ kaç hafta (sabit gider haftalık prorate için). */
    private static final BigDecimal WEEKS_PER_MONTH = new BigDecimal("4.345");

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final String[] TR_MONTHS_SHORT = {
            "", "Oca", "Şub", "Mar", "Nis", "May", "Haz",
            "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"
    };

    /**
     * 13-haftalık nakit-akış tahmini. {@code scenario} null ise baz senaryo.
     *
     * @param weeks projeksiyon ufku (clamp: 1..52); ≤0 → {@link #DEFAULT_WEEKS}
     */
    @Transactional(readOnly = true)
    public CashFlowForecastDto forecast(UUID userId, UUID businessId, int weeks,
                                        ForecastScenarioRequest scenario) {
        int horizon = clampWeeks(weeks);
        List<UUID> businessIds = resolveBusinessIds(userId, businessId);
        LocalDate today = LocalDate.now();

        if (businessIds.isEmpty()) {
            return emptyForecast(today, horizon);
        }

        // ─── 1. Açılış bakiyesi: bugünkü hesap bakiyeleri toplamı (TL) ───
        BigDecimal openingBalance = currentBalance(businessIds);

        // ─── 2. Baz haftalık net akış (geçmiş lookback haftası, NAKIT+POS) ───
        BigDecimal baselineWeeklyNet = baselineWeeklyNet(businessIds, today);

        // ─── 3. What-if normalize ───
        Scenario sc = normalizeScenario(scenario, horizon);
        // Baz akışı gelir/gider taraflarına ayır ki ±% farklı uygulanabilsin.
        // Baz net'i tek değer; pozitifse gelir-ağırlıklı, negatifse gider-ağırlıklı
        // varsayımı yerine net'e oransal delta uygula (basit, şeffaf model):
        // adjustedBaseNet = baseNet + (baseNet>0 ? baseNet*incPct : baseNet*expPct... )
        BigDecimal adjustedWeeklyNet = applyDeltaToNet(baselineWeeklyNet, sc);

        // ─── 4. Bilinen vadeli kalemler (alacak/verecek/çek) ───
        List<Debt> openDebts = loadOpenDebts(businessIds);

        // ─── 5. Aktif sabit gider haftalık prorate (gider tarafı) ───
        BigDecimal weeklyFixedCost = weeklyFixedCost(businessIds);
        // Sabit gider de gider ±% deltasından etkilenir.
        weeklyFixedCost = applyExpenseDelta(weeklyFixedCost, sc.expenseDeltaPct);

        // ─── 6. Hafta hafta projeksiyon ───
        List<CashFlowForecastDto.WeekPoint> points = new ArrayList<>(horizon);
        BigDecimal running = openingBalance;
        BigDecimal minBalance = openingBalance;
        int minWeek = 0;
        boolean shortfall = false;

        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        // Bugün haftanın ortasındaysa ilk hafta bugünden başlasın (kısmi hafta).
        if (weekStart.isBefore(today)) {
            weekStart = today;
        }

        for (int i = 1; i <= horizon; i++) {
            LocalDate wStart = (i == 1) ? weekStart : today.with(DayOfWeek.MONDAY).plusWeeks(i - 1);
            // i==1 partial olabilir; sonraki haftalar tam Pzt-Pzr.
            LocalDate wEnd = today.with(DayOfWeek.MONDAY).plusWeeks(i - 1).plusDays(6);
            if (wEnd.isBefore(wStart)) wEnd = wStart;

            BigDecimal wOpening = running;
            BigDecimal inflow = BigDecimal.ZERO;
            BigDecimal outflow = BigDecimal.ZERO;
            List<CashFlowForecastDto.ScheduledItem> scheduled = new ArrayList<>();

            // (a) baz akış: pozitif → inflow, negatif → outflow
            if (adjustedWeeklyNet.signum() >= 0) {
                inflow = inflow.add(adjustedWeeklyNet);
            } else {
                outflow = outflow.add(adjustedWeeklyNet.abs());
            }

            // (b) sabit gider (her hafta)
            if (weeklyFixedCost.signum() > 0) {
                outflow = outflow.add(weeklyFixedCost);
                scheduled.add(item("FIXED_COST", "Sabit gider (haftalık)", null,
                        weeklyFixedCost.negate()));
            }

            // (c) bilinen vadeli kalemler (bu haftaya düşenler)
            for (Debt d : openDebts) {
                LocalDate due = effectiveDueDate(d);
                if (due == null) continue;
                if (due.isBefore(wStart) || due.isAfter(wEnd)) continue;
                BigDecimal tl = debtTl(d);
                if (tl.signum() == 0) continue;
                boolean cheque = d.getChequeDueDate() != null;
                if (d.getDirection() == DebtDirection.RECEIVABLE) {
                    inflow = inflow.add(tl);
                    scheduled.add(item(cheque ? "CHEQUE_IN" : "RECEIVABLE",
                            counterpartName(d), due.format(ISO), tl));
                } else {
                    outflow = outflow.add(tl);
                    scheduled.add(item(cheque ? "CHEQUE_OUT" : "PAYABLE",
                            counterpartName(d), due.format(ISO), tl.negate()));
                }
            }

            // (d) what-if ek haftalık gider
            if (sc.extraWeeklyExpense.signum() > 0) {
                outflow = outflow.add(sc.extraWeeklyExpense);
                scheduled.add(item("FIXED_COST", "What-if ek haftalık gider", null,
                        sc.extraWeeklyExpense.negate()));
            }
            // (e) what-if tek-seferlik gider (belirtilen haftada)
            if (sc.extraOneTimeExpense.signum() > 0 && sc.extraOneTimeWeek == i) {
                outflow = outflow.add(sc.extraOneTimeExpense);
                scheduled.add(item("FIXED_COST", "What-if tek seferlik gider", null,
                        sc.extraOneTimeExpense.negate()));
            }

            BigDecimal net = inflow.subtract(outflow);
            running = wOpening.add(net);
            if (running.signum() < 0) shortfall = true;
            if (running.compareTo(minBalance) < 0) {
                minBalance = running;
                minWeek = i;
            }

            points.add(CashFlowForecastDto.WeekPoint.builder()
                    .index(i)
                    .weekStart(wStart.format(ISO))
                    .weekEnd(wEnd.format(ISO))
                    .label(weekLabel(wStart, wEnd))
                    .openingBalance(scale(wOpening))
                    .inflow(scale(inflow))
                    .outflow(scale(outflow))
                    .net(scale(net))
                    .closingBalance(scale(running))
                    .scheduledItems(scheduled)
                    .build());
        }

        return CashFlowForecastDto.builder()
                .openingBalance(scale(openingBalance))
                .asOf(today.format(ISO))
                .weeks(horizon)
                .baselineWeeklyNet(scale(baselineWeeklyNet))
                .baselineLookbackWeeks(DEFAULT_LOOKBACK_WEEKS)
                .scenario(scenarioEcho(sc, scenario))
                .weeksData(points)
                .endingBalance(scale(running))
                .minBalance(scale(minBalance))
                .minBalanceWeek(minWeek)
                .hasShortfall(shortfall)
                .build();
    }

    // ─────────────────────── açılış bakiyesi ───────────────────────

    /**
     * Σ aktif posting-türetilebilir hesapların {@code current_balance}'ı (TL).
     * {@code FinancialAlertService.currentBusinessBalance} ile aynı semantik —
     * MAIN_CASH/SUB_CASH aggregate hesapları çift-sayım önlemek için dışlanır.
     */
    private BigDecimal currentBalance(List<UUID> businessIds) {
        List<BankAccount> accounts = bankAccountRepository
                .findByActiveTrueAndBusinessIdInOrderByNameAsc(businessIds);
        BigDecimal sum = BigDecimal.ZERO;
        for (BankAccount acc : accounts) {
            if (acc.getType() == null || !acc.getType().isPostingDerivable()) continue;
            sum = sum.add(acc.getCurrentBalance() != null ? acc.getCurrentBalance() : BigDecimal.ZERO);
        }
        return sum;
    }

    // ─────────────────────── baz haftalık akış ───────────────────────

    /**
     * Geçmiş {@link #DEFAULT_LOOKBACK_WEEKS} haftanın ortalama haftalık net
     * NAKIT akışı. Yalnız fiziksel kasa: paymentMethod NAKIT+POS, kind=NORMAL
     * (TRANSFER/LOAN bilanço hareketidir — dışlanır). HESAPDAN dışlanır
     * (ClosingCalculator/conventions §3 semantiği).
     */
    private BigDecimal baselineWeeklyNet(List<UUID> businessIds, LocalDate today) {
        LocalDate from = today.minusWeeks(DEFAULT_LOOKBACK_WEEKS);
        List<Transaction> txs = transactionRepository
                .findByBusinessIdInAndDateBetween(businessIds, from, today.minusDays(1));
        BigDecimal net = BigDecimal.ZERO;
        for (Transaction t : txs) {
            if (!isCashFlowTx(t)) continue;
            BigDecimal amt = t.getAmount() != null ? t.getAmount() : BigDecimal.ZERO;
            if (t.getDirection() == TransactionDirection.INCOME) {
                net = net.add(amt);
            } else if (t.getDirection() == TransactionDirection.EXPENSE) {
                net = net.subtract(amt);
            }
        }
        return net.divide(BigDecimal.valueOf(DEFAULT_LOOKBACK_WEEKS), 2, RoundingMode.HALF_UP);
    }

    /** Fiziksel kasaya yansıyan gerçek gelir/gider tx mi? (NAKIT+POS, NORMAL). */
    private static boolean isCashFlowTx(Transaction t) {
        TransactionKind kind = t.getKind() != null ? t.getKind() : TransactionKind.NORMAL;
        if (kind != TransactionKind.NORMAL) return false; // TRANSFER/LOAN dışla
        String pm = t.getPaymentMethod() != null ? t.getPaymentMethod() : "NAKIT";
        return "NAKIT".equals(pm) || "POS".equals(pm); // HESAPDAN dışla
    }

    // ─────────────────────── sabit gider ───────────────────────

    /** Aktif aylık sabit giderlerin haftalık prorate toplamı (TL, magnitude). */
    private BigDecimal weeklyFixedCost(List<UUID> businessIds) {
        BigDecimal monthly = BigDecimal.ZERO;
        for (UUID bizId : businessIds) {
            List<FixedCost> costs = fixedCostRepository
                    .findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(bizId);
            for (FixedCost fc : costs) {
                BigDecimal amt = fc.getAmount() != null ? fc.getAmount() : BigDecimal.ZERO;
                monthly = monthly.add(monthlyEquivalent(amt, fc.getFrequency()));
            }
        }
        return monthly.divide(WEEKS_PER_MONTH, 2, RoundingMode.HALF_UP);
    }

    /** Sabit gideri aylık eşdeğere çevir (frequency'e göre). */
    private static BigDecimal monthlyEquivalent(BigDecimal amount, String frequency) {
        if (amount == null || amount.signum() <= 0) return BigDecimal.ZERO;
        String f = frequency != null ? frequency.toUpperCase() : "MONTHLY";
        return switch (f) {
            case "WEEKLY" -> amount.multiply(WEEKS_PER_MONTH);
            case "QUARTERLY" -> amount.divide(new BigDecimal("3"), 2, RoundingMode.HALF_UP);
            case "YEARLY", "ANNUAL" -> amount.divide(new BigDecimal("12"), 2, RoundingMode.HALF_UP);
            case "DAILY" -> amount.multiply(new BigDecimal("30"));
            default -> amount; // MONTHLY
        };
    }

    // ─────────────────────── vadeli kalemler ───────────────────────

    private List<Debt> loadOpenDebts(List<UUID> businessIds) {
        return debtRepository.findByBusinessIdInOrderByCreatedAtDesc(businessIds).stream()
                .filter(d -> !d.isSettled())
                .toList();
    }

    /** Çek vadesi öncelikli; yoksa due_date. İkisi de yoksa null (vadesiz → projeksiyona girmez). */
    private static LocalDate effectiveDueDate(Debt d) {
        if (d.getChequeDueDate() != null) return d.getChequeDueDate();
        return d.getDueDate();
    }

    private BigDecimal debtTl(Debt d) {
        BigDecimal base = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
        BigDecimal tl = amountConverter.toTry(d, base);
        return tl != null ? tl : BigDecimal.ZERO;
    }

    private static String counterpartName(Debt d) {
        if (d.getCounterpartRef() != null && d.getCounterpartRef().getName() != null) {
            return d.getCounterpartRef().getName();
        }
        return d.getCounterparty() != null ? d.getCounterparty() : "—";
    }

    // ─────────────────────── what-if normalize ───────────────────────

    /** Normalize edilmiş, clamp'lenmiş senaryo (servis içi). */
    private record Scenario(BigDecimal incomeDeltaPct, BigDecimal expenseDeltaPct,
                            BigDecimal extraWeeklyExpense, BigDecimal extraOneTimeExpense,
                            int extraOneTimeWeek) {}

    private Scenario normalizeScenario(ForecastScenarioRequest req, int horizon) {
        if (req == null) {
            return new Scenario(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                    BigDecimal.ZERO, 1);
        }
        BigDecimal inc = clampPct(req.incomeDeltaPct());
        BigDecimal exp = clampPct(req.expenseDeltaPct());
        BigDecimal extraWeekly = nonNegative(req.extraWeeklyExpense());
        BigDecimal extraOnce = nonNegative(req.extraOneTimeExpense());
        int onceWeek = req.extraOneTimeWeek() != null ? req.extraOneTimeWeek() : 1;
        if (onceWeek < 1) onceWeek = 1;
        if (onceWeek > horizon) onceWeek = horizon;
        return new Scenario(inc, exp, extraWeekly, extraOnce, onceWeek);
    }

    /**
     * Baz net akışa gelir/gider ±% uygula. Net pozitifse "gelir-baskın" kabul
     * edip income delta'sını, net negatifse "gider-baskın" kabul edip expense
     * delta'sını uygular (şeffaf, basit model — net tek değer olduğundan).
     */
    private static BigDecimal applyDeltaToNet(BigDecimal baseNet, Scenario sc) {
        if (baseNet.signum() >= 0) {
            // gelir-baskın hafta: income delta net'i büyütür/küçültür
            return baseNet.add(baseNet.multiply(sc.incomeDeltaPct).movePointLeft(2));
        }
        // gider-baskın hafta: expense delta giderin magnitude'ünü değiştirir
        BigDecimal magnitude = baseNet.abs();
        BigDecimal adjusted = magnitude.add(magnitude.multiply(sc.expenseDeltaPct).movePointLeft(2));
        return adjusted.negate();
    }

    /** Sabit gider tutarına gider ±% uygula. */
    private static BigDecimal applyExpenseDelta(BigDecimal amount, BigDecimal expenseDeltaPct) {
        if (amount.signum() <= 0) return amount;
        return amount.add(amount.multiply(expenseDeltaPct).movePointLeft(2));
    }

    private CashFlowForecastDto.ScenarioEcho scenarioEcho(Scenario sc, ForecastScenarioRequest req) {
        if (req == null) return null;
        return CashFlowForecastDto.ScenarioEcho.builder()
                .incomeDeltaPct(sc.incomeDeltaPct)
                .expenseDeltaPct(sc.expenseDeltaPct)
                .extraWeeklyExpense(sc.extraWeeklyExpense)
                .extraOneTimeExpense(sc.extraOneTimeExpense)
                .extraOneTimeWeek(sc.extraOneTimeExpense.signum() > 0 ? sc.extraOneTimeWeek : null)
                .build();
    }

    // ─────────────────────── helpers ───────────────────────

    private List<UUID> resolveBusinessIds(UUID userId, UUID businessId) {
        if (businessId != null) {
            accessGuard.assertCanReadBusiness(userId, businessId);
            return List.of(businessId);
        }
        return accessGuard.accessibleBusinessIds(userId);
    }

    private static int clampWeeks(int weeks) {
        if (weeks <= 0) return DEFAULT_WEEKS;
        if (weeks < MIN_WEEKS) return MIN_WEEKS;
        return Math.min(weeks, MAX_WEEKS);
    }

    private static BigDecimal clampPct(BigDecimal pct) {
        if (pct == null) return BigDecimal.ZERO;
        if (pct.compareTo(PCT_MIN) < 0) return PCT_MIN;
        if (pct.compareTo(PCT_MAX) > 0) return PCT_MAX;
        return pct;
    }

    private static BigDecimal nonNegative(BigDecimal v) {
        if (v == null || v.signum() < 0) return BigDecimal.ZERO;
        return v;
    }

    private static BigDecimal scale(BigDecimal v) {
        return (v != null ? v : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    private static CashFlowForecastDto.ScheduledItem item(String kind, String label,
                                                          String dueDate, BigDecimal amount) {
        return CashFlowForecastDto.ScheduledItem.builder()
                .kind(kind).label(label).dueDate(dueDate).amount(scale(amount)).build();
    }

    private static String weekLabel(LocalDate start, LocalDate end) {
        return start.getDayOfMonth() + " " + TR_MONTHS_SHORT[start.getMonthValue()]
                + " – " + end.getDayOfMonth() + " " + TR_MONTHS_SHORT[end.getMonthValue()];
    }

    private CashFlowForecastDto emptyForecast(LocalDate today, int horizon) {
        return CashFlowForecastDto.builder()
                .openingBalance(BigDecimal.ZERO)
                .asOf(today.format(ISO))
                .weeks(horizon)
                .baselineWeeklyNet(BigDecimal.ZERO)
                .baselineLookbackWeeks(DEFAULT_LOOKBACK_WEEKS)
                .scenario(null)
                .weeksData(List.of())
                .endingBalance(BigDecimal.ZERO)
                .minBalance(BigDecimal.ZERO)
                .minBalanceWeek(0)
                .hasShortfall(false)
                .build();
    }
}
