package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.*;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.DayCloseCreatedVia;
import com.bizboard.common.enums.DayCloseStatus;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Ledger v2 (Faz B, §4) — gün-kapanışı + mutabakat + kaçak omurgası.
 *
 * <p>Akış (§4):</p>
 * <ol>
 *   <li>Gün boyu işlemler → posting türetilir (Faz A).</li>
 *   <li>Cron / kullanıcı gün açar (PENDING).</li>
 *   <li>Kullanıcı her parası-olan hesabın gerçek bakiyesini ZORUNLU girer
 *       (SON KASA = Σ counted).</li>
 *   <li>Sistem computed = opening − totalOut + totalIn (SAĞLAMA HESAP).</li>
 *   <li>variance = computed − actual. Eşik aşılırsa ALARM + drill-down.</li>
 *   <li>CLOSED → ertesi günün opening = bu günün actual (otomatik devir).</li>
 *   <li>Geçmiş düzeltme → forward-chain recompute (idempotent + kilit + invariant).</li>
 * </ol>
 *
 * <p><b>STRICT:</b> tüm mutate admin/guard'lı + audit; backdated feature flag +
 * admin-gate; recompute tek-transaction + kilitli pencere + bitişte invariant.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DayCloseService {

    /** variance.abs() bu eşiği aşarsa alarm. Business override edebilir (request). */
    private static final BigDecimal DEFAULT_THRESHOLD = new BigDecimal("100.00");
    private static final BigDecimal INVARIANT_TOLERANCE = new BigDecimal("0.01");

    private final DayCloseRepository dayCloseRepository;
    private final DayCloseAccountCountRepository countRepository;
    private final jakarta.persistence.EntityManager entityManager;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final PostingRepository postingRepository;
    private final DayCloseCalculator calculator;
    private final BusinessAccessGuard accessGuard;
    private final LedgerFeatureFlagService featureFlags;
    private final AuditLogService auditLogService;
    /** Faz D (§9/TODO 4): kaçak eşik aşımı → bildirim (in-app + opt-in Telegram). */
    private final com.bizboard.service.notification.NotificationDispatchService dispatchService;

    /**
     * Recompute kilidi: bir business'in zincirini aynı anda iki recompute/edit
     * dövmesin (yarım recompute → tutarsız opening riski, §4.1 azaltma). İn-process
     * lock — tek instance varsayımı (mevcut cron de aynı varsayımda).
     */
    private final ConcurrentHashMap<UUID, Object> chainLocks = new ConcurrentHashMap<>();

    private Object lockFor(UUID businessId) {
        return chainLocks.computeIfAbsent(businessId, k -> new Object());
    }

    // ──────────────────────────── FINALIZE (close) ────────────────────────────

    /**
     * Gün-kapanışını finalize eder — çok-hesaplı zorunlu sayım + SAĞLAMA HESAP.
     *
     * <p>{@code closeDate} null = bugün. Geçmiş tarih = backdated → admin-only +
     * feature flag (§4.1) + audit highlight; ardından forward-chain recompute.</p>
     */
    @Transactional
    public DayCloseDto closeDay(UUID userId, UUID businessId, CloseDayRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        LocalDate today = LocalDate.now();
        LocalDate date = req.getCloseDate() != null ? req.getCloseDate() : today;
        if (date.isAfter(today)) {
            throw new IllegalArgumentException("close_date gelecek tarih olamaz: " + date);
        }
        boolean isBackdated = date.isBefore(today);
        if (isBackdated) {
            assertBackdateAllowed(user);
        }

        if (req.getAccountCounts() == null || req.getAccountCounts().isEmpty()) {
            throw new IllegalArgumentException(
                    "Gün kapanışı için en az bir hesap sayımı zorunlu (SON KASA = Σ sayım)");
        }

        synchronized (lockFor(businessId)) {
            Optional<DayClose> existing =
                    dayCloseRepository.findByBusinessIdAndCloseDate(businessId, date);
            boolean override = Boolean.TRUE.equals(req.getOverride());
            if (existing.isPresent()
                    && existing.get().getStatus() == DayCloseStatus.CLOSED
                    && !override) {
                throw new IllegalStateException(
                        "Bu tarih için kapanış zaten var: " + date + " (override=true ile üzerine yaz)");
            }

            DayClose dc = existing.orElseGet(() -> DayClose.builder()
                    .business(business)
                    .closeDate(date)
                    .build());

            // Sayımları doğrula: account_id parası-olan hesap mı + tenant mı?
            Map<UUID, BankAccount> moneyAccounts = new LinkedHashMap<>();
            for (BankAccount a : calculator.moneyHoldingAccounts(businessId)) {
                moneyAccounts.put(a.getId(), a);
            }

            BigDecimal actualTotal = BigDecimal.ZERO;
            clearExistingCounts(dc); // override: eski sayımları DB'den sil + flush (unique çakışmasını önle)
            for (CloseDayRequest.AccountCountInput in : req.getAccountCounts()) {
                BankAccount acc = moneyAccounts.get(in.getAccountId());
                if (acc == null) {
                    throw new IllegalArgumentException(
                            "Geçersiz/yetkisiz hesap sayımı: " + in.getAccountId()
                                    + " (parası-olan hesap değil ya da farklı işletme)");
                }
                BigDecimal counted = in.getCountedBalance();
                BigDecimal computedBal = calculator.accountComputedAsOf(acc.getId(), date);
                DayCloseAccountCount c = DayCloseAccountCount.builder()
                        .dayClose(dc)
                        .account(acc)
                        .countedBalance(counted)
                        .computedBalance(computedBal)
                        .accountVariance(computedBal.subtract(counted))
                        .build();
                dc.getAccountCounts().add(c);
                actualTotal = actualTotal.add(counted);
            }

            // SAĞLAMA HESAP zinciri (posting-tabanlı).
            List<UUID> accIds = new ArrayList<>(moneyAccounts.keySet());
            BigDecimal opening = calculator.openingFor(businessId, date);
            BigDecimal totalIn = calculator.totalInFor(businessId, date, accIds);
            BigDecimal totalOut = calculator.totalOutFor(businessId, date, accIds);
            BigDecimal computed = calculator.computedClosing(opening, totalIn, totalOut);
            BigDecimal variance = computed.subtract(actualTotal); // KARAR A1: computed − actual

            BigDecimal threshold = req.getVarianceThreshold() != null
                    ? req.getVarianceThreshold() : DEFAULT_THRESHOLD;
            boolean alarm = variance.abs().compareTo(threshold) > 0;

            dc.setOpeningBalance(opening);
            dc.setTotalIn(totalIn);
            dc.setTotalOut(totalOut);
            dc.setComputedClosing(computed);
            dc.setActualTotal(actualTotal);
            dc.setVariance(variance);
            dc.setVarianceThreshold(threshold);
            dc.setAlarmFired(alarm);
            dc.setStatus(DayCloseStatus.CLOSED);
            dc.setBackdated(isBackdated);
            dc.setCreatedVia(isBackdated ? DayCloseCreatedVia.BACKDATED : DayCloseCreatedVia.TODAY);
            dc.setReasonCategory(normalizeReason(req.getReasonCategory()));
            dc.setReasonNote(req.getReasonNote());
            dc.setClosedBy(userId);
            dc.setClosedAt(LocalDateTime.now());

            dc = dayCloseRepository.save(dc);

            // Audit
            Map<String, Object> meta = baseMeta(dc);
            meta.put("backdated", isBackdated);
            meta.put("override", override);
            auditLogService.recordEntityAction(
                    isBackdated ? AuditAction.DAY_CLOSE_BACKDATED : AuditAction.DAY_CLOSE_CLOSED,
                    userId, user.getUsername(),
                    "DAY_CLOSE", dc.getId(),
                    "Gün kapanışı " + date + " — computed=" + computed
                            + " actual=" + actualTotal + " variance=" + variance,
                    meta,
                    isBackdated ? AuditAction.HIGHLIGHT_DAY_CLOSE_BACKDATED : null);

            if (alarm) {
                fireAlarm(dc, user);
            }

            // §4.1: bugün-DIŞI bir kapanış zincirde ileri günleri etkiler →
            // recompute. (Bugünse zaten en uçta; forward yok.)
            if (date.isBefore(today)) {
                recomputeChainFromInternal(businessId, date.plusDays(1), userId, user.getUsername(),
                        "backdated/edit close @ " + date);
            }

            return toDto(dc);
        }
    }

    // ──────────────────────────── AUTO (cron) ────────────────────────────

    /**
     * §4 madde 2 + 6: 20:00 cron — bugün PENDING DayClose'u açar (yoksa). Sayım
     * GİRİLMEZ (actual=null); computed/opening yine de hesaplanır ki ertesi gün
     * devri kopmasın + tutarsızlık erken görünsün. Idempotent.
     */
    @Transactional
    public List<DayCloseDto> autoOpenToday() {
        LocalDate today = LocalDate.now();
        List<DayCloseDto> out = new ArrayList<>();
        for (Business b : businessRepository.findAll()) {
            UUID bizId = b.getId();
            Optional<DayClose> existing = dayCloseRepository.findByBusinessIdAndCloseDate(bizId, today);
            if (existing.isPresent() && existing.get().getStatus() == DayCloseStatus.CLOSED) {
                continue; // manuel kapatılmış — dokunma
            }
            List<UUID> accIds = calculator.moneyHoldingAccountIds(bizId);
            BigDecimal opening = calculator.openingFor(bizId, today);
            BigDecimal totalIn = calculator.totalInFor(bizId, today, accIds);
            BigDecimal totalOut = calculator.totalOutFor(bizId, today, accIds);
            BigDecimal computed = calculator.computedClosing(opening, totalIn, totalOut);

            final Business _b = b;
            DayClose dc = existing.orElseGet(() -> DayClose.builder()
                    .business(_b).closeDate(today).build());
            dc.setOpeningBalance(opening);
            dc.setTotalIn(totalIn);
            dc.setTotalOut(totalOut);
            dc.setComputedClosing(computed);
            // actual/variance null bırakılır — sayım yapılmadı.
            dc.setActualTotal(null);
            dc.setVariance(null);
            dc.setAlarmFired(false);
            dc.setStatus(DayCloseStatus.PENDING);
            dc.setCreatedVia(DayCloseCreatedVia.AUTO_CRON);
            dc = dayCloseRepository.save(dc);

            auditLogService.recordEntityAction(
                    AuditAction.DAY_CLOSE_AUTO, null, "system",
                    "DAY_CLOSE", dc.getId(),
                    "Otomatik gün açıldı [" + b.getName() + "] " + today + " — computed=" + computed,
                    baseMeta(dc), null);
            out.add(toDto(dc));
        }
        return out;
    }

    // ──────────────────────────── REOPEN (admin) ────────────────────────────

    @Transactional
    public DayCloseDto reopen(UUID userId, UUID dayCloseId, String reasonNote) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!accessGuard.isAdmin(userId)) {
            throw new SecurityException("Sadece admin gün kapanışını yeniden açabilir");
        }
        DayClose dc = dayCloseRepository.findById(dayCloseId)
                .orElseThrow(() -> new IllegalArgumentException("Kapanış bulunamadı"));
        accessGuard.assertCanAccessBusiness(userId,
                dc.getBusiness() != null ? dc.getBusiness().getId() : null);

        dc.setStatus(DayCloseStatus.REOPENED);
        dc.setReasonNote((dc.getReasonNote() != null ? dc.getReasonNote() + "\n" : "")
                + "[REOPEN " + LocalDate.now() + " by " + user.getUsername() + "] "
                + (reasonNote != null ? reasonNote : ""));
        dc = dayCloseRepository.save(dc);

        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSE_REOPENED, userId, user.getUsername(),
                "DAY_CLOSE", dc.getId(),
                "Gün kapanışı yeniden açıldı: " + dc.getCloseDate(),
                Map.of("date", dc.getCloseDate().toString()),
                AuditAction.HIGHLIGHT_DAY_CLOSE_REOPEN);
        return toDto(dc);
    }

    // ──────────────────────────── DRILL-DOWN (kaçak kaynağı) ────────────────────────────

    /** §4 madde 5: variance'ın kaynağına in — hesap-bazlı sapma + gün hareketleri. */
    @Transactional(readOnly = true)
    public DayCloseDrillDownDto drillDown(UUID userId, UUID businessId, LocalDate date) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        DayClose dc = dayCloseRepository.findByBusinessIdAndCloseDate(businessId, date)
                .orElseThrow(() -> new IllegalArgumentException("Kapanış bulunamadı: " + date));

        List<DayCloseAccountCountDto> breakdown = countRepository.findByDayCloseId(dc.getId())
                .stream()
                .map(this::toCountDto)
                .sorted((a, b) -> nz(b.getAccountVariance()).abs()
                        .compareTo(nz(a.getAccountVariance()).abs()))
                .toList();

        List<UUID> accIds = calculator.moneyHoldingAccountIds(businessId);
        List<DayCloseDrillDownDto.Movement> movements = new ArrayList<>();
        if (!accIds.isEmpty()) {
            for (Posting p : postingRepository.findLocationLegsForDate(businessId, date, accIds)) {
                BankAccount acc = p.getAccount();
                JournalEntry e = p.getJournalEntry();
                movements.add(DayCloseDrillDownDto.Movement.builder()
                        .postingId(p.getId())
                        .journalEntryId(e != null ? e.getId() : null)
                        .accountId(acc != null ? acc.getId() : null)
                        .accountName(acc != null ? acc.getName() : null)
                        .amount(p.getAmount())
                        .sourceType(e != null && e.getSourceType() != null
                                ? e.getSourceType().name() : null)
                        .description(e != null ? e.getDescription() : null)
                        .build());
            }
        }

        return DayCloseDrillDownDto.builder()
                .closeDate(date)
                .openingBalance(dc.getOpeningBalance())
                .totalIn(dc.getTotalIn())
                .totalOut(dc.getTotalOut())
                .computedClosing(dc.getComputedClosing())
                .actualTotal(dc.getActualTotal())
                .variance(dc.getVariance())
                .accountBreakdown(breakdown)
                .movements(movements)
                .build();
    }

    // ──────────────────────── CHAIN RECOMPUTE (§4.1) ────────────────────────

    /**
     * §4.1 devir zinciri ileri-yeniden-hesap: {@code from}'tan bugüne her CLOSED
     * DayClose'un opening/totalIn/totalOut/computed/variance'ını SIRAYLA yeniden
     * türetir. Sayım (actualTotal) DEĞİŞMEZ — sadece computed/variance ve opening
     * (önceki gün actual'ından devir) güncellenir.
     *
     * <p><b>Idempotent:</b> tekrar koşturmada aynı sonuç (girdi posting'ler +
     * sayımlar sabitse). <b>Kilitli pencere:</b> {@link #chainLocks} ile o
     * business'e eşzamanlı recompute/edit bloklanır. <b>Bitişte invariant:</b>
     * her CLOSED gün için opening == önceki CLOSED gün actual (tolerans dahilinde);
     * ihlal varsa tutarsızlık uyarısı loglanır + audit.</p>
     *
     * @return etkilenen (güncellenen) gün sayısı.
     */
    @Transactional
    public int recomputeChainFrom(UUID userId, UUID businessId, LocalDate from) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = userRepository.findById(userId).orElse(null);
        String actor = user != null ? user.getUsername() : "system";
        synchronized (lockFor(businessId)) {
            return recomputeChainFromInternal(businessId, from, userId, actor, "manual recompute");
        }
    }

    /**
     * İç recompute — çağıran ZATEN kilidi tutmalı (closeDay / approve içinden).
     */
    private int recomputeChainFromInternal(UUID businessId, LocalDate from,
                                           UUID userId, String actor, String trigger) {
        LocalDate today = LocalDate.now();
        List<DayClose> chain = dayCloseRepository
                .findByBusinessIdAndCloseDateBetweenOrderByCloseDateAsc(businessId, from, today);
        List<UUID> accIds = calculator.moneyHoldingAccountIds(businessId);
        int touched = 0;
        List<String> inconsistencies = new ArrayList<>();

        for (DayClose dc : chain) {
            LocalDate d = dc.getCloseDate();
            BigDecimal opening = calculator.openingFor(businessId, d);
            BigDecimal totalIn = calculator.totalInFor(businessId, d, accIds);
            BigDecimal totalOut = calculator.totalOutFor(businessId, d, accIds);
            BigDecimal computed = calculator.computedClosing(opening, totalIn, totalOut);

            dc.setOpeningBalance(opening);
            dc.setTotalIn(totalIn);
            dc.setTotalOut(totalOut);
            dc.setComputedClosing(computed);

            // actual sabit kalır; variance yeniden = computed − actual.
            if (dc.getActualTotal() != null) {
                BigDecimal variance = computed.subtract(dc.getActualTotal());
                dc.setVariance(variance);
                BigDecimal th = dc.getVarianceThreshold() != null
                        ? dc.getVarianceThreshold() : DEFAULT_THRESHOLD;
                dc.setAlarmFired(variance.abs().compareTo(th) > 0);
            }
            if (dc.getCreatedVia() != DayCloseCreatedVia.BACKDATED
                    && dc.getCreatedVia() != DayCloseCreatedVia.EDIT_APPROVED) {
                dc.setCreatedVia(DayCloseCreatedVia.CHAIN_RECOMPUTE);
            }
            dayCloseRepository.save(dc);
            touched++;
        }

        // Bitişte invariant: her CLOSED gün opening == önceki CLOSED gün actual.
        verifyChainInvariant(businessId, from, today, inconsistencies);

        Map<String, Object> meta = new HashMap<>();
        meta.put("from", from.toString());
        meta.put("touched", touched);
        meta.put("trigger", trigger);
        if (!inconsistencies.isEmpty()) {
            meta.put("inconsistencies", inconsistencies);
            log.warn("[day-close-recompute] business={} from={} TUTARSIZLIK: {}",
                    businessId, from, inconsistencies);
        }
        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSE_CHAIN_RECOMPUTE, userId, actor,
                "DAY_CLOSE", null,
                "Devir zinciri yeniden hesaplandı " + from + "→bugün (" + touched + " gün)",
                meta,
                inconsistencies.isEmpty() ? null : AuditAction.HIGHLIGHT_DAY_CLOSE_ALARM);
        log.info("[day-close-recompute] business={} from={} touched={} inconsist={}",
                businessId, from, touched, inconsistencies.size());
        return touched;
    }

    /**
     * Zincir bütünlüğü: ardışık CLOSED günlerde {@code opening == önceki actual}.
     * (Atlanmış/PENDING günler zinciri kopartmaz — en yakın önceki CLOSED'a göre.)
     */
    private void verifyChainInvariant(UUID businessId, LocalDate from, LocalDate to,
                                      List<String> out) {
        List<DayClose> all = dayCloseRepository
                .findByBusinessIdAndCloseDateBetweenOrderByCloseDateAsc(
                        businessId, from.minusYears(5), to)
                .stream()
                .filter(dc -> dc.getStatus() == DayCloseStatus.CLOSED && dc.getActualTotal() != null)
                .toList();
        for (int i = 1; i < all.size(); i++) {
            DayClose prev = all.get(i - 1);
            DayClose cur = all.get(i);
            if (cur.getCloseDate().isBefore(from)) continue; // pencere dışı
            BigDecimal expectedOpening = prev.getActualTotal();
            BigDecimal actualOpening = cur.getOpeningBalance() != null
                    ? cur.getOpeningBalance() : BigDecimal.ZERO;
            if (expectedOpening != null
                    && actualOpening.subtract(expectedOpening).abs()
                    .compareTo(INVARIANT_TOLERANCE) > 0) {
                out.add(cur.getCloseDate() + ": opening=" + actualOpening
                        + " ≠ önceki(" + prev.getCloseDate() + ") actual=" + expectedOpening);
            }
        }
    }

    // ──────────────────── EDIT APPLY (§4.2, edit service'ten çağrılır) ────────────────────

    /**
     * §4.2: ONAYLANMIŞ bir düzenlemeyi finalize CLOSED kapanışa uygular.
     * {@link DayCloseEditService#approve} içinden çağrılır (zaten admin-gated +
     * audit). Sayımları günceller, SAĞLAMA HESAP'ı yeniden hesaplar, sonra
     * forward-chain recompute tetikler. Kilit + invariant burada da geçerli.
     *
     * @param newCounts   önerilen yeni sayımlar (boş/null = sayım değişmez)
     * @param threshold   yeni eşik (null = mevcut)
     * @return güncellenmiş DayClose snapshot'ı (apply sonrası).
     */
    @Transactional
    public DayClose applyApprovedEdit(UUID dayCloseId,
                                      List<CloseDayRequest.AccountCountInput> newCounts,
                                      BigDecimal threshold,
                                      String reasonCategory, String reasonNote,
                                      UUID actorUserId, String actorName) {
        DayClose dc = dayCloseRepository.findById(dayCloseId)
                .orElseThrow(() -> new IllegalArgumentException("Kapanış bulunamadı"));
        UUID businessId = dc.getBusiness().getId();
        synchronized (lockFor(businessId)) {
            LocalDate date = dc.getCloseDate();
            Map<UUID, BankAccount> moneyAccounts = new LinkedHashMap<>();
            for (BankAccount a : calculator.moneyHoldingAccounts(businessId)) {
                moneyAccounts.put(a.getId(), a);
            }

            if (newCounts != null && !newCounts.isEmpty()) {
                BigDecimal actualTotal = BigDecimal.ZERO;
                clearExistingCounts(dc);
                for (CloseDayRequest.AccountCountInput in : newCounts) {
                    BankAccount acc = moneyAccounts.get(in.getAccountId());
                    if (acc == null) {
                        throw new IllegalArgumentException(
                                "Geçersiz/yetkisiz hesap sayımı: " + in.getAccountId());
                    }
                    BigDecimal counted = in.getCountedBalance();
                    BigDecimal computedBal = calculator.accountComputedAsOf(acc.getId(), date);
                    dc.getAccountCounts().add(DayCloseAccountCount.builder()
                            .dayClose(dc).account(acc)
                            .countedBalance(counted)
                            .computedBalance(computedBal)
                            .accountVariance(computedBal.subtract(counted))
                            .build());
                    actualTotal = actualTotal.add(counted);
                }
                dc.setActualTotal(actualTotal);
            }

            List<UUID> accIds = new ArrayList<>(moneyAccounts.keySet());
            BigDecimal opening = calculator.openingFor(businessId, date);
            BigDecimal totalIn = calculator.totalInFor(businessId, date, accIds);
            BigDecimal totalOut = calculator.totalOutFor(businessId, date, accIds);
            BigDecimal computed = calculator.computedClosing(opening, totalIn, totalOut);
            BigDecimal variance = dc.getActualTotal() != null
                    ? computed.subtract(dc.getActualTotal()) : null;
            BigDecimal th = threshold != null ? threshold
                    : (dc.getVarianceThreshold() != null ? dc.getVarianceThreshold() : DEFAULT_THRESHOLD);

            dc.setOpeningBalance(opening);
            dc.setTotalIn(totalIn);
            dc.setTotalOut(totalOut);
            dc.setComputedClosing(computed);
            dc.setVariance(variance);
            dc.setVarianceThreshold(th);
            dc.setAlarmFired(variance != null && variance.abs().compareTo(th) > 0);
            dc.setCreatedVia(DayCloseCreatedVia.EDIT_APPROVED);
            if (reasonCategory != null) dc.setReasonCategory(normalizeReason(reasonCategory));
            if (reasonNote != null) dc.setReasonNote(reasonNote);
            dc = dayCloseRepository.save(dc);

            if (dc.isAlarmFired()) {
                fireAlarm(dc, userRepository.findById(actorUserId).orElse(null));
            }

            // actual değiştiyse → sonraki günler etkilenir (§4.2 / §4.1 zinciri).
            recomputeChainFromInternal(businessId, date.plusDays(1), actorUserId, actorName,
                    "edit-approved apply @ " + date);
            return dc;
        }
    }

    /** Edit service'in before_snapshot/DTO'ları için DayClose yükler. */
    @Transactional(readOnly = true)
    public Optional<DayClose> findById(UUID id) {
        return dayCloseRepository.findById(id);
    }

    /** Edit service için DTO map'i (public). */
    public DayCloseDto toDtoPublic(DayClose dc) {
        return toDto(dc);
    }

    // ──────────────────────────── QUERY ────────────────────────────

    @Transactional(readOnly = true)
    public Optional<DayCloseDto> get(UUID userId, UUID businessId, LocalDate date) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return dayCloseRepository.findByBusinessIdAndCloseDate(businessId, date).map(this::toDto);
    }

    @Transactional(readOnly = true)
    public List<DayCloseDto> list(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return dayCloseRepository.findByBusinessIdOrderByCloseDateDesc(businessId)
                .stream().map(this::toDto).toList();
    }

    /**
     * §4 madde 3-4: bugün için canlı SAĞLAMA HESAP önizleme — hangi hesaplar
     * sayılmalı + opening/computed (sayım girilmeden önce). UI kapanış ekranını
     * besler.
     */
    @Transactional(readOnly = true)
    public DayCloseDto preview(UUID userId, UUID businessId, LocalDate date) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate d = date != null ? date : LocalDate.now();
        List<BankAccount> accounts = calculator.moneyHoldingAccounts(businessId);
        List<UUID> accIds = accounts.stream().map(BankAccount::getId).toList();
        BigDecimal opening = calculator.openingFor(businessId, d);
        BigDecimal totalIn = calculator.totalInFor(businessId, d, accIds);
        BigDecimal totalOut = calculator.totalOutFor(businessId, d, accIds);
        BigDecimal computed = calculator.computedClosing(opening, totalIn, totalOut);

        Optional<DayClose> existing = dayCloseRepository.findByBusinessIdAndCloseDate(businessId, d);
        List<DayCloseAccountCountDto> seed = accounts.stream().map(a ->
                DayCloseAccountCountDto.builder()
                        .accountId(a.getId())
                        .accountName(a.getName())
                        .accountType(a.getType() != null ? a.getType().name() : null)
                        .computedBalance(calculator.accountComputedAsOf(a.getId(), d))
                        .build()).toList();

        return DayCloseDto.builder()
                .id(existing.map(DayClose::getId).orElse(null))
                .closeDate(d)
                .status(existing.map(x -> x.getStatus().name()).orElse("PENDING"))
                .openingBalance(opening)
                .totalIn(totalIn)
                .totalOut(totalOut)
                .computedClosing(computed)
                .actualTotal(existing.map(DayClose::getActualTotal).orElse(null))
                .variance(existing.map(DayClose::getVariance).orElse(null))
                .accountCounts(seed)
                .build();
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    /**
     * Override/edit re-count'ta eski {@link DayCloseAccountCount}'ları temizler.
     * orphanRemoval tek başına yetmez: Hibernate yeni INSERT'leri eski DELETE'ten
     * ÖNCE atabilir → {@code uk_dcac_dayclose_account} unique ihlali. Bu yüzden
     * önce koleksiyonu boşalt + DB'den fiziksel sil + flush; sonra yeni count'lar
     * eklenir (çakışma yok). Yeni (id'siz) DayClose için no-op.
     */
    private void clearExistingCounts(DayClose dc) {
        dc.getAccountCounts().clear();
        if (dc.getId() != null) {
            countRepository.deleteByDayCloseId(dc.getId());
            entityManager.flush();
        }
    }

    private void assertBackdateAllowed(User user) {
        if (!"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Sadece admin geçmiş tarih için kapanış yapabilir");
        }
        if (!featureFlags.isBackdateEnabled()) {
            throw new IllegalStateException(
                    "Geri dönük kapanış kapalı (day_close.backdate_enabled=false)");
        }
    }

    private void fireAlarm(DayClose dc, User user) {
        Map<String, Object> meta = baseMeta(dc);
        meta.put("threshold", dc.getVarianceThreshold());
        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSE_ALARM,
                user != null ? user.getId() : null,
                user != null ? user.getUsername() : "system",
                "DAY_CLOSE", dc.getId(),
                "KAÇAK ALARMI " + dc.getCloseDate() + " — variance=" + dc.getVariance()
                        + " (eşik=" + dc.getVarianceThreshold() + ")",
                meta, AuditAction.HIGHLIGHT_DAY_CLOSE_ALARM);
        log.warn("[day-close-alarm] business={} date={} variance={} threshold={}",
                dc.getBusiness() != null ? dc.getBusiness().getId() : null,
                dc.getCloseDate(), dc.getVariance(), dc.getVarianceThreshold());

        // Faz D (§9/TODO 4): kaçak eşik aşıldı → bildirim üret. In-app default açık;
        // Telegram opt-in (admin per-event tercih). Best-effort: bildirim hatası
        // kapanışı bozmaz.
        try {
            dispatchVarianceAlert(dc);
        } catch (Exception e) {
            log.warn("[day-close-alarm] bildirim dispatch hatası: {}", e.getMessage());
        }
    }

    /**
     * Faz D (§9/TODO 4): DAY_CLOSE_VARIANCE_ALERT'i tüm admin'lere dağıt (in-app +
     * opt-in Telegram outbound). Per-event tercih + admin'e dispatch katmanında
     * uygulanır.
     */
    private void dispatchVarianceAlert(DayClose dc) {
        java.util.List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        if (admins.isEmpty()) return;
        java.util.List<UUID> recipients = admins.stream().map(User::getId).toList();
        UUID businessId = dc.getBusiness() != null ? dc.getBusiness().getId() : null;
        dispatchService.dispatch(
                com.bizboard.common.enums.NotificationEvent.DAY_CLOSE_VARIANCE_ALERT,
                recipients,
                Map.of(
                        "date", dc.getCloseDate() != null ? dc.getCloseDate().toString() : "—",
                        "variance", money(dc.getVariance()),
                        "threshold", money(dc.getVarianceThreshold()),
                        "computed", money(dc.getComputedClosing()),
                        "actual", money(dc.getActualTotal()),
                        "currency", "TL"
                ),
                "/dashboard/gun-kapanisi",
                businessId);
        log.info("[day-close-alarm] variance alert dispatched business={} date={} alıcı={}",
                businessId, dc.getCloseDate(), recipients.size());
    }

    private static String money(BigDecimal v) {
        return v != null ? v.toPlainString() : "0";
    }

    private Map<String, Object> baseMeta(DayClose dc) {
        Map<String, Object> m = new HashMap<>();
        m.put("date", dc.getCloseDate() != null ? dc.getCloseDate().toString() : null);
        m.put("opening", dc.getOpeningBalance());
        m.put("totalIn", dc.getTotalIn());
        m.put("totalOut", dc.getTotalOut());
        m.put("computed", dc.getComputedClosing());
        m.put("actual", dc.getActualTotal());
        m.put("variance", dc.getVariance());
        return m;
    }

    private static final Set<String> ALLOWED_REASONS = Set.of(
            DayClose.REASON_LOSS, DayClose.REASON_MIS_ENTRY,
            DayClose.REASON_ROUNDING, DayClose.REASON_OTHER);

    private static String normalizeReason(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_REASONS.contains(upper)) {
            throw new IllegalArgumentException(
                    "Geçersiz reason_category: " + raw + " — LOSS/MIS_ENTRY/ROUNDING/OTHER olmalı");
        }
        return upper;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    DayCloseDto toDto(DayClose dc) {
        List<DayCloseAccountCountDto> counts = dc.getAccountCounts() != null
                ? dc.getAccountCounts().stream().map(this::toCountDto).toList()
                : List.of();
        return DayCloseDto.builder()
                .id(dc.getId())
                .closeDate(dc.getCloseDate())
                .status(dc.getStatus() != null ? dc.getStatus().name() : null)
                .openingBalance(dc.getOpeningBalance())
                .totalIn(dc.getTotalIn())
                .totalOut(dc.getTotalOut())
                .computedClosing(dc.getComputedClosing())
                .actualTotal(dc.getActualTotal())
                .variance(dc.getVariance())
                .varianceThreshold(dc.getVarianceThreshold())
                .alarmFired(dc.isAlarmFired())
                .backdated(dc.isBackdated())
                .createdVia(dc.getCreatedVia() != null ? dc.getCreatedVia().name() : null)
                .reasonCategory(dc.getReasonCategory())
                .reasonNote(dc.getReasonNote())
                .closedBy(dc.getClosedBy())
                .closedAt(dc.getClosedAt())
                .accountCounts(counts)
                .build();
    }

    private DayCloseAccountCountDto toCountDto(DayCloseAccountCount c) {
        BankAccount a = c.getAccount();
        return DayCloseAccountCountDto.builder()
                .id(c.getId())
                .accountId(a != null ? a.getId() : null)
                .accountName(a != null ? a.getName() : null)
                .accountType(a != null && a.getType() != null ? a.getType().name() : null)
                .countedBalance(c.getCountedBalance())
                .computedBalance(c.getComputedBalance())
                .accountVariance(c.getAccountVariance())
                .build();
    }
}
