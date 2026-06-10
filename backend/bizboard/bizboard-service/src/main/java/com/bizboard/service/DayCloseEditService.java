package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CloseDayRequest;
import com.bizboard.common.dto.DayCloseEditCreateRequest;
import com.bizboard.common.dto.DayCloseEditRequestDto;
import com.bizboard.common.entity.DayClose;
import com.bizboard.common.entity.DayCloseAccountCount;
import com.bizboard.common.entity.DayCloseEditRequest;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.DayCloseEditStatus;
import com.bizboard.common.enums.DayCloseStatus;
import com.bizboard.repository.DayCloseAccountCountRepository;
import com.bizboard.repository.DayCloseEditRequestRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Ledger v2 (Faz B, §4.2) — finalize (CLOSED) gün-kapanışı için ONAYLI düzenleme
 * akışı. Düzenleme DOĞRUDAN uygulanmaz:
 *
 * <ol>
 *   <li>{@link #request} — admin öneri açar → {@code PENDING} +
 *       {@code before_snapshot} (rollback için). Kapanış DEĞİŞMEZ.</li>
 *   <li>{@link #approve} — yetkili onaylar → {@code APPLIED}: DayCloseService
 *       sayımları günceller + SAĞLAMA HESAP + forward-chain recompute.</li>
 *   <li>{@link #reject} — reddedilir → {@code REJECTED} + reject_note; kapanış
 *       el değmemiş kalır.</li>
 * </ol>
 *
 * <p><b>Onay kanalı (şimdilik):</b> admin-only + in-app. Approver kanalı
 * pluggable — ileride Faz-2 Telegram onay (§4.2) aynı state-machine'i kullanır
 * (approve/reject çağrısı bir Telegram callback'inden gelebilir).</p>
 *
 * <p><b>STRICT:</b> admin-gate + ZORUNLU gerekçe + tam audit + before_snapshot.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DayCloseEditService {

    private final DayCloseEditRequestRepository editRepository;
    private final DayCloseAccountCountRepository countRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final DayCloseService dayCloseService;
    private final AuditLogService auditLogService;

    // ──────────────────────────── REQUEST ────────────────────────────

    @Transactional
    public DayCloseEditRequestDto request(UUID userId, UUID businessId,
                                          DayCloseEditCreateRequest req) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        User user = requireAdmin(userId, "düzenleme isteği açabilir");

        DayClose dc = dayCloseService.findById(req.getDayCloseId())
                .orElseThrow(() -> new IllegalArgumentException("Kapanış bulunamadı"));
        if (dc.getBusiness() == null || !businessId.equals(dc.getBusiness().getId())) {
            throw new SecurityException("Kapanış bu işletmeye ait değil");
        }
        if (dc.getStatus() != DayCloseStatus.CLOSED) {
            throw new IllegalStateException(
                    "Yalnız CLOSED kapanış düzenlenebilir (mevcut: " + dc.getStatus() + ")");
        }
        if (req.getReasonCategory() == null || req.getReasonCategory().isBlank()
                || req.getReasonNote() == null || req.getReasonNote().isBlank()) {
            throw new IllegalArgumentException("Düzenleme için gerekçe (kategori + not) zorunlu");
        }
        // Aynı kapanışta bekleyen başka istek varsa engelle (çift-onay karmaşası).
        if (editRepository.countByDayCloseIdAndStatus(dc.getId(), DayCloseEditStatus.PENDING) > 0) {
            throw new IllegalStateException("Bu kapanış için bekleyen bir düzenleme isteği zaten var");
        }

        Map<String, Object> before = snapshot(dc);
        Map<String, Object> payload = new HashMap<>();
        if (req.getAccountCounts() != null && !req.getAccountCounts().isEmpty()) {
            List<Map<String, Object>> counts = new ArrayList<>();
            for (CloseDayRequest.AccountCountInput in : req.getAccountCounts()) {
                Map<String, Object> c = new HashMap<>();
                c.put("accountId", in.getAccountId().toString());
                c.put("countedBalance", in.getCountedBalance());
                counts.add(c);
            }
            payload.put("accountCounts", counts);
        }
        if (req.getVarianceThreshold() != null) {
            payload.put("varianceThreshold", req.getVarianceThreshold());
        }
        payload.put("reasonCategory", req.getReasonCategory());
        payload.put("reasonNote", req.getReasonNote());

        DayCloseEditRequest er = DayCloseEditRequest.builder()
                .business(dc.getBusiness())
                .dayClose(dc)
                .status(DayCloseEditStatus.PENDING)
                .payload(payload)
                .beforeSnapshot(before)
                .reasonCategory(req.getReasonCategory())
                .reasonNote(req.getReasonNote())
                .requestedBy(userId)
                .build();
        er = editRepository.save(er);

        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSE_EDIT_REQUESTED, userId, user.getUsername(),
                "DAY_CLOSE_EDIT", er.getId(),
                "Kapanış düzenleme önerisi: " + dc.getCloseDate() + " — " + req.getReasonNote(),
                Map.of("dayCloseId", dc.getId().toString(),
                        "date", dc.getCloseDate().toString(),
                        "reasonCategory", req.getReasonCategory()),
                AuditAction.HIGHLIGHT_DAY_CLOSE_EDIT);
        return toDto(er, dc.getCloseDate().toString());
    }

    // ──────────────────────────── APPROVE ────────────────────────────

    @Transactional
    @SuppressWarnings("unchecked")
    public DayCloseEditRequestDto approve(UUID userId, UUID editRequestId) {
        User approver = requireAdmin(userId, "düzenleme onaylayabilir");
        DayCloseEditRequest er = editRepository.findById(editRequestId)
                .orElseThrow(() -> new IllegalArgumentException("Düzenleme isteği bulunamadı"));
        accessGuard.assertCanAccessBusiness(userId,
                er.getBusiness() != null ? er.getBusiness().getId() : null);
        if (er.getStatus() != DayCloseEditStatus.PENDING) {
            throw new IllegalStateException(
                    "Yalnız PENDING istek onaylanabilir (mevcut: " + er.getStatus() + ")");
        }

        // Payload'tan önerilen sayımları çöz.
        List<CloseDayRequest.AccountCountInput> newCounts = new ArrayList<>();
        Object rawCounts = er.getPayload() != null ? er.getPayload().get("accountCounts") : null;
        if (rawCounts instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    CloseDayRequest.AccountCountInput in = new CloseDayRequest.AccountCountInput();
                    in.setAccountId(UUID.fromString(String.valueOf(m.get("accountId"))));
                    in.setCountedBalance(new java.math.BigDecimal(String.valueOf(m.get("countedBalance"))));
                    newCounts.add(in);
                }
            }
        }
        java.math.BigDecimal threshold = null;
        if (er.getPayload() != null && er.getPayload().get("varianceThreshold") != null) {
            threshold = new java.math.BigDecimal(
                    String.valueOf(er.getPayload().get("varianceThreshold")));
        }

        DayClose applied = dayCloseService.applyApprovedEdit(
                er.getDayClose().getId(),
                newCounts.isEmpty() ? null : newCounts,
                threshold,
                er.getReasonCategory(), er.getReasonNote(),
                userId, approver.getUsername());

        LocalDateTime now = LocalDateTime.now();
        er.setStatus(DayCloseEditStatus.APPLIED);
        er.setApprovedBy(userId);
        er.setApprovedAt(now);
        er.setAppliedAt(now);
        er = editRepository.save(er);

        Map<String, Object> meta = new HashMap<>();
        meta.put("dayCloseId", applied.getId().toString());
        meta.put("date", applied.getCloseDate().toString());
        meta.put("newComputed", applied.getComputedClosing());
        meta.put("newActual", applied.getActualTotal());
        meta.put("newVariance", applied.getVariance());
        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSE_EDIT_APPROVED, userId, approver.getUsername(),
                "DAY_CLOSE_EDIT", er.getId(),
                "Kapanış düzenleme onaylandı+uygulandı: " + applied.getCloseDate(),
                meta, AuditAction.HIGHLIGHT_DAY_CLOSE_EDIT);
        return toDto(er, applied.getCloseDate().toString());
    }

    // ──────────────────────────── REJECT ────────────────────────────

    @Transactional
    public DayCloseEditRequestDto reject(UUID userId, UUID editRequestId, String rejectNote) {
        User approver = requireAdmin(userId, "düzenleme reddedebilir");
        DayCloseEditRequest er = editRepository.findById(editRequestId)
                .orElseThrow(() -> new IllegalArgumentException("Düzenleme isteği bulunamadı"));
        accessGuard.assertCanAccessBusiness(userId,
                er.getBusiness() != null ? er.getBusiness().getId() : null);
        if (er.getStatus() != DayCloseEditStatus.PENDING) {
            throw new IllegalStateException(
                    "Yalnız PENDING istek reddedilebilir (mevcut: " + er.getStatus() + ")");
        }
        er.setStatus(DayCloseEditStatus.REJECTED);
        er.setApprovedBy(userId);
        er.setApprovedAt(LocalDateTime.now());
        er.setRejectNote(rejectNote);
        er = editRepository.save(er);

        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSE_EDIT_REJECTED, userId, approver.getUsername(),
                "DAY_CLOSE_EDIT", er.getId(),
                "Kapanış düzenleme reddedildi — " + rejectNote,
                Map.of("dayCloseId", er.getDayClose().getId().toString()),
                null);
        return toDto(er, er.getDayClose().getCloseDate().toString());
    }

    // ──────────────────────────── QUERY ────────────────────────────

    @Transactional(readOnly = true)
    public List<DayCloseEditRequestDto> list(UUID userId, UUID businessId, String status) {
        accessGuard.assertCanReadBusiness(userId, businessId);
        List<DayCloseEditRequest> rows;
        if (status != null && !status.isBlank()) {
            rows = editRepository.findByBusinessIdAndStatusOrderByRequestedAtDesc(
                    businessId, DayCloseEditStatus.valueOf(status.trim().toUpperCase(Locale.ROOT)));
        } else {
            rows = editRepository.findByBusinessIdOrderByRequestedAtDesc(businessId);
        }
        return rows.stream()
                .map(er -> toDto(er, er.getDayClose() != null
                        ? er.getDayClose().getCloseDate().toString() : null))
                .toList();
    }

    // ──────────────────────────── HELPERS ────────────────────────────

    private User requireAdmin(UUID userId, String verbPhrase) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!"admin".equalsIgnoreCase(user.getRole())) {
            throw new SecurityException("Sadece admin " + verbPhrase);
        }
        return user;
    }

    private Map<String, Object> snapshot(DayClose dc) {
        Map<String, Object> s = new HashMap<>();
        s.put("opening", dc.getOpeningBalance());
        s.put("totalIn", dc.getTotalIn());
        s.put("totalOut", dc.getTotalOut());
        s.put("computed", dc.getComputedClosing());
        s.put("actual", dc.getActualTotal());
        s.put("variance", dc.getVariance());
        s.put("reasonCategory", dc.getReasonCategory());
        s.put("reasonNote", dc.getReasonNote());
        List<Map<String, Object>> counts = new ArrayList<>();
        for (DayCloseAccountCount c : countRepository.findByDayCloseId(dc.getId())) {
            Map<String, Object> cm = new HashMap<>();
            cm.put("accountId", c.getAccount() != null ? c.getAccount().getId().toString() : null);
            cm.put("countedBalance", c.getCountedBalance());
            counts.add(cm);
        }
        s.put("accountCounts", counts);
        return s;
    }

    private DayCloseEditRequestDto toDto(DayCloseEditRequest er, String closeDate) {
        return DayCloseEditRequestDto.builder()
                .id(er.getId())
                .dayCloseId(er.getDayClose() != null ? er.getDayClose().getId() : null)
                .closeDate(closeDate != null ? java.time.LocalDate.parse(closeDate) : null)
                .status(er.getStatus() != null ? er.getStatus().name() : null)
                .payload(er.getPayload())
                .beforeSnapshot(er.getBeforeSnapshot())
                .reasonCategory(er.getReasonCategory())
                .reasonNote(er.getReasonNote())
                .requestedBy(er.getRequestedBy())
                .requestedAt(er.getRequestedAt())
                .approvedBy(er.getApprovedBy())
                .approvedAt(er.getApprovedAt())
                .appliedAt(er.getAppliedAt())
                .rejectNote(er.getRejectNote())
                .build();
    }
}
