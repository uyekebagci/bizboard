package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateUserRequest;
import com.bizboard.common.dto.UpdateUserRequest;
import com.bizboard.common.dto.UserDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminUserService {

    private final UserRepository userRepository;
    private final BusinessRepository businessRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;
    // v1.7.x: user delete öncesi FK temizleme için
    private final com.bizboard.repository.NotificationRepository notificationRepository;
    private final com.bizboard.repository.RefreshTokenRepository refreshTokenRepository;
    // Standalone hatırlatıcı: user delete öncesi FK temizleme.
    private final com.bizboard.repository.ReminderRepository reminderRepository;
    // Tier 3 (EVT-3): firma erişimi verilince FIRM_ACCESS_GRANTED dispatch için.
    private final com.bizboard.service.notification.NotificationDispatchService dispatchService;

    @Transactional(readOnly = true)
    public List<UserDto> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::toUserDto)
                .toList();
    }

    @Transactional
    public UserDto createUser(CreateUserRequest request, UUID actorUserId) {
        // Username kontrolü
        if (userRepository.findByUsername(request.getUsername()).isPresent()) {
            throw new IllegalArgumentException("Bu kullanici adi zaten kullaniliyor");
        }

        String role = request.getRole().toLowerCase(java.util.Locale.ENGLISH);
        // Y3: accessibleBusinesses strict — "all" sadece admin için; non-admin için
        // her id geçerli bir UUID olmalı. Geçersiz girişte create reddedilir.
        String businessIdsStr = normalizeAccessibleBusinesses(request.getBusinessIds(), role);

        User user = User.builder()
                .username(request.getUsername())
                .password(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .role(role)
                .accessibleBusinesses(businessIdsStr)
                .onboardingCompleted(true)
                .active(true)
                // v1.7.x: zorunlu şifre değişikliği kaldırıldı (kullanıcı talebi).
                .mustChangePassword(false)
                .build();

        user = userRepository.save(user);

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.USER_CREATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "USER", user.getId(),
                "Kullanici olusturuldu: " + user.getUsername() + " (rol=" + role + ")",
                Map.of(
                        "targetUserId", user.getId(),
                        "targetUsername", user.getUsername(),
                        "role", role,
                        "businessIdsCount", request.getBusinessIds().size()
                ));

        // Tier 3 (EVT-3): yeni kullanıcıya verilen tüm firma erişimleri için
        // FIRM_ACCESS_GRANTED dispatch (oluşturma = tümü yeni). Non-fatal.
        dispatchFirmAccessGranted(user, parseBusinessIds(businessIdsStr));

        return toUserDto(user);
    }

    @Transactional
    public UserDto updateUser(UUID userId, UpdateUserRequest request, UUID actorUserId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi"));

        Map<String, Object> changes = new HashMap<>();
        String oldRole = user.getRole();
        String newRole = null;
        // Tier 3 (EVT-3): değişiklik commit'inden ÖNCE eski erişim seti — yalnız
        // YENİ EKLENEN firmalar için bildirim (idempotent: mevcut erişim tekrar etmez).
        Set<UUID> oldAccessIds = parseBusinessIds(user.getAccessibleBusinesses());
        Set<UUID> newlyGranted = new HashSet<>();

        if (request.getFullName() != null && !request.getFullName().isBlank()
                && !Objects.equals(request.getFullName(), user.getFullName())) {
            changes.put("fullName", Map.of(
                    "from", user.getFullName() != null ? user.getFullName() : "",
                    "to", request.getFullName()));
            user.setFullName(request.getFullName());
        }

        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            // Şifre değeri audit'e GIRMEZ; sadece değişti bayrağı.
            changes.put("password", "changed");
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        if (request.getRole() != null) {
            newRole = request.getRole().toLowerCase(java.util.Locale.ENGLISH);
            if (!Objects.equals(newRole, oldRole)) {
                changes.put("role", Map.of(
                        "from", oldRole != null ? oldRole : "",
                        "to", newRole));
                user.setRole(newRole);
            }
        }

        if (request.getBusinessIds() != null && !request.getBusinessIds().isEmpty()) {
            String oldBusinesses = user.getAccessibleBusinesses();
            // Update'te efektif rol: request'te role değiştiyse onu, yoksa user'ın
            // mevcut rolünü esas al. Y3 strict validation.
            String effectiveRole = newRole != null ? newRole : user.getRole();
            String newBusinesses = normalizeAccessibleBusinesses(request.getBusinessIds(), effectiveRole);
            if (!Objects.equals(newBusinesses, oldBusinesses)) {
                changes.put("accessibleBusinesses", Map.of(
                        "from", oldBusinesses != null ? oldBusinesses : "",
                        "to", newBusinesses));
                user.setAccessibleBusinesses(newBusinesses);
                // EVT-3: yeni eklenen = yeni set − eski set. "all" (admin) atlanır;
                // her firma için tek tek bildirim sadece açık id listesinde anlamlı.
                Set<UUID> newAccessIds = parseBusinessIds(newBusinesses);
                for (UUID id : newAccessIds) {
                    if (!oldAccessIds.contains(id)) newlyGranted.add(id);
                }
            }
        }

        if (request.getActive() != null && request.getActive() != user.isActive()) {
            changes.put("active", Map.of("from", user.isActive(), "to", request.getActive()));
            user.setActive(request.getActive());
        }

        user = userRepository.save(user);

        User actor = lookupActor(actorUserId);

        // Rol değişimi varsa AYRI bir USER_ROLE_CHANGE satırı düş — security-kritik aksiyon.
        if (newRole != null && !Objects.equals(newRole, oldRole)) {
            auditLogService.recordEntityAction(
                    AuditAction.USER_ROLE_CHANGE,
                    actorUserId, actor != null ? actor.getUsername() : null,
                    "USER", user.getId(),
                    "Rol degisikligi: " + user.getUsername() + " (" + oldRole + " -> " + newRole + ")",
                    Map.of(
                            "targetUserId", user.getId(),
                            "targetUsername", user.getUsername(),
                            "from", oldRole != null ? oldRole : "",
                            "to", newRole
                    ));
        }

        // Genel update — rol değişimi de dahil edilir (full diff burada).
        Map<String, Object> meta = new HashMap<>();
        meta.put("targetUserId", user.getId());
        meta.put("targetUsername", user.getUsername());
        meta.put("changes", changes);
        meta.put("fieldsChanged", changes.size());
        auditLogService.recordEntityAction(
                AuditAction.USER_UPDATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "USER", user.getId(),
                "Kullanici guncellendi: " + user.getUsername() + " (" + changes.size() + " alan)",
                meta);

        // Tier 3 (EVT-3): yalnız bu güncellemede YENİ eklenen firmalar için dispatch.
        dispatchFirmAccessGranted(user, newlyGranted);

        return toUserDto(user);
    }

    @Transactional
    public void deleteUser(UUID userId, UUID actorUserId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi"));

        if ("admin".equalsIgnoreCase(user.getRole())) {
            throw new IllegalArgumentException("Admin kullanici silinemez");
        }

        String username = user.getUsername();
        String role = user.getRole();

        // v1.7.x: FK temizliği — notifications + refresh_tokens.
        // Bu kayıtlar kullanıcıya bağlı; cascade yok, manuel delete gerekiyor.
        // (audit_logs.user_id NULLABLE olduğu için orada cascade gerekmez.)
        int notif = notificationRepository.deleteByUserId(userId);
        int rt = refreshTokenRepository.deleteByUserId(userId);
        int rem = reminderRepository.deleteByOwnerId(userId);
        if (notif > 0 || rt > 0 || rem > 0) {
            log.info("[user-delete] FK cleanup — notifications: {}, refresh_tokens: {}, reminders: {}",
                    notif, rt, rem);
        }

        userRepository.delete(user);

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.USER_DELETE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "USER", userId,
                "Kullanici silindi: " + username + " (rol=" + role + ")",
                Map.of(
                        "targetUserId", userId,
                        "targetUsername", username,
                        "role", role != null ? role : ""
                ));
    }

    private User lookupActor(UUID actorUserId) {
        if (actorUserId == null) return null;
        return userRepository.findById(actorUserId).orElse(null);
    }

    /**
     * Y3 — {@code accessible_businesses} kolonu için strict normalize/validate.
     *
     * <ul>
     *   <li>Admin rolü → her zaman "all". Request'te ne gelirse gelsin ezilir.</li>
     *   <li>Non-admin için: her id geçerli UUID olmalı; aksi takdirde
     *       {@code IllegalArgumentException}. Boş liste → boş string (hiçbir
     *       işletmeye erişim yok, controller bunu reddederse de tutarlı bir
     *       şekilde "no access" döner).</li>
     *   <li>"all" stringi non-admin için kabul edilmez (privilege escalation
     *       vektörü kapanır — eski sürümlerde non-admin için bile "all" geçerdi).</li>
     * </ul>
     */
    private static String normalizeAccessibleBusinesses(java.util.List<UUID> businessIds, String role) {
        if ("admin".equalsIgnoreCase(role)) {
            return "all";
        }
        if (businessIds == null || businessIds.isEmpty()) {
            return "";
        }
        // Tüm id'ler zaten UUID tipinde geliyor (Spring binding); ama defansif:
        // null veya bozuk olanları reddet.
        return businessIds.stream()
                .filter(java.util.Objects::nonNull)
                .map(UUID::toString)
                .collect(Collectors.joining(","));
    }

    /**
     * Tier 3 (EVT-3): verilen firmalara erişimi tanımlanan kullanıcıya
     * {@link NotificationEvent#FIRM_ACCESS_GRANTED} dispatch eder (firma başına bir
     * bildirim). Mevcut kanal-agnostik dispatch altyapısı (in-app + opt-in Telegram)
     * kullanılır.
     *
     * <p><b>İdempotent:</b> yalnız YENİ eklenen firmalar geçilir (çağıran diff
     * hesaplar); aynı erişim ikinci kez verilmez → tekrar bildirim olmaz.
     * <b>Non-fatal:</b> bildirim hatası kullanıcı oluşturma/güncelleme tx'ini
     * BOZMAZ (yakalanır, loglanır). "all" (admin) firmaları burada listelenmez.</p>
     */
    private void dispatchFirmAccessGranted(User user, Set<UUID> grantedBusinessIds) {
        if (user == null || grantedBusinessIds == null || grantedBusinessIds.isEmpty()) return;
        try {
            List<Business> businesses = businessRepository.findAllById(grantedBusinessIds);
            for (Business b : businesses) {
                try {
                    dispatchService.dispatchToUser(
                            NotificationEvent.FIRM_ACCESS_GRANTED,
                            user.getId(),
                            Map.of("business", b.getName() != null ? b.getName() : ""),
                            "/dashboard",
                            b.getId());
                } catch (Exception inner) {
                    log.warn("[firm-access] dispatch hatası (izole) user={} business={}: {}",
                            user.getId(), b.getId(), inner.getMessage());
                }
            }
            log.info("[firm-access] FIRM_ACCESS_GRANTED dispatch user={} firma sayısı={}",
                    user.getId(), businesses.size());
        } catch (Exception e) {
            log.warn("[firm-access] FIRM_ACCESS_GRANTED değerlendirme hatası (izole): {}", e.getMessage());
        }
    }

    /**
     * {@code accessible_businesses} CSV'sini geçerli {@link UUID} setine çevirir.
     * {@code null}/boş/"all" → boş set (admin "all" per-firma bildirim üretmez;
     * geçersiz token sessizce atlanır). Sıra önemsiz olduğu için Set.
     */
    private static Set<UUID> parseBusinessIds(String csv) {
        if (csv == null || csv.isBlank() || "all".equalsIgnoreCase(csv.trim())) {
            return new HashSet<>();
        }
        Set<UUID> out = new HashSet<>();
        for (String token : csv.split(",")) {
            String t = token.trim();
            if (t.isEmpty()) continue;
            try {
                out.add(UUID.fromString(t));
            } catch (IllegalArgumentException ignored) {
                // bozuk token — atla (defansif)
            }
        }
        return out;
    }

    private UserDto toUserDto(User user) {
        List<UUID> businessIds = new ArrayList<>();
        List<String> businessNames = new ArrayList<>();

        String accessible = user.getAccessibleBusinesses();
        if (accessible != null && !accessible.isBlank()) {
            if ("all".equalsIgnoreCase(accessible)) {
                List<Business> all = businessRepository.findAll();
                for (Business b : all) {
                    businessIds.add(b.getId());
                    businessNames.add(b.getName());
                }
            } else {
                List<UUID> ids = Arrays.stream(accessible.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .map(UUID::fromString)
                        .toList();
                List<Business> businesses = businessRepository.findAllById(ids);
                for (Business b : businesses) {
                    businessIds.add(b.getId());
                    businessNames.add(b.getName());
                }
            }
        }

        return UserDto.builder()
                .id(user.getId())
                .username(user.getUsername())
                .fullName(user.getFullName())
                .role(user.getRole())
                .active(user.isActive())
                .businessIds(businessIds)
                .businessNames(businessNames)
                .createdAt(user.getCreatedAt())
                .build();
    }
}
