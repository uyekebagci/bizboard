package com.bizboard.service;

import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Transaction;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * R3 (god-component split): salt-okunur transaction read/list akışı,
 * {@code TransactionService}'ten ayrıştırıldı. Davranış ve tenant-filtreleme
 * birebir korundu; {@code TransactionService} bu servise delege eder (facade),
 * controller imzaları değişmedi.
 *
 * <p>Erişilebilir işletme çözümü tek kaynaktan ({@link BusinessAccessGuard}).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TransactionQueryService {

    private final TransactionRepository transactionRepository;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public List<TransactionDto> getTransactions(UUID businessId, int limit, UUID actorUserId) {
        accessGuard.assertCanReadBusiness(actorUserId, businessId);
        // Beta v1.1: date DESC + createdAt DESC — aynı gün eklenen tx'ler
        // arasında en son insert üstte (Son İşlemler widget'ı için).
        List<Transaction> transactions = transactionRepository
                .findByBusinessIdOrderByDateDescCreatedAtDesc(businessId, PageRequest.of(0, limit));
        return transactions.stream()
                .map(DtoMapper::toTransactionDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TransactionDto> getRecentTransactionsForUser(UUID userId, int limit) {
        List<Business> businesses = accessGuard.accessibleBusinesses(userId);
        if (businesses.isEmpty()) {
            return List.of();
        }
        List<UUID> businessIds = businesses.stream().map(Business::getId).toList();
        List<Transaction> transactions = transactionRepository
                .findByBusinessIdInOrderByCreatedAtDesc(businessIds, PageRequest.of(0, limit));
        return transactions.stream()
                .map(t -> {
                    TransactionDto dto = DtoMapper.toTransactionDto(t);
                    dto.setBusinessName(t.getBusiness().getName());
                    return dto;
                })
                .toList();
    }

    /**
     * Kullanicinin erisebilecehi tum islemleri dondurur.
     * Opsiyonel businessId ve direction filtresi.
     */
    @Transactional(readOnly = true)
    public List<TransactionDto> getAllTransactionsForUser(UUID userId, UUID filterBusinessId, String filterDirection) {
        List<Business> businesses = accessGuard.accessibleBusinesses(userId);
        if (businesses.isEmpty()) return List.of();

        List<Transaction> transactions;
        if (filterBusinessId != null) {
            // Belirli isletme filtresi
            boolean hasAccess = businesses.stream().anyMatch(b -> b.getId().equals(filterBusinessId));
            if (!hasAccess) return List.of();
            transactions = transactionRepository.findByBusinessIdOrderByDateDesc(filterBusinessId);
        } else {
            List<UUID> businessIds = businesses.stream().map(Business::getId).toList();
            transactions = transactionRepository.findByBusinessIdInOrderByDateDesc(businessIds);
        }

        return transactions.stream()
                .filter(t -> {
                    if (filterDirection != null && !filterDirection.isEmpty()) {
                        return t.getDirection().name().equalsIgnoreCase(filterDirection);
                    }
                    return true;
                })
                .map(t -> {
                    TransactionDto dto = DtoMapper.toTransactionDto(t);
                    dto.setBusinessName(t.getBusiness().getName());
                    return dto;
                })
                .toList();
    }
}
