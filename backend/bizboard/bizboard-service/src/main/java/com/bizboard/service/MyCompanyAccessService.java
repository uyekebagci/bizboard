package com.bizboard.service;

import com.bizboard.common.dto.MyCompanyAccessUserDto;
import com.bizboard.common.entity.MyCompany;
import com.bizboard.common.entity.MyCompanyUserAccess;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.MyCompanyRepository;
import com.bizboard.repository.MyCompanyUserAccessRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * v1.7.x WP 8b961444 TODO 515755d1 + 422595dd: Per-firm user access CRUD.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MyCompanyAccessService {

    private final MyCompanyUserAccessRepository repository;
    private final MyCompanyRepository firmRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final NotificationDispatchService dispatchService;

    @Transactional(readOnly = true)
    public List<MyCompanyAccessUserDto> list(UUID firmId) {
        return repository.findByMyCompanyIdOrderByGrantedAtDesc(firmId).stream()
                .map(this::toDto).toList();
    }

    /** TODO 422595dd: bulk-select için kaynak firmanın user_id listesi. */
    @Transactional(readOnly = true)
    public List<UUID> listUserIds(UUID firmId) {
        return repository.findUserIdsByMyCompanyId(firmId);
    }

    /**
     * Toplu grant — idempotent (zaten var olan kayıt atlanır).
     * Cross-tenant: admin yetkisi controller'da; firm geçerliliği burada.
     */
    @Transactional
    public List<MyCompanyAccessUserDto> grantBulk(UUID firmId, List<UUID> userIds, UUID actorUserId) {
        MyCompany firm = firmRepository.findById(firmId)
                .orElseThrow(() -> new IllegalArgumentException("Firma bulunamadi"));
        User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
        List<MyCompanyUserAccess> created = new ArrayList<>();
        int skipped = 0;
        for (UUID uid : userIds) {
            if (uid == null) continue;
            Optional<MyCompanyUserAccess> existing =
                    repository.findByMyCompanyIdAndUserId(firmId, uid);
            if (existing.isPresent()) { skipped++; continue; }
            User u = userRepository.findById(uid).orElse(null);
            if (u == null) continue;
            MyCompanyUserAccess a = MyCompanyUserAccess.builder()
                    .myCompany(firm)
                    .user(u)
                    .grantedBy(actor)
                    .build();
            created.add(repository.save(a));
        }
        log.info("[my-company-access] grantBulk firmId={} created={} skipped={}", firmId, created.size(), skipped);
        auditLogService.recordEntityAction(
                "MY_COMPANY_ACCESS_GRANT",
                actorUserId, actor != null ? actor.getUsername() : null,
                "MY_COMPANY", firmId,
                "Erisim verildi: " + created.size() + " yeni kullanici",
                Map.of("created", created.size(), "skipped", skipped));

        // #900e316d: toplu grant yolunda da FIRM_ACCESS_GRANTED dispatch (AdminUserService
        // ile simetrik). Yalnız YENİ eklenen (idempotent skip değil) kullanıcılara.
        List<UUID> grantedUserIds = created.stream()
                .map(a -> a.getUser() != null ? a.getUser().getId() : null)
                .filter(java.util.Objects::nonNull).toList();
        dispatchFirmAccess(NotificationEvent.FIRM_ACCESS_GRANTED, grantedUserIds, firm);

        return created.stream().map(this::toDto).toList();
    }

    @Transactional
    public void revoke(UUID firmId, UUID userId, UUID actorUserId) {
        Optional<MyCompanyUserAccess> existing = repository.findByMyCompanyIdAndUserId(firmId, userId);
        if (existing.isEmpty()) return;
        repository.delete(existing.get());
        auditLogService.recordEntityAction(
                "MY_COMPANY_ACCESS_REVOKE",
                actorUserId, null,
                "MY_COMPANY", firmId,
                "Erisim kaldirildi: user=" + userId,
                Map.of("userId", userId));
        // #900e316d: revoke → etkilenen kullanıcıya "erişim kaldırıldı" bildirimi.
        dispatchFirmAccess(NotificationEvent.FIRM_ACCESS_REVOKED, List.of(userId), loadFirm(firmId));
    }

    @Transactional
    public int revokeBulk(UUID firmId, List<UUID> userIds, UUID actorUserId) {
        if (userIds == null || userIds.isEmpty()) return 0;
        // Yalnız gerçekten erişimi olanlara bildir (silinmeden önce tespit et).
        List<UUID> affected = userIds.stream()
                .filter(uid -> uid != null && repository.findByMyCompanyIdAndUserId(firmId, uid).isPresent())
                .toList();
        int removed = repository.deleteByMyCompanyIdAndUserIdIn(firmId, userIds);
        auditLogService.recordEntityAction(
                "MY_COMPANY_ACCESS_REVOKE_BULK",
                actorUserId, null,
                "MY_COMPANY", firmId,
                "Toplu erisim kaldirildi: " + removed,
                Map.of("removed", removed));
        // #900e316d: toplu revoke → etkilenen her kullanıcıya bildirim.
        dispatchFirmAccess(NotificationEvent.FIRM_ACCESS_REVOKED, affected, loadFirm(firmId));
        return removed;
    }

    @Transactional
    public int clearAll(UUID firmId, UUID actorUserId) {
        // Silmeden önce etkilenen user_id'leri topla (clearAll'da tek tek silinmiyor).
        List<UUID> affected = repository.findUserIdsByMyCompanyId(firmId);
        int removed = repository.deleteByMyCompanyId(firmId);
        auditLogService.recordEntityAction(
                "MY_COMPANY_ACCESS_CLEAR",
                actorUserId, null,
                "MY_COMPANY", firmId,
                "Tum erisimler temizlendi: " + removed,
                Map.of("removed", removed));
        // #900e316d: clearAll → etkilenen her kullanıcıya "erişim kaldırıldı".
        dispatchFirmAccess(NotificationEvent.FIRM_ACCESS_REVOKED, affected, loadFirm(firmId));
        return removed;
    }

    /** Bildirim için firma adını çözmek üzere firmayı yükler (yoksa null). */
    private MyCompany loadFirm(UUID firmId) {
        return firmRepository.findById(firmId).orElse(null);
    }

    /**
     * #900e316d: FIRM_ACCESS_GRANTED/REVOKED dispatch (AdminUserService deseni).
     * Best-effort/non-fatal — bildirim hatası grant/revoke işlemini BOZMAZ.
     * Firma {@code legalName} şablonun {@code {business}} değişkenine eşlenir.
     */
    private void dispatchFirmAccess(NotificationEvent event, List<UUID> userIds, MyCompany firm) {
        if (userIds == null || userIds.isEmpty()) return;
        String firmName = firm != null && firm.getLegalName() != null ? firm.getLegalName() : "";
        UUID firmId = firm != null ? firm.getId() : null;
        for (UUID uid : userIds) {
            if (uid == null) continue;
            try {
                dispatchService.dispatchToUser(
                        event, uid,
                        Map.of("business", firmName),
                        "/dashboard/firmalarim",
                        firmId);
            } catch (Exception e) {
                log.warn("[my-company-access] {} dispatch hatası (izole) user={} firm={}: {}",
                        event, uid, firmId, e.getMessage());
            }
        }
        log.info("[my-company-access] {} dispatch firm={} alıcı={}", event, firmId, userIds.size());
    }

    private MyCompanyAccessUserDto toDto(MyCompanyUserAccess a) {
        User u = a.getUser();
        User by = a.getGrantedBy();
        return MyCompanyAccessUserDto.builder()
                .accessId(a.getId())
                .userId(u != null ? u.getId() : null)
                .username(u != null ? u.getUsername() : null)
                .fullName(u != null ? u.getFullName() : null)
                .grantedAt(a.getGrantedAt())
                .grantedByUsername(by != null ? by.getUsername() : null)
                .build();
    }
}
