package com.bizboard.service;

import com.bizboard.common.dto.CreateTransferRequest;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.TransferDto;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

/**
 * v1.7.0-beta (Bankalar WP TODO abb90050 + c5ca0689 + 3993f396):
 * Banka hesapları arası transfer servisi — paired tx (Option B).
 *
 * <h3>Model</h3>
 * <ul>
 *   <li>Her transfer iki tx üretir: OUT (direction=EXPENSE) + IN (direction=INCOME).</li>
 *   <li>İki tx aynı {@code transferPairId} UUID'sini paylaşır.</li>
 *   <li>Her ikisi de {@code kind=TRANSFER}; raporlarda
 *       {@code kind='NORMAL'} filter'ı ile dışlanır.</li>
 *   <li>Bank balance'ları senkron güncellenir: from −= amount, to += amount.
 *       Toplam delta = 0 → MAIN ve sub-cash aggregate INVARIANT (d884a0ec) bozulmaz.</li>
 * </ul>
 *
 * <h3>Validation kuralları (c5ca0689)</h3>
 * <ul>
 *   <li>from != to</li>
 *   <li>Her ikisi de eligible: CHECKING/SAVINGS/CASH_HOLDER.
 *       MAIN_CASH ve SUB_CASH transfer kaynağı/hedefi OLAMAZ
 *       (zaten current_balance kalıcı 0).</li>
 *   <li>Aynı business — cross-tenant transfer YASAK</li>
 *   <li>Aynı currency (v1.7'de multi-currency yok)</li>
 *   <li>amount &gt; 0</li>
 *   <li>Bakiye yetersizse 200 + warning (block değil)</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TransferService {

    private final TransactionRepository transactionRepository;
    private final BankAccountRepository bankAccountRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    /** Transfer kaynağı/hedefi olamayacak tipler. */
    private static final EnumSet<BankAccountType> INELIGIBLE_TYPES =
            EnumSet.of(BankAccountType.MAIN_CASH, BankAccountType.SUB_CASH);

    @Transactional
    public TransferDto create(CreateTransferRequest req, UUID actorUserId) {
        if (req.getAmount() == null || req.getAmount().signum() <= 0) {
            throw new IllegalArgumentException("amount pozitif olmali");
        }
        // v1.7.x (Transfer UX): External mode — to_external_name dolu,
        // to_bank_account_id null. Sadece OUT tx (rapor dışı), kaynak bakiyesi düşer.
        String externalName = req.getToExternalName() != null ? req.getToExternalName().trim() : null;
        boolean external = externalName != null && !externalName.isBlank();
        if (external) {
            return createExternal(req, actorUserId, externalName);
        }
        if (req.getToBankAccountId() == null) {
            throw new IllegalArgumentException(
                    "Hedef hesap zorunlu (kayıtlı hesap için to_bank_account_id, dış hedef için to_external_name)");
        }
        if (req.getFromBankAccountId().equals(req.getToBankAccountId())) {
            throw new IllegalArgumentException("Kaynak ve hedef aynı hesap olamaz");
        }
        BankAccount from = bankAccountRepository.findById(req.getFromBankAccountId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Kaynak hesap bulunamadi: " + req.getFromBankAccountId()));
        BankAccount to = bankAccountRepository.findById(req.getToBankAccountId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Hedef hesap bulunamadi: " + req.getToBankAccountId()));

        // Eligibility
        if (INELIGIBLE_TYPES.contains(from.getType())) {
            throw new IllegalArgumentException(
                    "Kaynak hesap tipi transfer'e uygun degil: " + from.getType()
                            + " (MAIN_CASH ve SUB_CASH transfer yapamaz)");
        }
        if (INELIGIBLE_TYPES.contains(to.getType())) {
            throw new IllegalArgumentException(
                    "Hedef hesap tipi transfer'e uygun degil: " + to.getType()
                            + " (MAIN_CASH ve SUB_CASH transfer hedefi olamaz)");
        }

        // Same business (cross-tenant yasak)
        if (from.getBusiness() == null || to.getBusiness() == null
                || !from.getBusiness().getId().equals(to.getBusiness().getId())) {
            throw new IllegalArgumentException(
                    "Cross-tenant transfer yasak: kaynak ve hedef ayni isletmede olmali");
        }
        UUID businessId = from.getBusiness().getId();
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);

        // v1.7.0.x: Aynı firma (MyCompany) kuralı — kaynak ve hedef hesap aynı
        // firmamıza ait olmalı. Her ikisinin de firması varsa eşit olmalı; biri
        // null diğeri set ise yasak. İkisi de null ise (henüz atama yapılmamış) izin.
        UUID fromFirmId = from.getOwnerMyCompany() != null ? from.getOwnerMyCompany().getId() : null;
        UUID toFirmId = to.getOwnerMyCompany() != null ? to.getOwnerMyCompany().getId() : null;
        if (!java.util.Objects.equals(fromFirmId, toFirmId)) {
            throw new IllegalArgumentException(
                    "Farkli firma'ya transfer yasak: kaynak ve hedef hesap ayni Firmalarim'a ait olmali "
                            + "(from firma=" + (fromFirmId != null ? fromFirmId : "yok")
                            + ", to firma=" + (toFirmId != null ? toFirmId : "yok") + ")");
        }

        // Aktiflik kontrolü
        if (!from.isActive() || !to.isActive()) {
            throw new IllegalArgumentException("Pasif hesaba transfer yapilamaz");
        }
        // Currency uyumu (v1.7: aynı currency zorunlu)
        if (!java.util.Objects.equals(
                java.util.Optional.ofNullable(from.getCurrency()).orElse("TRY"),
                java.util.Optional.ofNullable(to.getCurrency()).orElse("TRY"))) {
            throw new IllegalArgumentException(
                    "Farkli currency transferi v1.7'de desteklenmiyor (from="
                            + from.getCurrency() + ", to=" + to.getCurrency() + ")");
        }

        Business business = from.getBusiness();
        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        UUID pairId = UUID.randomUUID();
        String currency = java.util.Optional.ofNullable(from.getCurrency()).orElse("TRY");
        String description = req.getDescription();
        BigDecimal amount = req.getAmount();

        // OUT tx (kaynak — direction=EXPENSE, kind=TRANSFER)
        Transaction outTx = Transaction.builder()
                .business(business)
                .direction(TransactionDirection.EXPENSE)
                .kind(TransactionKind.TRANSFER)
                .transferPairId(pairId)
                .amount(amount)
                .currency(currency)
                .description(description)
                .date(req.getDate())
                .paymentMethod("HESAPDAN")
                .bankAccount(from)
                .createdBy(actor)
                .build();
        outTx = transactionRepository.save(outTx);

        // IN tx (hedef — direction=INCOME, kind=TRANSFER)
        Transaction inTx = Transaction.builder()
                .business(business)
                .direction(TransactionDirection.INCOME)
                .kind(TransactionKind.TRANSFER)
                .transferPairId(pairId)
                .amount(amount)
                .currency(currency)
                .description(description)
                .date(req.getDate())
                .paymentMethod("HESAPDAN")
                .bankAccount(to)
                .createdBy(actor)
                .build();
        inTx = transactionRepository.save(inTx);

        // Bank balance update (atomic — aynı transaction)
        BigDecimal fromBal = from.getCurrentBalance() != null
                ? from.getCurrentBalance() : BigDecimal.ZERO;
        String lowBalanceWarning = null;
        if (fromBal.compareTo(amount) < 0) {
            lowBalanceWarning = "Kaynak hesap bakiyesi yetersiz (mevcut: "
                    + fromBal.toPlainString() + " " + currency
                    + "); transfer yine de oluşturuldu — bakiye negatife düşecek.";
            log.warn("[transfer] low balance: from={} balance={} amount={}",
                    from.getName(), fromBal, amount);
        }
        from.setCurrentBalance(fromBal.subtract(amount));
        BigDecimal toBal = to.getCurrentBalance() != null
                ? to.getCurrentBalance() : BigDecimal.ZERO;
        to.setCurrentBalance(toBal.add(amount));
        bankAccountRepository.save(from);
        bankAccountRepository.save(to);

        // Audit
        auditLogService.recordEntityAction(
                "TRANSFER_CREATE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "TRANSFER", pairId,
                "Transfer: " + from.getName() + " -> " + to.getName() + " " + amount + " " + currency,
                Map.of(
                        "pairId", pairId,
                        "fromBankAccountId", from.getId(),
                        "toBankAccountId", to.getId(),
                        "amount", amount,
                        "lowBalanceWarning", lowBalanceWarning != null));
        log.info("[transfer] {} -> {} {} {} (pair={})",
                from.getName(), to.getName(), amount, currency, pairId);

        return buildDto(outTx, inTx, lowBalanceWarning);
    }

    /**
     * v1.7.0-beta (TODO abb90050): Transfer detay — pair'in iki tarafı.
     */
    @Transactional(readOnly = true)
    public TransferDto getByPairId(UUID pairId, UUID actorUserId) {
        List<Transaction> pair = transactionRepository
                .findByTransferPairIdOrderByDirectionAsc(pairId);
        if (pair.isEmpty()) {
            throw new IllegalArgumentException("Transfer bulunamadi: " + pairId);
        }
        if (pair.size() != 2) {
            log.error("[transfer] pair size anormal: {} -> {}", pairId, pair.size());
            throw new IllegalStateException("Transfer pair bozuk (size=" + pair.size() + ")");
        }
        UUID bizId = pair.get(0).getBusiness() != null
                ? pair.get(0).getBusiness().getId() : null;
        accessGuard.assertCanReadBusiness(actorUserId, bizId);

        // direction sırasını netleştir — EXPENSE first (OUT), INCOME second (IN)
        Transaction outTx = pair.stream()
                .filter(t -> t.getDirection() == TransactionDirection.EXPENSE)
                .findFirst().orElseThrow();
        Transaction inTx = pair.stream()
                .filter(t -> t.getDirection() == TransactionDirection.INCOME)
                .findFirst().orElseThrow();
        return buildDto(outTx, inTx, null);
    }

    /**
     * v1.7.0-beta (TODO 3993f396): Transfer silme — atomic her iki tarafı.
     * Bakiye reversal: from += amount, to -= amount.
     * Single-side delete YASAK — TransactionService.delete guard'i 400 döner.
     */
    @Transactional
    public void deleteByPairId(UUID pairId, UUID actorUserId) {
        List<Transaction> pair = transactionRepository
                .findByTransferPairIdOrderByDirectionAsc(pairId);
        if (pair.isEmpty()) {
            throw new IllegalArgumentException("Transfer bulunamadi: " + pairId);
        }
        if (pair.size() != 2) {
            throw new IllegalStateException("Transfer pair bozuk; manuel inceleme gerek.");
        }
        UUID bizId = pair.get(0).getBusiness() != null
                ? pair.get(0).getBusiness().getId() : null;
        accessGuard.assertCanAccessBusiness(actorUserId, bizId);

        Transaction outTx = pair.stream()
                .filter(t -> t.getDirection() == TransactionDirection.EXPENSE)
                .findFirst().orElseThrow();
        Transaction inTx = pair.stream()
                .filter(t -> t.getDirection() == TransactionDirection.INCOME)
                .findFirst().orElseThrow();

        // Balance reversal
        BankAccount fromAcc = outTx.getBankAccount();
        BankAccount toAcc = inTx.getBankAccount();
        BigDecimal amount = outTx.getAmount();
        if (fromAcc != null) {
            fromAcc.setCurrentBalance(
                    (fromAcc.getCurrentBalance() != null ? fromAcc.getCurrentBalance() : BigDecimal.ZERO)
                            .add(amount));
            bankAccountRepository.save(fromAcc);
        }
        if (toAcc != null) {
            toAcc.setCurrentBalance(
                    (toAcc.getCurrentBalance() != null ? toAcc.getCurrentBalance() : BigDecimal.ZERO)
                            .subtract(amount));
            bankAccountRepository.save(toAcc);
        }

        transactionRepository.delete(outTx);
        transactionRepository.delete(inTx);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        auditLogService.recordEntityAction(
                "TRANSFER_DELETE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "TRANSFER", pairId,
                "Transfer silindi: " + (fromAcc != null ? fromAcc.getName() : "?")
                        + " -> " + (toAcc != null ? toAcc.getName() : "?")
                        + " " + amount,
                Map.of("pairId", pairId, "amount", amount));
        log.info("[transfer] deleted pair={} amount={}", pairId, amount);
    }

    // ─────────────────────── external (v1.7.x Transfer UX) ───────────────────────

    /**
     * Dış hedefe transfer — yalnız OUT tx oluşur. Kaynak bakiyesi düşer,
     * paired IN yok. Raporlar kind!=NORMAL filter ile bunu zaten dışlar.
     */
    private TransferDto createExternal(CreateTransferRequest req, UUID actorUserId, String externalName) {
        BankAccount from = bankAccountRepository.findById(req.getFromBankAccountId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Kaynak hesap bulunamadi: " + req.getFromBankAccountId()));
        if (INELIGIBLE_TYPES.contains(from.getType())) {
            throw new IllegalArgumentException(
                    "Kaynak hesap tipi transfer'e uygun degil: " + from.getType()
                            + " (MAIN_CASH ve SUB_CASH transfer yapamaz)");
        }
        if (from.getBusiness() == null) {
            throw new IllegalArgumentException("Kaynak hesap business'a bağlı değil");
        }
        UUID businessId = from.getBusiness().getId();
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        if (!from.isActive()) {
            throw new IllegalArgumentException("Pasif hesaptan transfer yapilamaz");
        }

        Business business = from.getBusiness();
        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        String currency = java.util.Optional.ofNullable(from.getCurrency()).orElse("TRY");
        BigDecimal amount = req.getAmount();
        String userDescription = req.getDescription();
        // Description: "Transfer → <name>" prefix + user description (varsa).
        String description = "Transfer → " + externalName
                + (userDescription != null && !userDescription.isBlank()
                        ? " · " + userDescription : "");

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("external_target", externalName);
        metadata.put("transfer_mode", "external");

        // Tek OUT tx — pair_id NULL (paired değil)
        Transaction outTx = Transaction.builder()
                .business(business)
                .direction(TransactionDirection.EXPENSE)
                .kind(TransactionKind.TRANSFER)
                .transferPairId(null)
                .amount(amount)
                .currency(currency)
                .description(description)
                .date(req.getDate())
                .paymentMethod("HESAPDAN")
                .bankAccount(from)
                .metadata(metadata)
                .createdBy(actor)
                .build();
        outTx = transactionRepository.save(outTx);

        // Bakiye düşür
        BigDecimal fromBal = from.getCurrentBalance() != null
                ? from.getCurrentBalance() : BigDecimal.ZERO;
        String lowBalanceWarning = null;
        if (fromBal.compareTo(amount) < 0) {
            lowBalanceWarning = "Kaynak hesap bakiyesi yetersiz (mevcut: "
                    + fromBal.toPlainString() + " " + currency
                    + "); transfer yine de oluşturuldu — bakiye negatife düşecek.";
            log.warn("[transfer-ext] low balance: from={} balance={} amount={}",
                    from.getName(), fromBal, amount);
        }
        from.setCurrentBalance(fromBal.subtract(amount));
        bankAccountRepository.save(from);

        auditLogService.recordEntityAction(
                "TRANSFER_CREATE_EXTERNAL",
                actorUserId, actor != null ? actor.getUsername() : null,
                "TRANSFER", outTx.getId(),
                "Dis transfer: " + from.getName() + " -> " + externalName
                        + " " + amount + " " + currency,
                Map.of(
                        "fromBankAccountId", from.getId(),
                        "externalTarget", externalName,
                        "amount", amount,
                        "lowBalanceWarning", lowBalanceWarning != null));
        log.info("[transfer-ext] {} -> {} {} {} (txId={})",
                from.getName(), externalName, amount, currency, outTx.getId());

        return TransferDto.builder()
                .transferPairId(null) // external'da pair yok
                .businessId(businessId)
                .amount(amount)
                .currency(currency)
                .date(req.getDate())
                .description(description)
                .outTx(DtoMapper.toTransactionDto(outTx))
                .inTx(null)
                .fromBankAccountId(from.getId())
                .fromBankAccountName(from.getName())
                .toBankAccountId(null)
                .toBankAccountName(externalName)
                .lowBalanceWarning(lowBalanceWarning)
                .build();
    }

    // ─────────────────────── helpers ───────────────────────

    private TransferDto buildDto(Transaction outTx, Transaction inTx, String warning) {
        BankAccount from = outTx.getBankAccount();
        BankAccount to = inTx.getBankAccount();
        return TransferDto.builder()
                .transferPairId(outTx.getTransferPairId())
                .businessId(outTx.getBusiness() != null ? outTx.getBusiness().getId() : null)
                .amount(outTx.getAmount())
                .currency(outTx.getCurrency())
                .date(outTx.getDate())
                .description(outTx.getDescription())
                .outTx(DtoMapper.toTransactionDto(outTx))
                .inTx(DtoMapper.toTransactionDto(inTx))
                .fromBankAccountId(from != null ? from.getId() : null)
                .fromBankAccountName(from != null ? from.getName() : null)
                .toBankAccountId(to != null ? to.getId() : null)
                .toBankAccountName(to != null ? to.getName() : null)
                .lowBalanceWarning(warning)
                .build();
    }

    /** v1.7.0-beta yardımcı — açıklama için. Field name'i ortaya çıkarmak için. */
    @SuppressWarnings("unused")
    private static TransactionDto _unused(Transaction t) {
        return DtoMapper.toTransactionDto(t);
    }
}
