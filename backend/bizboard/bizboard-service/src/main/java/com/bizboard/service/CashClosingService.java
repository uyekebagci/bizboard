package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.BackdateClosingRequest;
import com.bizboard.common.dto.CashClosingDto;
import com.bizboard.common.dto.CloseTodayRequest;
import com.bizboard.common.dto.ReopenClosingRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.CashClosing;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.CashClosingStatus;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CashClosingRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * v1.6.19 (WP-2): Günlük kasa kapanışı servisi.
 *
 * <p>Üç temel akış:</p>
 * <ul>
 *   <li><b>closeToday</b> — kullanıcı physical sayım sonucu girip kapatır.
 *       Idempotent: zaten CLOSED ise IllegalStateException (controller 409 çevirir).</li>
 *   <li><b>autoClose</b> — cron 20:00'de manuel kapama yapılmamışsa otomatik
 *       kapatır (actualBalance=null, is_auto=true).</li>
 *   <li><b>reopen</b> — admin-only; CLOSED → REOPENED. Audit highlight.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CashClosingService {

    private final CashClosingRepository repository;
    private final UserRepository userRepository;
    private final ClosingCalculator calculator;
    private final AuditLogService auditLogService;
    private final BusinessRepository businessRepository;
    private final BusinessAccessGuard accessGuard;
    /** WP 08617251 (Beta v1.1 Closure Modülü): session tx'lerini yönet. */
    private final com.bizboard.repository.TransactionRepository transactionRepository;
    private final TransactionService transactionService;

    // ───────────────────────── CLOSE TODAY ─────────────────────────

    /**
     * v1.6.23.21 (Security WP / arch-rules §1.1): business-scoped closeToday.
     */
    @Transactional
    public CashClosingDto closeToday(UUID userId, UUID businessId, CloseTodayRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        LocalDate today = LocalDate.now();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        Optional<CashClosing> existing = repository.findByBusinessIdAndClosingDate(businessId, today);
        if (existing.isPresent() && existing.get().getStatus() == CashClosingStatus.CLOSED) {
            throw new IllegalStateException("Bugün zaten kapatılmış");
        }

        BigDecimal opening = calculator.getOpeningBalance(businessId, today);
        BigDecimal computed = calculator.computeClosing(businessId, today);
        BigDecimal actual = req.getActualBalance();
        BigDecimal difference = actual.subtract(computed);

        final Business _biz = business;
        CashClosing closing = existing.orElseGet(() -> CashClosing.builder()
                .business(_biz)
                .closingDate(today)
                .auto(false)
                .build());
        closing.setOpeningBalance(opening);
        closing.setComputedClosing(computed);
        closing.setActualBalance(actual);
        closing.setDifference(difference);
        closing.setStatus(CashClosingStatus.CLOSED);
        closing.setAuto(false);
        closing.setClosedAt(LocalDateTime.now());
        closing.setClosedBy(userId);
        closing.setReasonCategory(normalizeReason(req.getReasonCategory()));
        closing.setReasonNote(req.getReasonNote());

        closing = repository.save(closing);

        // WP 08617251: session strip — closure finalize'da inline eklenen
        // tx'ler artık "draft" değil; closure_session_id NULL'a çekilir
        // (= kalıcı tx). Yalnız actor'un kendi tx'leri (cross-user guard).
        int strippedCount = 0;
        if (req.getClosureSessionId() != null) {
            var sessionTxs = transactionRepository
                    .findByClosureSessionIdAndCreatedBy_Id(req.getClosureSessionId(), userId);
            for (var t : sessionTxs) {
                t.setClosureSessionId(null);
                transactionRepository.save(t);
                strippedCount++;
            }
            log.info("[closure-finalize] session={} stripped {} tx", req.getClosureSessionId(), strippedCount);
        }

        // Audit
        Map<String, Object> meta = new HashMap<>();
        meta.put("date", today.toString());
        meta.put("opening", opening);
        meta.put("computed", computed);
        meta.put("actual", actual);
        meta.put("difference", difference);
        if (req.getReasonCategory() != null) meta.put("reasonCategory", req.getReasonCategory());
        if (req.getClosureSessionId() != null) {
            meta.put("closureSessionId", req.getClosureSessionId().toString());
            meta.put("sessionTxStripped", strippedCount);
        }
        auditLogService.recordEntityAction(
                AuditAction.CASH_CLOSING_CLOSED,
                user.getId(), user.getUsername(),
                "CASH_CLOSING", closing.getId(),
                "Günlük kapanış: " + today + " (fark: " + difference + ")",
                meta, null);

        return toDto(closing);
    }

    // ───────────────────────── CLOSURE SESSION (WP 08617251) ─────────────────────────

    /**
     * WP 08617251 Beta v1.1 Closure Modülü: session rollback (DELETE) /
     * abandon (sendBeacon). Aynı işi yapar — session'a etiketli tüm tx'leri
     * standart delete akışıyla (bank balance reversal, inclusion CASCADE,
     * audit log) siler.
     *
     * <p>Cross-user guard: yalnız actor'ün kendi yarattığı tx'ler silinir.</p>
     */
    @Transactional
    public int rollbackSession(java.util.UUID sessionId, UUID actorUserId) {
        if (sessionId == null) return 0;
        var sessionTxs = transactionRepository
                .findByClosureSessionIdAndCreatedBy_Id(sessionId, actorUserId);
        int deleted = 0;
        for (var t : sessionTxs) {
            try {
                // Standart delete akışı: balance reversal + audit + inclusion CASCADE
                transactionService.deleteTransaction(t.getId(), actorUserId,
                        "Closure session rollback");
                deleted++;
            } catch (Exception e) {
                log.warn("[closure-session-rollback] tx {} delete failed: {}", t.getId(), e.getMessage());
            }
        }
        log.info("[closure-session-rollback] session={} deleted={} of {}",
                sessionId, deleted, sessionTxs.size());
        return deleted;
    }

    /**
     * WP 08617251: "Kaydet & Çık" akışı — closure finalize ETMEDEN
     * session etiketi strip. Tx'ler kalır (normal current-day tx'e dönüşür).
     */
    @Transactional
    public int keepSessionTransactions(java.util.UUID sessionId, UUID actorUserId) {
        if (sessionId == null) return 0;
        var sessionTxs = transactionRepository
                .findByClosureSessionIdAndCreatedBy_Id(sessionId, actorUserId);
        int kept = 0;
        for (var t : sessionTxs) {
            t.setClosureSessionId(null);
            transactionRepository.save(t);
            kept++;
        }
        log.info("[closure-session-keep] session={} stripped={}", sessionId, kept);
        return kept;
    }

    // ───────────────────────── BACKDATE CLOSE (v1.6.23.4) ─────────────────────────

    /**
     * v1.6.23.4 (BUG-2 fix): Geçmiş bir tarih için kapanış oluştur veya günceller.
     * Admin-only. Migration ve atlanmış günleri toparlamak için.
     *
     * <p>Davranış:</p>
     * <ul>
     *   <li>{@code closing_date > today} → IllegalArgumentException (gelecek yok)</li>
     *   <li>Mevcut CLOSED kayıt + {@code override=false} → IllegalStateException (409)</li>
     *   <li>Aksi halde upsert: opening + computed_closing ClosingCalculator'dan,
     *       difference = actual - computed</li>
     *   <li>Audit log entry: action=CASH_CLOSING_BACKDATED, highlight=BACKDATED_CLOSING</li>
     * </ul>
     */
    @Transactional
    public CashClosingDto closeBackdate(UUID userId, UUID businessId, BackdateClosingRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Sadece admin geçmiş tarih için kapanış oluşturabilir");
        }
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        LocalDate date = req.getClosingDate();
        if (date == null) {
            throw new IllegalArgumentException("closing_date zorunlu");
        }
        if (date.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("closing_date gelecek tarih olamaz: " + date);
        }

        Optional<CashClosing> existing = repository.findByBusinessIdAndClosingDate(businessId, date);
        boolean override = Boolean.TRUE.equals(req.getOverride());
        if (existing.isPresent()
                && existing.get().getStatus() == CashClosingStatus.CLOSED
                && !override) {
            throw new IllegalStateException(
                    "Bu tarih icin kapanis zaten var: " + date + " (override=true ile uzerine yaz)");
        }

        BigDecimal opening = calculator.getOpeningBalance(businessId, date);
        BigDecimal computed = calculator.computeClosing(businessId, date);
        BigDecimal actual = req.getActualBalance();
        BigDecimal difference = actual.subtract(computed);

        final Business _biz = business;
        CashClosing closing = existing.orElseGet(() -> CashClosing.builder()
                .business(_biz)
                .closingDate(date)
                .auto(false)
                .build());
        closing.setOpeningBalance(opening);
        closing.setComputedClosing(computed);
        closing.setActualBalance(actual);
        closing.setDifference(difference);
        closing.setStatus(CashClosingStatus.CLOSED);
        closing.setAuto(false);
        closing.setClosedAt(LocalDateTime.now());
        closing.setClosedBy(userId);
        closing.setReasonCategory(normalizeReason(req.getReasonCategory()));
        closing.setReasonNote(req.getReasonNote());

        closing = repository.save(closing);

        Map<String, Object> meta = new HashMap<>();
        meta.put("date", date.toString());
        meta.put("opening", opening);
        meta.put("computed", computed);
        meta.put("actual", actual);
        meta.put("difference", difference);
        meta.put("override", override);
        meta.put("source", "BACKDATE");
        auditLogService.recordEntityAction(
                AuditAction.CASH_CLOSING_BACKDATED,
                user.getId(), user.getUsername(),
                "CASH_CLOSING", closing.getId(),
                "Backdate kapanis: " + date + " (fark: " + difference + ")",
                meta,
                AuditAction.HIGHLIGHT_BACKDATED_CLOSING);

        log.info("[backdate-close] date={} actual={} computed={} diff={} by={}",
                date, actual, computed, difference, user.getUsername());

        return toDto(closing);
    }

    // ───────────────────────── AUTO CLOSE (cron) ─────────────────────────

    /**
     * v1.6.23.21: cron — tüm işletmeler için otomatik kapanış.
     * Tek-tenant DGR çağrısı: businesses tablosunda DGR var ise yalnız onu işler.
     */
    @Transactional
    public List<CashClosingDto> autoCloseToday() {
        LocalDate today = LocalDate.now();
        List<CashClosingDto> closed = new ArrayList<>();
        for (Business b : businessRepository.findAll()) {
            UUID bizId = b.getId();
            Optional<CashClosing> existing = repository.findByBusinessIdAndClosingDate(bizId, today);
            if (existing.isPresent() && existing.get().getStatus() == CashClosingStatus.CLOSED) {
                continue;
            }
            BigDecimal opening = calculator.getOpeningBalance(bizId, today);
            BigDecimal computed = calculator.computeClosing(bizId, today);
            final Business _biz = b;
            CashClosing closing = existing.orElseGet(() -> CashClosing.builder()
                    .business(_biz)
                    .closingDate(today)
                    .build());
            closing.setOpeningBalance(opening);
            closing.setComputedClosing(computed);
            closing.setActualBalance(null);
            closing.setDifference(null);
            closing.setStatus(CashClosingStatus.CLOSED);
            closing.setAuto(true);
            closing.setClosedAt(LocalDateTime.now());
            closing.setClosedBy(null);
            closing.setReasonCategory(null);
            closing.setReasonNote(null);
            closing = repository.save(closing);
            auditLogService.recordEntityAction(
                    AuditAction.CASH_CLOSING_AUTO_CLOSED,
                    null, "system",
                    "CASH_CLOSING", closing.getId(),
                    "Otomatik kapanış (20:00) [" + b.getName() + "]: " + today + " — computed=" + computed,
                    Map.of("date", today.toString(), "businessId", bizId,
                            "opening", opening, "computed", computed),
                    null);
            log.info("[auto-close] business={} {} otomatik kapatıldı (computed={})",
                    b.getName(), today, computed);
            closed.add(toDto(closing));
        }
        return closed;
    }

    // ───────────────────────── REOPEN (admin) ─────────────────────────

    @Transactional
    public CashClosingDto reopen(UUID userId, UUID closingId, ReopenClosingRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Sadece admin kapanışı yeniden açabilir");
        }

        CashClosing closing = repository.findById(closingId)
                .orElseThrow(() -> new IllegalArgumentException("Kapanış bulunamadı"));
        // v1.6.23.21: cross-tenant reopen engeli.
        accessGuard.assertCanAccessBusiness(userId,
                closing.getBusiness() != null ? closing.getBusiness().getId() : null);

        closing.setStatus(CashClosingStatus.REOPENED);
        closing.setReasonNote(
                (closing.getReasonNote() != null ? closing.getReasonNote() + "\n" : "")
                        + "[REOPEN " + LocalDate.now() + " by " + user.getUsername() + "] "
                        + req.getReasonNote());
        closing = repository.save(closing);

        auditLogService.recordEntityAction(
                AuditAction.CASH_CLOSING_REOPENED,
                user.getId(), user.getUsername(),
                "CASH_CLOSING", closing.getId(),
                "Kapanış yeniden açıldı: " + closing.getClosingDate() + " — " + req.getReasonNote(),
                Map.of("date", closing.getClosingDate().toString(),
                        "reasonNote", req.getReasonNote()),
                AuditAction.HIGHLIGHT_CLOSING_REOPEN);

        return toDto(closing);
    }

    // ───────────────────────── QUERY ─────────────────────────

    /** v1.6.23.21: business-scoped paged list. */
    @Transactional(readOnly = true)
    public Page<CashClosingDto> list(UUID userId, UUID businessId, int page, int size) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Direction.DESC, "closingDate"));
        // JPA Pageable + custom query: kullan basit listeyi sayfala (kayıt sayısı düşük).
        List<CashClosing> all = repository
                .findByBusinessIdAndClosingDateBetweenOrderByClosingDateAsc(
                        businessId, LocalDate.of(2000, 1, 1), LocalDate.now().plusDays(365));
        all = all.stream()
                .sorted((a, b) -> b.getClosingDate().compareTo(a.getClosingDate()))
                .toList();
        int total = all.size();
        int fromIdx = Math.min(safePage * safeSize, total);
        int toIdx = Math.min(fromIdx + safeSize, total);
        List<CashClosingDto> slice = all.subList(fromIdx, toIdx).stream()
                .map(this::toDto).toList();
        return new org.springframework.data.domain.PageImpl<>(slice, pageable, total);
    }

    /** v1.6.23.21: business-scoped today. */
    @Transactional(readOnly = true)
    public Optional<CashClosingDto> getToday(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return repository.findByBusinessIdAndClosingDate(businessId, LocalDate.now()).map(this::toDto);
    }

    /** v1.6.23.21: business-scoped yesterday. */
    @Transactional(readOnly = true)
    public Optional<CashClosingDto> getYesterday(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        return repository.findByBusinessIdAndClosingDate(businessId, LocalDate.now().minusDays(1))
                .map(this::toDto);
    }

    /** v1.6.23.21: business-scoped preview. */
    @Transactional(readOnly = true)
    public Map<String, Object> getTodayPreview(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        LocalDate today = LocalDate.now();
        BigDecimal opening = calculator.getOpeningBalance(businessId, today);
        BigDecimal computed = calculator.computeClosing(businessId, today);
        Optional<CashClosing> existing = repository.findByBusinessIdAndClosingDate(businessId, today);

        Map<String, Object> m = new HashMap<>();
        m.put("date", today.toString());
        m.put("business_id", businessId);
        m.put("opening_balance", opening);
        m.put("computed_closing", computed);
        m.put("net_flow", computed.subtract(opening));
        m.put("closed", existing.isPresent() && existing.get().getStatus() == CashClosingStatus.CLOSED);
        m.put("auto", existing.map(CashClosing::isAuto).orElse(false));
        return m;
    }

    // ───────────────────────── HELPERS ─────────────────────────

    private static final Set<String> ALLOWED_REASONS = Set.of(
            CashClosing.REASON_LOSS,
            CashClosing.REASON_MIS_ENTRY,
            CashClosing.REASON_ROUNDING,
            CashClosing.REASON_OTHER);

    private static String normalizeReason(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_REASONS.contains(upper)) {
            throw new IllegalArgumentException(
                    "Geçersiz reason_category: " + raw + " — LOSS/MIS_ENTRY/ROUNDING/OTHER olmalı");
        }
        return upper;
    }

    private CashClosingDto toDto(CashClosing c) {
        return CashClosingDto.builder()
                .id(c.getId())
                .closingDate(c.getClosingDate())
                .openingBalance(c.getOpeningBalance())
                .computedClosing(c.getComputedClosing())
                .actualBalance(c.getActualBalance())
                .difference(c.getDifference())
                .status(c.getStatus() != null ? c.getStatus().name() : null)
                .auto(c.isAuto())
                .closedAt(c.getClosedAt())
                .closedBy(c.getClosedBy())
                .reasonCategory(c.getReasonCategory())
                .reasonNote(c.getReasonNote())
                .build();
    }
}
