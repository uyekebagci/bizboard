package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * R3 (god-component split): POS settle / unsettle / bulk-settle akışı,
 * {@code TransactionService}'ten ayrıştırıldı. Davranış ve doğrulama kuralları
 * birebir korundu; {@code TransactionService} bu servise delege eder (facade),
 * controller imzaları değişmedi.
 *
 * <p>STRICT finansal: settle bank_account.current_balance'a net (= amount −
 * commission) ekler; unsettle aynı net'i geri düşer (admin-only).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosSettlementService {

    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final BankAccountRepository bankAccountRepository;
    private final AuditLogService auditLogService;
    private final BusinessAccessGuard accessGuard;

    /**
     * v1.6.23.9 (TODO ddda6029): Bulk POS settle.
     * Tüm tx'ler aynı transaction içinde işaretlenir; biri fail olursa hepsi rollback.
     */
    @Transactional
    public List<TransactionDto> bulkSettlePosTransactions(List<UUID> txIds, UUID userId,
                                                          UUID bankAccountId,
                                                          LocalDateTime settledAt) {
        List<TransactionDto> results = new ArrayList<>();
        for (UUID txId : txIds) {
            results.add(settlePosTransaction(txId, userId, bankAccountId, settledAt));
        }
        return results;
    }

    /**
     * POS tx'i "hesaba düştü" işaretle. {@code bank_account.current_balance}'a
     * net tutar (= amount − commission) eklenir.
     *
     * <p>Validation:
     * <ul>
     *   <li>tx.payment_method = POS</li>
     *   <li>tx.pos_settled != true (zaten true ise IllegalStateException → 409)</li>
     *   <li>bank_account aktif + CHECKING/SAVINGS (CASH_HOLDER reddedilir)</li>
     *   <li>currency uyumu</li>
     * </ul></p>
     */
    @Transactional
    public TransactionDto settlePosTransaction(UUID transactionId, UUID userId,
                                                UUID bankAccountId,
                                                LocalDateTime settledAt) {
        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new IllegalArgumentException("Transaction not found"));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        accessGuard.assertCanAccessBusiness(userId, transaction.getBusiness().getId());

        if (!"POS".equalsIgnoreCase(transaction.getPaymentMethod())) {
            throw new IllegalArgumentException(
                    "settle yalniz POS tx icin gecerli (tx.payment_method=" + transaction.getPaymentMethod() + ")");
        }
        if (Boolean.TRUE.equals(transaction.getPosSettled())) {
            throw new IllegalStateException(
                    "Bu tx zaten 'hesaba dustu' isaretli; once unsettle gerekli.");
        }
        if (bankAccountId == null) {
            throw new IllegalArgumentException("bank_account_id zorunlu");
        }
        BankAccount bank = bankAccountRepository.findById(bankAccountId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Bank account bulunamadi: " + bankAccountId));
        if (!bank.isActive()) {
            throw new IllegalArgumentException("Pasif banka hesabina POS settle yapilamaz: " + bank.getName());
        }
        String bankType = bank.getType() != null ? bank.getType().name() : "";
        if (!"CHECKING".equals(bankType) && !"SAVINGS".equals(bankType)) {
            throw new IllegalArgumentException(
                    "POS settle yalniz CHECKING/SAVINGS hesabina yapilabilir (gonderilen: " + bankType + ")");
        }
        if (transaction.getCurrency() != null && bank.getCurrency() != null
                && !transaction.getCurrency().equalsIgnoreCase(bank.getCurrency())) {
            throw new IllegalArgumentException(
                    "Currency uyusmuyor: tx=" + transaction.getCurrency() + " bank=" + bank.getCurrency());
        }

        // Net = amount × (1 − rate/100). applied_pos_rate snapshot kullanilir.
        BigDecimal amount = transaction.getAmount();
        BigDecimal rate = transaction.getAppliedPosRate() != null
                ? transaction.getAppliedPosRate()
                : (transaction.getPosRate() != null ? transaction.getPosRate() : BigDecimal.ZERO);
        BigDecimal commission = amount.multiply(rate)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal net = amount.subtract(commission);

        transaction.setPosSettled(true);
        transaction.setBankAccount(bank);
        transaction.setSettledAt(settledAt != null ? settledAt : LocalDateTime.now());
        transactionRepository.save(transaction);

        bank.setCurrentBalance(
                (bank.getCurrentBalance() == null ? BigDecimal.ZERO : bank.getCurrentBalance())
                        .add(net));
        bankAccountRepository.save(bank);

        auditLogService.recordEntityAction(
                AuditAction.POS_SETTLED,
                user.getId(), user.getUsername(),
                "TRANSACTION", transaction.getId(),
                "POS settled: " + amount + " " + transaction.getCurrency()
                        + " → " + bank.getName() + " (+net " + net + ")",
                Map.of(
                        "transactionId", transaction.getId(),
                        "bankAccountId", bank.getId(),
                        "bankName", bank.getName(),
                        "amount", amount,
                        "commission", commission,
                        "net", net,
                        "settledAt", transaction.getSettledAt().toString()),
                AuditAction.HIGHLIGHT_POS_SETTLED);

        log.info("[pos-settle] tx={} → bank={} (+net {})", transaction.getId(), bank.getName(), net);
        return DtoMapper.toTransactionDto(transaction);
    }

    /**
     * POS tx settle iptali. Admin-only.
     * Bank balance'tan net düşülür, pos_settled=false set edilir.
     */
    @Transactional
    public TransactionDto unsettlePosTransaction(UUID transactionId, UUID userId) {
        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new IllegalArgumentException("Transaction not found"));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Sadece admin POS settle iptali yapabilir");
        }
        accessGuard.assertCanAccessBusiness(userId, transaction.getBusiness().getId());

        if (!"POS".equalsIgnoreCase(transaction.getPaymentMethod())) {
            throw new IllegalArgumentException("unsettle yalniz POS tx icin");
        }
        if (!Boolean.TRUE.equals(transaction.getPosSettled())) {
            throw new IllegalStateException("Bu tx zaten settled degil; iptal anlamsiz.");
        }
        BankAccount bank = transaction.getBankAccount();
        BigDecimal amount = transaction.getAmount();
        BigDecimal rate = transaction.getAppliedPosRate() != null
                ? transaction.getAppliedPosRate()
                : (transaction.getPosRate() != null ? transaction.getPosRate() : BigDecimal.ZERO);
        BigDecimal commission = amount.multiply(rate)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal net = amount.subtract(commission);

        // Bank balance'tan net düş (eski bank reference'i kayıt için saklanır).
        if (bank != null) {
            bank.setCurrentBalance(
                    (bank.getCurrentBalance() == null ? BigDecimal.ZERO : bank.getCurrentBalance())
                            .subtract(net));
            bankAccountRepository.save(bank);
        }

        transaction.setPosSettled(false);
        transaction.setSettledAt(null);
        transaction.setBankAccount(null);
        transactionRepository.save(transaction);

        auditLogService.recordEntityAction(
                AuditAction.POS_UNSETTLED,
                user.getId(), user.getUsername(),
                "TRANSACTION", transaction.getId(),
                "POS unsettled: " + amount + " " + transaction.getCurrency()
                        + (bank != null ? " from " + bank.getName() : ""),
                Map.of(
                        "transactionId", transaction.getId(),
                        "bankAccountId", bank != null ? bank.getId() : "null",
                        "amount", amount,
                        "net_reversed", net),
                AuditAction.HIGHLIGHT_POS_UNSETTLED);

        log.info("[pos-unsettle] tx={} → bank balance -{}", transaction.getId(), net);
        return DtoMapper.toTransactionDto(transaction);
    }
}
