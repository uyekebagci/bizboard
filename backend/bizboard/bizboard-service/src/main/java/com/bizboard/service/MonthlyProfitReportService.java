package com.bizboard.service;

import com.bizboard.common.dto.MonthlyProfitReportDto;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.enums.PostingLegKind;
import com.bizboard.repository.PostingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §5 / §6 / TODO 6) — aylık kâr raporu (posting + kategori P&L).
 *
 * <p>İKİ eksen:</p>
 * <ul>
 *   <li><b>Kategori-bazlı P&L (NE tür):</b> gelir (PNL_INCOME) + gider
 *       (PNL_EXPENSE) + masraf (PNL_COST) — gider≠masraf ayrımı (§5). Net kâr =
 *       gelir − gider − masraf.</li>
 *   <li><b>Operatör/kâr-merkezi-bazlı kâr (KİM):</b> her operatör kasasının o
 *       dönemde biriken net kârı (Σ posting); şirket residual ayrı.</li>
 * </ul>
 *
 * <p><b>İşaret normalize:</b> P&L bacakları işaretli (PNL_INCOME negatif —
 * karşı-konum +; PNL_EXPENSE/PNL_COST pozitif). Rapor pozitif "tutar" sunar:
 * gelir = |Σ PNL_INCOME|, gider = Σ PNL_EXPENSE, masraf = Σ PNL_COST.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MonthlyProfitReportService {

    private final PostingRepository postingRepository;
    private final OperatorStatementService operatorStatementService;
    private final ProfitSharePostingService profitSharePostingService;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public MonthlyProfitReportDto report(UUID userId, UUID businessId, int year, int month) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        if (month < 1 || month > 12) {
            throw new IllegalArgumentException("month 1-12 olmalı: " + month);
        }
        YearMonth ym = YearMonth.of(year, month);
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.atEndOfMonth();

        // ── Kategori-bazlı P&L (NE tür) ──
        // İşaret normalize: PNL_INCOME bacakları negatif (gelir hesaba +, P&L bacağı
        // −) → negate ederek pozitif gelir sunarız (residual zarar ise negatif kalır,
        // company_residual tutarlı). PNL_EXPENSE/PNL_COST zaten pozitif.
        List<MonthlyProfitReportDto.CategoryLine> incomeByCat =
                categoryLines(businessId, from, to, PostingLegKind.PNL_INCOME, true);
        List<MonthlyProfitReportDto.CategoryLine> expenseByCat =
                categoryLines(businessId, from, to, PostingLegKind.PNL_EXPENSE, false);
        List<MonthlyProfitReportDto.CategoryLine> costByCat =
                categoryLines(businessId, from, to, PostingLegKind.PNL_COST, false);

        BigDecimal totalIncome = nz(postingRepository.sumPnlForPeriod(
                businessId, from, to, PostingLegKind.PNL_INCOME)).negate();
        BigDecimal totalExpense = nz(postingRepository.sumPnlForPeriod(
                businessId, from, to, PostingLegKind.PNL_EXPENSE));
        BigDecimal totalCost = nz(postingRepository.sumPnlForPeriod(
                businessId, from, to, PostingLegKind.PNL_COST));
        BigDecimal netProfit = totalIncome.subtract(totalExpense).subtract(totalCost);

        // ── Operatör/kâr-merkezi-bazlı kâr (KİM) ──
        List<BankAccount> operators = operatorStatementService.profitCenters(businessId);
        List<MonthlyProfitReportDto.OperatorLine> operatorLines = new ArrayList<>();
        BigDecimal companyResidual = BigDecimal.ZERO;
        if (!operators.isEmpty()) {
            List<UUID> opIds = operators.stream().map(BankAccount::getId).toList();
            Map<UUID, BigDecimal> earnedByAccount = new HashMap<>();
            for (Object[] row : postingRepository.sumByAccountForPeriod(businessId, from, to, opIds)) {
                // Operatör hesabı kredi-normal (accrual −amount) → negate ile pozitif kâr.
                earnedByAccount.put((UUID) row[0], nz((BigDecimal) row[1]).negate());
            }
            for (BankAccount acc : operators) {
                operatorLines.add(MonthlyProfitReportDto.OperatorLine.builder()
                        .accountId(acc.getId())
                        .accountName(acc.getName())
                        .operatorCounterpartId(acc.getOperatorCounterpart() != null
                                ? acc.getOperatorCounterpart().getId() : null)
                        .operatorName(acc.getOperatorCounterpart() != null
                                ? acc.getOperatorCounterpart().getName() : null)
                        .earned(nz(earnedByAccount.get(acc.getId())))
                        .build());
            }
        }
        // Şirket residual = POS gross margin geliri − Σ operatör payı (DERIVED).
        // POS Kâr geliri = "POS Kâr (Şirket)" kategorisindeki PNL_INCOME.
        BigDecimal posMargin = BigDecimal.ZERO;
        for (MonthlyProfitReportDto.CategoryLine c : incomeByCat) {
            if (ProfitSharePostingService.CATEGORY_POS_PROFIT.equalsIgnoreCase(c.getCategoryName())) {
                posMargin = c.getAmount();
            }
        }
        BigDecimal operatorTotal = operatorLines.stream()
                .map(MonthlyProfitReportDto.OperatorLine::getEarned)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        companyResidual = posMargin.subtract(operatorTotal);

        return MonthlyProfitReportDto.builder()
                .year(year)
                .month(month)
                .totalIncome(totalIncome)
                .totalExpense(totalExpense)
                .totalCost(totalCost)
                .netProfit(netProfit)
                .incomeByCategory(incomeByCat)
                .expenseByCategory(expenseByCat)
                .costByCategory(costByCat)
                .operatorProfit(operatorLines)
                .companyResidual(companyResidual)
                .build();
    }

    /**
     * Kategori bazlı P&L satırları. {@code negateForIncome=true} (PNL_INCOME):
     * negatif income bacaklarını negate ederek pozitif gelir sunar (residual zarar
     * negatif kalır — abs ETMEZ). Gider/masraf zaten pozitif (negate yok).
     */
    private List<MonthlyProfitReportDto.CategoryLine> categoryLines(
            UUID businessId, LocalDate from, LocalDate to, PostingLegKind kind, boolean negateForIncome) {
        List<MonthlyProfitReportDto.CategoryLine> out = new ArrayList<>();
        for (Object[] row : postingRepository.sumPnlByCategoryForPeriod(businessId, from, to, kind)) {
            UUID catId = (UUID) row[0];
            String catName = (String) row[1];
            BigDecimal amount = nz((BigDecimal) row[2]);
            if (negateForIncome) amount = amount.negate();
            if (amount.signum() == 0) continue;
            out.add(MonthlyProfitReportDto.CategoryLine.builder()
                    .categoryId(catId)
                    .categoryName(catName != null ? catName : "(kategorisiz)")
                    .amount(amount)
                    .build());
        }
        out.sort((a, b) -> b.getAmount().compareTo(a.getAmount()));
        return out;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
