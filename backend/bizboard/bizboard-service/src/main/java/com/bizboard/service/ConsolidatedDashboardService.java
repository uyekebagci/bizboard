package com.bizboard.service;

import com.bizboard.common.dto.ConsolidatedDashboardDto;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * v1.6.20 (WP-3): İşletme detay sayfasının "tek-shot" consolidated endpoint
 * yardımcı servisi. Tüm widget verisini tek round-trip ile toparlar.
 *
 * <p>Tek-tenant DGR mantığı: bir işletme id ile çağrılır, geri kalan
 * agregasyonlar tek-tenant olduğu için system-wide. {@code businessId}
 * authorization + döndürülen DTO başlığı için kullanılır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConsolidatedDashboardService {

    private final BusinessAccessGuard accessGuard;
    private final BusinessRepository businessRepository;
    private final BankAccountRepository bankAccountRepository;
    private final PosDeviceRepository posDeviceRepository;
    private final TransactionRepository transactionRepository;
    private final DebtRepository debtRepository;
    private final CashClosingRepository cashClosingRepository;
    private final ClosingCalculator closingCalculator;

    @Transactional(readOnly = true)
    public ConsolidatedDashboardDto getConsolidated(UUID userId, UUID businessId) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        // Mevcudiyet kontrolü (404 vs.)
        businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        LocalDate today = LocalDate.now();

        // ── BANK ACCOUNTS ────────────────────────────────────────────
        List<BankAccount> banks = bankAccountRepository.findByActiveTrueOrderByNameAsc();
        BigDecimal totalCash = banks.stream()
                .map(BankAccount::getCurrentBalance)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<ConsolidatedDashboardDto.BankAccountSummary> bankRows = banks.stream()
                .map(this::toBankSummary)
                .toList();

        // ── DEBTS: payables (BORC) + receivables ─────────────────────
        List<Debt> payableDebts = debtRepository
                .findByDirectionAndSettledFalseOrderByDueDateAsc(DebtDirection.PAYABLE);
        BigDecimal totalPayables = sumDebt(payableDebts);

        List<Debt> receivableDebts = debtRepository
                .findByDirectionAndSettledFalseOrderByDueDateAsc(DebtDirection.RECEIVABLE);
        BigDecimal totalReceivables = sumDebt(receivableDebts);

        // ── CONSOLIDATED POSITION ────────────────────────────────────
        // KK / loan rezerve — WP-5 öncesi 0.
        ConsolidatedDashboardDto.ConsolidatedPosition consolidated =
                ConsolidatedDashboardDto.ConsolidatedPosition.builder()
                        .totalCash(totalCash)
                        .creditCardDebt(BigDecimal.ZERO)
                        .loanPrincipal(BigDecimal.ZERO)
                        .receivables(totalReceivables)
                        .payables(totalPayables)
                        .net(totalCash
                                .add(totalReceivables)
                                .subtract(totalPayables))
                        .build();

        // ── TODAY CLOSING ────────────────────────────────────────────
        BigDecimal opening = closingCalculator.getOpeningBalance(today);
        BigDecimal computed = closingCalculator.computeClosing(today);
        Optional<CashClosing> existing = cashClosingRepository.findByClosingDate(today);
        BigDecimal incoming = sumByDirection(today, "NAKIT", TransactionDirection.INCOME);
        BigDecimal outgoing = sumByDirection(today, "NAKIT", TransactionDirection.EXPENSE);

        ConsolidatedDashboardDto.TodayClosing todayClosing =
                ConsolidatedDashboardDto.TodayClosing.builder()
                        .openingBalance(opening)
                        .incoming(incoming)
                        .outgoing(outgoing)
                        .computedClosing(computed)
                        .actualBalance(existing.map(CashClosing::getActualBalance).orElse(null))
                        .difference(existing.map(CashClosing::getDifference).orElse(null))
                        .closed(existing.isPresent()
                                && existing.get().getStatus() != null
                                && "CLOSED".equals(existing.get().getStatus().name()))
                        .auto(existing.map(CashClosing::isAuto).orElse(false))
                        .closingId(existing.map(CashClosing::getId).orElse(null))
                        .build();

        // ── POS DEVICES (bugün) ──────────────────────────────────────
        List<PosDevice> activeDevices = posDeviceRepository.findByActiveTrueOrderByNameAsc();
        List<ConsolidatedDashboardDto.PosDeviceToday> posRows = activeDevices.stream()
                .map(d -> buildPosDeviceToday(d, today))
                .toList();

        // ── PAYABLES rows ────────────────────────────────────────────
        List<ConsolidatedDashboardDto.DebtRow> payableRows = payableDebts.stream()
                .map(d -> toDebtRow(d, today))
                .toList();

        // ── RECEIVABLES summary ──────────────────────────────────────
        Map<String, List<Debt>> byType = receivableDebts.stream()
                .collect(Collectors.groupingBy(
                        d -> d.getReceivableType() == null || d.getReceivableType().isBlank()
                                ? "UNSPECIFIED" : d.getReceivableType(),
                        LinkedHashMap::new, Collectors.toList()));
        List<ConsolidatedDashboardDto.TypeBreakdown> breakdowns = new ArrayList<>();
        for (Map.Entry<String, List<Debt>> e : byType.entrySet()) {
            breakdowns.add(ConsolidatedDashboardDto.TypeBreakdown.builder()
                    .type(e.getKey())
                    .amount(sumDebt(e.getValue()))
                    .count(e.getValue().size())
                    .build());
        }
        int overdueCount = (int) receivableDebts.stream()
                .filter(d -> d.getDueDate() != null && d.getDueDate().isBefore(today))
                .count();
        ConsolidatedDashboardDto.ReceivablesSummary receivablesSummary =
                ConsolidatedDashboardDto.ReceivablesSummary.builder()
                        .total(totalReceivables)
                        .typeBreakdown(breakdowns)
                        .overdueCount(overdueCount)
                        .totalCount(receivableDebts.size())
                        .build();

        // ── CASH OUTFLOWS (bugün, NAKIT, EXPENSE) ────────────────────
        List<Transaction> outflowsToday = transactionRepository
                .findByDateAndPaymentMethodAndDirection(today, "NAKIT", TransactionDirection.EXPENSE);
        List<ConsolidatedDashboardDto.TxRow> outflowRows = outflowsToday.stream()
                .map(this::toTxRow)
                .toList();

        // ── UPCOMING CHEQUES (next 30 days) ──────────────────────────
        List<Debt> upcomingCheques = debtRepository.findUpcomingCheques(today, today.plusDays(30));
        List<ConsolidatedDashboardDto.ChequeRow> chequeRows = upcomingCheques.stream()
                .map(d -> ConsolidatedDashboardDto.ChequeRow.builder()
                        .debtId(d.getId())
                        .counterpartName(displayCounterpartName(d))
                        .amount(d.getAmount())
                        .chequeDueDate(d.getChequeDueDate())
                        .chequeNo(d.getChequeNo())
                        .collectorBank(d.getChequeCollectorBank())
                        .daysToDue((int) java.time.temporal.ChronoUnit.DAYS.between(today, d.getChequeDueDate()))
                        .build())
                .toList();

        // ── UPCOMING REMINDERS (next 7 days) ─────────────────────────
        List<Debt> upcomingReminders = debtRepository.findUpcomingReminders(today, today.plusDays(7));
        List<ConsolidatedDashboardDto.ReminderRow> reminderRows = upcomingReminders.stream()
                .map(d -> ConsolidatedDashboardDto.ReminderRow.builder()
                        .debtId(d.getId())
                        .counterpartName(displayCounterpartName(d))
                        .amount(d.getAmount())
                        .reminderDate(d.getReminderDate())
                        .reminderNote(d.getReminderNote())
                        .daysToRemind((int) java.time.temporal.ChronoUnit.DAYS.between(today, d.getReminderDate()))
                        .build())
                .toList();

        // ── NET POSITION ─────────────────────────────────────────────
        BigDecimal net = totalReceivables.subtract(totalPayables);
        ConsolidatedDashboardDto.NetPosition netPosition =
                ConsolidatedDashboardDto.NetPosition.builder()
                        .receivables(totalReceivables)
                        .payables(totalPayables)
                        .net(net)
                        .netPositive(net.signum() >= 0)
                        .build();

        return ConsolidatedDashboardDto.builder()
                .businessId(businessId)
                .consolidated(consolidated)
                .todayClosing(todayClosing)
                .posDevices(posRows)
                .bankAccounts(bankRows)
                .payables(payableRows)
                .receivables(receivablesSummary)
                .cashOutflowsToday(outflowRows)
                .upcomingCheques(chequeRows)
                .upcomingReminders(reminderRows)
                .netPosition(netPosition)
                .build();
    }

    // ───────────────────────── helpers ─────────────────────────

    private ConsolidatedDashboardDto.BankAccountSummary toBankSummary(BankAccount b) {
        return ConsolidatedDashboardDto.BankAccountSummary.builder()
                .id(b.getId())
                .name(b.getName())
                .type(b.getType() != null ? b.getType().name() : null)
                .bankName(b.getBankName())
                .holderName(b.getHolderPerson() != null ? b.getHolderPerson().getName() : null)
                .balance(b.getCurrentBalance())
                .currency(b.getCurrency())
                .build();
    }

    private ConsolidatedDashboardDto.PosDeviceToday buildPosDeviceToday(PosDevice d, LocalDate date) {
        List<Transaction> txs = transactionRepository.findByPosDeviceIdAndDate(d.getId(), date);
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal commission = BigDecimal.ZERO;
        int unsettled = 0;
        for (Transaction t : txs) {
            if (t.getAmount() == null) continue;
            gross = gross.add(t.getAmount());
            BigDecimal rate = t.getAppliedPosRate() != null
                    ? t.getAppliedPosRate()
                    : (t.getPosRate() != null ? t.getPosRate() : BigDecimal.ZERO);
            BigDecimal c = t.getAmount().multiply(rate)
                    .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            commission = commission.add(c);
            if (Boolean.FALSE.equals(t.getPosSettled())) unsettled++;
        }
        return ConsolidatedDashboardDto.PosDeviceToday.builder()
                .deviceId(d.getId())
                .deviceName(d.getName())
                .todayGross(gross)
                .todayCommission(commission)
                .todayNet(gross.subtract(commission))
                .unsettledCount(unsettled)
                .txCount(txs.size())
                .build();
    }

    private ConsolidatedDashboardDto.DebtRow toDebtRow(Debt d, LocalDate today) {
        Integer daysToDue = d.getDueDate() != null
                ? (int) java.time.temporal.ChronoUnit.DAYS.between(today, d.getDueDate())
                : null;
        return ConsolidatedDashboardDto.DebtRow.builder()
                .debtId(d.getId())
                .counterpartName(displayCounterpartName(d))
                .amount(d.getAmount())
                .currency(d.getCurrency())
                .dueDate(d.getDueDate())
                .daysToDue(daysToDue)
                .instrumentType(d.getInstrumentType())
                .build();
    }

    private ConsolidatedDashboardDto.TxRow toTxRow(Transaction t) {
        return ConsolidatedDashboardDto.TxRow.builder()
                .txId(t.getId())
                .description(t.getDescription())
                .categoryName(t.getCategory() != null ? t.getCategory().getName() : null)
                .amount(t.getAmount())
                .counterpartName(t.getTargetCounterpart() != null
                        ? t.getTargetCounterpart().getName() : null)
                .date(t.getDate())
                .build();
    }

    private static String displayCounterpartName(Debt d) {
        if (d.getCounterpartRef() != null) return d.getCounterpartRef().getName();
        return d.getCounterparty();
    }

    private static BigDecimal sumDebt(List<Debt> debts) {
        return debts.stream()
                .map(Debt::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumByDirection(LocalDate date, String pm, TransactionDirection dir) {
        return transactionRepository.findByDateAndPaymentMethodAndDirection(date, pm, dir)
                .stream()
                .map(Transaction::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
