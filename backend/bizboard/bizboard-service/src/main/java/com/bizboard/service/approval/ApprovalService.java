package com.bizboard.service.approval;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.ApprovalDto;
import com.bizboard.common.entity.ApprovalRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.ApprovalStatus;
import com.bizboard.repository.ApprovalRequestRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.TelegramApprovalCallbackRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.BusinessAccessGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1 — JENERİK onay çerçevesi servisi.
 *
 * <p>create / approve / reject / cancel / bulk-approve + opsiyonel verify-code
 * (TTL'li doğrulama). Tüm operasyonlar STRICT multi-tenant: çağıran yalnız
 * erişebildiği işletmenin onaylarını görebilir/yönetebilir
 * ({@link BusinessAccessGuard}). Her geçiş audit'lenir ({@link AuditAction}).</p>
 *
 * <p>Onaylanınca işlemin gerçekten yürütülmesi {@link ApprovalExecutor}
 * stratejisine devredilir; eşleşen executor yoksa onay reddedilir (sessiz
 * yürütme YOK — STRICT).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApprovalService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int VERIFY_CODE_TTL_MINUTES = 10;
    private static final int MAX_BULK = 200;

    private final ApprovalRequestRepository repository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;
    private final List<ApprovalExecutor> executors;
    private final ApplicationEventPublisher eventPublisher;
    private final TelegramApprovalCallbackRepository telegramCallbackRepository;

    // ─────────────────────────── CREATE ────────────────────────────────────

    /**
     * Jenerik onay talebi oluşturur (PENDING).
     *
     * @throws SecurityException        cross-tenant (controller 404'e çevirir)
     * @throws IllegalArgumentException business yok / actionType boş
     */
    @Transactional
    public ApprovalDto create(UUID businessId, String actionType, String title,
                              Map<String, Object> payload, boolean requireVerifyCode,
                              Integer expiresInMinutes, UUID actorUserId) {
        if (actionType == null || actionType.isBlank()) {
            throw new IllegalArgumentException("action_type zorunlu");
        }
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("İşletme bulunamadı: " + businessId));

        ApprovalRequest req = ApprovalRequest.builder()
                .business(business)
                .requestedBy(actorUserId)
                .actionType(actionType.trim())
                .title(title != null && !title.isBlank() ? title.trim() : actionType.trim())
                .payload(payload)
                .status(ApprovalStatus.PENDING)
                .build();

        if (requireVerifyCode) {
            req.setVerifyCode(generateCode());
            req.setVerifyCodeExpiresAt(LocalDateTime.now().plusMinutes(VERIFY_CODE_TTL_MINUTES));
        }
        if (expiresInMinutes != null && expiresInMinutes > 0) {
            req.setExpiresAt(LocalDateTime.now().plusMinutes(expiresInMinutes));
        }

        req = repository.save(req);

        audit(AuditAction.APPROVAL_REQUESTED, actorUserId, req,
                "Onay talebi: " + req.getTitle() + " (tür: " + req.getActionType() + ")");
        log.info("[approval] created id={} business={} action={} verify={} by={}",
                req.getId(), businessId, actionType, requireVerifyCode, actorUserId);

        // Yan-etki (örn. Telegram buton-mesajı) onay COMMIT olduktan SONRA tetiklensin.
        // Dinleyici AFTER_COMMIT; Telegram hatası bu onay kaydını geri almaz.
        eventPublisher.publishEvent(new ApprovalRequestedEvent(
                req.getId(), business.getId(), req.getActionType()));
        return toDto(req);
    }

    // ─────────────────────────── APPROVE ───────────────────────────────────

    /**
     * Onaylar → eşleşen {@link ApprovalExecutor} işlemi yürütür. İşlem hata
     * fırlatırsa tüm geçiş (status=APPROVED dahil) rollback olur.
     *
     * @throws SecurityException        cross-tenant
     * @throws IllegalArgumentException kayıt yok / executor yok
     * @throws IllegalStateException    terminal durum / TTL doldu / kod doğrulanmadı
     */
    @Transactional
    public ApprovalDto approve(UUID id, String note, UUID actorUserId) {
        ApprovalRequest req = loadForMutation(id, actorUserId);
        assertPendingAndFresh(req);

        if (req.isVerifyPending()) {
            throw new IllegalStateException(
                    "Bu onay için doğrulama kodu gerekli — önce kodu doğrulayın.");
        }

        ApprovalExecutor executor = findExecutor(req.getActionType());
        if (executor == null) {
            throw new IllegalArgumentException(
                    "Bu onay türü için tanımlı bir yürütücü yok: " + req.getActionType());
        }

        // Önce işlemi yürüt — başarısız olursa aşağıdaki state geçişi de rollback olur.
        executor.execute(req);

        req.setStatus(ApprovalStatus.APPROVED);
        req.setApprover(actorUserId);
        if (note != null && !note.isBlank()) req.setReason(note.trim());
        req.setDecidedAt(LocalDateTime.now());
        req = repository.save(req);

        audit(AuditAction.APPROVAL_APPROVED, actorUserId, req,
                "Onaylandı + yürütüldü: " + req.getTitle());
        log.info("[approval] approved+executed id={} action={} by={}",
                req.getId(), req.getActionType(), actorUserId);
        return toDto(req);
    }

    // ─────────────────────────── REJECT ────────────────────────────────────

    /**
     * Reddeder — işlem hiçbir zaman yürütülmez. Gerekçe ({@code reason}) STRICT
     * zorunlu.
     */
    @Transactional
    public ApprovalDto reject(UUID id, String reason, UUID actorUserId) {
        ApprovalRequest req = loadForMutation(id, actorUserId);
        assertPendingAndFresh(req);
        String r = reason != null ? reason.trim() : "";
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Red gerekçesi (reason) zorunlu");
        }

        req.setStatus(ApprovalStatus.REJECTED);
        req.setApprover(actorUserId);
        req.setReason(r);
        req.setDecidedAt(LocalDateTime.now());
        req = repository.save(req);

        audit(AuditAction.APPROVAL_REJECTED, actorUserId, req,
                "Reddedildi: " + req.getTitle() + " · " + r);
        log.info("[approval] rejected id={} action={} by={}",
                req.getId(), req.getActionType(), actorUserId);
        return toDto(req);
    }

    // ─────────────────────────── CANCEL ────────────────────────────────────

    /** Geri çeker (talep eden ya da admin). İşlem yürütülmez. */
    @Transactional
    public ApprovalDto cancel(UUID id, String note, UUID actorUserId) {
        ApprovalRequest req = loadForMutation(id, actorUserId);
        assertPendingAndFresh(req);

        req.setStatus(ApprovalStatus.CANCELLED);
        req.setApprover(actorUserId);
        if (note != null && !note.isBlank()) req.setReason(note.trim());
        req.setDecidedAt(LocalDateTime.now());
        req = repository.save(req);

        audit(AuditAction.APPROVAL_CANCELLED, actorUserId, req,
                "İptal edildi: " + req.getTitle());
        log.info("[approval] cancelled id={} action={} by={}",
                req.getId(), req.getActionType(), actorUserId);
        return toDto(req);
    }

    // ─────────────────────────── VERIFY CODE ───────────────────────────────

    /** TTL'li doğrulama kodunu doğrular (onaydan önce). */
    @Transactional
    public ApprovalDto verifyCode(UUID id, String code, UUID actorUserId) {
        ApprovalRequest req = loadForMutation(id, actorUserId);
        assertPendingAndFresh(req);

        if (req.getVerifyCode() == null) {
            throw new IllegalStateException("Bu onay için doğrulama kodu gerekmez.");
        }
        if (req.getVerifiedAt() != null) {
            return toDto(req); // idempotent — zaten doğrulanmış
        }
        if (req.getVerifyCodeExpiresAt() != null
                && req.getVerifyCodeExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalStateException("Doğrulama kodunun süresi doldu.");
        }
        if (code == null || !req.getVerifyCode().equals(code.trim())) {
            throw new IllegalArgumentException("Doğrulama kodu hatalı.");
        }

        req.setVerifiedAt(LocalDateTime.now());
        req = repository.save(req);

        audit(AuditAction.APPROVAL_VERIFIED, actorUserId, req,
                "Doğrulama kodu doğrulandı: " + req.getTitle());
        log.info("[approval] verify-code ok id={} by={}", req.getId(), actorUserId);
        return toDto(req);
    }

    // ─────────────────────────── BULK APPROVE ──────────────────────────────

    /**
     * Birden çok onayı tek seferde onaylar. Her id ayrı tenant + durum +
     * executor kontrolünden geçer; kısmi başarı desteklenir. Sonuçta her id için
     * {@code {id, status: APPROVED|SKIPPED, message?}} döner.
     */
    @Transactional
    public List<Map<String, Object>> bulkApprove(List<UUID> ids, String note, UUID actorUserId) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("ids boş olamaz");
        }
        if (ids.size() > MAX_BULK) {
            throw new IllegalArgumentException("Tek seferde en fazla " + MAX_BULK + " onay işlenebilir");
        }
        List<Map<String, Object>> results = new ArrayList<>();
        for (UUID id : ids) {
            Map<String, Object> r = new HashMap<>();
            r.put("id", id.toString());
            try {
                approve(id, note, actorUserId);
                r.put("status", "APPROVED");
            } catch (Exception e) {
                r.put("status", "SKIPPED");
                r.put("message", e.getMessage());
                log.info("[approval] bulk skip id={} reason={}", id, e.getMessage());
            }
            results.add(r);
        }
        return results;
    }

    // ─────────────────────────── READ ──────────────────────────────────────

    /** Onay Kuyruğu — erişilebilir işletmelerin onayları (status filtre opsiyonel). */
    @Transactional(readOnly = true)
    public List<ApprovalDto> list(UUID actorUserId, ApprovalStatus statusFilter) {
        List<UUID> allowed = accessGuard.accessibleBusinessIds(actorUserId);
        if (allowed.isEmpty()) return List.of();
        List<ApprovalRequest> rows = (statusFilter != null)
                ? repository.findByBusinessIdInAndStatusOrderByCreatedAtDesc(allowed, statusFilter)
                : repository.findByBusinessIdInOrderByCreatedAtDesc(allowed);

        // Telegram gönderim durumunu tek sorguyla topla (N+1 önleme).
        List<UUID> ids = rows.stream().map(ApprovalRequest::getId).filter(java.util.Objects::nonNull).toList();
        java.util.Set<UUID> sentIds = ids.isEmpty()
                ? java.util.Set.of()
                : new java.util.HashSet<>(telegramCallbackRepository.findApprovalIdsWithCallback(ids));
        return rows.stream().map(r -> toDto(r, sentIds.contains(r.getId()))).toList();
    }

    @Transactional(readOnly = true)
    public ApprovalDto getOne(UUID id, UUID actorUserId) {
        ApprovalRequest req = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Onay bulunamadı: " + id));
        accessGuard.assertCanAccessBusiness(actorUserId, businessIdOf(req));
        return toDto(req);
    }

    // ─────────────────────────── helpers ───────────────────────────────────

    private ApprovalRequest loadForMutation(UUID id, UUID actorUserId) {
        ApprovalRequest req = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Onay bulunamadı: " + id));
        accessGuard.assertCanAccessBusiness(actorUserId, businessIdOf(req));
        return req;
    }

    private void assertPendingAndFresh(ApprovalRequest req) {
        if (req.getStatus() != ApprovalStatus.PENDING) {
            throw new IllegalStateException(
                    "Bu onay zaten sonuçlanmış (" + req.getStatus() + "); değiştirilemez.");
        }
        if (req.getExpiresAt() != null && req.getExpiresAt().isBefore(LocalDateTime.now())) {
            // Lazy expire — TTL geçmiş PENDING kaydı EXPIRED'a çek.
            req.setStatus(ApprovalStatus.EXPIRED);
            req.setDecidedAt(LocalDateTime.now());
            repository.save(req);
            throw new IllegalStateException("Bu onayın süresi doldu (EXPIRED).");
        }
    }

    private ApprovalExecutor findExecutor(String actionType) {
        if (executors == null) return null;
        for (ApprovalExecutor e : executors) {
            if (actionType.equals(e.actionType())) return e;
        }
        return null;
    }

    private String generateCode() {
        // 6 haneli, sıfır-dolgulu (000000-999999).
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    private UUID businessIdOf(ApprovalRequest req) {
        return req.getBusiness() != null ? req.getBusiness().getId() : null;
    }

    private void audit(String action, UUID actorUserId, ApprovalRequest req, String detail) {
        String userName = Optional.ofNullable(actorUserId)
                .flatMap(userRepository::findById)
                .map(User::getUsername).orElse(null);
        Map<String, Object> meta = new HashMap<>();
        meta.put("approvalId", req.getId() != null ? req.getId().toString() : null);
        meta.put("actionType", req.getActionType());
        meta.put("businessId", businessIdOf(req) != null ? businessIdOf(req).toString() : null);
        meta.put("status", req.getStatus().name());
        auditLogService.recordEntityAction(action, actorUserId, userName,
                "APPROVAL_REQUEST", req.getId(), detail, meta, AuditAction.HIGHLIGHT_APPROVAL);
    }

    /** Tek kayıt — Telegram gönderim durumu DB'den (tek sorgu) okunur. */
    private ApprovalDto toDto(ApprovalRequest r) {
        boolean telegramSent = r.getId() != null
                && telegramCallbackRepository.existsByApprovalRequestId(r.getId());
        return toDto(r, telegramSent);
    }

    /** Liste yolu için: telegram-sent bilgisi dışarıdan (batch) verilir (N+1 önleme). */
    private ApprovalDto toDto(ApprovalRequest r, boolean telegramSent) {
        String requestedByName = Optional.ofNullable(r.getRequestedBy())
                .flatMap(userRepository::findById).map(User::getUsername).orElse(null);
        String approverName = Optional.ofNullable(r.getApprover())
                .flatMap(userRepository::findById).map(User::getUsername).orElse(null);
        Business b = r.getBusiness();
        return ApprovalDto.builder()
                .id(r.getId())
                .businessId(b != null ? b.getId() : null)
                .businessName(b != null ? b.getName() : null)
                .actionType(r.getActionType())
                .title(r.getTitle())
                .payload(r.getPayload())
                .status(r.getStatus() != null ? r.getStatus().name() : null)
                .requestedBy(r.getRequestedBy())
                .requestedByName(requestedByName)
                .approver(r.getApprover())
                .approverName(approverName)
                .reason(r.getReason())
                .verifyRequired(r.getVerifyCode() != null)
                .verified(r.getVerifiedAt() != null)
                .telegramSent(telegramSent)
                .expiresAt(r.getExpiresAt())
                .createdAt(r.getCreatedAt())
                .decidedAt(r.getDecidedAt())
                .build();
    }
}
