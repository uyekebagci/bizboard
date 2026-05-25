package com.bizboard.service;

import com.bizboard.common.dto.MyCompanyAccessUserDto;
import com.bizboard.common.entity.MyCompany;
import com.bizboard.common.entity.MyCompanyUserAccess;
import com.bizboard.common.entity.User;
import com.bizboard.repository.MyCompanyRepository;
import com.bizboard.repository.MyCompanyUserAccessRepository;
import com.bizboard.repository.UserRepository;
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
    }

    @Transactional
    public int revokeBulk(UUID firmId, List<UUID> userIds, UUID actorUserId) {
        if (userIds == null || userIds.isEmpty()) return 0;
        int removed = repository.deleteByMyCompanyIdAndUserIdIn(firmId, userIds);
        auditLogService.recordEntityAction(
                "MY_COMPANY_ACCESS_REVOKE_BULK",
                actorUserId, null,
                "MY_COMPANY", firmId,
                "Toplu erisim kaldirildi: " + removed,
                Map.of("removed", removed));
        return removed;
    }

    @Transactional
    public int clearAll(UUID firmId, UUID actorUserId) {
        int removed = repository.deleteByMyCompanyId(firmId);
        auditLogService.recordEntityAction(
                "MY_COMPANY_ACCESS_CLEAR",
                actorUserId, null,
                "MY_COMPANY", firmId,
                "Tum erisimler temizlendi: " + removed,
                Map.of("removed", removed));
        return removed;
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
