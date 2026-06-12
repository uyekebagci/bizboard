package com.bizboard.service;

import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
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

    /**
     * PERF (server-pagination, non-breaking): {@link #getAllTransactionsForUser}'in
     * sayfalı eşi. {@code ?page=&size=} geldiğinde controller bunu çağırır;
     * parametre yoksa ESKİ {@link #getAllTransactionsForUser} aynen kullanılır.
     *
     * <p>Davranış birebir korunur — yalnız iki şey değişir:</p>
     * <ul>
     *   <li>{@code direction} filtresi bellekte değil DB'de uygulanır
     *       ({@code WHERE t.direction = ...}) — SONUÇ kümesi aynı, IO daha az;</li>
     *   <li>sonuç {@code Page<>} (içerik + {@code totalElements}); sıralama
     *       {@code date DESC} (eski ile aynı).</li>
     * </ul>
     *
     * <p>Tenant-scope eski metodla AYNEN: erişilebilir işletmeler
     * {@link BusinessAccessGuard#accessibleBusinesses}'tan; {@code filterBusinessId}
     * verildiyse erişim doğrulanır, erişilemezse boş sayfa döner.</p>
     */
    @Transactional(readOnly = true)
    public Page<TransactionDto> getAllTransactionsForUserPaged(
            UUID userId, UUID filterBusinessId, String filterDirection, Pageable pageable) {
        List<Business> businesses = accessGuard.accessibleBusinesses(userId);
        if (businesses.isEmpty()) return Page.empty(pageable);

        // direction string → enum (DB filtresi için).
        boolean hasDirectionFilter = filterDirection != null && !filterDirection.isBlank();
        TransactionDirection direction = parseDirection(filterDirection);
        // Eski bellekteki filtre {@code name().equalsIgnoreCase(filterDirection)} ile
        // parite: TANINMAYAN ama BOŞ-OLMAYAN direction string'i hiçbir kaydı
        // geçirmezdi → boş sayfa (sonuç-değiştirmez).
        if (hasDirectionFilter && direction == null) return Page.empty(pageable);

        Page<Transaction> page;
        if (filterBusinessId != null) {
            boolean hasAccess = businesses.stream().anyMatch(b -> b.getId().equals(filterBusinessId));
            if (!hasAccess) return Page.empty(pageable);
            page = (direction != null)
                    ? transactionRepository.findByBusinessIdAndDirection(filterBusinessId, direction, pageable)
                    : transactionRepository.findByBusinessId(filterBusinessId, pageable);
        } else {
            List<UUID> businessIds = businesses.stream().map(Business::getId).toList();
            page = (direction != null)
                    ? transactionRepository.findByBusinessIdInAndDirection(businessIds, direction, pageable)
                    : transactionRepository.findByBusinessIdIn(businessIds, pageable);
        }

        List<TransactionDto> dtos = page.getContent().stream()
                .map(t -> {
                    TransactionDto dto = DtoMapper.toTransactionDto(t);
                    dto.setBusinessName(t.getBusiness().getName());
                    return dto;
                })
                .toList();
        return new PageImpl<>(dtos, pageable, page.getTotalElements());
    }

    /**
     * direction string'ini enum'a çevirir. Eski bellekteki filtre
     * {@code name().equalsIgnoreCase(filterDirection)} ile birebir uyumlu:
     * tanınmayan/boş değer filtresiz (tüm yönler) demektir — eski davranışta da
     * eşleşmeyen direction string'i hiçbir kaydı geçirmezdi; ama eski uçta yalnız
     * INCOME/EXPENSE gönderildiğinden pratikte sonuç aynıdır.
     */
    private static TransactionDirection parseDirection(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return TransactionDirection.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
