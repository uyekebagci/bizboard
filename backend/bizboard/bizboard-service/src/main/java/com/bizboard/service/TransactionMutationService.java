package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateTransactionRequest;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.DeletedTransactionLog;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.DeletedTransactionLogRepository;
import com.bizboard.repository.PosDeviceRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * R3 (god-component split): transaction MUTATION akışı (create/update/delete),
 * {@code TransactionService}'ten ayrıştırılıyor. STRICT finansal mantık —
 * balance delta, ledger wait-list, sub-cash inclusion, audit — birebir korundu.
 * {@code TransactionService} bu servise delege eder (facade); controller
 * imzaları değişmedi.
 *
 * <p>Adım 3a: {@code deleteTransaction}; 3b: {@code createTransaction} (+ POS
 * komisyon / payment-method helper'ları) taşındı. update 3c'de gelecek.</p>
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
    private final BusinessRepository businessRepository;
    private final CategoryRepository categoryRepository;
    private final CounterpartRepository counterpartRepository;
    private final PosDeviceRepository posDeviceRepository;
    private final NotificationDispatchService dispatchService;

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
        // v1.7.x (POS Komisyon WP — tx-zinciri): POS tx oluşturulurken iki komisyon
        // oranı SNAPSHOT edilir → effectiveAmount net (profit = our − bank) zinciri
        // create anında tutarlı çalışır (eskiden yalnız UPDATE wire'lıydı; yeni POS
        // tx'ler edit edilene dek profit=0 görünüyordu — tutarsızlık).
        //
        // Öncelik: request.posRate/ourCommissionRate; verilmezse seçili cihazın
        // defaultRate (banka) / ourCommissionRate (bizim) snapshot'ı. Snapshot, cihaz
        // sonradan değişse de sabit kalır (Transaction.appliedPosRate semantiği).
        com.bizboard.common.entity.PosDevice posDevice = null;
        java.math.BigDecimal appliedRate = null;
        java.math.BigDecimal appliedOurRate = null;
        if ("POS".equals(pm) && request.getPosDeviceId() != null) {
            posDevice = posDeviceRepository.findById(request.getPosDeviceId()).orElse(null);
        }
        if ("POS".equals(pm)) {
            appliedRate = posRate != null ? posRate
                    : (posDevice != null ? posDevice.getDefaultRate() : null);
            appliedOurRate = request.getOurCommissionRate() != null ? request.getOurCommissionRate()
                    : (posDevice != null ? posDevice.getOurCommissionRate() : null);
            // Tutarlılık: bizim oran >= banka oranı (her ikisi de doluysa). NULL → no-op.
            validatePosCommissionRates(appliedOurRate, appliedRate);
        }

        // WP b446c696 (Beta v1.1 Hotfix): POS gider akışı + extended NAKIT gider.
        // Hem POS+EXPENSE hem NAKIT+EXPENSE için pos_tx_subtype kabul (NAKIT/TRANSFER)
        // ve related_bank_account_id (TRANSFER subtype'ta) guard'lı atanır.
        boolean isPosExpense = "POS".equals(pm)
                && "EXPENSE".equalsIgnoreCase(request.getDirection());
        boolean isNakitExpense = "NAKIT".equals(pm)
                && "EXPENSE".equalsIgnoreCase(request.getDirection());
        boolean acceptsSubtype = isPosExpense || isNakitExpense;
        String posTxSubtype = null;
        com.bizboard.common.entity.BankAccount relatedBankAccount = null;
        if (isPosExpense && (request.getPosDeviceId() == null || posDevice == null)) {
            throw new IllegalArgumentException("POS gider için cihaz seçimi zorunlu");
        }
        if (acceptsSubtype) {
            posTxSubtype = request.getPosTxSubtype();
            if (posTxSubtype != null) {
                posTxSubtype = posTxSubtype.toUpperCase(java.util.Locale.ENGLISH);
                if (!"NAKIT".equals(posTxSubtype) && !"TRANSFER".equals(posTxSubtype)) {
                    throw new IllegalArgumentException(
                            "Geçersiz pos_tx_subtype (NAKIT veya TRANSFER olmalı)");
                }
            }
            if (request.getRelatedBankAccountId() != null && "TRANSFER".equals(posTxSubtype)) {
                relatedBankAccount = bankAccountRepository
                        .findById(request.getRelatedBankAccountId())
                        .orElseThrow(() -> new IllegalArgumentException(
                                "İlgili banka hesabı bulunamadı"));
                if (!relatedBankAccount.getBusiness().getId().equals(business.getId())) {
                    throw new IllegalArgumentException(
                            "İlgili banka hesabı bu işletmeye ait değil");
                }
                if (!relatedBankAccount.isActive()) {
                    throw new IllegalArgumentException(
                            "Pasif banka hesabı atanamaz: " + relatedBankAccount.getName());
                }
                String type = relatedBankAccount.getType() != null
                        ? relatedBankAccount.getType().name() : "";
                if (!java.util.Set.of("CHECKING", "SAVINGS", "CASH_HOLDER", "MAIN_CASH", "SUB_CASH")
                        .contains(type)) {
                    throw new IllegalArgumentException(
                            "Geçersiz hesap tipi: " + type);
                }
            }
            // NAKIT subtype'da related_bank_account_id ignore edilir (silent).
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
                .appliedOurCommissionRate(appliedOurRate)
                .posSettled(posSettledDefault)
                .bankAccount(bankAccount)
                .backdated(backdated)
                .tags(request.getTags())
                .metadata(request.getMetadata())
                .createdBy(user)
                // WP 08617251: closure session etiketi (NULL = normal tx)
                .closureSessionId(request.getClosureSessionId())
                // WP b446c696: POS gider akışı alanları (income veya non-POS için NULL).
                .posTxSubtype(posTxSubtype)
                .relatedBankAccount(relatedBankAccount)
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

        // WP Sub-Cash Retroactive Inclusion: tx oluşturulduktan sonra
        // entity'leri (counterpart/POS/bank) sub-cash assignment'la match'lerse
        // her bir sub-cash için AUTOMATIC inclusion kaydı eklenir. Spec:
        // mevcut tx'ler için backfill YOK; sadece yeni tx'ler auto-include.
        subCashInclusionService.autoIncludeIfApplicable(transaction);

        // Beta v1.1: manual_sub_cash_id verilirse MANUAL scope'lu inclusion ekle.
        // Transfer tx'lerinde reject (front'da da gizlendi ama defansif).
        if (request.getManualSubCashId() != null) {
            // (kind=TRANSFER bu endpoint'te zaten oluşmaz — transfer ayrı endpoint;
            // yine de defansif assertion.)
            subCashInclusionService.addManualInclusion(
                    request.getManualSubCashId(), transaction.getId(), userId);
        }

        // WP f1fa3cd5: yeni işlem → NEW_TRANSACTION dispatch (admin'lere; in-app default açık,
        // Telegram opt-in). Best-effort — dispatch katmanı hatayı yutar.
        List<UUID> recipients = userRepository.findByRoleIgnoreCase("admin")
                .stream().map(com.bizboard.common.entity.User::getId).toList();
        if (!recipients.isEmpty()) {
            String desc = transaction.getDescription() != null && !transaction.getDescription().isBlank()
                    ? " · " + transaction.getDescription() : "";
            dispatchService.dispatch(
                    NotificationEvent.NEW_TRANSACTION,
                    recipients,
                    Map.of(
                            "business", business.getName() != null ? business.getName() : "",
                            "direction", transaction.getDirection() == TransactionDirection.INCOME ? "gelir" : "gider",
                            "amount", transaction.getAmount() != null ? transaction.getAmount().toPlainString() : "",
                            "currency", transaction.getCurrency() != null ? transaction.getCurrency() : "TRY",
                            "description", desc
                    ),
                    "/dashboard/transactions",
                    business.getId());
        }

        return DtoMapper.toTransactionDto(transaction);
    }

    // ───────── shared mutation helpers (create + update; R3) ─────────

    static String normalizePaymentMethod(String raw) {
        if (raw == null || raw.isBlank()) return "NAKIT";
        String upper = raw.trim().toUpperCase(java.util.Locale.ENGLISH);
        if ("POS".equals(upper)) return "POS";
        if ("HESAPDAN".equals(upper)) return "HESAPDAN";
        return "NAKIT";
    }

    /**
     * v1.7.x: POS tx için iki oran validation (bizim >= banka). Bir taraf NULL →
     * no-op (Beta v1.1: oranlar opsiyonel). Hata mesajı {@link TransactionService#MSG_OUR_LT_BANK}
     * — dış referanslar (PosDeviceManagementService) o sabiti kullandığından sabit orada kalır.
     */
    static void validatePosCommissionRates(java.math.BigDecimal ourRate,
                                           java.math.BigDecimal bankRate) {
        if (ourRate == null || bankRate == null) {
            return;
        }
        if (ourRate.compareTo(bankRate) < 0) {
            throw new IllegalArgumentException(TransactionService.MSG_OUR_LT_BANK);
        }
    }
}
