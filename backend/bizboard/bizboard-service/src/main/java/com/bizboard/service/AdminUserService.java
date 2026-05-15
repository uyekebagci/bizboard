package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateUserRequest;
import com.bizboard.common.dto.UpdateUserRequest;
import com.bizboard.common.dto.UserDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminUserService {

    private final UserRepository userRepository;
    private final BusinessRepository businessRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;

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

        // İşletme ID'lerini string olarak birleştir
        String businessIdsStr = request.getBusinessIds().stream()
                .map(UUID::toString)
                .collect(Collectors.joining(","));

        // Admin rolü için "all" ata
        String role = request.getRole().toLowerCase(java.util.Locale.ENGLISH);
        if ("admin".equalsIgnoreCase(role)) {
            businessIdsStr = "all";
        }

        User user = User.builder()
                .username(request.getUsername())
                .password(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .role(role)
                .accessibleBusinesses(businessIdsStr)
                .onboardingCompleted(true)
                .active(true)
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

        return toUserDto(user);
    }

    @Transactional
    public UserDto updateUser(UUID userId, UpdateUserRequest request, UUID actorUserId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi"));

        Map<String, Object> changes = new HashMap<>();
        String oldRole = user.getRole();
        String newRole = null;

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
            String newBusinesses;
            if ("admin".equalsIgnoreCase(request.getRole())) {
                newBusinesses = "all";
            } else {
                newBusinesses = request.getBusinessIds().stream()
                        .map(UUID::toString)
                        .collect(Collectors.joining(","));
            }
            if (!Objects.equals(newBusinesses, oldBusinesses)) {
                changes.put("accessibleBusinesses", Map.of(
                        "from", oldBusinesses != null ? oldBusinesses : "",
                        "to", newBusinesses));
                user.setAccessibleBusinesses(newBusinesses);
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
