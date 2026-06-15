package com.bizboard.service;

import com.bizboard.common.dto.CreatePaymentRequest;
import com.bizboard.common.dto.PaymentResponseDto;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.CategoryApplicability;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.*;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * v1.7.x WP fbb2ef55: Cari hesap ödeme servisi.
 *
 * <p>POST /counterparts/{id}/payments akışı: nakit/havale → tx; çek/senet →
 * payment_instrument. Her durumda debt_payments kaydı oluşur + ilgili debt'lerin
 * remaining_amount + status değerleri atomic güncellenir. Allocations
 * verilmezse FIFO (due_date ASC NULLS LAST, created_at ASC).
 * Overpayment varsa negatif debt (avans) açılır.</p>
 *
 * <p>Tüm methodlar tek DB transaction içinde çalışır; herhangi bir adım
 * fail → tüm değişiklikler rollback.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final CounterpartRepository counterpartRepository;
    private final DebtRepository debtRepository;
    private final DebtPaymentRepository debtPaymentRepository;
    private final PaymentInstrumentRepository paymentInstrumentRepository;
    private final TransactionRepository transactionRepository;
    private final BankAccountRepository bankAccountRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final CounterpartLedgerService counterpartLedger;
    // WP f1fa3cd5 (otomasyon): ödeme alındı → PAYMENT_RECEIVED dispatch.
    private final NotificationDispatchService dispatchService;
    // Çatı v1.2: cari kapatma tx'i kind=LOAN → dengeli Posting türetme + sistem
    // "Borç" kategorisi (category_id NOT NULL kısıtı; P&L'e girmez).
    private final CategoryRepository categoryRepository;
    private final LedgerPostingService ledgerPostingService;

    private static final EnumSet<BankAccountType> ELIGIBLE_BANK_TYPES =
            EnumSet.of(BankAccountType.CHECKING, BankAccountType.SAVINGS, BankAccountType.CASH_HOLDER);

    /**
     * Cari hesap ödeme oluştur.
     *
     * @param counterpartId hedef counterpart
     * @param req           request body
     * @param actorUserId   JWT'den
     */
    @Transactional
    public PaymentResponseDto createPayment(UUID counterpartId, CreatePaymentRequest req, UUID actorUserId) {
        // ── Validation ──────────────────────────────────────────────
        if (req.getAmount() == null || req.getAmount().signum() <= 0) {
            throw new IllegalArgumentException("amount pozitif olmalı");
        }
        String dir = req.getPaymentDirection();
        if (!"RECEIVED".equals(dir) && !"PAID".equals(dir)) {
            throw new IllegalArgumentException("payment_direction RECEIVED veya PAID olmalı");
        }
        String pm = req.getPaymentMethod();
        if (pm == null) {
            throw new IllegalArgumentException("payment_method zorunlu");
        }
        if (!Arrays.asList("NAKIT", "HESAPDAN", "CHEQUE", "PROMISSORY_NOTE").contains(pm)) {
            throw new IllegalArgumentException("payment_method geçersiz: " + pm);
        }
        if (req.getPaymentDate() == null) {
            throw new IllegalArgumentException("payment_date zorunlu");
        }

        Counterpart counterpart = counterpartRepository.findById(counterpartId)
                .orElseThrow(() -> new IllegalArgumentException("Counterpart bulunamadı: " + counterpartId));
        Business business = counterpart.getBusiness();
        if (business == null) {
            throw new IllegalArgumentException("Counterpart'ın business'ı yok");
        }
        accessGuard.assertCanAccessBusiness(actorUserId, business.getId());
        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;

        // Method-specific validation
        BankAccount bankAccount = null;
        if ("HESAPDAN".equals(pm)) {
            if (req.getBankAccountId() == null) {
                throw new IllegalArgumentException("HESAPDAN için bank_account_id zorunlu");
            }
            bankAccount = bankAccountRepository.findById(req.getBankAccountId())
                    .orElseThrow(() -> new IllegalArgumentException("Bank account bulunamadı"));
            if (bankAccount.getBusiness() == null || !bankAccount.getBusiness().getId().equals(business.getId())) {
                throw new IllegalArgumentException("Bank account farklı business'a ait");
            }
            if (!bankAccount.isActive()) {
                throw new IllegalArgumentException("Pasif bank account'a ödeme yapılamaz");
            }
            if (bankAccount.getType() == null || !ELIGIBLE_BANK_TYPES.contains(bankAccount.getType())) {
                throw new IllegalArgumentException(
                        "Bank account tipi uygun değil: " + bankAccount.getType());
            }
        }
        if ("CHEQUE".equals(pm)) {
            if (req.getChequeDetails() == null
                    || req.getChequeDetails().getChequeNumber() == null
                    || req.getChequeDetails().getChequeNumber().isBlank()
                    || req.getChequeDetails().getDrawerBank() == null
                    || req.getChequeDetails().getDrawerBank().isBlank()
                    || req.getChequeDetails().getDueDate() == null) {
                throw new IllegalArgumentException("CHEQUE için cheque_number + drawer_bank + due_date zorunlu");
            }
        }
        if ("PROMISSORY_NOTE".equals(pm)) {
            if (req.getNoteDetails() == null
                    || req.getNoteDetails().getNoteSerial() == null
                    || req.getNoteDetails().getNoteSerial().isBlank()
                    || req.getNoteDetails().getDueDate() == null) {
                throw new IllegalArgumentException("PROMISSORY_NOTE için note_serial + due_date zorunlu");
            }
        }

        // Allocations validation (verildiyse)
        DebtDirection targetDirection = "RECEIVED".equals(dir) ? DebtDirection.RECEIVABLE : DebtDirection.PAYABLE;
        if (req.getAllocations() != null && !req.getAllocations().isEmpty()) {
            BigDecimal allocSum = BigDecimal.ZERO;
            for (CreatePaymentRequest.Allocation a : req.getAllocations()) {
                if (a.getDebtId() == null || a.getAmount() == null || a.getAmount().signum() <= 0) {
                    throw new IllegalArgumentException("Allocation debt_id + pozitif amount içermeli");
                }
                Debt d = debtRepository.findById(a.getDebtId())
                        .orElseThrow(() -> new IllegalArgumentException(
                                "Debt bulunamadı: " + a.getDebtId()));
                if (d.getCounterpartRef() == null || !d.getCounterpartRef().getId().equals(counterpartId)) {
                    throw new IllegalArgumentException(
                            "Debt " + a.getDebtId() + " başka counterpart'a ait");
                }
                if (d.getDirection() != targetDirection) {
                    throw new IllegalArgumentException(
                            "Debt " + a.getDebtId() + " direction'u " + targetDirection + " olmalı");
                }
                String status = d.getStatus() != null ? d.getStatus() : "OPEN";
                if (!"OPEN".equals(status) && !"PARTIAL".equals(status)) {
                    throw new IllegalArgumentException(
                            "Debt " + a.getDebtId() + " status'u OPEN veya PARTIAL olmalı (mevcut: " + status + ")");
                }
                BigDecimal rem = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
                if (a.getAmount().compareTo(rem) > 0) {
                    throw new IllegalArgumentException(
                            "Debt " + a.getDebtId() + " kalan tutarından fazla allocate edilemez (kalan: " + rem + ")");
                }
                allocSum = allocSum.add(a.getAmount());
            }
            if (allocSum.compareTo(req.getAmount()) != 0) {
                throw new IllegalArgumentException(
                        "Allocations toplamı (" + allocSum + ") payment amount'a (" + req.getAmount() + ") eşit olmalı");
            }
        }

        // ── STEP A: Instrument / transaction oluştur ──────────────
        Transaction linkedTx = null;
        PaymentInstrument linkedInstrument = null;

        if ("NAKIT".equals(pm) || "HESAPDAN".equals(pm)) {
            BankAccount txBank = bankAccount;
            if ("NAKIT".equals(pm) && txBank == null) {
                // Default Genel Nakit CASH_HOLDER bul
                txBank = bankAccountRepository
                        .findByActiveTrueAndBusinessIdInOrderByNameAsc(List.of(business.getId()))
                        .stream()
                        .filter(ba -> ba.isSystem()
                                && ba.getType() == BankAccountType.CASH_HOLDER)
                        .findFirst()
                        .orElse(null);
            }
            TransactionDirection txDir = "RECEIVED".equals(dir)
                    ? TransactionDirection.INCOME : TransactionDirection.EXPENSE;
            String txPm = "NAKIT".equals(pm) ? "NAKIT" : "HESAPDAN";
            // Çatı v1.2: cari tahsilat/ödeme = alacak/verecek KAPATMA = kasa ↔ cari
            // bilanço hareketi (gelir/gider DEĞİL). kind=LOAN ile P&L'e GİRMEZ
            // (Net Kâr'a yansımaz; gelir/satış zaten orijinal işlemde tanındı).
            // category_id NOT NULL kısıtı için sistem "Borç" kategorisi (P&L'e
            // girmez — LOAN posting'i yalnız LOCATION_MOVE bacağı üretir).
            Category loanCat = resolveLoanCategory(business);
            Transaction tx = Transaction.builder()
                    .business(business)
                    .direction(txDir)
                    .kind(TransactionKind.LOAN)
                    .amount(req.getAmount())
                    .currency(counterpart.getBusiness().getCurrency() != null
                            ? counterpart.getBusiness().getCurrency() : "TRY")
                    .paymentMethod(txPm)
                    .bankAccount(txBank)
                    .category(loanCat)
                    .targetCounterpart(counterpart)
                    .date(req.getPaymentDate())
                    .description(buildPaymentDescription(req, counterpart))
                    .createdBy(actor)
                    .build();
            tx = transactionRepository.save(tx);
            linkedTx = tx;

            // Ledger v2: dengeli çift-giriş Posting türet (kind=LOAN → iki
            // LOCATION_MOVE bacağı, PNL YOK, Σ=0). Non-fatal — ödeme akışını bozmaz.
            try {
                ledgerPostingService.deriveForTransactionId(tx.getId());
            } catch (Exception e) {
                log.warn("[payment] tx={} posting türetme hatası (izole, atlandı): {}",
                        tx.getId(), e.getMessage());
            }

            // Bank balance update — FİNANSAL KURAL (kullanıcı onayı Z, 2026-06):
            // bu tx kind=LOAN (cari tahsilat/ödeme = alacak/verecek KAPATMA).
            // Tahsilat/LOAN OPERASYONEL KASAYA (Genel Kasa) YANSIMAZ — gelir/satış
            // zaten orijinal işlemde tanındı. CASH_HOLDER/HESAPDAN current_balance
            // BUMPLANMAZ; LedgerPostingService LOAN posting'i de kasaya yansımaz
            // (her iki bacak account=NULL). Cari bakiye Debt entity'sinden okunur,
            // değişmez. (Non-LOAN ödemeler bu metodda üretilmiyor — hepsi LOAN.)
        } else if ("CHEQUE".equals(pm)) {
            CreatePaymentRequest.ChequeDetails cd = req.getChequeDetails();
            PaymentInstrument inst = PaymentInstrument.builder()
                    .business(business)
                    .counterpart(counterpart)
                    .instrumentType("CHEQUE")
                    .direction("RECEIVED".equals(dir) ? "INCOMING" : "OUTGOING")
                    .amount(req.getAmount())
                    .currency("TRY")
                    .issueDate(req.getPaymentDate())
                    .dueDate(cd.getDueDate())
                    .chequeNumber(cd.getChequeNumber())
                    .drawerBank(cd.getDrawerBank())
                    .drawerBranch(cd.getDrawerBranch())
                    .status("PORTFOLIO")
                    .description(req.getDescription())
                    .createdBy(actor)
                    .build();
            inst = paymentInstrumentRepository.save(inst);
            linkedInstrument = inst;
        } else { // PROMISSORY_NOTE
            CreatePaymentRequest.NoteDetails nd = req.getNoteDetails();
            PaymentInstrument inst = PaymentInstrument.builder()
                    .business(business)
                    .counterpart(counterpart)
                    .instrumentType("PROMISSORY_NOTE")
                    .direction("RECEIVED".equals(dir) ? "INCOMING" : "OUTGOING")
                    .amount(req.getAmount())
                    .currency("TRY")
                    .issueDate(req.getPaymentDate())
                    .dueDate(nd.getDueDate())
                    .noteSerial(nd.getNoteSerial())
                    .status("PORTFOLIO")
                    .description(req.getDescription())
                    .createdBy(actor)
                    .build();
            inst = paymentInstrumentRepository.save(inst);
            linkedInstrument = inst;
        }

        // ── STEP B + C: Allocation + debt_payments kayıtları ───────
        List<PaymentResponseDto.DebtUpdate> updates = new ArrayList<>();
        PaymentResponseDto.OverpaymentInfo overpayInfo = null;

        if (req.getAllocations() != null && !req.getAllocations().isEmpty()) {
            for (CreatePaymentRequest.Allocation a : req.getAllocations()) {
                Debt d = debtRepository.findById(a.getDebtId()).orElseThrow();
                applyAllocation(d, a.getAmount());
                debtRepository.save(d);
                createDebtPaymentRow(business, counterpart, d, dir, pm,
                        a.getAmount(), req.getPaymentDate(), linkedTx, bankAccount,
                        linkedInstrument, req.getDescription(), actor);
                updates.add(PaymentResponseDto.DebtUpdate.builder()
                        .debtId(d.getId())
                        .remainingAfter(d.getRemainingAmount())
                        .status(d.getStatus())
                        .build());
            }
        } else {
            // FIFO
            BigDecimal remaining = req.getAmount();
            List<Debt> openDebts = debtRepository.findOpenByCounterpartFifo(
                    business.getId(), counterpartId, targetDirection);
            for (Debt d : openDebts) {
                if (remaining.signum() <= 0) break;
                BigDecimal rem = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
                if (rem.signum() <= 0) continue;
                BigDecimal apply = remaining.min(rem);
                applyAllocation(d, apply);
                debtRepository.save(d);
                createDebtPaymentRow(business, counterpart, d, dir, pm,
                        apply, req.getPaymentDate(), linkedTx, bankAccount,
                        linkedInstrument, req.getDescription(), actor);
                updates.add(PaymentResponseDto.DebtUpdate.builder()
                        .debtId(d.getId())
                        .remainingAfter(d.getRemainingAmount())
                        .status(d.getStatus())
                        .build());
                remaining = remaining.subtract(apply);
            }
            // Overpayment → avans (ters direction'da yeni debt)
            if (remaining.signum() > 0) {
                DebtDirection avansDir = "RECEIVED".equals(dir)
                        ? DebtDirection.PAYABLE   // alacak tahsil ettik, fazlası: biz borçluyuz
                        : DebtDirection.RECEIVABLE; // ödeme yaptık, fazlası: bizim alacağımız
                Debt avans = Debt.builder()
                        .business(business)
                        .direction(avansDir)
                        .counterparty(counterpart.getName())
                        .counterpartRef(counterpart)
                        .amount(remaining)
                        .remainingAmount(remaining)
                        .status("OPEN")
                        .currency("TRY")
                        .instrumentType("AVANS")
                        .description("Avans: ödeme fazlası (payment_date=" + req.getPaymentDate() + ")")
                        .settled(false)
                        .createdBy(actor)
                        .build();
                avans = debtRepository.save(avans);
                createDebtPaymentRow(business, counterpart, avans, dir, pm,
                        remaining, req.getPaymentDate(), linkedTx, bankAccount,
                        linkedInstrument, "Avans (overpayment)", actor);
                overpayInfo = PaymentResponseDto.OverpaymentInfo.builder()
                        .debtId(avans.getId())
                        .amount(remaining)
                        .build();
                updates.add(PaymentResponseDto.DebtUpdate.builder()
                        .debtId(avans.getId())
                        .remainingAfter(remaining)
                        .status("OPEN")
                        .build());
            }
        }

        // Counterpart current_balance yeniden hesapla
        counterpartLedger.recompute(counterpartId);

        // Audit
        UUID auditRef = linkedTx != null ? linkedTx.getId()
                : linkedInstrument != null ? linkedInstrument.getId() : null;
        auditLogService.recordEntityAction(
                "PAYMENT_CREATE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "PAYMENT", auditRef,
                "Ödeme " + dir + " " + pm + " " + req.getAmount() + " → " + counterpart.getName(),
                Map.of(
                        "counterpartId", counterpartId,
                        "direction", dir,
                        "method", pm,
                        "amount", req.getAmount(),
                        "txId", linkedTx != null ? linkedTx.getId() : "null",
                        "instrumentId", linkedInstrument != null ? linkedInstrument.getId() : "null",
                        "overpayment", overpayInfo != null));

        // WP f1fa3cd5 + #a95afa5e: cari ödeme dispatch — simetrik.
        // RECEIVED (tahsilat) → "Ödeme alındı"; PAID (biz ödedik) → "Ödeme yapıldı".
        // İkisi de in-app default açık, Telegram opt-in. Best-effort.
        NotificationEvent paymentEvent = "RECEIVED".equals(dir)
                ? NotificationEvent.PAYMENT_RECEIVED
                : NotificationEvent.PAYMENT_MADE;
        List<UUID> recipients = userRepository.findByRoleIgnoreCase("admin")
                .stream().map(User::getId).toList();
        if (!recipients.isEmpty()) {
            dispatchService.dispatch(
                    paymentEvent,
                    recipients,
                    Map.of(
                            "counterparty", counterpart.getName() != null ? counterpart.getName() : "",
                            "amount", req.getAmount().toPlainString(),
                            "currency", business.getCurrency() != null ? business.getCurrency() : "TRY"
                    ),
                    "/dashboard/counterparts/" + counterpartId,
                    business.getId());
        }

        return PaymentResponseDto.builder()
                .paymentId(auditRef) // first debt_payment id de olabilir; basit tutuyoruz
                .linkedTransactionId(linkedTx != null ? linkedTx.getId() : null)
                .linkedInstrumentId(linkedInstrument != null ? linkedInstrument.getId() : null)
                .debtsUpdated(updates)
                .overpaymentCreated(overpayInfo)
                .build();
    }

    // ───────────────────────── Instrument lifecycle ─────────────────────────

    @Transactional
    public PaymentInstrument clearInstrument(UUID instrumentId, UUID bankAccountId,
                                              LocalDateTime clearedAt, UUID actorUserId) {
        PaymentInstrument inst = paymentInstrumentRepository.findById(instrumentId)
                .orElseThrow(() -> new IllegalArgumentException("Instrument bulunamadı"));
        if (inst.getBusiness() == null) {
            throw new IllegalArgumentException("Instrument business'a bağlı değil");
        }
        accessGuard.assertCanAccessBusiness(actorUserId, inst.getBusiness().getId());

        if (!"PORTFOLIO".equals(inst.getStatus())) {
            throw new IllegalStateException("Sadece PORTFOLIO instrument tahsil edilebilir (mevcut: " + inst.getStatus() + ")");
        }
        if (bankAccountId == null) {
            throw new IllegalArgumentException("bank_account_id zorunlu");
        }
        BankAccount bank = bankAccountRepository.findById(bankAccountId)
                .orElseThrow(() -> new IllegalArgumentException("Bank account bulunamadı"));
        if (bank.getBusiness() == null || !bank.getBusiness().getId().equals(inst.getBusiness().getId())) {
            throw new IllegalArgumentException("Bank account farklı business'a ait");
        }
        if (!bank.isActive() || bank.getType() == null
                || !ELIGIBLE_BANK_TYPES.contains(bank.getType())) {
            throw new IllegalArgumentException("Bank account uygun değil");
        }

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        LocalDateTime when = clearedAt != null ? clearedAt : LocalDateTime.now();

        // FİNANSAL KURAL (kullanıcı onayı Z, 2026-06): çek/senet tahsili =
        // cari kapatma = kind=LOAN. Tahsilat/LOAN OPERASYONEL KASAYA (Genel Kasa)
        // YANSIMAZ — bu yüzden tahsil edilen hesabın current_balance'ı
        // BUMPLANMAZ (createPayment ile simetrik). LedgerPostingService LOAN
        // posting'i de kasaya yansımaz (her iki bacak account=NULL). Cari bakiye
        // Debt entity'sinden okunur; instrument lifecycle (PORTFOLIO→CLEARED)
        // ayrı izlenir.

        // tx açılır
        TransactionDirection txDir = "INCOMING".equals(inst.getDirection())
                ? TransactionDirection.INCOME : TransactionDirection.EXPENSE;
        String descPrefix = "CHEQUE".equals(inst.getInstrumentType())
                ? ("Çek tahsil: " + (inst.getChequeNumber() != null ? inst.getChequeNumber() : "?"))
                : ("Senet tahsil: " + (inst.getNoteSerial() != null ? inst.getNoteSerial() : "?"));
        // Çatı v1.2: çek/senet tahsili = cari kapatma = bilanço hareketi (kind=LOAN,
        // P&L'e girmez) + sistem "Borç" kategorisi (category_id NOT NULL kısıtı).
        Category instCat = resolveLoanCategory(inst.getBusiness());
        Transaction tx = Transaction.builder()
                .business(inst.getBusiness())
                .direction(txDir)
                .kind(TransactionKind.LOAN)
                .amount(inst.getAmount())
                .currency(inst.getCurrency())
                .paymentMethod("HESAPDAN")
                .bankAccount(bank)
                .category(instCat)
                .targetCounterpart(inst.getCounterpart())
                .date(when.toLocalDate())
                .description(descPrefix)
                .createdBy(actor)
                .build();
        tx = transactionRepository.save(tx);

        // Ledger v2: dengeli Posting türet (kind=LOAN → LOCATION_MOVE, PNL YOK).
        try {
            ledgerPostingService.deriveForTransactionId(tx.getId());
        } catch (Exception e) {
            log.warn("[instrument-clear] tx={} posting türetme hatası (izole): {}",
                    tx.getId(), e.getMessage());
        }

        // Instrument state
        inst.setStatus("CLEARED");
        inst.setClearedAt(when);
        inst.setClearedBankAccount(bank);
        paymentInstrumentRepository.save(inst);

        // Bağlı debt_payments → linked_transaction_id update
        for (DebtPayment dp : debtPaymentRepository.findByLinkedInstrumentId(instrumentId)) {
            dp.setLinkedTransaction(tx);
            debtPaymentRepository.save(dp);
        }

        // Counterpart balance — debt remaining'ler değişmedi, sadece tx oluştu;
        // ama tx'in tek başına counterpart balance üzerinde etkisi yok (current_balance
        // sadece açık debt'lere göre hesaplanıyor). Defansif recompute.
        if (inst.getCounterpart() != null) {
            counterpartLedger.recompute(inst.getCounterpart().getId());
        }

        auditLogService.recordEntityAction(
                "INSTRUMENT_CLEAR",
                actorUserId, actor != null ? actor.getUsername() : null,
                "PAYMENT_INSTRUMENT", inst.getId(),
                "Instrument cleared: " + inst.getInstrumentType() + " " + inst.getAmount()
                        + " → " + bank.getName(),
                Map.of("instrumentId", inst.getId(),
                        "bankAccountId", bank.getId(),
                        "amount", inst.getAmount(),
                        "txId", tx.getId()));
        return inst;
    }

    @Transactional
    public PaymentInstrument bounceInstrument(UUID instrumentId, LocalDateTime bouncedAt,
                                                String reason, UUID actorUserId) {
        PaymentInstrument inst = paymentInstrumentRepository.findById(instrumentId)
                .orElseThrow(() -> new IllegalArgumentException("Instrument bulunamadı"));
        accessGuard.assertCanAccessBusiness(actorUserId, inst.getBusiness().getId());

        if (!"PORTFOLIO".equals(inst.getStatus())) {
            throw new IllegalStateException("Sadece PORTFOLIO instrument bounce edilebilir");
        }

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;

        // İlişkili debt_payments'ları reverse et
        List<DebtPayment> linked = debtPaymentRepository.findByLinkedInstrumentId(instrumentId);
        for (DebtPayment dp : linked) {
            Debt d = dp.getDebt();
            if (d != null) {
                BigDecimal rem = d.getRemainingAmount() != null ? d.getRemainingAmount() : BigDecimal.ZERO;
                BigDecimal restored = rem.add(dp.getAmount()).min(d.getAmount());
                d.setRemainingAmount(restored);
                d.setStatus(restored.compareTo(d.getAmount()) == 0 ? "OPEN"
                        : restored.signum() == 0 ? "PAID" : "PARTIAL");
                if ("OPEN".equals(d.getStatus()) || "PARTIAL".equals(d.getStatus())) {
                    d.setSettled(false);
                }
                debtRepository.save(d);
            }
        }
        // debt_payments kayıtlarını sil (bounce reverse semantiği)
        debtPaymentRepository.deleteAll(linked);

        inst.setStatus("BOUNCED");
        inst.setBouncedAt(bouncedAt != null ? bouncedAt : LocalDateTime.now());
        paymentInstrumentRepository.save(inst);

        if (inst.getCounterpart() != null) {
            counterpartLedger.recompute(inst.getCounterpart().getId());
        }

        auditLogService.recordEntityAction(
                "INSTRUMENT_BOUNCE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "PAYMENT_INSTRUMENT", inst.getId(),
                "Instrument bounced: " + inst.getInstrumentType() + " " + inst.getAmount()
                        + (reason != null ? " (" + reason + ")" : ""),
                Map.of("instrumentId", inst.getId(),
                        "reason", reason != null ? reason : ""));
        return inst;
    }

    @Transactional
    public void deleteInstrument(UUID instrumentId, UUID actorUserId) {
        PaymentInstrument inst = paymentInstrumentRepository.findById(instrumentId)
                .orElseThrow(() -> new IllegalArgumentException("Instrument bulunamadı"));
        accessGuard.assertCanAccessBusiness(actorUserId, inst.getBusiness().getId());

        if (!"PORTFOLIO".equals(inst.getStatus())) {
            throw new IllegalStateException(
                    "Sadece PORTFOLIO instrument silinebilir (CLEARED/BOUNCED audit için korunur)");
        }

        // İlişkili debt_payments'ları reverse et (bounce ile aynı mantık)
        List<DebtPayment> linked = debtPaymentRepository.findByLinkedInstrumentId(instrumentId);
        for (DebtPayment dp : linked) {
            Debt d = dp.getDebt();
            if (d != null) {
                BigDecimal rem = d.getRemainingAmount() != null ? d.getRemainingAmount() : BigDecimal.ZERO;
                BigDecimal restored = rem.add(dp.getAmount()).min(d.getAmount());
                d.setRemainingAmount(restored);
                d.setStatus(restored.compareTo(d.getAmount()) == 0 ? "OPEN"
                        : restored.signum() == 0 ? "PAID" : "PARTIAL");
                if ("OPEN".equals(d.getStatus()) || "PARTIAL".equals(d.getStatus())) {
                    d.setSettled(false);
                }
                debtRepository.save(d);
            }
        }
        debtPaymentRepository.deleteAll(linked);

        UUID cpId = inst.getCounterpart() != null ? inst.getCounterpart().getId() : null;
        paymentInstrumentRepository.delete(inst);

        if (cpId != null) {
            counterpartLedger.recompute(cpId);
        }

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        auditLogService.recordEntityAction(
                "INSTRUMENT_DELETE",
                actorUserId, actor != null ? actor.getUsername() : null,
                "PAYMENT_INSTRUMENT", instrumentId,
                "Instrument deleted: " + inst.getInstrumentType() + " " + inst.getAmount(),
                Map.of("instrumentId", instrumentId));
    }

    // ───────────────────────── helpers ─────────────────────────

    private void applyAllocation(Debt d, BigDecimal apply) {
        BigDecimal rem = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
        BigDecimal newRem = rem.subtract(apply).setScale(2, RoundingMode.HALF_UP);
        if (newRem.signum() < 0) newRem = BigDecimal.ZERO;
        d.setRemainingAmount(newRem);
        if (newRem.signum() == 0) {
            d.setStatus("PAID");
            d.setSettled(true);
            if (d.getSettledAt() == null) d.setSettledAt(LocalDateTime.now());
        } else if (newRem.compareTo(d.getAmount()) < 0) {
            d.setStatus("PARTIAL");
            d.setSettled(false);
        } else {
            d.setStatus("OPEN");
            d.setSettled(false);
        }
    }

    private void createDebtPaymentRow(Business business, Counterpart counterpart, Debt debt,
                                      String paymentDirection, String paymentMethod,
                                      BigDecimal amount, LocalDate paymentDate,
                                      Transaction linkedTx, BankAccount bankAccount,
                                      PaymentInstrument instrument, String description,
                                      User actor) {
        DebtPayment dp = DebtPayment.builder()
                .business(business)
                .counterpart(counterpart)
                .debt(debt)
                .paymentDirection(paymentDirection)
                .paymentMethod(paymentMethod)
                .amount(amount)
                .paymentDate(paymentDate)
                .linkedTransaction(linkedTx)
                .bankAccount(bankAccount)
                .linkedInstrument(instrument)
                .description(description)
                .createdBy(actor)
                .build();
        debtPaymentRepository.save(dp);
    }

    /**
     * Çatı v1.2: cari kapatma tx'leri için sistem "Borç" kategorisi
     * (lookup-or-create, idempotent). {@link LoanService#CATEGORY_LOAN} ile AYNI
     * kategori — borç verme/alma ve kapatma tek isim altında toplanır. LOAN
     * posting'i P&L bacağı üretmediği için Net Kâr kırılımına yansımaz.
     */
    private Category resolveLoanCategory(Business business) {
        return categoryRepository
                .findFirstByBusinessIdAndNameIgnoreCaseAndActiveTrue(business.getId(), LoanService.CATEGORY_LOAN)
                .orElseGet(() -> {
                    Category c = new Category();
                    c.setBusiness(business);
                    c.setName(LoanService.CATEGORY_LOAN);
                    c.setApplicability(CategoryApplicability.BOTH);
                    c.setActive(true);
                    return categoryRepository.save(c);
                });
    }

    private String buildPaymentDescription(CreatePaymentRequest req, Counterpart counterpart) {
        String userDesc = req.getDescription() != null ? req.getDescription().trim() : "";
        String prefix = "RECEIVED".equals(req.getPaymentDirection())
                ? ("Tahsilat: " + counterpart.getName())
                : ("Ödeme: " + counterpart.getName());
        if (userDesc.isEmpty()) return prefix;
        return prefix + " · " + userDesc;
    }
}
