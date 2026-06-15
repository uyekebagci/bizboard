package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateLoanRequest;
import com.bizboard.common.dto.LoanResponseDto;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.CategoryApplicability;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Çatı v1.2 — Verilen/Alınan Borç (LOAN) servisi.
 *
 * <p>Borç = kasa ↔ alacak/verecek arası TRANSFER. <b>P&L'e (Net Kâr) GİRMEZ</b>
 * (gelir/gider değil; bilanço hareketi). Mevcut Alacaklar/Verecekler ({@link Debt})
 * altyapısına BAĞLANIR — yeniden icat edilmez:</p>
 *
 * <ul>
 *   <li><b>Verilen Borç</b> ({@code loan_type=GIVEN}): nakit ÇIKAR
 *       (Transaction {@code kind=LOAN, direction=EXPENSE}) + karşılığı
 *       <b>ALACAK</b> ({@link DebtDirection#RECEIVABLE} {@link Debt}) artar.</li>
 *   <li><b>Alınan Borç</b> ({@code loan_type=TAKEN}): nakit ARTAR
 *       ({@code kind=LOAN, direction=INCOME}) + <b>VERECEK</b>
 *       ({@link DebtDirection#PAYABLE} {@link Debt}) artar.</li>
 * </ul>
 *
 * <p>Kasa hareketi {@code bank_account.current_balance} snapshot'ını günceller
 * (NAKIT/HESAPDAN ile aynı kural) + dengeli çift-giriş Posting türetir
 * ({@link LedgerPostingService}; iki {@code LOCATION_MOVE} bacağı, PNL YOK,
 * Σ=0). Geri ödeme/tahsilat MEVCUT {@link PaymentService} akışıyla yapılır
 * (alacak/vereceği kapatır).</p>
 *
 * <p>Tüm akış tek DB transaction içinde — herhangi bir adım fail → rollback
 * (kasa + alacak/verecek tutarlı kalır). STRICT: guard ilk satırda.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LoanService {

    /**
     * Borç tx'lerinin (kind=LOAN) sistem kategorisi. {@code transactions.category_id}
     * NOT NULL kısıtını karşılamak için zorunlu; ancak posting türetiminde LOAN
     * yalnız {@code LOCATION_MOVE} bacağı üretir → bu kategori P&L (Net Kâr)
     * kategori kırılımına GİRMEZ (gelir/gider raporunda görünmez).
     */
    public static final String CATEGORY_LOAN = "Borç (Verilen/Alınan)";

    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final BankAccountRepository bankAccountRepository;
    private final TransactionRepository transactionRepository;
    private final DebtRepository debtRepository;
    private final CounterpartRepository counterpartRepository;
    private final CategoryRepository categoryRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final LedgerPostingService ledgerPostingService;
    private final CounterpartLedgerService counterpartLedger;
    private final LedgerService ledgerService;
    private final DayOpenService dayOpenService;

    /**
     * Verilen/Alınan Borç oluştur: kasa hareketi + alacak/verecek kaydı.
     *
     * @param businessId  hedef işletme
     * @param request     borç isteği
     * @param actorUserId JWT'den
     */
    @Transactional
    public LoanResponseDto createLoan(UUID businessId, CreateLoanRequest request, UUID actorUserId) {
        // STRICT: business guard ilk satır (defense-in-depth).
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);

        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));
        User actor = userRepository.findById(actorUserId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // ── Validation ──────────────────────────────────────────────
        if (request.getAmount() == null || request.getAmount().signum() <= 0) {
            throw new IllegalArgumentException("amount pozitif olmalı");
        }
        String loanType = request.getLoanType() != null
                ? request.getLoanType().trim().toUpperCase(Locale.ENGLISH) : null;
        if (!"GIVEN".equals(loanType) && !"TAKEN".equals(loanType)) {
            throw new IllegalArgumentException("loan_type GIVEN (verilen borç) veya TAKEN (alınan borç) olmalı");
        }
        // GIVEN (verilen borç) → nakit çıkar (EXPENSE) + ALACAK (RECEIVABLE).
        // TAKEN (alınan borç)  → nakit girer (INCOME)  + VERECEK (PAYABLE).
        boolean given = "GIVEN".equals(loanType);
        TransactionDirection txDir = given ? TransactionDirection.EXPENSE : TransactionDirection.INCOME;
        DebtDirection debtDir = given ? DebtDirection.RECEIVABLE : DebtDirection.PAYABLE;

        LocalDate date = request.getDate() != null ? request.getDate() : LocalDate.now();
        // Gün Açılışı enforcement (feature-flag arkasında, NON-BREAKING).
        dayOpenService.assertDayOpenForEntry(businessId, date);

        String pm = normalizePaymentMethod(request.getPaymentMethod());

        // ── Counterpart (cari) çöz / serbest metin ad ───────────────
        Counterpart counterpart = null;
        String counterpartyName = request.getCounterparty();
        if (request.getCounterpartId() != null) {
            counterpart = counterpartRepository.findById(request.getCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException("Karsi firma bulunamadi"));
            if (counterpart.getBusiness() == null
                    || !counterpart.getBusiness().getId().equals(businessId)) {
                // Sızdırma yok — generic 400.
                throw new IllegalArgumentException("Karsi firma bu isletmeye ait degil");
            }
            if (counterpartyName == null || counterpartyName.isBlank()) {
                counterpartyName = counterpart.getName();
            }
        }
        if (counterpartyName == null || counterpartyName.isBlank()) {
            throw new IllegalArgumentException("counterpart_id veya counterparty (ad) zorunlu");
        }

        // ── Kasa hesabı çöz (NAKIT → Genel Nakit; HESAPDAN → zorunlu) ──
        BankAccount bankAccount = resolveBankAccount(businessId, pm, request.getBankAccountId());

        // ── 1) Cari hareketi: Transaction (kind=LOAN) ───────────────
        String desc = buildTxDescription(given, counterpartyName, request.getDescription());
        // transactions.category_id NOT NULL → sistem "Borç" kategorisi (P&L'e girmez).
        Category loanCategory = resolveLoanCategory(business);
        Transaction tx = Transaction.builder()
                .business(business)
                .direction(txDir)
                .kind(TransactionKind.LOAN)
                .amount(request.getAmount())
                .currency(request.getCurrency() != null ? request.getCurrency() : business.getCurrency())
                .paymentMethod(pm)
                .bankAccount(bankAccount)
                .category(loanCategory)
                .targetCounterpart(counterpart)
                .date(date)
                .description(desc)
                .createdBy(actor)
                .build();
        tx = transactionRepository.save(tx);

        // FİNANSAL KURAL (kullanıcı onayı Z, 2026-06): kind=LOAN (verilen/alınan
        // borç + tahsilat = cari hareket) OPERASYONEL KASAYA (Genel Kasa) YANSIMAZ.
        // Net Kâr LOAN'ı zaten dışlıyor; kasa da SİMETRİK olarak dışlamalı (cached
        // current_balance ↔ posting-türetilen bakiye tutarlı kalsın). Bu yüzden
        // kasa snapshot'ı (current_balance) BUMPLANMAZ — LedgerPostingService LOAN
        // posting'i de gerçek hesaba bağlanmaz (her iki bacak account=NULL). Cari
        // (alacak/verecek) hareketi aşağıda Debt kaydında izlenir.

        // Dengeli çift-giriş Posting türet (iki clearing LOCATION_MOVE bacağı,
        // account=NULL, PNL YOK → kasaya da Net Kâr'a da girmez, Σ=0). Non-fatal:
        // türetme hatası borç akışını BOZMAZ.
        try {
            ledgerPostingService.deriveForTransactionId(tx.getId());
        } catch (Exception e) {
            log.warn("[loan] tx={} posting türetme hatası (izole, atlandı): {}", tx.getId(), e.getMessage());
        }

        // Kapanmış döneme aitse wait-list'e ADD (mevcut tx akışıyla simetrik).
        if (ledgerService.isClosedPeriod(date)) {
            ledgerService.addToWaitList(businessId, date.getYear(), date.getMonthValue(), tx.getId(), "ADD");
        }

        // ── 2) Alacak/Verecek kaydı: Debt ───────────────────────────
        Debt debt = Debt.builder()
                .business(business)
                .direction(debtDir)
                .counterparty(counterpartyName)
                .counterpartRef(counterpart)
                .amount(request.getAmount())
                .remainingAmount(request.getAmount())
                .originalAmount(request.getAmount())
                .rateSnapshot(BigDecimal.ONE)
                .rateSnapshotAt(LocalDateTime.now())
                .status("OPEN")
                .currency(request.getCurrency() != null ? request.getCurrency() : "TRY")
                .instrumentType("NAKIT")
                .dueDate(request.getDueDate())
                .description(desc)
                .adminOnly(request.getAdminOnly() != null && request.getAdminOnly())
                .settled(false)
                .createdBy(actor)
                .build();
        debt = debtRepository.save(debt);

        if (counterpart != null) {
            counterpartLedger.recomputeIfPresent(counterpart.getId());
        }

        // ── Audit ───────────────────────────────────────────────────
        Map<String, Object> meta = new HashMap<>();
        meta.put("businessId", businessId);
        meta.put("loanType", loanType);
        meta.put("amount", request.getAmount());
        meta.put("debtDirection", debtDir.name());
        meta.put("txDirection", txDir.name());
        meta.put("txId", tx.getId());
        meta.put("debtId", debt.getId());
        meta.put("counterparty", counterpartyName);
        if (counterpart != null) meta.put("counterpartId", counterpart.getId());
        auditLogService.recordEntityAction(
                AuditAction.LOAN_CREATE,
                actor.getId(), actor.getUsername(),
                "DEBT", debt.getId(),
                business.getName() + " — " + (given ? "Verilen Borç (ALACAK)" : "Alınan Borç (VERECEK)")
                        + " " + request.getAmount() + " (" + counterpartyName + ")",
                meta);

        log.info("[loan] {} {} {} isletme={} txId={} debtId={}",
                loanType, request.getAmount(), counterpartyName, business.getName(),
                tx.getId(), debt.getId());

        return LoanResponseDto.builder()
                .loanType(loanType)
                .transactionId(tx.getId())
                .debtId(debt.getId())
                .debtDirection(debtDir.name())
                .amount(request.getAmount())
                .counterpartId(counterpart != null ? counterpart.getId() : null)
                .counterparty(counterpartyName)
                .build();
    }

    // ───────────────────────── helpers ─────────────────────────

    private BankAccount resolveBankAccount(UUID businessId, String pm, UUID requestedId) {
        BankAccount bankAccount = null;
        if (requestedId != null) {
            bankAccount = bankAccountRepository.findById(requestedId)
                    .orElseThrow(() -> new IllegalArgumentException("Bank account bulunamadi: " + requestedId));
            if (bankAccount.getBusiness() == null
                    || !bankAccount.getBusiness().getId().equals(businessId)) {
                throw new IllegalArgumentException("Bank account bu isletmeye ait degil");
            }
            if (!bankAccount.isActive()) {
                throw new IllegalArgumentException("Pasif bank account'a islem yapilamaz");
            }
        }
        if ("HESAPDAN".equals(pm) && bankAccount == null) {
            throw new IllegalArgumentException("HESAPDAN payment_method icin bank_account_id zorunlu");
        }
        if ("NAKIT".equals(pm) && bankAccount == null) {
            // Default "Genel Nakit" (is_system=true CASH_HOLDER) — tx-create ile aynı fallback.
            bankAccount = bankAccountRepository
                    .findByActiveTrueAndBusinessIdInOrderByNameAsc(List.of(businessId))
                    .stream()
                    .filter(ba -> ba.isSystem() && ba.getType() == BankAccountType.CASH_HOLDER)
                    .findFirst()
                    .orElse(null);
            if (bankAccount == null) {
                log.warn("[loan] NAKIT — business={} icin 'Genel Nakit' sistem hesabi yok; "
                        + "tx bank_account NULL (legacy fallback, posting FLAGGED olabilir)", businessId);
            }
        }
        return bankAccount;
    }

    /**
     * Borç tx'i için sistem kategorisi lookup-or-create (idempotent), {@link
     * ProfitSharePostingService#resolveCategory} ile aynı desen. {@code BOTH}
     * applicability (verilen=gider yönü, alınan=gelir yönü). LOAN posting'i
     * P&L bacağı üretmediği için bu kategori Net Kâr kırılımına yansımaz.
     */
    private Category resolveLoanCategory(Business business) {
        return categoryRepository
                .findFirstByBusinessIdAndNameIgnoreCaseAndActiveTrue(business.getId(), CATEGORY_LOAN)
                .orElseGet(() -> {
                    Category c = new Category();
                    c.setBusiness(business);
                    c.setName(CATEGORY_LOAN);
                    c.setApplicability(CategoryApplicability.BOTH);
                    c.setActive(true);
                    return categoryRepository.save(c);
                });
    }

    private static String normalizePaymentMethod(String raw) {
        if (raw == null || raw.isBlank()) return "NAKIT";
        String upper = raw.trim().toUpperCase(Locale.ENGLISH);
        if ("HESAPDAN".equals(upper)) return "HESAPDAN";
        // POS borç akışında anlamsız → NAKIT'e düşür.
        return "NAKIT";
    }

    private static String buildTxDescription(boolean given, String counterparty, String userDesc) {
        String prefix = given
                ? ("Verilen borç: " + counterparty)
                : ("Alınan borç: " + counterparty);
        if (userDesc == null || userDesc.isBlank()) return prefix;
        return prefix + " · " + userDesc.trim();
    }
}
