package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateTransactionRequest;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.UpdateTransactionRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.DeletedTransactionLog;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.DeletedTransactionLogRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final BusinessRepository businessRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final DeletedTransactionLogRepository deletedTransactionLogRepository;
    private final LedgerService ledgerService;
    private final AuditLogService auditLogService;

    @Transactional(readOnly = true)
    public List<TransactionDto> getTransactions(UUID businessId, int limit) {
        List<Transaction> transactions = transactionRepository
                .findByBusinessIdOrderByDateDesc(businessId, PageRequest.of(0, limit));
        return transactions.stream()
                .map(DtoMapper::toTransactionDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TransactionDto> getRecentTransactionsForUser(UUID userId, int limit) {
        List<Business> businesses = getAccessibleBusinesses(userId);
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
        List<Business> businesses = getAccessibleBusinesses(userId);
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

    @Transactional
    public TransactionDto createTransaction(UUID businessId, CreateTransactionRequest request, UUID userId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (!hasAccessToBusiness(user, businessId)) {
            throw new SecurityException("Access denied");
        }

        Category category = null;
        if (request.getCategoryId() != null) {
            category = categoryRepository.findById(request.getCategoryId()).orElse(null);
        }

        Transaction transaction = Transaction.builder()
                .business(business)
                .direction(TransactionDirection.valueOf(request.getDirection().toUpperCase(java.util.Locale.ENGLISH)))
                .amount(request.getAmount())
                .currency(request.getCurrency() != null ? request.getCurrency() : business.getCurrency())
                .description(request.getDescription())
                .date(request.getDate())
                .category(category)
                .tags(request.getTags())
                .metadata(request.getMetadata())
                .createdBy(user)
                .build();

        transaction = transactionRepository.save(transaction);

        // Geriye dönük bir işlem mi? (kapanmış döneme ait)
        if (ledgerService.isClosedPeriod(request.getDate())) {
            int year = request.getDate().getYear();
            int month = request.getDate().getMonthValue();
            ledgerService.addToWaitList(businessId, year, month, transaction.getId(), "ADD");
            log.info("Geriye donuk islem tespit edildi: {} {}/{} -> wait list'e eklendi",
                    business.getName(), year, month);
        }

        auditLogService.recordEntityAction(
                AuditAction.TRANSACTION_CREATE,
                user.getId(), user.getUsername(),
                "TRANSACTION", transaction.getId(),
                business.getName() + " — " + transaction.getDirection() + " " + transaction.getAmount() + " " + transaction.getCurrency(),
                Map.of(
                        "businessId", businessId,
                        "amount", transaction.getAmount(),
                        "direction", transaction.getDirection().name(),
                        "currency", transaction.getCurrency(),
                        "date", transaction.getDate().toString(),
                        "categoryId", transaction.getCategory() != null ? transaction.getCategory().getId() : "null"
                ));

        return DtoMapper.toTransactionDto(transaction);
    }

    @Transactional
    public TransactionDto updateTransaction(UUID transactionId, UpdateTransactionRequest request, UUID userId) {
        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new IllegalArgumentException("Transaction not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (!hasAccessToBusiness(user, transaction.getBusiness().getId())) {
            throw new SecurityException("Access denied");
        }

        if (request.getDirection() != null) {
            transaction.setDirection(TransactionDirection.valueOf(
                    request.getDirection().toUpperCase(java.util.Locale.ENGLISH)));
        }
        if (request.getAmount() != null) {
            transaction.setAmount(request.getAmount());
        }
        if (request.getCurrency() != null) {
            transaction.setCurrency(request.getCurrency());
        }
        if (request.getDescription() != null) {
            transaction.setDescription(request.getDescription());
        }
        if (request.getDate() != null) {
            transaction.setDate(request.getDate());
        }
        if (request.getCategoryId() != null) {
            Category category = categoryRepository.findById(request.getCategoryId()).orElse(null);
            transaction.setCategory(category);
        }
        if (request.getTags() != null) {
            transaction.setTags(request.getTags());
        }
        if (request.getMetadata() != null) {
            transaction.setMetadata(request.getMetadata());
        }

        transaction = transactionRepository.save(transaction);

        auditLogService.recordEntityAction(
                AuditAction.TRANSACTION_UPDATE,
                user.getId(), user.getUsername(),
                "TRANSACTION", transaction.getId(),
                transaction.getBusiness().getName() + " — islem guncellendi: " + transaction.getAmount() + " " + transaction.getCurrency(),
                Map.of(
                        "businessId", transaction.getBusiness().getId(),
                        "amount", transaction.getAmount(),
                        "direction", transaction.getDirection().name()
                ));

        TransactionDto dto = DtoMapper.toTransactionDto(transaction);
        dto.setBusinessName(transaction.getBusiness().getName());
        return dto;
    }

    @Transactional
    public void deleteTransaction(UUID transactionId, UUID userId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Silme sebebi zorunludur");
        }

        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new IllegalArgumentException("Transaction not found"));

        Business business = transaction.getBusiness();

        User deletedByUser = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (!hasAccessToBusiness(deletedByUser, business.getId())) {
            throw new SecurityException("Access denied");
        }

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
        java.time.LocalDate txDate = transaction.getDate();

        // Kapanmış döneme ait mi?
        boolean wasClosed = ledgerService.isClosedPeriod(txDate);

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

    /**
     * Kullanıcının accessible_businesses sütununa göre erişebildiği işletmeleri döndürür.
     */
    private List<Business> getAccessibleBusinesses(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String accessible = user.getAccessibleBusinesses();

        if ("admin".equalsIgnoreCase(user.getRole())
                || (accessible != null && "all".equalsIgnoreCase(accessible.trim()))) {
            return businessRepository.findAll();
        }

        if (accessible != null && !accessible.isBlank()) {
            List<UUID> ids = Arrays.stream(accessible.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(UUID::fromString)
                    .toList();
            return businessRepository.findByIdIn(ids);
        }

        return businessRepository.findAllAccessibleByUser(userId);
    }

    /**
     * Kullanıcının belirli bir işletmeye erişimi var mı?
     */
    private boolean hasAccessToBusiness(User user, UUID businessId) {
        if ("admin".equalsIgnoreCase(user.getRole())) {
            return true;
        }

        String accessible = user.getAccessibleBusinesses();
        if (accessible != null && !accessible.isBlank()) {
            if ("all".equalsIgnoreCase(accessible.trim())) {
                return true;
            }
            return Arrays.stream(accessible.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .anyMatch(s -> s.equals(businessId.toString()));
        }

        // Fallback: eski owner/member kontrolü
        Business business = businessRepository.findById(businessId).orElse(null);
        if (business == null) return false;

        return business.getOwner().getId().equals(user.getId())
                || business.getMembers().stream()
                .anyMatch(m -> m.getUser().getId().equals(user.getId()));
    }
}
