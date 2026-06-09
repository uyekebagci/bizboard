package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateTransactionRequest;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.UpdateTransactionRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final LedgerService ledgerService;
    private final AuditLogService auditLogService;
    private final BusinessAccessGuard accessGuard;
    // v1.6.23.4 (sandbox-test): HESAPDAN ödemeleri için bank_account binding (update'te kullanılır)
    private final com.bizboard.repository.BankAccountRepository bankAccountRepository;
    /** WP Sub-Cash Retroactive Inclusion: tx update sonrası inclusion hook. */
    private final SubCashInclusionService subCashInclusionService;
    // R3 (god-component split): POS settle/unsettle/bulk akışı ayrı serviste; buradan delege edilir.
    private final PosSettlementService posSettlementService;
    // R3 (god-component split): salt-okunur read/list akışı ayrı serviste; buradan delege edilir.
    private final TransactionQueryService transactionQueryService;
    // R3 (god-component split): mutation (create/update/delete) akışı ayrı serviste; buradan delege edilir.
    private final TransactionMutationService transactionMutationService;

    // ───────── READ/LIST (R3: TransactionQueryService'e delege — facade) ─────────

    /** R3: bkz. {@link TransactionQueryService#getTransactions}. */
    public List<TransactionDto> getTransactions(UUID businessId, int limit, UUID actorUserId) {
        return transactionQueryService.getTransactions(businessId, limit, actorUserId);
    }

    /** R3: bkz. {@link TransactionQueryService#getRecentTransactionsForUser}. */
    public List<TransactionDto> getRecentTransactionsForUser(UUID userId, int limit) {
        return transactionQueryService.getRecentTransactionsForUser(userId, limit);
    }

    /** R3: bkz. {@link TransactionQueryService#getAllTransactionsForUser}. */
    public List<TransactionDto> getAllTransactionsForUser(UUID userId, UUID filterBusinessId, String filterDirection) {
        return transactionQueryService.getAllTransactionsForUser(userId, filterBusinessId, filterDirection);
    }

    /** R3: bkz. {@link TransactionMutationService#createTransaction}. */
    public TransactionDto createTransaction(UUID businessId, CreateTransactionRequest request, UUID userId) {
        return transactionMutationService.createTransaction(businessId, request, userId);
    }

    @Transactional
    public TransactionDto updateTransaction(UUID transactionId, UpdateTransactionRequest request, UUID userId) {
        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new IllegalArgumentException("Transaction not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        accessGuard.assertCanAccessBusiness(userId, transaction.getBusiness().getId());

        // v1.6.23.4 (BUG-1 fix): HESAPDAN tx update için bank balance reversal/apply.
        // Eski state'i yakala — sonrasında reverse + apply yapacağız.
        final String oldPm = transaction.getPaymentMethod() != null
                ? transaction.getPaymentMethod() : "NAKIT";
        final java.math.BigDecimal oldAmount = transaction.getAmount();
        final TransactionDirection oldDirection = transaction.getDirection();
        final com.bizboard.common.entity.BankAccount oldBank = transaction.getBankAccount();

        // WP Sub-Cash Retroactive Inclusion: entity ID snapshot — update sonrası
        // değişim olduysa eski inclusion'lar silinip yenisi hesaplanacak.
        final UUID oldCounterpartId = transaction.getTargetCounterpart() != null
                ? transaction.getTargetCounterpart().getId() : null;
        final UUID oldPosDeviceId = transaction.getPosDevice() != null
                ? transaction.getPosDevice().getId() : null;
        final UUID oldBankAccountIdForInclusion = oldBank != null ? oldBank.getId() : null;

        // v1.7.0-beta+ (Bankalar WP TODO 317415bb): POS settled tx için
        // eski net'i yakala — pos_rate veya amount değişirse bank balance
        // delta'sını hesaplamak için gerek.
        final boolean wasPosSettled = "POS".equals(oldPm)
                && Boolean.TRUE.equals(transaction.getPosSettled());
        final java.math.BigDecimal oldAppliedRate = transaction.getAppliedPosRate() != null
                ? transaction.getAppliedPosRate()
                : (transaction.getPosRate() != null
                        ? transaction.getPosRate() : java.math.BigDecimal.ZERO);
        final java.math.BigDecimal oldPosNet = wasPosSettled
                ? oldAmount.subtract(oldAmount.multiply(oldAppliedRate)
                        .divide(java.math.BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP))
                : null;

        // ── Eski değerleri yakala (diff için) ───────────────────────────
        Map<String, Object> changes = new HashMap<>();

        if (request.getDirection() != null) {
            TransactionDirection newDir = TransactionDirection.valueOf(
                    request.getDirection().toUpperCase(java.util.Locale.ENGLISH));
            if (transaction.getDirection() != newDir) {
                changes.put("direction", Map.of("from", transaction.getDirection().name(), "to", newDir.name()));
                transaction.setDirection(newDir);
            }
        }
        if (request.getAmount() != null && !request.getAmount().equals(transaction.getAmount())) {
            changes.put("amount", Map.of("from", transaction.getAmount(), "to", request.getAmount()));
            transaction.setAmount(request.getAmount());
        }
        if (request.getCurrency() != null && !request.getCurrency().equals(transaction.getCurrency())) {
            changes.put("currency", Map.of("from", transaction.getCurrency(), "to", request.getCurrency()));
            transaction.setCurrency(request.getCurrency());
        }
        if (request.getDescription() != null && !java.util.Objects.equals(request.getDescription(), transaction.getDescription())) {
            changes.put("description", Map.of(
                    "from", transaction.getDescription() != null ? transaction.getDescription() : "",
                    "to", request.getDescription()));
            transaction.setDescription(request.getDescription());
        }
        if (request.getDate() != null && !request.getDate().equals(transaction.getDate())) {
            changes.put("date", Map.of("from", transaction.getDate().toString(), "to", request.getDate().toString()));
            transaction.setDate(request.getDate());
        }
        if (request.getCategoryId() != null) {
            UUID oldCategoryId = transaction.getCategory() != null ? transaction.getCategory().getId() : null;
            if (!java.util.Objects.equals(oldCategoryId, request.getCategoryId())) {
                Category category = categoryRepository.findById(request.getCategoryId()).orElse(null);
                changes.put("categoryId", Map.of(
                        "from", oldCategoryId != null ? oldCategoryId.toString() : "null",
                        "to", request.getCategoryId().toString()));
                transaction.setCategory(category);
            }
        }
        if (request.getTags() != null && !request.getTags().equals(transaction.getTags())) {
            changes.put("tags", Map.of(
                    "from", transaction.getTags() != null ? transaction.getTags() : List.of(),
                    "to", request.getTags()));
            transaction.setTags(request.getTags());
        }
        if (request.getMetadata() != null) {
            // Metadata diff'i taşımıyoruz (JSONB serbest yapı); sadece güncellendi bayrağı.
            changes.put("metadataUpdated", true);
            transaction.setMetadata(request.getMetadata());
        }
        // v1.6.3: payment_method + pos_rate update
        if (request.getPaymentMethod() != null) {
            String newPm = TransactionMutationService.normalizePaymentMethod(request.getPaymentMethod());
            if (!newPm.equals(transaction.getPaymentMethod())) {
                changes.put("paymentMethod", Map.of(
                        "from", transaction.getPaymentMethod() != null ? transaction.getPaymentMethod() : "NAKIT",
                        "to", newPm));
                transaction.setPaymentMethod(newPm);
                // NAKIT'e geçerse posRate temizle; POS'a geçerse aşağıda set olur
                if ("NAKIT".equals(newPm)) {
                    transaction.setPosRate(null);
                }
            }
        }
        if (request.getPosRate() != null && "POS".equals(transaction.getPaymentMethod())) {
            if (!java.util.Objects.equals(transaction.getPosRate(), request.getPosRate())) {
                changes.put("posRate", Map.of(
                        "from", transaction.getPosRate() != null ? transaction.getPosRate() : 0,
                        "to", request.getPosRate()));
                transaction.setPosRate(request.getPosRate());
                // v1.7.0-beta+ / v1.7.x (TODO 317415bb + 6ffe0665):
                // applied_pos_rate snapshot da sync — DtoMapper bank_commission
                // hesabı applied_pos_rate'ten türer.
                java.math.BigDecimal oldApplied = transaction.getAppliedPosRate();
                if (!java.util.Objects.equals(oldApplied, request.getPosRate())) {
                    changes.put("appliedPosRate", Map.of(
                            "from", oldApplied != null ? oldApplied : 0,
                            "to", request.getPosRate()));
                    transaction.setAppliedPosRate(request.getPosRate());
                }
            }
        }
        // v1.7.x (POS Komisyon WP TODO 6ffe0665): bizim oran update.
        if (request.getOurCommissionRate() != null && "POS".equals(transaction.getPaymentMethod())) {
            if (!java.util.Objects.equals(
                    transaction.getAppliedOurCommissionRate(), request.getOurCommissionRate())) {
                changes.put("appliedOurCommissionRate", Map.of(
                        "from", transaction.getAppliedOurCommissionRate() != null
                                ? transaction.getAppliedOurCommissionRate() : 0,
                        "to", request.getOurCommissionRate()));
                transaction.setAppliedOurCommissionRate(request.getOurCommissionRate());
            }
        }
        // PM POS'tan başkasına geçerse her iki oran da temizle (defensive).
        if (transaction.getPaymentMethod() != null
                && !"POS".equals(transaction.getPaymentMethod())) {
            if (transaction.getAppliedPosRate() != null) transaction.setAppliedPosRate(null);
            if (transaction.getAppliedOurCommissionRate() != null) {
                transaction.setAppliedOurCommissionRate(null);
            }
        }
        // v1.7.x (TODO fc3ed50f): POS tx için her iki oran zorunlu + our >= bank.
        // Validation update'in en sonunda — diğer field değişiklikleri ile karışmasın.
        if ("POS".equals(transaction.getPaymentMethod())) {
            TransactionMutationService.validatePosCommissionRates(
                    transaction.getAppliedOurCommissionRate(),
                    transaction.getAppliedPosRate());
        }
        // v1.6.21 (WP-4) / v1.6.23.11 fix:
        // pos_settled artık YALNIZ dedicated endpoint'ler (PATCH /settle, /unsettle)
        // üzerinden değişir — çünkü bank_account.current_balance senkron lazım.
        // Eski PUT path'i pos_settled toggle'a izin veriyordu ama balance'a
        // dokunmuyordu → settle drift bug. Şimdi explicit reddediyoruz.
        if (request.getPosSettled() != null
                && !java.util.Objects.equals(request.getPosSettled(), transaction.getPosSettled())) {
            throw new IllegalArgumentException(
                    "pos_settled bu endpoint'ten degistirilemez; "
                            + "PATCH /businesses/{bizId}/transactions/{txId}/settle veya /unsettle kullan.");
        }

        // WP b446c696 (Beta v1.1 Hotfix): POS+EXPENSE ve NAKIT+EXPENSE için
        // pos_tx_subtype + related_bank_account_id update.
        boolean isPosExpenseUpdate = "POS".equals(transaction.getPaymentMethod())
                && transaction.getDirection() == TransactionDirection.EXPENSE;
        boolean isNakitExpenseUpdate = "NAKIT".equals(transaction.getPaymentMethod())
                && transaction.getDirection() == TransactionDirection.EXPENSE;
        if (isPosExpenseUpdate || isNakitExpenseUpdate) {
            if (request.getPosTxSubtype() != null) {
                String newSubtype = request.getPosTxSubtype()
                        .toUpperCase(java.util.Locale.ENGLISH);
                if (!"NAKIT".equals(newSubtype) && !"TRANSFER".equals(newSubtype)) {
                    throw new IllegalArgumentException(
                            "Geçersiz pos_tx_subtype (NAKIT veya TRANSFER olmalı)");
                }
                if (!newSubtype.equals(transaction.getPosTxSubtype())) {
                    changes.put("posTxSubtype", Map.of(
                            "from", transaction.getPosTxSubtype() != null
                                    ? transaction.getPosTxSubtype() : "null",
                            "to", newSubtype));
                    transaction.setPosTxSubtype(newSubtype);
                    // TRANSFER → NAKIT geçişte related_bank_account_id NULL'a force.
                    if ("NAKIT".equals(newSubtype)
                            && transaction.getRelatedBankAccount() != null) {
                        transaction.setRelatedBankAccount(null);
                    }
                }
            }
            // related_bank_account_id update — sadece TRANSFER subtype'da.
            if (request.getRelatedBankAccountId() != null
                    && "TRANSFER".equals(transaction.getPosTxSubtype())) {
                com.bizboard.common.entity.BankAccount newRelated = bankAccountRepository
                        .findById(request.getRelatedBankAccountId())
                        .orElseThrow(() -> new IllegalArgumentException(
                                "İlgili banka hesabı bulunamadı"));
                if (!newRelated.getBusiness().getId()
                        .equals(transaction.getBusiness().getId())) {
                    throw new IllegalArgumentException(
                            "İlgili banka hesabı bu işletmeye ait değil");
                }
                if (!newRelated.isActive()) {
                    throw new IllegalArgumentException(
                            "Pasif banka hesabı atanamaz: " + newRelated.getName());
                }
                com.bizboard.common.entity.BankAccount oldRelated = transaction.getRelatedBankAccount();
                if (oldRelated == null || !oldRelated.getId().equals(newRelated.getId())) {
                    changes.put("relatedBankAccount", Map.of(
                            "from", oldRelated != null ? oldRelated.getId().toString() : "null",
                            "to", newRelated.getId().toString()));
                    transaction.setRelatedBankAccount(newRelated);
                }
            }
        } else {
            // POS+EXPENSE değilse alanlar her zaman NULL.
            if (transaction.getPosTxSubtype() != null) transaction.setPosTxSubtype(null);
            if (transaction.getRelatedBankAccount() != null) transaction.setRelatedBankAccount(null);
        }

        // v1.6.23.4 (BUG-1 fix): HESAPDAN bank_account update + balance reversal/apply.
        // request.bankAccountId verilirse veya pm HESAPDAN ise burada handle ediyoruz.
        final String newPm = transaction.getPaymentMethod() != null
                ? transaction.getPaymentMethod() : "NAKIT";
        com.bizboard.common.entity.BankAccount newBank = oldBank;
        if (request.getBankAccountId() != null) {
            newBank = bankAccountRepository.findById(request.getBankAccountId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Bank account bulunamadi: " + request.getBankAccountId()));
            if (oldBank == null || !oldBank.getId().equals(newBank.getId())) {
                changes.put("bankAccount", Map.of(
                        "from", oldBank != null ? oldBank.getId().toString() : "null",
                        "to", newBank.getId().toString()));
                transaction.setBankAccount(newBank);
            }
        }
        if ("HESAPDAN".equals(newPm) && transaction.getBankAccount() == null) {
            throw new IllegalArgumentException(
                    "HESAPDAN payment_method icin bank_account_id zorunlu");
        }
        // v1.7.0-beta+ (Bankalar WP TODO 317415bb): bank_account temizleme
        // kuralı sıkılaştırıldı. Eskiden: newPm != HESAPDAN ise her durumda
        // temizleniyordu — POS SETTLED tx'in bank linkini de uçuruyordu, böylece
        // pos_rate update'te net delta reconcile çalışamıyordu.
        //
        // Yeni kural: yalnız HESAPDAN'dan başka bir pm'e GEÇİŞTE temizle.
        // POS settled tx'in bank_account'u settle endpoint'i tarafından set
        // edilir; user update'te bunu kaybetmemeli.
        if ("HESAPDAN".equals(oldPm) && !"HESAPDAN".equals(newPm)
                && transaction.getBankAccount() != null) {
            transaction.setBankAccount(null);
        }

        // v1.6.19 (WP-2): Tx PATCH olduğunda corrected=true + audit highlight=CORRECTION.
        // Yalnız gerçekten değişen alan varsa işaretle (no-op update'lerde corrected aktif olmasın).
        if (!changes.isEmpty()) {
            transaction.setCorrected(true);
        }

        transaction = transactionRepository.save(transaction);

        // v1.6.23.4: Bank balance reversal + apply.
        // 1) Eski tx HESAPDAN ise old bank'tan reverse et.
        // 2) Yeni tx HESAPDAN ise new bank'a apply et.
        if ("HESAPDAN".equals(oldPm) && oldBank != null) {
            java.math.BigDecimal revert = oldDirection == TransactionDirection.EXPENSE
                    ? oldAmount  // expense reversed → add back
                    : oldAmount.negate();  // income reversed → subtract
            oldBank.setCurrentBalance(
                    (oldBank.getCurrentBalance() == null
                            ? java.math.BigDecimal.ZERO
                            : oldBank.getCurrentBalance()).add(revert));
            bankAccountRepository.save(oldBank);
        }
        if ("HESAPDAN".equals(newPm) && transaction.getBankAccount() != null) {
            com.bizboard.common.entity.BankAccount finalBank = transaction.getBankAccount();
            java.math.BigDecimal delta = transaction.getDirection() == TransactionDirection.EXPENSE
                    ? transaction.getAmount().negate()
                    : transaction.getAmount();
            finalBank.setCurrentBalance(
                    (finalBank.getCurrentBalance() == null
                            ? java.math.BigDecimal.ZERO
                            : finalBank.getCurrentBalance()).add(delta));
            bankAccountRepository.save(finalBank);
        }

        // v1.7.0-beta+ (Bankalar WP TODO 317415bb): POS settled tx için
        // net delta bank balance reconcile.
        // Tx settle anında bank.balance += oldNet idi (settlePosTransaction).
        // Şimdi rate veya amount değişti → newNet hesaplanmalı + delta uygulanmalı.
        // Önkoşul: wasPosSettled (eski state) ve hâlâ pos_settled=true + bank var.
        if (wasPosSettled
                && "POS".equals(transaction.getPaymentMethod())
                && Boolean.TRUE.equals(transaction.getPosSettled())
                && transaction.getBankAccount() != null) {
            java.math.BigDecimal newAmount = transaction.getAmount();
            java.math.BigDecimal newRate = transaction.getAppliedPosRate() != null
                    ? transaction.getAppliedPosRate()
                    : (transaction.getPosRate() != null
                            ? transaction.getPosRate() : java.math.BigDecimal.ZERO);
            java.math.BigDecimal newNet = newAmount.subtract(
                    newAmount.multiply(newRate)
                            .divide(java.math.BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP));
            java.math.BigDecimal netDelta = newNet.subtract(oldPosNet);
            if (netDelta.signum() != 0) {
                com.bizboard.common.entity.BankAccount settledBank = transaction.getBankAccount();
                settledBank.setCurrentBalance(
                        (settledBank.getCurrentBalance() == null
                                ? java.math.BigDecimal.ZERO
                                : settledBank.getCurrentBalance()).add(netDelta));
                bankAccountRepository.save(settledBank);
                changes.put("settledBankNetDelta", Map.of(
                        "from", oldPosNet,
                        "to", newNet,
                        "delta", netDelta,
                        "bank", settledBank.getName()));
                log.info("[tx-update POS settled] tx={} oldNet={} newNet={} delta={} bank={}",
                        transaction.getId(), oldPosNet, newNet, netDelta, settledBank.getName());
            }
        }

        Map<String, Object> meta = new HashMap<>();
        meta.put("businessId", transaction.getBusiness().getId());
        meta.put("amount", transaction.getAmount());
        meta.put("direction", transaction.getDirection().name());
        meta.put("changes", changes);
        meta.put("fieldsChanged", changes.size());

        auditLogService.recordEntityAction(
                AuditAction.TRANSACTION_UPDATE,
                user.getId(), user.getUsername(),
                "TRANSACTION", transaction.getId(),
                transaction.getBusiness().getName() + " — islem guncellendi (" + changes.size() + " alan): "
                        + transaction.getAmount() + " " + transaction.getCurrency(),
                meta,
                // v1.6.19 (WP-2): değişiklik varsa CORRECTION highlight.
                changes.isEmpty() ? null : AuditAction.HIGHLIGHT_CORRECTION);

        // WP Sub-Cash Retroactive Inclusion: entity ID değişimi varsa inclusion'lar
        // yeniden hesaplansın (eski sil + yeniden hesapla).
        subCashInclusionService.onTransactionUpdated(
                transaction, oldCounterpartId, oldPosDeviceId, oldBankAccountIdForInclusion);

        TransactionDto dto = DtoMapper.toTransactionDto(transaction);
        dto.setBusinessName(transaction.getBusiness().getName());
        return dto;
    }

    // ───────────────────────── POS SETTLE (R3: PosSettlementService'e delege) ─────────────────────────
    // Facade: controller imzaları korunsun diye public metodlar burada kalır,
    // gövde PosSettlementService'e taşındı. Davranış birebir aynı.

    /** R3: bkz. {@link PosSettlementService#bulkSettlePosTransactions}. */
    public List<TransactionDto> bulkSettlePosTransactions(List<UUID> txIds, UUID userId,
                                                          UUID bankAccountId,
                                                          java.time.LocalDateTime settledAt) {
        return posSettlementService.bulkSettlePosTransactions(txIds, userId, bankAccountId, settledAt);
    }

    /** R3: bkz. {@link PosSettlementService#settlePosTransaction}. */
    public TransactionDto settlePosTransaction(UUID transactionId, UUID userId,
                                                java.util.UUID bankAccountId,
                                                java.time.LocalDateTime settledAt) {
        return posSettlementService.settlePosTransaction(transactionId, userId, bankAccountId, settledAt);
    }

    /** R3: bkz. {@link PosSettlementService#unsettlePosTransaction}. */
    public TransactionDto unsettlePosTransaction(UUID transactionId, UUID userId) {
        return posSettlementService.unsettlePosTransaction(transactionId, userId);
    }

    /** R3: bkz. {@link TransactionMutationService#deleteTransaction}. */
    public void deleteTransaction(UUID transactionId, UUID userId, String reason) {
        transactionMutationService.deleteTransaction(transactionId, userId, reason);
    }

    /**
     * v1.7.x (POS Komisyon WP TODO fc3ed50f): "our >= bank" validation hata mesajı.
     * Hata mesajı BİREBİR — user spec'i: değiştirme. R3: validation helper'ı
     * {@link TransactionMutationService}'e taşındı ama bu sabit DIŞ referanslar
     * (PosDeviceManagementService) tarafından {@code TransactionService.MSG_OUR_LT_BANK}
     * olarak kullanıldığından burada kalır.
     */
    static final String MSG_OUR_LT_BANK =
            "Bizim komisyonumuz banka komisyonundan düşük olamaz";

}
