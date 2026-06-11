package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.DayOpenAccountOpeningDto;
import com.bizboard.common.dto.DayOpenDto;
import com.bizboard.common.dto.DayStatusDto;
import com.bizboard.common.dto.OpenDayRequest;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.DayCloseStatus;
import com.bizboard.common.enums.DayLifecycleStatus;
import com.bizboard.common.enums.DayOpenCreatedVia;
import com.bizboard.common.enums.DayOpenStatus;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.common.enums.PostingLegKind;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Ledger v2 (Faz B — Gün Açılışı) — gün AÇILIŞ durum makinesi + DEVİR YUVARLAMA.
 *
 * <h3>State machine (işletme + tarih):</h3>
 * <pre>
 *   AÇILMAMIŞ ──"Günü Aç"──▶ AÇIK ──DayClose finalize──▶ KAPALI
 *   (DayOpen yok)            (DayOpen.OPEN)               (DayOpen.CLOSED + DayClose.CLOSED)
 * </pre>
 *
 * <h3>Günü Aç akışı (KAPSAM §2):</h3>
 * <ol>
 *   <li>Her para-hesabın açılışı önceki günün CLOSED actual'ından OTOMATİK dolar
 *       (devir — {@link DayCloseCalculator#openingFor} / hesap özelinde
 *       {@code accountComputedAsOf(prevCloseDate)}).</li>
 *   <li>Kullanıcı her hesabın açılışını elle yuvarlar (DEVİR YUVARLAMA).</li>
 *   <li>Fark Σ(rounded − carriedOver) → "Devir Yuvarlama" düzeltme posting'i
 *       ({@code DAY_CLOSE_ADJUST}, source_ref_id=DayOpen.id): her hesabın delta'sı
 *       için bir LOCATION_MOVE bacağı + Σ'yi sıfırlayan tek clearing bacağı →
 *       <b>Σ=0</b>; bakiye tutarlı; <b>P&L-temiz</b> (yalnız LOCATION_MOVE).</li>
 *   <li>Onay → gün AÇIK + audit (her adım).</li>
 * </ol>
 *
 * <p><b>STRICT:</b> açılış/yuvarlama admin-gate + audit; backdated admin + feature
 * flag; yuvarlama posting Σ=0 doğrulanır (değilse FLAGGED, üretilmez); DGR /
 * mevcut veri bozulmaz (enforcement ayrı flag). <b>Reversible:</b> yeniden açılış
 * (override) eski yuvarlama posting'ini geri alır + yeniden üretir.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DayOpenService {

    private static final BigDecimal INVARIANT_TOLERANCE = new BigDecimal("0.01");

    private final DayOpenRepository dayOpenRepository;
    private final DayOpenAccountOpeningRepository openingRepository;
    private final DayCloseRepository dayCloseRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final DayCloseCalculator calculator;
    private final BusinessAccessGuard accessGuard;
    private final LedgerFeatureFlagService featureFlags;
    private final AuditLogService auditLogService;
    private final jakarta.persistence.EntityManager entityManager;

    // ──────────────────────────── OPEN (Günü Aç) ────────────────────────────

    /**
     * Günü açar — hesap-başı açılış (otomatik devir + elle yuvarlama) + Σ=0 devir-
     * yuvarlama posting'i. {@code openDate} null = bugün; geçmiş = backdated
     * (admin + flag). KAPALI gün açılamaz; OPEN gün yalnız {@code override=true}
     * ile yeniden açılır (eski yuvarlama posting reverse + yeniden üret).
     */
    @Transactional
    public DayOpenDto openDay(UUID userId, UUID businessId, OpenDayRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        LocalDate today = LocalDate.now();
        LocalDate date = req.getOpenDate() != null ? req.getOpenDate() : today;
        if (date.isAfter(today)) {
            throw new IllegalArgumentException("open_date gelecek tarih olamaz: " + date);
        }
        boolean isBackdated = date.isBefore(today);
        if (isBackdated) {
            assertBackdateAllowed(user);
        }

        // KAPALI gün açılamaz (DayClose finalize edilmiş).
        if (dayCloseRepository.findByBusinessIdAndCloseDate(businessId, date)
                .map(dc -> dc.getStatus() == DayCloseStatus.CLOSED).orElse(false)) {
            throw new IllegalStateException(
                    "Bu gün KAPALI (kapanış yapılmış) — açılamaz: " + date
                            + ". Düzeltme için onaylı kapanış düzenleme akışını kullanın.");
        }

        boolean override = Boolean.TRUE.equals(req.getOverride());
        Optional<DayOpen> existingOpt = dayOpenRepository.findByBusinessIdAndOpenDate(businessId, date);
        if (existingOpt.isPresent()
                && existingOpt.get().getStatus() == DayOpenStatus.OPEN
                && !override) {
            throw new IllegalStateException(
                    "Bu gün zaten AÇIK: " + date + " (yeniden açmak için override=true gönderin)");
        }

        DayOpen dayOpen = existingOpt.orElseGet(() -> DayOpen.builder()
                .business(business).openDate(date).build());

        // Yeniden açılış: eski yuvarlama posting'ini ve açılış bacaklarını geri al.
        if (dayOpen.getId() != null) {
            reverseRoundingEntry(dayOpen);
            clearExistingOpenings(dayOpen);
        }

        // Para-hesapları + otomatik devir (carriedOver) çöz.
        List<BankAccount> accounts = calculator.moneyHoldingAccounts(businessId);
        Map<UUID, BigDecimal> roundedByAccount = new LinkedHashMap<>();
        if (req.getAccountOpenings() != null) {
            for (OpenDayRequest.AccountOpeningInput in : req.getAccountOpenings()) {
                if (in.getRoundedOpening() == null) continue;
                roundedByAccount.put(in.getAccountId(), in.getRoundedOpening());
            }
        }
        // Verilen account_id'ler para-hesap mı? (tenant/tip doğrulama)
        Set<UUID> validIds = new HashSet<>();
        for (BankAccount a : accounts) validIds.add(a.getId());
        for (UUID given : roundedByAccount.keySet()) {
            if (!validIds.contains(given)) {
                throw new IllegalArgumentException(
                        "Geçersiz/yetkisiz hesap açılışı: " + given
                                + " (parası-olan hesap değil ya da farklı işletme)");
            }
        }

        BigDecimal carriedOverTotal = BigDecimal.ZERO;
        BigDecimal roundedTotal = BigDecimal.ZERO;
        List<DayOpenAccountOpening> openings = new ArrayList<>();
        for (BankAccount acc : accounts) {
            BigDecimal carried = carriedOverFor(acc.getId(), date);
            BigDecimal rounded = roundedByAccount.getOrDefault(acc.getId(), carried);
            BigDecimal delta = rounded.subtract(carried);
            openings.add(DayOpenAccountOpening.builder()
                    .dayOpen(dayOpen)
                    .account(acc)
                    .carriedOver(carried)
                    .rounded(rounded)
                    .roundingDelta(delta)
                    .build());
            carriedOverTotal = carriedOverTotal.add(carried);
            roundedTotal = roundedTotal.add(rounded);
        }
        BigDecimal roundingDelta = roundedTotal.subtract(carriedOverTotal);

        dayOpen.getAccountOpenings().addAll(openings);
        dayOpen.setCarriedOverTotal(carriedOverTotal);
        dayOpen.setRoundedTotal(roundedTotal);
        dayOpen.setRoundingDelta(roundingDelta);
        dayOpen.setStatus(DayOpenStatus.OPEN);
        dayOpen.setBackdated(isBackdated);
        dayOpen.setCreatedVia(isBackdated ? DayOpenCreatedVia.BACKDATED : DayOpenCreatedVia.MANUAL);
        dayOpen.setReasonNote(req.getReasonNote());
        dayOpen.setOpenedBy(userId);
        dayOpen.setOpenedAt(LocalDateTime.now());
        dayOpen.setRoundingEntryId(null);

        dayOpen = dayOpenRepository.save(dayOpen);

        // DEVİR YUVARLAMA posting'i (Σ=0, P&L-temiz). Delta 0 ise üretilmez.
        UUID roundingEntryId = postRoundingAdjustment(dayOpen, openings, user);
        if (roundingEntryId != null) {
            dayOpen.setRoundingEntryId(roundingEntryId);
            dayOpen = dayOpenRepository.save(dayOpen);
        }

        // Audit (her adım).
        Map<String, Object> meta = baseMeta(dayOpen);
        meta.put("backdated", isBackdated);
        meta.put("override", override);
        auditLogService.recordEntityAction(
                isBackdated ? AuditAction.DAY_OPEN_BACKDATED : AuditAction.DAY_OPEN_OPENED,
                userId, user.getUsername(),
                "DAY_OPEN", dayOpen.getId(),
                "Gün açıldı " + date + " — devir=" + carriedOverTotal
                        + " yuvarlanmış=" + roundedTotal + " fark=" + roundingDelta,
                meta,
                isBackdated ? AuditAction.HIGHLIGHT_DAY_OPEN_BACKDATED : AuditAction.HIGHLIGHT_DAY_OPEN);

        return toDto(dayOpen, today);
    }

    // ──────────────────────────── REVERT (geri al) ────────────────────────────

    /**
     * Açık günü geri alır (AÇILMAMIŞ'a döndürür): yuvarlama posting'ini reverse
     * eder + DayOpen kaydını siler. Admin-only. KAPALI gün geri alınamaz.
     */
    @Transactional
    public void revertOpen(UUID userId, UUID businessId, LocalDate date) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!accessGuard.isAdmin(userId)) {
            throw new SecurityException("Sadece admin gün açılışını geri alabilir");
        }
        accessGuard.assertCanAccessBusiness(userId, businessId);
        DayOpen dayOpen = dayOpenRepository.findByBusinessIdAndOpenDate(businessId, date)
                .orElseThrow(() -> new IllegalArgumentException("Açılış bulunamadı: " + date));
        if (dayOpen.getStatus() == DayOpenStatus.CLOSED) {
            throw new IllegalStateException("Kapalı gün geri alınamaz: " + date);
        }
        reverseRoundingEntry(dayOpen);
        UUID id = dayOpen.getId();
        dayOpenRepository.delete(dayOpen); // cascade openings

        auditLogService.recordEntityAction(
                AuditAction.DAY_OPEN_REVERTED, userId, user.getUsername(),
                "DAY_OPEN", id,
                "Gün açılışı geri alındı: " + date,
                Map.of("date", date.toString()),
                AuditAction.HIGHLIGHT_DAY_OPEN);
    }

    // ──────────────── CLOSE SYNC (DayClose finalize hook) ────────────────

    /**
     * DayClose finalize edilince çağrılır (best-effort): o işletme+tarih için
     * DayOpen varsa CLOSED'a geçirir; yoksa (gün hiç açılmadan kapatıldıysa —
     * geriye-uyum) CLOSE_SYNC kaydı oluşturur. İdempotent + non-fatal: hata
     * kapanışı BOZMAZ (DayClose servisinde try/catch ile sarılır).
     */
    @Transactional
    public void onDayClosed(UUID businessId, LocalDate date, UUID actorUserId, String actorName) {
        Optional<DayOpen> opt = dayOpenRepository.findByBusinessIdAndOpenDate(businessId, date);
        if (opt.isPresent()) {
            DayOpen dayOpen = opt.get();
            if (dayOpen.getStatus() != DayOpenStatus.CLOSED) {
                dayOpen.setStatus(DayOpenStatus.CLOSED);
                dayOpen.setClosedAt(LocalDateTime.now());
                dayOpenRepository.save(dayOpen);
            }
            return;
        }
        // Geriye-uyum: gün hiç açılmamış ama kapatılıyor → CLOSE_SYNC kaydı.
        Business business = businessRepository.findById(businessId).orElse(null);
        if (business == null) return;
        DayOpen synced = DayOpen.builder()
                .business(business).openDate(date)
                .status(DayOpenStatus.CLOSED)
                .createdVia(DayOpenCreatedVia.CLOSE_SYNC)
                .closedAt(LocalDateTime.now())
                .build();
        dayOpenRepository.save(synced);
        auditLogService.recordEntityAction(
                AuditAction.DAY_OPEN_CLOSED_SYNC, actorUserId,
                actorName != null ? actorName : "system",
                "DAY_OPEN", synced.getId(),
                "Gün açılmadan kapatıldı → CLOSE_SYNC kaydı: " + date,
                Map.of("date", date.toString()), null);
    }

    // ──────────────────────────── ENFORCEMENT ────────────────────────────

    /**
     * İşlem-giriş enforcement: enforcement açıksa ve gün AÇIK değilse reddet.
     * NON-BREAKING: enforcement kapalıyken her zaman geçer (mevcut akış korunur).
     * TransactionMutationService create/update'te (tarih değişiminde) çağrılır.
     *
     * @throws DayNotOpenException gün AÇIK değil (AÇILMAMIŞ/KAPALI) + enforcement açık.
     */
    @Transactional(readOnly = true)
    public void assertDayOpenForEntry(UUID businessId, LocalDate date) {
        if (businessId == null || date == null) return;             // defansif — gating'e takılmasın
        if (!featureFlags.isDayOpenEnforceEnabled(businessId)) return; // o işletmenin flag'i kapalı → serbest
        DayLifecycleStatus status = lifecycleStatus(businessId, date);
        if (status == DayLifecycleStatus.OPEN) return;
        if (status == DayLifecycleStatus.CLOSED) {
            throw new DayNotOpenException(
                    date + " günü KAPALI (kapanış yapılmış) — yeni işlem girilemez. "
                            + "Düzeltme için onaylı kapanış düzenleme akışını kullanın.");
        }
        throw new DayNotOpenException(
                date + " günü henüz AÇILMADI — işlem girmeden önce 'Günü Aç' yapın.");
    }

    // ──────────────────────────── QUERY / PREVIEW ────────────────────────────

    /**
     * "Günü Aç" ekranı önizlemesi: hangi hesaplar + otomatik devir (carriedOver)
     * + birleşik durum. Kayıt varsa (OPEN) onun yuvarlanmış değerleri döner.
     */
    @Transactional(readOnly = true)
    public DayOpenDto preview(UUID userId, UUID businessId, LocalDate date) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate today = LocalDate.now();
        LocalDate d = date != null ? date : today;
        Optional<DayOpen> existing = dayOpenRepository.findByBusinessIdAndOpenDate(businessId, d);
        if (existing.isPresent()) {
            return toDto(existing.get(), today);
        }
        // Kayıt yok → seed: her para-hesabın carriedOver'ı (rounded=carried, delta=0).
        List<BankAccount> accounts = calculator.moneyHoldingAccounts(businessId);
        List<DayOpenAccountOpeningDto> seed = new ArrayList<>();
        BigDecimal carriedTotal = BigDecimal.ZERO;
        for (BankAccount a : accounts) {
            BigDecimal carried = carriedOverFor(a.getId(), d);
            seed.add(DayOpenAccountOpeningDto.builder()
                    .accountId(a.getId())
                    .accountName(a.getName())
                    .accountType(a.getType() != null ? a.getType().name() : null)
                    .carriedOver(carried)
                    .rounded(carried)
                    .roundingDelta(BigDecimal.ZERO)
                    .build());
            carriedTotal = carriedTotal.add(carried);
        }
        DayLifecycleStatus lifecycle = lifecycleStatus(businessId, d);
        return DayOpenDto.builder()
                .id(null)
                .openDate(d)
                .status(null)
                .lifecycleStatus(lifecycle.name())
                .carriedOverTotal(carriedTotal)
                .roundedTotal(carriedTotal)
                .roundingDelta(BigDecimal.ZERO)
                .accountOpenings(seed)
                .build();
    }

    @Transactional(readOnly = true)
    public Optional<DayOpenDto> get(UUID userId, UUID businessId, LocalDate date) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate today = LocalDate.now();
        return dayOpenRepository.findByBusinessIdAndOpenDate(businessId, date)
                .map(d -> toDto(d, today));
    }

    @Transactional(readOnly = true)
    public List<DayOpenDto> list(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate today = LocalDate.now();
        return dayOpenRepository.findByBusinessIdOrderByOpenDateDesc(businessId)
                .stream().map(d -> toDto(d, today)).toList();
    }

    /** Birleşik gün durumu + gating kararı (FE işlem-giriş gating'i tüketir). */
    @Transactional(readOnly = true)
    public DayStatusDto status(UUID userId, UUID businessId, LocalDate date) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate d = date != null ? date : LocalDate.now();
        DayLifecycleStatus lifecycle = lifecycleStatus(businessId, d);
        boolean enforce = featureFlags.isDayOpenEnforceEnabled(businessId);
        boolean canAdd = !enforce || lifecycle == DayLifecycleStatus.OPEN;
        return DayStatusDto.builder()
                .date(d)
                .lifecycleStatus(lifecycle.name())
                .enforcementEnabled(enforce)
                .canAddTransaction(canAdd)
                .build();
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    /**
     * Birleşik durum: DayClose CLOSED → KAPALI; DayOpen OPEN → AÇIK; aksi
     * AÇILMAMIŞ. (DayClose PENDING tek başına KAPALI sayılmaz — cron PENDING
     * açabilir; gerçek kilit CLOSED'tır.)
     */
    private DayLifecycleStatus lifecycleStatus(UUID businessId, LocalDate date) {
        boolean closed = dayCloseRepository.findByBusinessIdAndCloseDate(businessId, date)
                .map(dc -> dc.getStatus() == DayCloseStatus.CLOSED).orElse(false);
        if (closed) return DayLifecycleStatus.CLOSED;
        boolean open = dayOpenRepository.findByBusinessIdAndOpenDate(businessId, date)
                .map(d -> d.getStatus() == DayOpenStatus.OPEN).orElse(false);
        return open ? DayLifecycleStatus.OPEN : DayLifecycleStatus.UNOPENED;
    }

    /**
     * Bir hesabın {@code date} için OTOMATİK devir açılışı = önceki güne kadar
     * (date hariç) posting-türetilen bakiyesi. Faz B devir ile hizalı:
     * {@code accountComputedAsOf(account, date.minusDays(1))}.
     */
    private BigDecimal carriedOverFor(UUID accountId, LocalDate date) {
        return calculator.accountComputedAsOf(accountId, date.minusDays(1));
    }

    /**
     * DEVİR YUVARLAMA düzeltme posting'i: her hesabın {@code roundingDelta}'sı
     * için bir LOCATION_MOVE bacağı (account = hesap) + Σ delta'yı sıfırlayan tek
     * clearing bacağı (account NULL) → <b>Σ=0</b>, <b>P&L-temiz</b>. Delta yoksa
     * (tüm bacaklar 0) entry üretilmez.
     *
     * <p>İşaret: pozitif delta = açılış yukarı yuvarlandı → hesaba +delta; clearing
     * bacağı toplamı dengeler. Bakiye posting'ten türediği için (sumAmountByAccountId)
     * hesap bakiyesi yuvarlamayı yansıtır — clearing bacağı (account NULL) bakiyeyi
     * etkilemez, yalnız çift-girişi dengeler.</p>
     *
     * @return üretilen entry id; delta 0 ise null.
     */
    private UUID postRoundingAdjustment(DayOpen dayOpen, List<DayOpenAccountOpening> openings,
                                        User actor) {
        List<DayOpenAccountOpening> nonZero = openings.stream()
                .filter(o -> o.getRoundingDelta() != null
                        && o.getRoundingDelta().signum() != 0)
                .toList();
        if (nonZero.isEmpty()) return null;

        BigDecimal sumDelta = BigDecimal.ZERO;
        List<Posting> postings = new ArrayList<>();
        JournalEntry entry = JournalEntry.builder()
                .business(dayOpen.getBusiness())
                .entryDate(dayOpen.getOpenDate())
                .sourceType(JournalSourceType.DAY_CLOSE_ADJUST)
                .sourceRefId(dayOpen.getId())
                .description("Devir Yuvarlama — gün açılışı " + dayOpen.getOpenDate())
                .createdBy(actor)
                .build();
        for (DayOpenAccountOpening o : nonZero) {
            BigDecimal delta = o.getRoundingDelta();
            postings.add(Posting.builder()
                    .journalEntry(entry)
                    .account(o.getAccount())
                    .amount(delta)
                    .legKind(PostingLegKind.LOCATION_MOVE)
                    .build());
            sumDelta = sumDelta.add(delta);
        }
        // Clearing bacağı (account NULL): Σ'yi sıfırlar (P&L'i ETKİLEMEZ — LOCATION_MOVE,
        // gerçek hesap değil; gelir/gider raporuna girmez).
        if (sumDelta.signum() != 0) {
            postings.add(Posting.builder()
                    .journalEntry(entry)
                    .account(null)
                    .amount(sumDelta.negate())
                    .legKind(PostingLegKind.LOCATION_MOVE)
                    .build());
        }
        entry.setPostings(postings);

        // STRICT: Σ=0 invariant doğrula; değilse FLAGGED — üretme (yetim posting yok).
        BigDecimal sum = postings.stream().map(Posting::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (sum.abs().compareTo(INVARIANT_TOLERANCE) > 0) {
            log.warn("[day-open-rounding] FLAGGED — Σ={} ≠ 0; posting üretilmedi (dayOpen={})",
                    sum.toPlainString(), dayOpen.getId());
            return null;
        }

        entry = journalEntryRepository.save(entry); // cascade postings

        Map<String, Object> meta = new HashMap<>();
        meta.put("date", dayOpen.getOpenDate().toString());
        meta.put("roundingDelta", dayOpen.getRoundingDelta());
        meta.put("legs", postings.size());
        meta.put("entryId", entry.getId().toString());
        auditLogService.recordEntityAction(
                AuditAction.DAY_OPEN_ROUNDING_POSTED,
                actor != null ? actor.getId() : null,
                actor != null ? actor.getUsername() : "system",
                "JOURNAL_ENTRY", entry.getId(),
                "Devir Yuvarlama posting (Σ=0) " + dayOpen.getOpenDate()
                        + " — fark=" + dayOpen.getRoundingDelta(),
                meta, AuditAction.HIGHLIGHT_DAY_OPEN_ROUNDING);
        log.info("[day-open-rounding] business={} date={} delta={} entry={} legs={}",
                dayOpen.getBusiness().getId(), dayOpen.getOpenDate(),
                dayOpen.getRoundingDelta(), entry.getId(), postings.size());
        return entry.getId();
    }

    /**
     * Yeniden açılış/geri-alma: bu DayOpen'a bağlı devir-yuvarlama posting'ini
     * (DAY_CLOSE_ADJUST + source_ref_id=DayOpen.id) siler (cascade bacaklar).
     * İdempotent — yoksa no-op.
     */
    private void reverseRoundingEntry(DayOpen dayOpen) {
        Optional<JournalEntry> e = journalEntryRepository
                .findBySourceTypeAndSourceRefId(JournalSourceType.DAY_CLOSE_ADJUST, dayOpen.getId());
        if (e.isPresent()) {
            journalEntryRepository.delete(e.get());
            dayOpen.setRoundingEntryId(null);
            log.info("[day-open-rounding] reverse entry={} (dayOpen={})", e.get().getId(), dayOpen.getId());
        }
    }

    private void clearExistingOpenings(DayOpen dayOpen) {
        dayOpen.getAccountOpenings().clear();
        if (dayOpen.getId() != null) {
            openingRepository.deleteByDayOpenId(dayOpen.getId());
            entityManager.flush();
        }
    }

    private void assertBackdateAllowed(User user) {
        if (!"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Sadece admin geçmiş tarih için gün açabilir");
        }
        if (!featureFlags.isBackdateEnabled()) {
            throw new IllegalStateException(
                    "Geri dönük gün açma kapalı (day_close.backdate_enabled=false)");
        }
    }

    private Map<String, Object> baseMeta(DayOpen d) {
        Map<String, Object> m = new HashMap<>();
        m.put("date", d.getOpenDate() != null ? d.getOpenDate().toString() : null);
        m.put("carriedOver", d.getCarriedOverTotal());
        m.put("rounded", d.getRoundedTotal());
        m.put("roundingDelta", d.getRoundingDelta());
        return m;
    }

    DayOpenDto toDto(DayOpen d, LocalDate today) {
        List<DayOpenAccountOpeningDto> openings = d.getAccountOpenings() != null
                ? d.getAccountOpenings().stream().map(this::toOpeningDto).toList()
                : List.of();
        DayLifecycleStatus lifecycle = d.getStatus() == DayOpenStatus.CLOSED
                ? DayLifecycleStatus.CLOSED
                : (d.getStatus() == DayOpenStatus.OPEN
                        ? DayLifecycleStatus.OPEN : DayLifecycleStatus.UNOPENED);
        return DayOpenDto.builder()
                .id(d.getId())
                .openDate(d.getOpenDate())
                .status(d.getStatus() != null ? d.getStatus().name() : null)
                .lifecycleStatus(lifecycle.name())
                .carriedOverTotal(d.getCarriedOverTotal())
                .roundedTotal(d.getRoundedTotal())
                .roundingDelta(d.getRoundingDelta())
                .roundingEntryId(d.getRoundingEntryId())
                .reasonNote(d.getReasonNote())
                .backdated(d.isBackdated())
                .createdVia(d.getCreatedVia() != null ? d.getCreatedVia().name() : null)
                .openedBy(d.getOpenedBy())
                .openedAt(d.getOpenedAt())
                .accountOpenings(openings)
                .build();
    }

    private DayOpenAccountOpeningDto toOpeningDto(DayOpenAccountOpening o) {
        BankAccount a = o.getAccount();
        return DayOpenAccountOpeningDto.builder()
                .id(o.getId())
                .accountId(a != null ? a.getId() : null)
                .accountName(a != null ? a.getName() : null)
                .accountType(a != null && a.getType() != null ? a.getType().name() : null)
                .carriedOver(o.getCarriedOver())
                .rounded(o.getRounded())
                .roundingDelta(o.getRoundingDelta())
                .build();
    }
}
