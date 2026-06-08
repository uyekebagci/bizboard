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
    /** WP a9da4e9d: statement içinde writeoff log + WRITEOFF event. */
    private final DebtWriteoffRepository writeoffRepository;
    private final UserRepository userRepository;
    /** WP a9da4e9d (USD+Altın fix): USD/GOLD borçları GÜNCEL kurla TL'ye çevirir.
     *  Eski 460k-bug penceresinde kaydedilmiş amount/remaining (stale TL) yerine
     *  original_amount × güncel kur kullanılır — recompute/sumDebt ile tutarlı. */
    private final DebtAmountConverter amountConverter;

    /** Borcun GÜNCEL TL kalan tutarı (remaining baz; null → amount). TRY aynen. */
    private BigDecimal remainingTry(Debt d) {
        BigDecimal base = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
        return amountConverter.toTry(d, base);
    }

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
            // USD/GOLD → güncel kurla TL (stale amount/remaining'i kullanma). TRY aynen.
            BigDecimal rem = remainingTry(d);
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
                    // USD/GOLD → güncel kurla TL (stale amount yerine). TRY aynen.
                    .originalAmount(amountConverter.fullToTry(d))
                    .remainingAmount(remainingTry(d))
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

        // ── Writeoffs (WP a9da4e9d) ─────────────────────────────────
        List<DebtWriteoff> writeoffs = writeoffRepository
                .findByCounterpart_IdOrderByWrittenOffAtDesc(counterpartId);
        BigDecimal totalWriteoffs = writeoffs.stream()
                .map(DebtWriteoff::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        breakdown.setTotalWriteoffsAmount(totalWriteoffs);
        List<com.bizboard.common.dto.DebtWriteoffDto> writeoffDtos = new ArrayList<>();
        for (DebtWriteoff w : writeoffs) {
            String byName = w.getWrittenOffBy() != null
                    ? userRepository.findById(w.getWrittenOffBy()).map(User::getUsername).orElse(null)
                    : null;
            writeoffDtos.add(com.bizboard.common.dto.DebtWriteoffDto.builder()
                    .id(w.getId())
                    .businessId(w.getBusiness() != null ? w.getBusiness().getId() : null)
                    .counterpartId(w.getCounterpart() != null ? w.getCounterpart().getId() : null)
                    .counterpartName(w.getCounterpart() != null ? w.getCounterpart().getName() : null)
                    .debtId(w.getDebt() != null ? w.getDebt().getId() : null)
                    .amount(w.getAmount())
                    .reason(w.getReason())
                    .writtenOffBy(w.getWrittenOffBy())
                    .writtenOffByName(byName)
                    .writtenOffAt(w.getWrittenOffAt())
                    .debtRemainingAfter(w.getDebt() != null ? w.getDebt().getRemainingAmount() : null)
                    .debtStatusAfter(w.getDebt() != null ? w.getDebt().getStatus() : null)
                    .build());
        }

        // ── Running balance history (chronological) ─────────────────
        List<AccountStatementDto.RunningBalanceEntry> running = buildRunningBalance(
                allDebts, payments, allInstruments, cpTxs, writeoffs, from, to);

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
                .writeoffs(writeoffDtos)
                .build();
    }

    private List<AccountStatementDto.RunningBalanceEntry> buildRunningBalance(
            List<Debt> debts, List<DebtPayment> payments, List<PaymentInstrument> instruments,
            List<Transaction> txs, List<DebtWriteoff> writeoffs, LocalDate from, LocalDate to) {

        List<AccountStatementDto.RunningBalanceEntry> rows = new ArrayList<>();
        // 1) DEBT_CREATED events — USD/GOLD güncel kurla TL (stale amount yerine).
        for (Debt d : debts) {
            BigDecimal tl = amountConverter.fullToTry(d);
            BigDecimal amt = d.getDirection() == DebtDirection.RECEIVABLE ? tl : tl.negate();
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

        // 4) WRITEOFF events (WP a9da4e9d) — debt remaining düşer, alacak negatif delta
        // RECEIVABLE writeoff: alacak azaldı (negatif delta — bizim için kayıp)
        // PAYABLE writeoff:    verecek azaldı (pozitif delta — bizim için kazanç)
        for (DebtWriteoff w : writeoffs) {
            Debt d = w.getDebt();
            if (d == null || w.getAmount() == null) continue;
            BigDecimal amt = d.getDirection() == DebtDirection.RECEIVABLE
                    ? w.getAmount().negate() : w.getAmount();
            rows.add(AccountStatementDto.RunningBalanceEntry.builder()
                    .date(w.getWrittenOffAt())
                    .type("WRITEOFF")
                    .amount(amt)
                    .referenceId(w.getId())
                    .description("Borç silindi: " + w.getAmount()
                            + (w.getReason() != null ? " · " + w.getReason() : ""))
                    .build());
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
