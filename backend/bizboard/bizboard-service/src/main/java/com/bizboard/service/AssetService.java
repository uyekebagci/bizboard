package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.AcquireAssetRequest;
import com.bizboard.common.dto.AssetDto;
import com.bizboard.common.dto.SellAssetRequest;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.CategoryApplicability;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.common.enums.PostingLegKind;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.1 / §7 / TODO 2) — ayni varlık (ASSET) yönetimi.
 *
 * <p>İş karşılığı alınan araba/mal → dedike {@code BankAccount(type=ASSET)}
 * hesabına (envanter) Posting ile giriş; satılınca P&L gelirine/zararına döner.
 * Mevcut inventory ile ÇAKIŞMAZ — ASSET account tipini kullanır (defter değeri =
 * Σ posting; posting-türetilebilir).</p>
 *
 * <h3>Edinim (acquire) — Σ=0:</h3>
 * <pre>
 *   ASSET hesabı            += bookValue   (LOCATION_MOVE)
 *   clearing (account NULL) −= bookValue   (counterpart = malı veren)
 * </pre>
 *
 * <h3>Satış (sell) — Σ=0, kâr/zarar P&L:</h3>
 * <pre>
 *   para hesabı             += salePrice   (LOCATION_MOVE)
 *   ASSET hesabı            −= bookValue   (LOCATION_MOVE; defter değeri çıkışı)
 *   P&L (account NULL)      = −(salePrice − bookValue)   (PNL_INCOME; işaret Faz A
 *                             konvansiyonu — gelir tanıma negatif, rapor negate eder)
 * </pre>
 * Σ = salePrice − bookValue − (salePrice − bookValue) = 0. Satıştan sonra ASSET
 * hesabı bakiyesi 0 → hesap pasifleşir.
 *
 * <p><b>STRICT:</b> tüm mutate guard'lı + audit; posting Σ=0 doğrulanır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AssetService {

    /** Ayni satış kâr/zarar P&L kategorisi (BOTH — kâr gelir, zarar gider olabilir). */
    public static final String CATEGORY_ASSET_SALE = "Ayni Satış Kâr/Zarar";

    private final BankAccountRepository bankAccountRepository;
    private final CounterpartRepository counterpartRepository;
    private final CategoryRepository categoryRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final PostingRepository postingRepository;
    private final LedgerBalanceService balanceService;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    // ──────────────────────────── ACQUIRE ────────────────────────────

    @Transactional
    public AssetDto acquire(UUID userId, UUID businessId, AcquireAssetRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = loadUser(userId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        if (req.getName() == null || req.getName().isBlank()) {
            throw new IllegalArgumentException("name (varlık adı) zorunlu");
        }
        if (req.getBookValue() == null || req.getBookValue().signum() <= 0) {
            throw new IllegalArgumentException("book_value > 0 olmalı");
        }
        Counterpart counterpart = null;
        if (req.getCounterpartId() != null) {
            counterpart = counterpartRepository.findById(req.getCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException("Karşı taraf bulunamadı"));
            assertSameBusiness(counterpart.getBusiness(), businessId, "Karşı taraf");
        }
        LocalDate acquiredDate = req.getAcquiredDate() != null ? req.getAcquiredDate() : LocalDate.now();
        if (acquiredDate.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("acquired_date gelecek tarih olamaz: " + acquiredDate);
        }

        // Dedike ASSET hesabı (envanter kalemi).
        BankAccount asset = BankAccount.builder()
                .business(business)
                .name(req.getName().trim())
                .type(BankAccountType.ASSET)
                .currency("TRY")
                .currentBalance(req.getBookValue())
                .active(true)
                .notes(req.getNotes())
                .build();
        asset = bankAccountRepository.save(asset);

        // Edinim posting'i (Σ=0).
        JournalEntry entry = JournalEntry.builder()
                .business(business)
                .entryDate(acquiredDate)
                .sourceType(JournalSourceType.ASSET)
                .sourceRefId(asset.getId())
                .description("Ayni varlık edinimi: " + asset.getName() + " — " + req.getBookValue()
                        + (counterpart != null ? " (" + counterpart.getName() + ")" : ""))
                .createdBy(user)
                .build();
        List<Posting> legs = new ArrayList<>();
        legs.add(Posting.builder().journalEntry(entry).account(asset)
                .amount(req.getBookValue()).legKind(PostingLegKind.LOCATION_MOVE).build());
        legs.add(Posting.builder().journalEntry(entry).account(null)
                .amount(req.getBookValue().negate()).legKind(PostingLegKind.LOCATION_MOVE)
                .counterpart(counterpart).build());
        entry.setPostings(legs);
        assertBalanced(entry);
        journalEntryRepository.save(entry);

        Map<String, Object> meta = new HashMap<>();
        meta.put("assetAccountId", asset.getId().toString());
        meta.put("bookValue", req.getBookValue());
        auditLogService.recordEntityAction(
                AuditAction.ASSET_ACQUIRE, userId, user.getUsername(),
                "ASSET", asset.getId(),
                "Ayni varlık edinildi: " + asset.getName() + " — " + req.getBookValue(), meta);
        log.info("[asset] acquired account={} name={} bookValue={}",
                asset.getId(), asset.getName(), req.getBookValue());
        return toDto(asset);
    }

    // ──────────────────────────── SELL ────────────────────────────

    @Transactional
    public AssetDto sell(UUID userId, UUID businessId, SellAssetRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = loadUser(userId);

        BankAccount asset = bankAccountRepository.findById(req.getAssetAccountId())
                .orElseThrow(() -> new IllegalArgumentException("Ayni varlık (ASSET hesabı) bulunamadı"));
        assertSameBusiness(asset.getBusiness(), businessId, "Ayni varlık");
        if (asset.getType() != BankAccountType.ASSET) {
            throw new IllegalArgumentException("Hesap ASSET tipinde değil: " + asset.getType());
        }
        if (!asset.isActive()) {
            throw new IllegalStateException("Bu varlık zaten satıldı/elden çıktı");
        }
        BankAccount money = bankAccountRepository.findById(req.getMoneyAccountId())
                .orElseThrow(() -> new IllegalArgumentException("Para hesabı bulunamadı"));
        assertSameBusiness(money.getBusiness(), businessId, "Para hesabı");
        if (money.getType() == BankAccountType.ASSET) {
            throw new IllegalArgumentException("Satış bedeli ASSET hesabına yatamaz");
        }
        BigDecimal salePrice = req.getSalePrice();
        if (salePrice == null || salePrice.signum() < 0) {
            throw new IllegalArgumentException("sale_price negatif olamaz");
        }
        LocalDate soldDate = req.getSoldDate() != null ? req.getSoldDate() : LocalDate.now();
        if (soldDate.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("sold_date gelecek tarih olamaz: " + soldDate);
        }

        // Güncel defter değeri = Σ posting (snapshot değil — invariant).
        BigDecimal bookValue = balanceService.derivedBalance(asset.getId());
        BigDecimal gain = salePrice.subtract(bookValue); // + kâr, − zarar

        JournalEntry entry = JournalEntry.builder()
                .business(asset.getBusiness())
                .entryDate(soldDate)
                .sourceType(JournalSourceType.ASSET)
                .sourceRefId(asset.getId())
                .description("Ayni varlık satışı: " + asset.getName() + " — bedel=" + salePrice
                        + " defter=" + bookValue + " kâr/zarar=" + gain)
                .createdBy(user)
                .build();
        List<Posting> legs = new ArrayList<>();
        // Para girişi.
        legs.add(Posting.builder().journalEntry(entry).account(money)
                .amount(salePrice).legKind(PostingLegKind.LOCATION_MOVE).build());
        // ASSET çıkışı (defter değeri).
        legs.add(Posting.builder().journalEntry(entry).account(asset)
                .amount(bookValue.negate()).legKind(PostingLegKind.LOCATION_MOVE).build());
        // Kâr/zarar P&L (Faz A konvansiyonu: gelir tanıma negatif). gain=0 ise bacak yok.
        if (gain.signum() != 0) {
            Category cat = resolveCategory(asset.getBusiness(), CATEGORY_ASSET_SALE);
            // gain>0 → kâr (PNL_INCOME, −gain); gain<0 → zarar (PNL_EXPENSE, +|zarar|).
            PostingLegKind kind = gain.signum() > 0 ? PostingLegKind.PNL_INCOME : PostingLegKind.PNL_EXPENSE;
            legs.add(Posting.builder().journalEntry(entry).account(null)
                    .amount(gain.negate()).legKind(kind).category(cat).build());
        }
        entry.setPostings(legs);
        assertBalanced(entry);
        journalEntryRepository.save(entry);

        // Varlık elden çıktı → pasifleştir (bakiye Σ posting = 0).
        asset.setActive(false);
        bankAccountRepository.save(asset);

        Map<String, Object> meta = new HashMap<>();
        meta.put("assetAccountId", asset.getId().toString());
        meta.put("salePrice", salePrice);
        meta.put("bookValue", bookValue);
        meta.put("gain", gain);
        auditLogService.recordEntityAction(
                AuditAction.ASSET_SELL, userId, user.getUsername(),
                "ASSET", asset.getId(),
                "Ayni varlık satıldı: " + asset.getName() + " bedel=" + salePrice
                        + " kâr/zarar=" + gain, meta);
        log.info("[asset] sold account={} salePrice={} bookValue={} gain={}",
                asset.getId(), salePrice, bookValue, gain);
        return toDto(asset);
    }

    // ──────────────────────────── QUERY ────────────────────────────

    @Transactional(readOnly = true)
    public List<AssetDto> list(UUID userId, UUID businessId, boolean includeSold) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return bankAccountRepository
                .findByBusinessIdAndTypeOrderByNameAsc(businessId, BankAccountType.ASSET)
                .stream()
                .filter(a -> includeSold || a.isActive())
                .map(this::toDto)
                .toList();
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private User loadUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }

    private void assertBalanced(JournalEntry entry) {
        BigDecimal sum = entry.getPostings().stream()
                .map(Posting::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (sum.compareTo(BigDecimal.ZERO) != 0) {
            throw new IllegalStateException("Posting dengesiz (Σ=" + sum + ") — entry yazılmadı");
        }
    }

    private void assertSameBusiness(Business owner, UUID businessId, String label) {
        if (owner == null || !owner.getId().equals(businessId)) {
            throw new IllegalArgumentException(label + " farklı işletmeye ait (tenant ihlali)");
        }
    }

    private Category resolveCategory(Business business, String name) {
        return categoryRepository
                .findFirstByBusinessIdAndNameIgnoreCaseAndActiveTrue(business.getId(), name)
                .orElseGet(() -> {
                    Category c = new Category();
                    c.setBusiness(business);
                    c.setName(name);
                    c.setApplicability(CategoryApplicability.BOTH);
                    c.setActive(true);
                    return categoryRepository.save(c);
                });
    }

    private AssetDto toDto(BankAccount a) {
        return AssetDto.builder()
                .accountId(a.getId())
                .name(a.getName())
                .bookValue(balanceService.derivedBalance(a.getId()))
                .active(a.isActive())
                .notes(a.getNotes())
                .build();
    }
}
