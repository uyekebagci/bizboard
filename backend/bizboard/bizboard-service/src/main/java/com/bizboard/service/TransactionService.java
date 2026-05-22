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
    private final BusinessAccessGuard accessGuard;
    // v1.6.20 (WP-3): counterpart + pos_device wiring
    private final com.bizboard.repository.CounterpartRepository counterpartRepository;
    private final com.bizboard.repository.PosDeviceRepository posDeviceRepository;
    // v1.6.23.4 (sandbox-test): HESAPDAN ödemeleri için bank_account binding
    private final com.bizboard.repository.BankAccountRepository bankAccountRepository;

    @Transactional(readOnly = true)
    public List<TransactionDto> getTransactions(UUID businessId, int limit, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
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

        accessGuard.assertCanAccessBusiness(userId, businessId);

        Category category = null;
        if (request.getCategoryId() != null) {
            category = categoryRepository.findById(request.getCategoryId()).orElse(null);
        }

        // v1.6.3: payment_method normalize (POS/NAKIT)
        // v1.6.23.4: HESAPDAN da geçerli — banka hesabından yapılan ödeme
        String pm = normalizePaymentMethod(request.getPaymentMethod());
        java.math.BigDecimal posRate = "POS".equals(pm) ? request.getPosRate() : null;

        // v1.6.23.4: HESAPDAN için bank_account zorunlu + bakiye güncelleme
        // v1.6.23.27 (UI Fix WP TODO 8764a6a4 + 7e0c5333): NAKIT için
        // bank_account_id verilmezse business'ın system "Genel Nakit"
        // CASH_HOLDER hesabına otomatik route. Bu sayede her tx mutlaka bir
        // bank_account'a bağlıdır → MAIN aggregate formülü (Σ ba.balance)
        // çift sayım yapmadan doğru çalışır.
        com.bizboard.common.entity.BankAccount bankAccount = null;
        if (request.getBankAccountId() != null) {
            bankAccount = bankAccountRepository.findById(request.getBankAccountId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Bank account bulunamadi: " + request.getBankAccountId()));
        }
        if ("HESAPDAN".equals(pm) && bankAccount == null) {
            throw new IllegalArgumentException(
                    "HESAPDAN payment_method icin bank_account_id zorunlu");
        }
        if ("NAKIT".equals(pm) && bankAccount == null) {
            // Default "Genel Nakit" (is_system=true CASH_HOLDER) bul.
            bankAccount = bankAccountRepository
                    .findByActiveTrueAndBusinessIdInOrderByNameAsc(java.util.List.of(businessId))
                    .stream()
                    .filter(ba -> ba.isSystem()
                            && ba.getType() == com.bizboard.common.enums.BankAccountType.CASH_HOLDER)
                    .findFirst()
                    .orElse(null);
            if (bankAccount == null) {
                log.warn("[tx-create] NAKIT tx — business={} icin 'Genel Nakit' sistem hesabi bulunamadi; " +
                        "tx bank_account NULL kayit ediliyor (legacy fallback)", businessId);
            }
        }

        // v1.6.19 (WP-2): backdated tespiti — tx tarihi bugünden önce ise işaretle.
        // Audit log highlight=BACKDATED ile rapor edilir.
        boolean backdated = request.getDate() != null
                && request.getDate().isBefore(java.time.LocalDate.now());

        // v1.6.20 (WP-3): karşı taraf + pos cihazı wiring
        com.bizboard.common.entity.Counterpart targetCounterpart = null;
        if (request.getTargetCounterpartId() != null) {
            targetCounterpart = counterpartRepository
                    .findById(request.getTargetCounterpartId())
                    .orElse(null);
        }
        com.bizboard.common.entity.PosDevice posDevice = null;
        java.math.BigDecimal appliedRate = null;
        if ("POS".equals(pm) && request.getPosDeviceId() != null) {
            posDevice = posDeviceRepository.findById(request.getPosDeviceId()).orElse(null);
            if (posDevice != null) {
                // Snapshot: cihazın o anki rate'ini sabitle.
                appliedRate = posRate != null ? posRate
                        : (posDevice.getDefaultRate() != null ? posDevice.getDefaultRate()
                            : posDevice.getLastUsedRate());
                // Cihazın "lastUsedRate"ini de güncelle.
                if (posRate != null) {
                    posDevice.setLastUsedRate(posRate);
                    posDeviceRepository.save(posDevice);
                }
            }
        } else if ("POS".equals(pm)) {
            appliedRate = posRate;
        }

        // v1.6.23.5 (BUG-V3 fix): POS tx için pos_settled default=false (NULL değil).
        // Önceki davranış: pos_settled NULL → analytics settled/unsettled count'ları
        // 0 dönüyordu çünkü Boolean.FALSE.equals(NULL) = false. Şimdi default false
        // veriyoruz ki "henüz hesaba düşmedi" durumu doğru sayılsın. NAKIT/HESAPDAN
        // için null (anlamsız) kalır.
        Boolean posSettledDefault = "POS".equals(pm) ? Boolean.FALSE : null;

        Transaction transaction = Transaction.builder()
                .business(business)
                .direction(TransactionDirection.valueOf(request.getDirection().toUpperCase(java.util.Locale.ENGLISH)))
                .amount(request.getAmount())
                .currency(request.getCurrency() != null ? request.getCurrency() : business.getCurrency())
                .description(request.getDescription())
                .date(request.getDate())
                .category(category)
                .paymentMethod(pm)
                .posRate(posRate)
                .targetCounterpart(targetCounterpart)
                .posDevice(posDevice)
                .appliedPosRate(appliedRate)
                .posSettled(posSettledDefault)
                .bankAccount(bankAccount)
                .backdated(backdated)
                .tags(request.getTags())
                .metadata(request.getMetadata())
                .createdBy(user)
                .build();

        transaction = transactionRepository.save(transaction);

        // v1.6.23.4: HESAPDAN tx kaydedildikten sonra banka hesap bakiyesini güncelle.
        // v1.6.23.27 (TODO 8764a6a4): NAKIT tx de artık bir bank_account'a route
        // edildiği için aynı kuralla balance güncellenir. Aggregate formülü
        // Σ ba.current_balance üzerinden hesaplandığı için bu güncelleme MAIN
        // ve sub-cash aggregate'lerine doğru yansır.
        if (bankAccount != null && ("HESAPDAN".equals(pm) || "NAKIT".equals(pm))) {
            java.math.BigDecimal delta = transaction.getAmount();
            if (transaction.getDirection() == TransactionDirection.EXPENSE) {
                delta = delta.negate();
            }
            bankAccount.setCurrentBalance(
                    (bankAccount.getCurrentBalance() != null
                            ? bankAccount.getCurrentBalance() : java.math.BigDecimal.ZERO).add(delta));
            bankAccountRepository.save(bankAccount);
        }

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
                business.getName() + " — " + transaction.getDirection() + " " + transaction.getAmount() + " " + transaction.getCurrency()
                        + (backdated ? " [BACKDATED " + request.getDate() + "]" : ""),
                Map.of(
                        "businessId", businessId,
                        "amount", transaction.getAmount(),
                        "direction", transaction.getDirection().name(),
                        "currency", transaction.getCurrency(),
                        "date", transaction.getDate().toString(),
                        "categoryId", transaction.getCategory() != null ? transaction.getCategory().getId() : "null",
                        "backdated", backdated
                ),
                // v1.6.19 (WP-2): backdated tx için UI rozet/renk için highlight set.
                backdated ? AuditAction.HIGHLIGHT_BACKDATED : null);

        return DtoMapper.toTransactionDto(transaction);
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
            String newPm = normalizePaymentMethod(request.getPaymentMethod());
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
                // v1.7.0-beta+ (Bankalar WP TODO 317415bb): applied_pos_rate
                // snapshot da sync edilmeli — DtoMapper net/commission'ı
                // applied_pos_rate'ten türetir; aksi takdirde UI'da stale değer.
                // Kullanıcı bu tx için oranı override ediyor → snapshot YENİ oran.
                java.math.BigDecimal oldApplied = transaction.getAppliedPosRate();
                if (!java.util.Objects.equals(oldApplied, request.getPosRate())) {
                    changes.put("appliedPosRate", Map.of(
                            "from", oldApplied != null ? oldApplied : 0,
                            "to", request.getPosRate()));
                    transaction.setAppliedPosRate(request.getPosRate());
                }
            }
        }
        // PM POS'tan başkasına geçerse applied_pos_rate da temizle (defensive).
        if (transaction.getPaymentMethod() != null
                && !"POS".equals(transaction.getPaymentMethod())
                && transaction.getAppliedPosRate() != null) {
            transaction.setAppliedPosRate(null);
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

        TransactionDto dto = DtoMapper.toTransactionDto(transaction);
        dto.setBusinessName(transaction.getBusiness().getName());
        return dto;
    }

    /**
     * v1.6.23.9 (TODO ddda6029): Bulk POS settle.
     * Tüm tx'ler aynı transaction içinde işaretlenir; biri fail olursa hepsi rollback.
     */
    @Transactional
    public List<TransactionDto> bulkSettlePosTransactions(List<UUID> txIds, UUID userId,
                                                          UUID bankAccountId,
                                                          java.time.LocalDateTime settledAt) {
        List<TransactionDto> results = new java.util.ArrayList<>();
        for (UUID txId : txIds) {
            results.add(settlePosTransaction(txId, userId, bankAccountId, settledAt));
        }
        return results;
    }

    // ───────────────────────── POS SETTLE (v1.6.23.9 TODO 6ee7a9f1) ─────────────────────────

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
                                                java.util.UUID bankAccountId,
                                                java.time.LocalDateTime settledAt) {
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
        com.bizboard.common.entity.BankAccount bank = bankAccountRepository.findById(bankAccountId)
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
        java.math.BigDecimal amount = transaction.getAmount();
        java.math.BigDecimal rate = transaction.getAppliedPosRate() != null
                ? transaction.getAppliedPosRate()
                : (transaction.getPosRate() != null ? transaction.getPosRate() : java.math.BigDecimal.ZERO);
        java.math.BigDecimal commission = amount.multiply(rate)
                .divide(java.math.BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        java.math.BigDecimal net = amount.subtract(commission);

        transaction.setPosSettled(true);
        transaction.setBankAccount(bank);
        transaction.setSettledAt(settledAt != null ? settledAt : java.time.LocalDateTime.now());
        transactionRepository.save(transaction);

        bank.setCurrentBalance(
                (bank.getCurrentBalance() == null ? java.math.BigDecimal.ZERO : bank.getCurrentBalance())
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
        com.bizboard.common.entity.BankAccount bank = transaction.getBankAccount();
        java.math.BigDecimal amount = transaction.getAmount();
        java.math.BigDecimal rate = transaction.getAppliedPosRate() != null
                ? transaction.getAppliedPosRate()
                : (transaction.getPosRate() != null ? transaction.getPosRate() : java.math.BigDecimal.ZERO);
        java.math.BigDecimal commission = amount.multiply(rate)
                .divide(java.math.BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        java.math.BigDecimal net = amount.subtract(commission);

        // Bank balance'tan net düş (eski bank reference'i kayıt için saklanır).
        if (bank != null) {
            bank.setCurrentBalance(
                    (bank.getCurrentBalance() == null ? java.math.BigDecimal.ZERO : bank.getCurrentBalance())
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
     * v1.6.3: payment_method normalize.
     * v1.6.23.4: HESAPDAN eklendi — banka hesabından yapılan ödeme.
     *
     * <p>Geçerli değerler: {@code POS}, {@code NAKIT}, {@code HESAPDAN}.
     * Null/blank/diğer her şey {@code NAKIT} fallback'ine düşer.</p>
     */
    private static String normalizePaymentMethod(String raw) {
        if (raw == null || raw.isBlank()) return "NAKIT";
        String upper = raw.trim().toUpperCase(java.util.Locale.ENGLISH);
        if ("POS".equals(upper)) return "POS";
        if ("HESAPDAN".equals(upper)) return "HESAPDAN";
        return "NAKIT";
    }

}
