package com.bizboard.service;

import com.bizboard.common.dto.BankAccountDetailDto;
import com.bizboard.common.dto.BankAccountDto;
import com.bizboard.common.dto.BankAccountToggleRequest;
import com.bizboard.common.dto.CreateBankAccountRequest;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.common.dto.UpdateBankAccountRequest;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.MyCompany;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.MyCompanyRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * v1.6.22 (WP-5): BankAccount aktif/pasif toggle servisi.
 *
 * <p>Pasif yapılırken bakiye 0 değilse {@link IllegalStateException}
 * ({@code force=true} ile zorla geçilebilir). Audit log her toggle'ı izler.</p>
 *
 * <p>v1.6.23.4: create / update endpoint'leri eklendi (BUG-3 fix). Yeni
 * banka hesabı eklemek için artık SQL gerekmiyor.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BankAccountService {

    private final BankAccountRepository repository;
    private final UserRepository userRepository;
    private final CounterpartRepository counterpartRepository;
    private final BusinessRepository businessRepository;
    private final TransactionRepository transactionRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    /** v1.7.0.x: banka hesabını kendi firmamıza (MyCompany) bağlamak için. */
    private final MyCompanyRepository myCompanyRepository;
    // v1.6.23.27 (UI Fix WP TODO 63229465): SUB_CASH silinmeden önce
    // assignment'lar cascade kaldırılır (entity'ler Ana Kasa'ya iade).
    private final com.bizboard.repository.SubCashAssignmentRepository subCashAssignmentRepository;

    @Transactional
    public BankAccountDto toggleActive(UUID id, BankAccountToggleRequest req, UUID actorUserId) {
        BankAccount a = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hesap bulunamadi: " + id));
        // v1.6.23.19 (Security WP TODO 7432143f): actor bu işletmeye erişebiliyor mu?
        accessGuard.assertCanAccessBusiness(actorUserId,
                a.getBusiness() != null ? a.getBusiness().getId() : null);
        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;

        boolean newActive = Boolean.TRUE.equals(req.getIsActive());
        boolean force = Boolean.TRUE.equals(req.getForce());

        if (!newActive && a.isActive()) {
            // Pasife geçiş — bakiye 0 değilse uyar (force=true atlatır)
            BigDecimal balance = a.getCurrentBalance() != null ? a.getCurrentBalance() : BigDecimal.ZERO;
            if (balance.signum() != 0 && !force) {
                throw new IllegalStateException(
                        "Hesap bakiyesi 0 değil (" + balance.toPlainString() + " "
                                + (a.getCurrency() != null ? a.getCurrency() : "TRY")
                                + "); pasif yapmak için force=true gerek.");
            }
        }

        boolean changed = a.isActive() != newActive;
        a.setActive(newActive);
        if (changed) {
            a = repository.save(a);
            auditLogService.recordEntityAction(
                    newActive ? "BANK_ACCOUNT_ACTIVATED" : "BANK_ACCOUNT_DEACTIVATED",
                    actorUserId, actor != null ? actor.getUsername() : null,
                    "BANK_ACCOUNT", a.getId(),
                    a.getName() + " — " + (newActive ? "aktif" : "pasif")
                            + (force ? " (force)" : ""),
                    Map.of(
                            "name", a.getName(),
                            "type", a.getType() != null ? a.getType().name() : "?",
                            "active", newActive,
                            "force", force));
            log.info("BankAccount {} -> active={} force={}", a.getId(), newActive, force);
        }
        return toDto(a);
    }

    // ───────────────────────── CREATE (v1.6.23.4) ─────────────────────────

    /**
     * Yeni banka hesabı oluşturur. Admin-only (servisin çağıran controller
     * authorization kontrolü yapmalı).
     */
    @Transactional
    public BankAccountDto create(CreateBankAccountRequest req, UUID actorUserId) {
        // v1.6.23.19 (Security WP TODO 7432143f): business binding zorunlu.
        if (req.getBusinessId() == null) {
            throw new IllegalArgumentException("business_id zorunlu");
        }
        Business business = businessRepository.findById(req.getBusinessId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "business_id bulunamadi: " + req.getBusinessId()));
        accessGuard.assertCanAccessBusiness(actorUserId, business.getId());

        // Type validation
        BankAccountType type;
        try {
            type = BankAccountType.valueOf(req.getType().trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Gecersiz type: '" + req.getType() +
                            "' — CHECKING / SAVINGS / SUB_CASH / CASH_HOLDER olmali");
        }

        // v1.6.23.25 (UI Fix WP / arch-rules): MAIN_CASH user create edemez —
        // her business için BusinessService hook'u tarafından otomatik yaratılır
        // ve DB unique partial index ile garanti edilir.
        if (!type.isUserCreatable()) {
            throw new IllegalArgumentException(
                    "type=" + type + " kullanici tarafindan olusturulamaz; otomatik yaratilir.");
        }
        // Legacy CASH tipi reject (SUB_CASH'a migrate edildi)
        if ("CASH".equalsIgnoreCase(req.getType().trim())) {
            throw new IllegalArgumentException(
                    "type=CASH artik kullanilmiyor — SUB_CASH kullan.");
        }

        // CASH_HOLDER → holder_person zorunlu + counterpart.kind=PERSON kontrolü
        // v1.6.23.27 (UI Fix WP TODO 7e0c5333): system-managed CASH_HOLDER
        // (örn. "Genel Nakit") için holder_person_id null olabilir. Kullanıcı
        // create endpoint'inden is_system=true gönderemez (request DTO'da
        // bu alan yok); system hesaplar yalnız BusinessService hook'undan
        // yaratılır.
        Counterpart holder = null;
        if (type == BankAccountType.CASH_HOLDER) {
            if (req.getHolderPersonId() == null) {
                throw new IllegalArgumentException(
                        "type=CASH_HOLDER icin holder_person_id zorunlu");
            }
            holder = counterpartRepository.findById(req.getHolderPersonId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "holder_person_id bulunamadi: " + req.getHolderPersonId()));
            // Kind kontrolü — Counterpart.kind enum (CounterpartKind: PERSON/FIRM)
            com.bizboard.common.enums.CounterpartKind k = holder.getKind();
            if (k != com.bizboard.common.enums.CounterpartKind.PERSON) {
                throw new IllegalArgumentException(
                        "holder counterpart.kind 'PERSON' olmali (gonderilen: " + k + ")");
            }
        } else if (req.getHolderPersonId() != null) {
            // Non-CASH_HOLDER için holder verilmiş — sessiz yoksay (yine de log'la)
            log.warn("[bank-account-create] type={} olmasina ragmen holder_person_id gonderildi — yoksayildi",
                    type);
        }

        BigDecimal opening = req.getOpeningBalance() != null
                ? req.getOpeningBalance() : BigDecimal.ZERO;

        // v1.7.0.x: opsiyonel ownerMyCompany — null gönderilirse boş kalır.
        MyCompany ownerMyCompany = null;
        if (req.getOwnerMyCompanyId() != null) {
            ownerMyCompany = myCompanyRepository.findById(req.getOwnerMyCompanyId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Sahip firma (my_company) bulunamadi: " + req.getOwnerMyCompanyId()));
        }

        BankAccount entity = BankAccount.builder()
                .business(business)
                .name(req.getName().trim())
                .type(type)
                .bankName(req.getBankName())
                .iban(req.getIban())
                .currency(req.getCurrency() != null ? req.getCurrency().trim() : "TRY")
                .holderPerson(holder)
                .ownerMyCompany(ownerMyCompany)
                .currentBalance(opening)
                .active(true)
                .notes(req.getNotes())
                .build();
        entity = repository.save(entity);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        Map<String, Object> meta = new HashMap<>();
        meta.put("name", entity.getName());
        meta.put("type", entity.getType().name());
        meta.put("bankName", entity.getBankName());
        meta.put("openingBalance", opening);
        if (holder != null) meta.put("holderPersonId", holder.getId());
        auditLogService.recordEntityAction(
                "BANK_ACCOUNT_CREATED",
                actorUserId, actor != null ? actor.getUsername() : null,
                "BANK_ACCOUNT", entity.getId(),
                entity.getName() + " olusturuldu (" + entity.getType() + ")",
                meta);
        log.info("BankAccount created: id={} name='{}' type={}", entity.getId(), entity.getName(), type);

        return toDto(entity);
    }

    // ───────────────────────── UPDATE (v1.6.23.4) ─────────────────────────

    /**
     * Banka hesabını partial-update eder. Yalnızca: name, bank_name, iban, notes.
     * type / currency / holder_person immutable; aktif/pasif için
     * {@code PATCH /bank-accounts/{id}/active} kullanin.
     */
    @Transactional
    public BankAccountDto update(UUID id, UpdateBankAccountRequest req, UUID actorUserId) {
        BankAccount a = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hesap bulunamadi: " + id));
        // v1.6.23.19 (Security WP TODO 7432143f): cross-tenant update'i engelle.
        accessGuard.assertCanAccessBusiness(actorUserId,
                a.getBusiness() != null ? a.getBusiness().getId() : null);
        // v1.6.23.25 (UI Fix WP TODO e9a619e3): MAIN_CASH üzerinde yalnız
        // {@code name} güncellenebilir — bank_name/iban/holder/notes sessizce
        // yoksayılır (request body'den gelse de uygulanmaz).
        boolean isMainCash = a.getType() == BankAccountType.MAIN_CASH;
        Map<String, Object> changes = new HashMap<>();

        if (req.getName() != null && !req.getName().equals(a.getName())) {
            changes.put("name", Map.of("from", a.getName(), "to", req.getName()));
            a.setName(req.getName().trim());
        }
        // MAIN_CASH için aşağıdaki alanlar değiştirilemez — sessizce yoksay.
        if (!isMainCash) {
            if (req.getBankName() != null && !req.getBankName().equals(a.getBankName())) {
                changes.put("bankName", Map.of(
                        "from", a.getBankName() != null ? a.getBankName() : "",
                        "to", req.getBankName()));
                a.setBankName(req.getBankName());
            }
            if (req.getIban() != null && !req.getIban().equals(a.getIban())) {
                changes.put("iban", Map.of(
                        "from", a.getIban() != null ? a.getIban() : "",
                        "to", req.getIban()));
                a.setIban(req.getIban());
            }
            if (req.getNotes() != null && !req.getNotes().equals(a.getNotes())) {
                changes.put("notes_updated", true);
                a.setNotes(req.getNotes());
            }
        } else if (req.getBankName() != null || req.getIban() != null || req.getNotes() != null) {
            log.warn("[bank-account-update] MAIN_CASH id={} — yalniz name guncellenebilir, " +
                    "diger alanlar yoksayildi", a.getId());
        }

        // v1.7.0.x: owner_my_company_id — MAIN_CASH dahil her tip için
        // her zaman uygulanır (frontend her zaman gönderir; null = temizle).
        {
            java.util.UUID oldMcId = a.getOwnerMyCompany() != null
                    ? a.getOwnerMyCompany().getId() : null;
            if (!java.util.Objects.equals(oldMcId, req.getOwnerMyCompanyId())) {
                MyCompany mc = req.getOwnerMyCompanyId() != null
                        ? myCompanyRepository.findById(req.getOwnerMyCompanyId())
                              .orElseThrow(() -> new IllegalArgumentException(
                                      "Sahip firma (my_company) bulunamadi: " + req.getOwnerMyCompanyId()))
                        : null;
                a.setOwnerMyCompany(mc);
                changes.put("ownerMyCompanyId", Map.of(
                        "from", oldMcId != null ? oldMcId.toString() : "null",
                        "to", req.getOwnerMyCompanyId() != null ? req.getOwnerMyCompanyId().toString() : "null"));
            }
        }

        if (changes.isEmpty()) {
            return toDto(a);
        }
        a = repository.save(a);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        auditLogService.recordEntityAction(
                "BANK_ACCOUNT_UPDATED",
                actorUserId, actor != null ? actor.getUsername() : null,
                "BANK_ACCOUNT", a.getId(),
                a.getName() + " — " + changes.size() + " alan guncellendi",
                Map.of("changes", changes));
        log.info("BankAccount updated: id={} fields={}", a.getId(), changes.keySet());
        return toDto(a);
    }

    // ───────────────────────── DELETE (v1.6.23.25) ─────────────────────────

    /**
     * v1.6.23.25 (UI Fix WP TODO d1876594 + 5f82395a):
     *
     * <p>SUB_CASH ve diğer kullanıcı-yaratılmış tipler delete edilebilir.
     * MAIN_CASH yalnız business cascade ile silinir — kullanıcı doğrudan
     * silemez ({@link IllegalStateException} → controller 409).</p>
     */
    @Transactional
    public void delete(UUID id, UUID actorUserId) {
        BankAccount a = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hesap bulunamadi: " + id));
        accessGuard.assertCanAccessBusiness(actorUserId,
                a.getBusiness() != null ? a.getBusiness().getId() : null);

        if (!a.getType().isUserDeletable()) {
            throw new IllegalStateException(
                    "Ana Kasa silinemez. Yalniz isletme silinince otomatik kaldirilir.");
        }
        // v1.6.23.27 (UI Fix WP TODO 7e0c5333): sistem hesaplar (Genel Nakit)
        // silinemez — sadece business cascade ile.
        if (a.isSystem()) {
            throw new IllegalStateException(
                    "Sistem hesabi silinemez (Genel Nakit). Yalniz isletme silinince otomatik kaldirilir.");
        }
        // Bağlı tx kontrol — varsa pasif yapmak öneriliyor.
        long txCount = transactionRepository.findByBankAccountIdOrderByDateDesc(
                id, PageRequest.of(0, 1)).size();
        if (txCount > 0) {
            throw new IllegalStateException(
                    "Bu hesaba bagli islem var; once pasif yapmayi dene.");
        }

        // v1.6.23.27 (TODO 63229465): SUB_CASH siliniyorsa önce tüm
        // assignment'ları cascade kaldır — entity'ler Ana Kasa'ya iade.
        // (sub_cash_assignments tablosunda ON DELETE CASCADE var ama
        // audit log için açıkça temizliyoruz; entity verisi etkilenmez.)
        if (a.getType() == BankAccountType.SUB_CASH) {
            int unassigned = subCashAssignmentRepository
                    .findBySubCashIdOrderByAssignedAtDesc(a.getId()).size();
            if (unassigned > 0) {
                subCashAssignmentRepository.findBySubCashIdOrderByAssignedAtDesc(a.getId())
                        .forEach(subCashAssignmentRepository::delete);
                log.info("[bank-account delete] SUB_CASH {} silindi; {} atama Ana Kasa'ya iade edildi",
                        a.getName(), unassigned);
            }
        }

        String name = a.getName();
        repository.delete(a);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        auditLogService.recordEntityAction(
                "BANK_ACCOUNT_DELETED",
                actorUserId, actor != null ? actor.getUsername() : null,
                "BANK_ACCOUNT", id,
                name + " silindi (" + a.getType() + ")",
                Map.of("name", name, "type", a.getType().name()));
        log.info("BankAccount deleted: id={} name='{}' type={}", id, name, a.getType());
    }

    // ───────────────────────── MAIN_CASH HOOK (v1.6.23.25) ─────────────────────────

    /**
     * v1.6.23.25 (UI Fix WP TODO 5cf7590b): BusinessService tarafından
     * çağrılır — yeni işletme yaratıldığında otomatik "Ana Kasa" oluşturur.
     * DB unique partial index ile aynı business için ikinci MAIN_CASH
     * yaratma denemesi başarısız olur (idempotent garanti).
     *
     * <p>actorUserId burada business owner / actor — audit log için.</p>
     */
    @Transactional
    public BankAccount createMainCashForBusiness(Business business, UUID actorUserId) {
        BankAccount mainCash = BankAccount.builder()
                .business(business)
                .name("Ana Kasa")
                .type(BankAccountType.MAIN_CASH)
                .currency("TRY")
                .currentBalance(BigDecimal.ZERO)
                .active(true)
                .build();
        mainCash = repository.save(mainCash);

        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        auditLogService.recordEntityAction(
                "BANK_ACCOUNT_CREATED",
                actorUserId, actor != null ? actor.getUsername() : null,
                "BANK_ACCOUNT", mainCash.getId(),
                "Ana Kasa otomatik olusturuldu — isletme: " + business.getName(),
                Map.of("auto", true, "type", "MAIN_CASH",
                        "businessId", business.getId().toString()));
        log.info("MAIN_CASH auto-created for business={} id={}",
                business.getName(), mainCash.getId());
        return mainCash;
    }

    // ───────────────────────── DETAIL (v1.6.23.19) ─────────────────────────

    /**
     * v1.6.23.19 (UI Fix WP 8b961444): Hesap detay modalı için aggregate.
     *
     * <p>Access check: actor bu hesabın business'ına erişemiyorsa
     * {@link SecurityException} fırlatır (controller 403'e çevirir).</p>
     *
     * @param recentLimit son N tx (default 10)
     * @param trendDays   bakiye trendi gün sayısı (default 30)
     */
    @Transactional(readOnly = true)
    public BankAccountDetailDto getDetail(UUID id, UUID actorUserId,
                                          int recentLimit, int trendDays) {
        BankAccount account = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Hesap bulunamadi: " + id));
        UUID businessId = account.getBusiness() != null ? account.getBusiness().getId() : null;
        // v1.6.23.19 (Security WP TODO 7432143f): cross-tenant access engeli.
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);

        // Son N tx
        List<Transaction> recent = transactionRepository
                .findByBankAccountIdOrderByDateDesc(id, PageRequest.of(0, Math.max(1, recentLimit)));
        List<TransactionDto> recentDtos = recent.stream()
                .map(DtoMapper::toTransactionDto)
                .toList();

        // Bekleyen POS (business level)
        List<TransactionDto> pendingPos = businessId == null ? List.of() :
                transactionRepository.findUnsettledPosTransactionsByBusiness(businessId).stream()
                        .map(DtoMapper::toTransactionDto)
                        .toList();

        // 30 günlük bakiye trendi — gün sonu running balance.
        // Yöntem: cari bakiyeden geriye doğru çalışıp her günü hesapla.
        int days = Math.max(1, trendDays);
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(days - 1L);

        List<Transaction> sinceTx = transactionRepository
                .findByBankAccountIdSince(id, from);
        // Toplam tx etkisi (from..today arası — HESAPDAN her zaman bankAccount'a
        // dokunur; direction IN→+, OUT→-).
        BigDecimal currentBal = account.getCurrentBalance() != null
                ? account.getCurrentBalance() : BigDecimal.ZERO;

        // Tx'leri tarihe göre grupla (gün toplamı net)
        TreeMap<LocalDate, BigDecimal> dailyNet = new TreeMap<>();
        for (Transaction t : sinceTx) {
            BigDecimal delta = t.getAmount() != null ? t.getAmount() : BigDecimal.ZERO;
            if (t.getDirection() == TransactionDirection.EXPENSE) {
                delta = delta.negate();
            }
            dailyNet.merge(t.getDate(), delta, BigDecimal::add);
        }

        // Bugünden geriye yürüyerek günlük running balance.
        BigDecimal running = currentBal;
        Map<LocalDate, BigDecimal> trendMap = new HashMap<>();
        for (LocalDate d = today; !d.isBefore(from); d = d.minusDays(1)) {
            trendMap.put(d, running);
            BigDecimal todayNet = dailyNet.getOrDefault(d, BigDecimal.ZERO);
            // O günün net etkisini çıkararak dünün gün sonu bakiyesine geçeriz.
            running = running.subtract(todayNet);
        }

        List<BankAccountDetailDto.BalanceTrendPoint> trend = new ArrayList<>(days);
        for (LocalDate d = from; !d.isAfter(today); d = d.plusDays(1)) {
            trend.add(BankAccountDetailDto.BalanceTrendPoint.builder()
                    .date(d)
                    .balance(trendMap.getOrDefault(d, currentBal))
                    .build());
        }

        return BankAccountDetailDto.builder()
                .account(toDto(account))
                .recentTransactions(recentDtos)
                .pendingPosTransactions(pendingPos)
                .balanceTrend(trend)
                .build();
    }

    /**
     * v1.6.23.27 (UI Fix WP TODO d884a0ec): MAIN/SUB için DTO'da computed
     * aggregate kullanılır. Caller {@code BankAccountService.toDto(b, aggregate)}
     * versiyonunu kullanmalı; eski {@code toDto(b)} backward-compat için
     * current_balance'ı entity'den alır (MAIN/SUB için 0).
     */
    public static BankAccountDto toDto(BankAccount b) {
        return toDto(b, null);
    }

    public static BankAccountDto toDto(BankAccount b, java.math.BigDecimal aggregateOverride) {
        BankAccountType type = b.getType();
        // v1.6.23.27: MAIN/SUB current_balance entity'de 0; gerçek değer aggregate.
        java.math.BigDecimal effectiveBalance;
        if (aggregateOverride != null && (type == BankAccountType.MAIN_CASH || type == BankAccountType.SUB_CASH)) {
            effectiveBalance = aggregateOverride;
        } else {
            effectiveBalance = b.getCurrentBalance();
        }
        return BankAccountDto.builder()
                .id(b.getId())
                .businessId(b.getBusiness() != null ? b.getBusiness().getId() : null)
                .businessName(b.getBusiness() != null ? b.getBusiness().getName() : null)
                .name(b.getName())
                .type(type != null ? type.name() : null)
                .mainCash(type == BankAccountType.MAIN_CASH)
                .userDeletable(type != null && type.isUserDeletable() && !b.isSystem())
                .system(b.isSystem())
                .bankName(b.getBankName())
                .iban(b.getIban())
                .currency(b.getCurrency())
                .holderPersonId(b.getHolderPerson() != null ? b.getHolderPerson().getId() : null)
                .holderPersonName(b.getHolderPerson() != null ? b.getHolderPerson().getName() : null)
                .ownerMyCompanyId(b.getOwnerMyCompany() != null ? b.getOwnerMyCompany().getId() : null)
                .ownerMyCompanyName(b.getOwnerMyCompany() != null ? b.getOwnerMyCompany().getLegalName() : null)
                .currentBalance(effectiveBalance)
                .active(b.isActive())
                .notes(b.getNotes())
                .createdAt(b.getCreatedAt())
                .build();
    }
}
