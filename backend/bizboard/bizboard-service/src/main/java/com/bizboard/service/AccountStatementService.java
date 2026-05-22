package com.bizboard.service;

import com.bizboard.common.dto.AccountStatementDto;
import com.bizboard.common.dto.PaymentInstrumentDto;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * v1.7.x WP fbb2ef55: Counterpart detay sayfasını tek endpoint ile besler.
 *
 * <p>GET /counterparts/{id}/account-statement → balance breakdown +
 * open debts + payment history + portfolio instruments + transactions +
 * chronological running balance history.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountStatementService {

    private final CounterpartRepository counterpartRepository;
    private final DebtRepository debtRepository;
    private final DebtPaymentRepository debtPaymentRepository;
    private final PaymentInstrumentRepository paymentInstrumentRepository;
    private final TransactionRepository transactionRepository;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public AccountStatementDto getAccountStatement(UUID counterpartId, LocalDate from, LocalDate to,
                                                    UUID actorUserId) {
        Counterpart counterpart = counterpartRepository.findById(counterpartId)
                .orElseThrow(() -> new IllegalArgumentException("Counterpart bulunamadı"));
        if (counterpart.getBusiness() == null) {
            throw new IllegalArgumentException("Counterpart business'a bağlı değil");
        }
        UUID businessId = counterpart.getBusiness().getId();
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);

        // ── Open debts ──────────────────────────────────────────────
        List<Debt> allDebts = debtRepository.findByBusinessAndCounterpartAll(businessId, counterpartId);
        List<Debt> openDebts = allDebts.stream()
                .filter(d -> "OPEN".equals(d.getStatus()) || "PARTIAL".equals(d.getStatus()))
                .toList();

        BigDecimal openReceivablesTotal = BigDecimal.ZERO;
        BigDecimal openPayablesTotal = BigDecimal.ZERO;
        for (Debt d : openDebts) {
            BigDecimal rem = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
            if (d.getDirection() == DebtDirection.RECEIVABLE) {
                openReceivablesTotal = openReceivablesTotal.add(rem);
            } else {
                openPayablesTotal = openPayablesTotal.add(rem);
            }
        }
        BigDecimal netRealized = openReceivablesTotal.subtract(openPayablesTotal);

        // ── Portfolio instruments (PORTFOLIO statu) ─────────────────
        List<PaymentInstrument> allInstruments = paymentInstrumentRepository
                .findByBusinessIdAndCounterpartIdOrderByDueDateAsc(businessId, counterpartId);
        BigDecimal pChequesIn = BigDecimal.ZERO;
        BigDecimal pChequesOut = BigDecimal.ZERO;
        BigDecimal pNotesIn = BigDecimal.ZERO;
        BigDecimal pNotesOut = BigDecimal.ZERO;
        for (PaymentInstrument pi : allInstruments) {
            if (!"PORTFOLIO".equals(pi.getStatus())) continue;
            boolean isCheque = "CHEQUE".equals(pi.getInstrumentType());
            boolean isIncoming = "INCOMING".equals(pi.getDirection());
            if (isCheque && isIncoming) pChequesIn = pChequesIn.add(pi.getAmount());
            else if (isCheque) pChequesOut = pChequesOut.add(pi.getAmount());
            else if (isIncoming) pNotesIn = pNotesIn.add(pi.getAmount());
            else pNotesOut = pNotesOut.add(pi.getAmount());
        }
        BigDecimal portfolioDelta = pChequesIn.add(pNotesIn).subtract(pChequesOut).subtract(pNotesOut);
        BigDecimal netWithPortfolio = netRealized.add(portfolioDelta);

        // ── Payment history ─────────────────────────────────────────
        List<DebtPayment> payments = debtPaymentRepository
                .findByBusinessIdAndCounterpartIdOrderByPaymentDateAscCreatedAtAsc(businessId, counterpartId);

        // ── Transactions linked to this counterpart ─────────────────
        List<Transaction> txs = transactionRepository.findByBusinessIdOrderByDateDesc(businessId);
        List<Transaction> cpTxs = txs.stream()
                .filter(t -> t.getTargetCounterpart() != null
                        && counterpartId.equals(t.getTargetCounterpart().getId()))
                .toList();

        // ── Build DTOs ──────────────────────────────────────────────
        AccountStatementDto.CounterpartSummary summary =
                AccountStatementDto.CounterpartSummary.builder()
                        .id(counterpart.getId())
                        .name(counterpart.getName())
                        .kind(counterpart.getKind() != null ? counterpart.getKind().name() : null)
                        .role(counterpart.getRole() != null ? counterpart.getRole().name() : null)
                        .taxId(counterpart.getTaxId())
                        .build();

        AccountStatementDto.BalanceBreakdown breakdown =
                AccountStatementDto.BalanceBreakdown.builder()
                        .openReceivablesTotal(openReceivablesTotal)
                        .openPayablesTotal(openPayablesTotal)
                        .portfolioChequesIncoming(pChequesIn)
                        .portfolioChequesOutgoing(pChequesOut)
                        .portfolioNotesIncoming(pNotesIn)
                        .portfolioNotesOutgoing(pNotesOut)
                        .netRealized(netRealized)
                        .netWithPortfolio(netWithPortfolio)
                        .build();

        List<AccountStatementDto.OpenDebt> openDebtDtos = new ArrayList<>();
        for (Debt d : openDebts) {
            openDebtDtos.add(AccountStatementDto.OpenDebt.builder()
                    .id(d.getId())
                    .direction(d.getDirection().name())
                    .originalAmount(d.getAmount())
                    .remainingAmount(d.getRemainingAmount())
                    .status(d.getStatus())
                    .dueDate(d.getDueDate())
                    .description(d.getDescription())
                    .createdAt(d.getCreatedAt())
                    .build());
        }

        List<AccountStatementDto.PaymentHistoryItem> paymentHistory = new ArrayList<>();
        for (DebtPayment dp : payments) {
            paymentHistory.add(AccountStatementDto.PaymentHistoryItem.builder()
                    .id(dp.getId())
                    .paymentDirection(dp.getPaymentDirection())
                    .paymentMethod(dp.getPaymentMethod())
                    .amount(dp.getAmount())
                    .paymentDate(dp.getPaymentDate())
                    .linkedTransactionId(dp.getLinkedTransaction() != null ? dp.getLinkedTransaction().getId() : null)
                    .linkedInstrumentId(dp.getLinkedInstrument() != null ? dp.getLinkedInstrument().getId() : null)
                    .debtId(dp.getDebt() != null ? dp.getDebt().getId() : null)
                    .description(dp.getDescription())
                    .createdAt(dp.getCreatedAt())
                    .build());
        }

        List<PaymentInstrumentDto> instrumentDtos = new ArrayList<>();
        for (PaymentInstrument pi : allInstruments) {
            instrumentDtos.add(toDto(pi));
        }

        List<TransactionDto> txDtos = new ArrayList<>();
        for (Transaction t : cpTxs) {
            txDtos.add(DtoMapper.toTransactionDto(t));
        }

        // ── Running balance history (chronological) ─────────────────
        List<AccountStatementDto.RunningBalanceEntry> running = buildRunningBalance(
                allDebts, payments, allInstruments, cpTxs, from, to);

        return AccountStatementDto.builder()
                .counterpart(summary)
                .currentBalance(counterpart.getCurrentBalance() != null
                        ? counterpart.getCurrentBalance() : BigDecimal.ZERO)
                .balanceBreakdown(breakdown)
                .openDebts(openDebtDtos)
                .paymentHistory(paymentHistory)
                .instrumentsPortfolio(instrumentDtos)
                .transactions(txDtos)
                .runningBalanceHistory(running)
                .build();
    }

    private List<AccountStatementDto.RunningBalanceEntry> buildRunningBalance(
            List<Debt> debts, List<DebtPayment> payments, List<PaymentInstrument> instruments,
            List<Transaction> txs, LocalDate from, LocalDate to) {

        List<AccountStatementDto.RunningBalanceEntry> rows = new ArrayList<>();
        // 1) DEBT_CREATED events
        for (Debt d : debts) {
            BigDecimal amt = d.getDirection() == DebtDirection.RECEIVABLE
                    ? d.getAmount() : d.getAmount().negate();
            rows.add(AccountStatementDto.RunningBalanceEntry.builder()
                    .date(d.getCreatedAt())
                    .type("DEBT_CREATED")
                    .amount(amt)
                    .referenceId(d.getId())
                    .description(d.getDescription() != null && !d.getDescription().isBlank()
                            ? d.getDescription()
                            : d.getInstrumentType() + " " + d.getDirection().name())
                    .build());
        }
        // 2) PAYMENT events (reduce open debt: opposite sign)
        for (DebtPayment dp : payments) {
            // RECEIVED tahsilat → alacak azaldı (negatif delta), PAID ödeme → verecek azaldı (pozitif delta)
            BigDecimal amt = "RECEIVED".equals(dp.getPaymentDirection())
                    ? dp.getAmount().negate() : dp.getAmount();
            rows.add(AccountStatementDto.RunningBalanceEntry.builder()
                    .date(dp.getCreatedAt())
                    .type("PAYMENT")
                    .amount(amt)
                    .referenceId(dp.getId())
                    .description(dp.getPaymentMethod() + " " + dp.getPaymentDirection()
                            + (dp.getDescription() != null ? " · " + dp.getDescription() : ""))
                    .build());
        }
        // 3) INSTRUMENT CLEARED — bookkeeping, no balance change (debt zaten payment ile düşmüştü)
        for (PaymentInstrument pi : instruments) {
            if (pi.getClearedAt() != null) {
                rows.add(AccountStatementDto.RunningBalanceEntry.builder()
                        .date(pi.getClearedAt())
                        .type("INSTRUMENT_CLEARED")
                        .amount(BigDecimal.ZERO)
                        .referenceId(pi.getId())
                        .description(pi.getInstrumentType() + " tahsil edildi: " + pi.getAmount())
                        .build());
            }
            if (pi.getBouncedAt() != null) {
                rows.add(AccountStatementDto.RunningBalanceEntry.builder()
                        .date(pi.getBouncedAt())
                        .type("INSTRUMENT_BOUNCED")
                        .amount(BigDecimal.ZERO)
                        .referenceId(pi.getId())
                        .description(pi.getInstrumentType() + " karşılıksız: " + pi.getAmount())
                        .build());
            }
        }

        // Sort by date asc, compute running balance
        rows.sort(Comparator.comparing(
                AccountStatementDto.RunningBalanceEntry::getDate,
                Comparator.nullsLast(Comparator.naturalOrder())));

        BigDecimal running = BigDecimal.ZERO;
        for (AccountStatementDto.RunningBalanceEntry r : rows) {
            running = running.add(r.getAmount() != null ? r.getAmount() : BigDecimal.ZERO);
            r.setBalanceAfter(running);
        }

        // Date filter
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : null;
        LocalDateTime toDt = to != null ? to.plusDays(1).atStartOfDay() : null;
        if (fromDt != null || toDt != null) {
            List<AccountStatementDto.RunningBalanceEntry> filtered = new ArrayList<>();
            for (AccountStatementDto.RunningBalanceEntry r : rows) {
                LocalDateTime d = r.getDate();
                if (d == null) continue;
                if (fromDt != null && d.isBefore(fromDt)) continue;
                if (toDt != null && !d.isBefore(toDt)) continue;
                filtered.add(r);
            }
            return filtered;
        }
        return rows;
    }

    public static PaymentInstrumentDto toDto(PaymentInstrument p) {
        return PaymentInstrumentDto.builder()
                .id(p.getId())
                .businessId(p.getBusiness() != null ? p.getBusiness().getId() : null)
                .counterpartId(p.getCounterpart() != null ? p.getCounterpart().getId() : null)
                .counterpartName(p.getCounterpart() != null ? p.getCounterpart().getName() : null)
                .instrumentType(p.getInstrumentType())
                .direction(p.getDirection())
                .amount(p.getAmount())
                .currency(p.getCurrency())
                .issueDate(p.getIssueDate())
                .dueDate(p.getDueDate())
                .chequeNumber(p.getChequeNumber())
                .drawerBank(p.getDrawerBank())
                .drawerBranch(p.getDrawerBranch())
                .noteSerial(p.getNoteSerial())
                .status(p.getStatus())
                .clearedAt(p.getClearedAt())
                .clearedBankAccountId(p.getClearedBankAccount() != null ? p.getClearedBankAccount().getId() : null)
                .clearedBankAccountName(p.getClearedBankAccount() != null ? p.getClearedBankAccount().getName() : null)
                .bouncedAt(p.getBouncedAt())
                .description(p.getDescription())
                .createdAt(p.getCreatedAt())
                .build();
    }
}
