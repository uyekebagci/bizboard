package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.BackdateClosingRequest;
import com.bizboard.common.dto.CashClosingDto;
import com.bizboard.common.dto.CloseTodayRequest;
import com.bizboard.common.dto.ReopenClosingRequest;
import com.bizboard.common.entity.CashClosing;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.CashClosingStatus;
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

    // ───────────────────────── CLOSE TODAY ─────────────────────────

    @Transactional
    public CashClosingDto closeToday(UUID userId, CloseTodayRequest req) {
        LocalDate today = LocalDate.now();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        Optional<CashClosing> existing = repository.findByClosingDate(today);
        if (existing.isPresent() && existing.get().getStatus() == CashClosingStatus.CLOSED) {
            throw new IllegalStateException("Bugün zaten kapatılmış");
        }

        BigDecimal opening = calculator.getOpeningBalance(today);
        BigDecimal computed = calculator.computeClosing(today);
        BigDecimal actual = req.getActualBalance();
        BigDecimal difference = actual.subtract(computed);

        CashClosing closing = existing.orElseGet(() -> CashClosing.builder()
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

        // Audit
        Map<String, Object> meta = new HashMap<>();
        meta.put("date", today.toString());
        meta.put("opening", opening);
        meta.put("computed", computed);
        meta.put("actual", actual);
        meta.put("difference", difference);
        if (req.getReasonCategory() != null) meta.put("reasonCategory", req.getReasonCategory());
        auditLogService.recordEntityAction(
                AuditAction.CASH_CLOSING_CLOSED,
                user.getId(), user.getUsername(),
                "CASH_CLOSING", closing.getId(),
                "Günlük kapanış: " + today + " (fark: " + difference + ")",
                meta, null);

        return toDto(closing);
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
    public CashClosingDto closeBackdate(UUID userId, BackdateClosingRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Sadece admin geçmiş tarih için kapanış oluşturabilir");
        }

        LocalDate date = req.getClosingDate();
        if (date == null) {
            throw new IllegalArgumentException("closing_date zorunlu");
        }
        if (date.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("closing_date gelecek tarih olamaz: " + date);
        }

        Optional<CashClosing> existing = repository.findByClosingDate(date);
        boolean override = Boolean.TRUE.equals(req.getOverride());
        if (existing.isPresent()
                && existing.get().getStatus() == CashClosingStatus.CLOSED
                && !override) {
            throw new IllegalStateException(
                    "Bu tarih icin kapanis zaten var: " + date + " (override=true ile uzerine yaz)");
        }

        BigDecimal opening = calculator.getOpeningBalance(date);
        BigDecimal computed = calculator.computeClosing(date);
        BigDecimal actual = req.getActualBalance();
        BigDecimal difference = actual.subtract(computed);

        CashClosing closing = existing.orElseGet(() -> CashClosing.builder()
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

    @Transactional
    public Optional<CashClosingDto> autoCloseToday() {
        LocalDate today = LocalDate.now();
        Optional<CashClosing> existing = repository.findByClosingDate(today);
        if (existing.isPresent() && existing.get().getStatus() == CashClosingStatus.CLOSED) {
            log.debug("[auto-close] Bugün zaten kapatılmış — atlanıyor.");
            return Optional.empty();
        }

        BigDecimal opening = calculator.getOpeningBalance(today);
        BigDecimal computed = calculator.computeClosing(today);

        CashClosing closing = existing.orElseGet(() -> CashClosing.builder()
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
                "Otomatik kapanış (20:00): " + today + " — computed=" + computed,
                Map.of("date", today.toString(), "opening", opening, "computed", computed),
                null);

        log.info("[auto-close] {} otomatik kapatıldı (computed={})", today, computed);
        return Optional.of(toDto(closing));
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

    @Transactional(readOnly = true)
    public Page<CashClosingDto> list(int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Direction.DESC, "closingDate"));
        return repository.findAll(pageable).map(this::toDto);
    }

    /** Bugün için kapanış var mı (status değil — varlığı). */
    @Transactional(readOnly = true)
    public Optional<CashClosingDto> getToday() {
        return repository.findByClosingDate(LocalDate.now()).map(this::toDto);
    }

    /** Dünün kapanışı — widget "Dünden Kalan Eksik" için. */
    @Transactional(readOnly = true)
    public Optional<CashClosingDto> getYesterday() {
        return repository.findByClosingDate(LocalDate.now().minusDays(1)).map(this::toDto);
    }

    /** "Bugün ne durumda?" preview — kapatılmamışsa real-time computed. */
    @Transactional(readOnly = true)
    public Map<String, Object> getTodayPreview() {
        LocalDate today = LocalDate.now();
        BigDecimal opening = calculator.getOpeningBalance(today);
        BigDecimal computed = calculator.computeClosing(today);
        Optional<CashClosing> existing = repository.findByClosingDate(today);

        Map<String, Object> m = new HashMap<>();
        m.put("date", today.toString());
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
