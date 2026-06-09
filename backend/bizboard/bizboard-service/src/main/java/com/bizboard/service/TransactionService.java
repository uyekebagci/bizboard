package com.bizboard.service;

import com.bizboard.common.dto.CreateTransactionRequest;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.UpdateTransactionRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * Transaction facade.
 *
 * <p>R3 (god-component split): eski ~1058 satırlık TransactionService üç odaklı
 * servise bölündü; bu sınıf yalnız delegasyon yapar ki controller imzaları ve
 * mevcut çağıranlar değişmesin:</p>
 * <ul>
 *   <li>read/list → {@link TransactionQueryService}</li>
 *   <li>create/update/delete → {@link TransactionMutationService}</li>
 *   <li>POS settle/unsettle/bulk → {@link PosSettlementService}</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionQueryService transactionQueryService;
    private final TransactionMutationService transactionMutationService;
    private final PosSettlementService posSettlementService;

    /**
     * v1.7.x (POS Komisyon WP TODO fc3ed50f): "our >= bank" validation hata mesajı.
     * Hata mesajı BİREBİR — user spec'i: değiştirme. R3: validation helper'ı
     * {@link TransactionMutationService}'e taşındı ama bu sabit DIŞ referanslar
     * (PosDeviceManagementService) tarafından {@code TransactionService.MSG_OUR_LT_BANK}
     * olarak kullanıldığından burada kalır.
     */
    static final String MSG_OUR_LT_BANK =
            "Bizim komisyonumuz banka komisyonundan düşük olamaz";

    // ───────── READ/LIST → TransactionQueryService ─────────

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

    // ───────── CREATE / UPDATE / DELETE → TransactionMutationService ─────────

    /** R3: bkz. {@link TransactionMutationService#createTransaction}. */
    public TransactionDto createTransaction(UUID businessId, CreateTransactionRequest request, UUID userId) {
        return transactionMutationService.createTransaction(businessId, request, userId);
    }

    /** R3: bkz. {@link TransactionMutationService#updateTransaction}. */
    public TransactionDto updateTransaction(UUID transactionId, UpdateTransactionRequest request, UUID userId) {
        return transactionMutationService.updateTransaction(transactionId, request, userId);
    }

    /** R3: bkz. {@link TransactionMutationService#deleteTransaction}. */
    public void deleteTransaction(UUID transactionId, UUID userId, String reason) {
        transactionMutationService.deleteTransaction(transactionId, userId, reason);
    }

    // ───────── POS SETTLE → PosSettlementService ─────────

    /** R3: bkz. {@link PosSettlementService#bulkSettlePosTransactions}. */
    public List<TransactionDto> bulkSettlePosTransactions(List<UUID> txIds, UUID userId,
                                                          UUID bankAccountId,
                                                          java.time.LocalDateTime settledAt) {
        return posSettlementService.bulkSettlePosTransactions(txIds, userId, bankAccountId, settledAt);
    }

    /** R3: bkz. {@link PosSettlementService#settlePosTransaction}. */
    public TransactionDto settlePosTransaction(UUID transactionId, UUID userId,
                                                UUID bankAccountId,
                                                java.time.LocalDateTime settledAt) {
        return posSettlementService.settlePosTransaction(transactionId, userId, bankAccountId, settledAt);
    }

    /** R3: bkz. {@link PosSettlementService#unsettlePosTransaction}. */
    public TransactionDto unsettlePosTransaction(UUID transactionId, UUID userId) {
        return posSettlementService.unsettlePosTransaction(transactionId, userId);
    }
}
