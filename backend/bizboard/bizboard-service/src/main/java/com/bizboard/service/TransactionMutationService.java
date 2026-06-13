package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateTransactionRequest;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.UpdateTransactionRequest;
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
    // Tier 2 (EVT-1): proaktif finansal alarmlar (HIGH_EXPENSE + BALANCE_BELOW).
    // best-effort/non-fatal; eşik 0/null ise no-op (DEFAULT KAPALI).
    private final FinancialAlertService financialAlertService;
    // Raporlar v1.1 (R7): kategori/dönem bütçe-eşik alarmı. best-effort/non-fatal;
    // bütçe 0/null ise no-op (DEFAULT KAPALI, opt-in, debounce).
    private final BudgetThresholdService budgetThresholdService;
    // Ledger v2 (Faz A): tx mutasyonunda senkron çift-giriş Posting türetme.
    // current_balance snapshot facade'i AYNEN korunur; bunun YANINDA JournalEntry/
    // Posting türetilir → gün-kapanışı posting-tabanlı totalIn/totalOut API yoluyla
    // da dolar (boot/admin backfill ile aynı kurallar, idempotent marker
    // source_type+source_ref_id). create→derive, update→reverse+rederive, delete→reverse.
    private final LedgerPostingService ledgerPostingService;
    // Gün Açılışı: işlem-giriş enforcement (feature-flag arkasında, NON-BREAKING).
    // create/update'te ilgili işletme+tarih için gün AÇIK değilse 409 reddi.
    private final DayOpenService dayOpenService;

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

        // Ledger v2 (Faz A): tx silinmeden ÖNCE türetilmiş JournalEntry+Posting'leri
        // geri al (idempotent; yoksa no-op). source_ref_id=tx.id ile bağlı oldukları
        // için tx silinince yetim kalmasınlar → posting-tabanlı gün-kapanışı doğru
        // kalır. current_balance reversal yukarıda korundu.
        ledgerPostingService.reversePostingsForTransaction(transaction.getId());

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

        // Tier 2 (EVT-1): silme bank balance'ı geri çevirdi → işletme toplamı
        // eşik altına yeni geçtiyse BALANCE_BELOW alarmı (debounce). best-effort.
        financialAlertService.onBalanceChanged(business);
    }

    @Transactional
    public TransactionDto createTransaction(UUID businessId, CreateTransactionRequest request, UUID userId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        accessGuard.assertCanAccessBusiness(userId, businessId);

        // Gün Açılışı enforcement (feature-flag arkasında, NON-BREAKING): işlem
        // yalnız AÇIK güne girilebilir. Flag kapalıyken no-op (mevcut canlı akış
        // korunur). İşlem tarihi null ise bugün varsayılır.
        LocalDate entryDate = request.getDate() != null ? request.getDate() : LocalDate.now();
        dayOpenService.assertDayOpenForEntry(businessId, entryDate);

        // Kategori ZORUNLU + sıkı doğrulama. categoryId verilmeli; verilen
        // kategori business'a ait ve aktif olmalı. Paylaşımlı modelde yön-eşleşme
        // kontrolü YOK (kategori hem gelir hem giderde geçerli).
        TransactionDirection txDirection = TransactionDirection.valueOf(
                request.getDirection().toUpperCase(java.util.Locale.ENGLISH));
        Category category = resolveRequiredCategory(
                request.getCategoryId(), business.getId());

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
            bankAccount = resolveSystemCashHolder(businessId);
            if (bankAccount == null) {
                log.warn("[tx-create] NAKIT tx — business={} icin 'Genel Nakit' sistem hesabi bulunamadi; " +
                        "tx bank_account NULL kayit ediliyor (legacy fallback)", businessId);
            }
        }
        // BUG-2 (POS bank_account): POS GELİR tx'i create anında bir konum hesabına
        // bağlanmazsa (FE eskiden bank_account_id GÖNDERMİYORDU) posting türetiminde
        // resolveLocationAccount NULL döner → tx FLAGGED → posting üretilmez → POS
        // geliri gün-kapanışı/mutabakata GİRMEZ. Kullanıcı kasa seçtiyse (request.
        // getBankAccountId) o hesaba; seçmediyse NAKIT ile aynı sistem "Genel Nakit"
        // CASH_HOLDER fallback'ine route et → POS geliri doğru kasaya düşer + mutabakata
        // girer. (POS GİDER kendi pos_tx_subtype/related_bank_account akışını kullanır;
        // burada yalnız GELİR yönü ele alınır.)
        if ("POS".equals(pm) && bankAccount == null
                && "INCOME".equalsIgnoreCase(request.getDirection())) {
            bankAccount = resolveSystemCashHolder(businessId);
            if (bankAccount == null) {
                log.warn("[tx-create] POS gelir tx — business={} icin 'Genel Nakit' sistem hesabi " +
                        "bulunamadi; tx bank_account NULL — posting FLAGGED riski.", businessId);
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
                .direction(txDirection)
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
                // cat-be WP: tags request'ten ÇIKARILDI — yeni yazımda kullanılmaz
                // (kolon ve eski veri DB'de kalır; builder default boş liste).
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

        // Ledger v2 (Faz A): senkron çift-giriş Posting türetme (gün-kapanışı API E2E).
        // current_balance snapshot facade'i yukarıda korundu; bunun YANINDA dengeli
        // JournalEntry+Posting türetilir. Aynı JPA transaction içinde — tx ile atomik.
        // İdempotent (entry zaten varsa no-op); dengelenemeyen → FLAGGED (entry yok),
        // boot backfill ile aynı kurallar. Türetme tx create'i BOZMAMALI (non-fatal).
        deriveLedgerPostings(transaction.getId());

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

        // WP f1fa3cd5 + #91647f74: yeni işlem → NEW_TRANSACTION dispatch (admin'lere;
        // in-app default açık, Telegram opt-in). SPAM-KAÇIN: yalnız tutarı işletme-başına
        // eşiği AŞAN işlemlerde bildir (default eşik 10.000; 0 yazılırsa her işlemde).
        // Best-effort — dispatch katmanı hatayı yutar.
        boolean notifyNewTx = financialAlertService.shouldNotifyNewTransaction(
                business.getId(), transaction.getAmount());
        List<UUID> recipients = notifyNewTx
                ? userRepository.findByRoleIgnoreCase("admin")
                        .stream().map(com.bizboard.common.entity.User::getId).toList()
                : List.of();
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

        // Tier 2 (EVT-1): proaktif finansal alarmlar. best-effort/non-fatal;
        // eşik 0/null ise no-op. HIGH_EXPENSE: bu gider tutarı eşiği aşarsa.
        // BALANCE_BELOW: bank balance güncellendikten sonra işletme toplamı
        // eşik altına yeni geçtiyse (debounce).
        financialAlertService.onTransactionCreated(transaction, business);
        financialAlertService.onBalanceChanged(business);
        // Raporlar v1.1 (R7): bütçe-eşik aşımı (kategori/dönem). best-effort/
        // non-fatal; bütçe 0/null ise no-op (DEFAULT KAPALI, debounce).
        budgetThresholdService.onExpenseRecorded(transaction, business);

        return DtoMapper.toTransactionDto(transaction);
    }

    @Transactional
    public TransactionDto updateTransaction(UUID transactionId, UpdateTransactionRequest request, UUID userId) {
        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new IllegalArgumentException("Transaction not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        accessGuard.assertCanAccessBusiness(userId, transaction.getBusiness().getId());

        // Gün Açılışı enforcement (feature-flag arkasında, NON-BREAKING): düzenleme
        // de yalnız AÇIK güne yapılabilir. Tarih değişiyorsa YENİ tarih, değilse
        // mevcut tarih gating'e girer. Flag kapalıyken no-op.
        LocalDate effectiveDate = request.getDate() != null
                ? request.getDate() : transaction.getDate();
        dayOpenService.assertDayOpenForEntry(transaction.getBusiness().getId(), effectiveDate);

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
        // Kategori sıkı doğrulama + ZORUNLU. Paylaşımlı modelde kategori
        // yön-bağımsız; yön-eşleşme kontrolü YOK.
        // - categoryId verilirse: business'a ait + aktif olmalı.
        // - verilmezse: mevcut kategori (varsa) korunur — yön değişse bile
        //   paylaşımlı kategori yeni yönde de geçerlidir.
        // Sessizce null'a DÜŞÜRME yok; tx kategorisi her zaman dolu kalmalı.
        if (request.getCategoryId() != null) {
            UUID oldCategoryId = transaction.getCategory() != null ? transaction.getCategory().getId() : null;
            if (!java.util.Objects.equals(oldCategoryId, request.getCategoryId())) {
                Category category = resolveRequiredCategory(
                        request.getCategoryId(), transaction.getBusiness().getId());
                changes.put("categoryId", Map.of(
                        "from", oldCategoryId != null ? oldCategoryId.toString() : "null",
                        "to", request.getCategoryId().toString()));
                transaction.setCategory(category);
            }
        } else {
            // categoryId verilmedi — mevcut kategori dolu olmalı (zorunluluk).
            // Paylaşımlı modelde yön değişimi mevcut kategoriyi geçersiz kılmaz.
            Category current = transaction.getCategory();
            if (current == null) {
                throw new IllegalArgumentException(
                        "category_id zorunlu (her islem bir kategoriye bagli olmali)");
            }
        }
        // cat-be WP: tags request'ten yok sayılır — yeni yazımda kullanılmaz
        // (kolon ve eski veri DB'de kalır; mevcut değer korunur).
        if (request.getMetadata() != null) {
            // Metadata diff'i taşımıyoruz (JSONB serbest yapı); sadece güncellendi bayrağı.
            changes.put("metadataUpdated", true);
            transaction.setMetadata(request.getMetadata());
        }
        // v1.6.3: payment_method + pos_rate update
        if (request.getPaymentMethod() != null) {
            String newPmCandidate = normalizePaymentMethod(request.getPaymentMethod());
            if (!newPmCandidate.equals(transaction.getPaymentMethod())) {
                changes.put("paymentMethod", Map.of(
                        "from", transaction.getPaymentMethod() != null ? transaction.getPaymentMethod() : "NAKIT",
                        "to", newPmCandidate));
                transaction.setPaymentMethod(newPmCandidate);
                // NAKIT'e geçerse posRate temizle; POS'a geçerse aşağıda set olur
                if ("NAKIT".equals(newPmCandidate)) {
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
            validatePosCommissionRates(
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

        // Ledger v2 (Faz A): tx alanları (tutar/yön/tarih/hesap/kategori) değişmiş
        // olabilir → türetilmiş Posting'leri YENİDEN türet (reverse + rederive).
        // İdempotent reverse (yoksa no-op) + tek dengeli entry yeniden üretilir;
        // böylece posting-tabanlı gün-kapanışı totalIn/totalOut güncel kalır.
        // current_balance reconcile yukarıda korundu — Σ=0 invariant'ı bozulmaz.
        ledgerPostingService.reversePostingsForTransaction(transaction.getId());
        deriveLedgerPostings(transaction.getId());

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

        // Tier 2 (EVT-1): bank balance reconcile sonrası işletme toplamı eşik
        // altına yeni geçtiyse BALANCE_BELOW alarmı (debounce). HIGH_EXPENSE
        // yalnız create'te değerlendirilir (edit'te tekrar fire etmeyiz).
        financialAlertService.onBalanceChanged(transaction.getBusiness());

        TransactionDto dto = DtoMapper.toTransactionDto(transaction);
        dto.setBusinessName(transaction.getBusiness().getName());
        return dto;
    }

    // ───────── ledger posting türetme (Faz A senkron) ─────────

    /**
     * Ledger v2 (Faz A): bir tx için dengeli çift-giriş Posting'i senkron türetir.
     *
     * <p>Boot {@link TransactionPostingBackfillRunner} / admin
     * {@link LedgerAdminService} ile AYNI mantığı ({@link LedgerPostingService})
     * tx create/update mutasyonunun içinde çağırır → posting-tabanlı gün-kapanışı
     * {@code totalIn/totalOut} API yoluyla da dolar. İdempotent (entry varsa no-op);
     * dengelenemeyen tx FLAGGED (entry üretilmez), boot backfill ile aynı kural.</p>
     *
     * <p><b>Non-fatal:</b> türetme hatası tx mutasyonunu (snapshot facade +
     * current_balance) BOZMAZ — loglanır, atlanır; gerekirse admin backfill ile
     * (businessId-scoped) yeniden türetilebilir.</p>
     */
    private void deriveLedgerPostings(UUID txId) {
        if (txId == null) return;
        try {
            ledgerPostingService.deriveForTransactionId(txId);
        } catch (Exception e) {
            log.warn("[tx-mutation] tx={} senkron posting turetme hatasi (izole, atlandi): {}",
                    txId, e.getMessage());
        }
    }

    /**
     * Bir işletmenin sistem-managed "Genel Nakit" ({@code is_system=true},
     * {@code CASH_HOLDER}) hesabını döner; yoksa {@code null}. NAKIT ve POS-gelir
     * tx'leri bank_account_id belirtilmediğinde buraya route edilir → her tx bir
     * konum hesabına bağlanır, posting türetilebilir, gün-kapanışı/mutabakata girer.
     * {@link LedgerPostingService#resolveLocationAccount} NAKIT fallback'i ile aynı
     * filtre.
     */
    private com.bizboard.common.entity.BankAccount resolveSystemCashHolder(UUID businessId) {
        return bankAccountRepository
                .findByActiveTrueAndBusinessIdInOrderByNameAsc(java.util.List.of(businessId))
                .stream()
                .filter(ba -> ba.isSystem()
                        && ba.getType() == com.bizboard.common.enums.BankAccountType.CASH_HOLDER)
                .findFirst()
                .orElse(null);
    }

    // ───────── shared mutation helpers (create + update; R3) ─────────

    /**
     * Tx kategori çözümleme + ZORUNLU + sıkı doğrulama.
     *
     * <p>Paylaşımlı (yön-bağımsız) model: kategori hem gelir hem giderde
     * kullanılabilir; yön-eşleşme kontrolü YOKTUR. Kalan kurallar:</p>
     * <ul>
     *   <li>{@code categoryId == null} → 400 (kategori zorunlu).</li>
     *   <li>Kategori bulunamazsa → 400.</li>
     *   <li>Kategori başka işletmeye aitse → 400 (sızdırma yok, generic).</li>
     *   <li>Kategori pasif (soft-deleted) ise → 400 (yeni tx'e atanamaz).</li>
     * </ul>
     *
     * Sessizce null'a düşürme YOK — uyumsuzlukta her zaman anlamlı 400.
     */
    Category resolveRequiredCategory(UUID categoryId, UUID businessId) {
        if (categoryId == null) {
            throw new IllegalArgumentException(
                    "category_id zorunlu (her islem bir kategoriye bagli olmali)");
        }
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Kategori bulunamadi: " + categoryId));
        if (category.getBusiness() == null
                || !category.getBusiness().getId().equals(businessId)) {
            throw new IllegalArgumentException("Kategori bu isletmeye ait degil");
        }
        if (!category.isActive()) {
            throw new IllegalArgumentException(
                    "Pasif (silinmis) kategori yeni isleme atanamaz: " + category.getName());
        }
        return category;
    }

    static String normalizePaymentMethod(String raw) {
        if (raw == null || raw.isBlank()) return "NAKIT";
        String upper = raw.trim().toUpperCase(java.util.Locale.ENGLISH);
        if ("NAKIT".equals(upper))    return "NAKIT";
        if ("POS".equals(upper))      return "POS";
        if ("HESAPDAN".equals(upper)) return "HESAPDAN";
        throw new IllegalArgumentException(
                "Gecersiz odeme yontemi: '" + raw.trim() + "'. Gecerli degerler: NAKIT, POS, HESAPDAN");
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
