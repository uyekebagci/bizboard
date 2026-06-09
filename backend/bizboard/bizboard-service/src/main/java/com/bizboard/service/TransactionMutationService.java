package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.DeletedTransactionLog;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.DeletedTransactionLogRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * R3 (god-component split): transaction MUTATION akışı (create/update/delete),
 * {@code TransactionService}'ten ayrıştırılıyor. STRICT finansal mantık —
 * balance delta, ledger wait-list, sub-cash inclusion, audit — birebir korundu.
 * {@code TransactionService} bu servise delege eder (facade); controller
 * imzaları değişmedi.
 *
 * <p>Adım 3a: {@code deleteTransaction} taşındı. create/update sonraki
 * adımlarda eklenecek.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TransactionMutationService {

    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final DeletedTransactionLogRepository deletedTransactionLogRepository;
    private final LedgerService ledgerService;
    private final AuditLogService auditLogService;
    private final BusinessAccessGuard accessGuard;
    private final BankAccountRepository bankAccountRepository;
    private final SubCashInclusionService subCashInclusionService;

    @Transactional
    public void deleteTransaction(UUID transactionId, UUID userId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Silme sebebi zorunludur");
        }

        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new IllegalArgumentException("Transaction not found"));

        // v1.7.0-beta (Bankalar WP TODO 3993f396): Transfer tx tek-yönlü silinemez.
        // Pair'in iki tarafı atomic silinmeli — DELETE /transfers/{pair_id} kullan.
        if (transaction.getTransferPairId() != null) {
            throw new IllegalArgumentException(
                    "Bu islem bir transferin parcasi. Tek tarafli silinemez — "
                            + "DELETE /transfers/" + transaction.getTransferPairId()
                            + " ile pair'in tamamini sil.");
        }

        Business business = transaction.getBusiness();

        User deletedByUser = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        accessGuard.assertCanAccessBusiness(userId, business.getId());

        // Silinen işlemin tam kaydını oluştur
        DeletedTransactionLog deleteLog = DeletedTransactionLog.builder()
                .originalTransactionId(transaction.getId())
                .businessId(business.getId())
                .businessName(business.getName())
                .categoryId(transaction.getCategory() != null ? transaction.getCategory().getId() : null)
                .categoryName(transaction.getCategory() != null ? transaction.getCategory().getName() : null)
                .direction(transaction.getDirection())
                .amount(transaction.getAmount())
                .currency(transaction.getCurrency())
                .originalDescription(transaction.getDescription())
                .transactionDate(transaction.getDate())
                .tags(transaction.getTags() != null ? transaction.getTags() : java.util.List.of())
                .metadata(transaction.getMetadata() != null ? transaction.getMetadata() : java.util.Map.of())
                .deletionReason(reason)
                .deletedBy(userId)
                .deletedByName(deletedByUser.getFullName())
                .build();

        deletedTransactionLogRepository.save(deleteLog);
        log.info("Islem silme logu olusturuldu: txId={} sebep='{}' silen={}",
                transactionId, reason, deletedByUser.getFullName());

        UUID businessId = business.getId();
        LocalDate txDate = transaction.getDate();

        // Kapanmış döneme ait mi?
        boolean wasClosed = ledgerService.isClosedPeriod(txDate);

        // v1.7.0.x (BUG fix): Silinen tx'in banka bakiyesine etkisini reverse et.
        // Eksik reversal yüzünden settled POS tx silinince bank balance "şişip
        // kalıyordu". Üç durum:
        //   1) HESAPDAN/NAKIT tx + bankAccount → create'de ±amount uygulanmış
        //      idi; silerken delta'yı geri çevir (income → -amount, expense → +amount).
        //   2) POS tx + posSettled=true + bankAccount → settle anında +net
        //      eklenmişti; silerken -net.
        //   3) Diğer: dokunmaya gerek yok (balance etkisi yok).
        BankAccount txBank = transaction.getBankAccount();
        String txPm = transaction.getPaymentMethod();
        BigDecimal reverseDelta = null;
        if (txBank != null) {
            if (("HESAPDAN".equals(txPm) || "NAKIT".equals(txPm))) {
                // Direction'a göre apply edilmiş delta'yı tersle.
                BigDecimal applied = transaction.getAmount();
                if (transaction.getDirection() == TransactionDirection.EXPENSE) {
                    applied = applied.negate();
                }
                reverseDelta = applied.negate();
            } else if ("POS".equalsIgnoreCase(txPm)
                    && Boolean.TRUE.equals(transaction.getPosSettled())) {
                // Settled POS net = amount × (1 - rate/100). Negatif (geri çek).
                BigDecimal amt = transaction.getAmount();
                BigDecimal rate = transaction.getAppliedPosRate() != null
                        ? transaction.getAppliedPosRate()
                        : (transaction.getPosRate() != null
                                ? transaction.getPosRate() : BigDecimal.ZERO);
                BigDecimal commission = amt.multiply(rate)
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                BigDecimal net = amt.subtract(commission);
                reverseDelta = net.negate();
            }
            if (reverseDelta != null) {
                BigDecimal current = txBank.getCurrentBalance() != null
                        ? txBank.getCurrentBalance() : BigDecimal.ZERO;
                txBank.setCurrentBalance(current.add(reverseDelta));
                bankAccountRepository.save(txBank);
                log.info("[tx-delete] bank balance reversed: bank={} delta={} (tx pm={} settled={})",
                        txBank.getName(), reverseDelta, txPm, transaction.getPosSettled());
            }
        }

        // Beta v1.1 hotfix: tx silinmeden önce sub_cash_tx_inclusion'lara bağlı
        // SUB_CASH bakiyelerini reverse et (önceki commit balance'a +contrib
        // eklenmişti; tx silinince düşmesi gerek). subCashInclusionService bunu
        // yapar ve inclusion satırlarını da temizler.
        subCashInclusionService.onTransactionDeleted(transaction);

        // Transaction'ı sil
        transactionRepository.delete(transaction);

        // Kapanmış döneme aitse wait list'e DELETE kaydı ekle
        if (wasClosed) {
            int year = txDate.getYear();
            int month = txDate.getMonthValue();
            ledgerService.addToWaitList(businessId, year, month, transactionId, "DELETE");
            log.info("Gecmis donemden islem silindi: {} {}/{} -> wait list'e eklendi",
                    business.getName(), year, month);
        }

        Map<String, Object> meta = new HashMap<>();
        meta.put("businessId", businessId);
        meta.put("amount", deleteLog.getAmount());
        meta.put("direction", deleteLog.getDirection().name());
        meta.put("currency", deleteLog.getCurrency());
        meta.put("reason", reason);
        if (deleteLog.getCategoryName() != null) {
            meta.put("categoryName", deleteLog.getCategoryName());
        }
        auditLogService.recordEntityAction(
                AuditAction.TRANSACTION_DELETE,
                deletedByUser.getId(), deletedByUser.getUsername(),
                "TRANSACTION", transactionId,
                business.getName() + " — islem silindi: " + deleteLog.getAmount() + " " + deleteLog.getCurrency() + " (sebep: " + reason + ")",
                meta);
    }
}
