package com.bizboard.service;

import com.bizboard.common.dto.*;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.BusinessGroup;
import com.bizboard.common.entity.BusinessGroupMember;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessGroupMemberRepository;
import com.bizboard.repository.BusinessGroupRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * v1.6.11: Kullanıcının dashboard'unda işletmeleri gruplara ayırma.
 *
 * İzolasyon kuralı: TÜM endpoint'ler `WHERE user_id = currentUser`. Bir
 * kullanıcının grupları başka bir kullanıcıya sızmaz. Üye ekleme/çıkarma
 * sırasında işletme erişimi {@link BusinessAccessGuard} ile doğrulanır.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BusinessGroupService {

    private final BusinessGroupRepository groupRepository;
    private final BusinessGroupMemberRepository memberRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;

    /** Default renk paletinde olabilecek değerler. Service-level guard. */
    private static final Set<String> ALLOWED_COLORS = Set.of(
            "zinc", "blue", "green", "orange", "red", "purple", "pink", "teal"
    );

    // ───────────────────────── LIST ─────────────────────────

    @Transactional(readOnly = true)
    public List<BusinessGroupDto> listMyGroups(UUID userId) {
        List<BusinessGroup> groups =
                groupRepository.findByUserIdOrderByPriorityAscOrderIndexAscCreatedAtAsc(userId);

        if (groups.isEmpty()) return List.of();

        // Bütün üyeleri tek query ile çek — N+1 önle.
        List<BusinessGroupMember> allMembers = memberRepository.findAllForUser(userId);
        Map<UUID, List<BusinessGroupMember>> byGroup = allMembers.stream()
                .collect(Collectors.groupingBy(m -> m.getGroup().getId()));

        return groups.stream()
                .map(g -> toDto(g, byGroup.getOrDefault(g.getId(), List.of())))
                .toList();
    }

    // ───────────────────────── CREATE ─────────────────────────

    @Transactional
    public BusinessGroupDto createGroup(UUID userId, CreateBusinessGroupRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        int priority = normalizePriority(req.getPriority(), BusinessGroup.PRIORITY_NORMAL);
        String color = normalizeColor(req.getColor());

        // Aynı priority içindeki son orderIndex'i bul → +1
        List<BusinessGroup> sameLevel =
                groupRepository.findByUserIdAndPriorityOrderByOrderIndexAsc(userId, priority);
        int nextOrder = sameLevel.isEmpty()
                ? 0
                : sameLevel.get(sameLevel.size() - 1).getOrderIndex() + 1;

        BusinessGroup group = BusinessGroup.builder()
                .user(user)
                .name(req.getName().trim())
                .color(color)
                .priority(priority)
                .orderIndex(nextOrder)
                .build();
        group = groupRepository.save(group);

        log.info("Group created: userId={} group={} priority={} color={}",
                userId, group.getName(), priority, color);

        return toDto(group, List.of());
    }

    // ───────────────────────── UPDATE ─────────────────────────

    @Transactional
    public BusinessGroupDto updateGroup(UUID userId, UUID groupId, UpdateBusinessGroupRequest req) {
        BusinessGroup group = mustOwn(userId, groupId);

        if (req.getName() != null && !req.getName().isBlank()) {
            group.setName(req.getName().trim());
        }
        if (req.getColor() != null) {
            group.setColor(normalizeColor(req.getColor()));
        }
        if (req.getPriority() != null) {
            int newPriority = normalizePriority(req.getPriority(), group.getPriority());
            if (newPriority != group.getPriority()) {
                // Priority değişti — yeni seviyenin sonuna it.
                List<BusinessGroup> sameLevel =
                        groupRepository.findByUserIdAndPriorityOrderByOrderIndexAsc(userId, newPriority);
                int nextOrder = sameLevel.isEmpty()
                        ? 0
                        : sameLevel.get(sameLevel.size() - 1).getOrderIndex() + 1;
                group.setPriority(newPriority);
                group.setOrderIndex(nextOrder);
            }
        }

        group = groupRepository.save(group);

        List<BusinessGroupMember> members =
                memberRepository.findByGroupIdOrderByOrderInGroupAsc(group.getId());
        return toDto(group, members);
    }

    // ───────────────────────── DELETE ─────────────────────────

    @Transactional
    public void deleteGroup(UUID userId, UUID groupId) {
        BusinessGroup group = mustOwn(userId, groupId);
        // Üyeler cascade ile temizlenir (relation @ManyToOne LAZY, ama bizim
        // tablomuzda CASCADE kuralı uygulama-level — bu nedenle önce member sil).
        List<BusinessGroupMember> members =
                memberRepository.findByGroupIdOrderByOrderInGroupAsc(groupId);
        if (!members.isEmpty()) {
            memberRepository.deleteAll(members);
        }
        groupRepository.delete(group);
        log.info("Group deleted: userId={} groupId={} memberCount={}", userId, groupId, members.size());
    }

    // ───────────────────────── ADD MEMBER ─────────────────────────

    @Transactional
    public BusinessGroupDto addMember(UUID userId, UUID groupId, AddGroupMemberRequest req) {
        BusinessGroup group = mustOwn(userId, groupId);

        // İşletme erişimi (IDOR koruması) — kullanıcı bu işletmeyi göremiyorsa
        // grubuna ekleyemez.
        accessGuard.assertCanAccessBusiness(userId, req.getBusinessId());

        Business business = businessRepository.findById(req.getBusinessId())
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        // Aynı işletme aynı grupta zaten var mı?
        Optional<BusinessGroupMember> existing =
                memberRepository.findByGroupIdAndBusinessId(groupId, req.getBusinessId());
        if (existing.isPresent()) {
            // No-op — idempotent davran (frontend dnd retry'ları için).
            return toDto(group, memberRepository.findByGroupIdOrderByOrderInGroupAsc(groupId));
        }

        // orderInGroup hesabı
        List<BusinessGroupMember> current =
                memberRepository.findByGroupIdOrderByOrderInGroupAsc(groupId);
        int order = req.getOrderInGroup() != null
                ? req.getOrderInGroup()
                : (current.isEmpty() ? 0 : current.get(current.size() - 1).getOrderInGroup() + 1);

        BusinessGroupMember member = BusinessGroupMember.builder()
                .group(group)
                .business(business)
                .orderInGroup(order)
                .build();
        memberRepository.save(member);

        log.info("Group member added: userId={} groupId={} businessId={}",
                userId, groupId, req.getBusinessId());

        return toDto(group, memberRepository.findByGroupIdOrderByOrderInGroupAsc(groupId));
    }

    // ───────────────────────── REMOVE MEMBER ─────────────────────────

    @Transactional
    public void removeMember(UUID userId, UUID groupId, UUID businessId) {
        BusinessGroup group = mustOwn(userId, groupId);
        memberRepository.deleteByGroupIdAndBusinessId(group.getId(), businessId);
        log.info("Group member removed: userId={} groupId={} businessId={}",
                userId, groupId, businessId);
    }

    // ───────────────────────── REORDER GROUPS ─────────────────────────

    @Transactional
    public List<BusinessGroupDto> reorderGroups(UUID userId, List<UUID> orderedIds) {
        if (orderedIds == null || orderedIds.isEmpty()) {
            return listMyGroups(userId);
        }
        // İlk olarak hepsinin sahibi mi onayla.
        List<BusinessGroup> all = orderedIds.stream()
                .map(id -> groupRepository.findByIdAndUserId(id, userId)
                        .orElseThrow(() -> new SecurityException("Group not accessible: " + id)))
                .toList();

        // Aynı priority içinde olduklarını da kontrol et — spec der ki:
        // "sürükleme YALNIZCA AYNI ÖNCELİK SEVİYESİ İÇİNDE çalışır".
        int priority = all.get(0).getPriority();
        for (BusinessGroup g : all) {
            if (g.getPriority() != priority) {
                throw new IllegalArgumentException(
                        "Reorder yalnız aynı priority içinde mümkün");
            }
        }

        // orderIndex'leri 0,1,2,... olarak ata.
        for (int i = 0; i < all.size(); i++) {
            all.get(i).setOrderIndex(i);
        }
        groupRepository.saveAll(all);

        return listMyGroups(userId);
    }

    // ───────────────────────── REORDER MEMBERS ─────────────────────────

    @Transactional
    public BusinessGroupDto reorderMembers(UUID userId, UUID groupId, List<UUID> orderedBusinessIds) {
        BusinessGroup group = mustOwn(userId, groupId);
        List<BusinessGroupMember> current =
                memberRepository.findByGroupIdOrderByOrderInGroupAsc(groupId);

        Map<UUID, BusinessGroupMember> byBusinessId = current.stream()
                .collect(Collectors.toMap(m -> m.getBusiness().getId(), m -> m));

        // Verilen sırayla 0,1,2,... ata. Listede olmayan üyeler dokunmadan kalır
        // (sonuna eklenir).
        int i = 0;
        for (UUID bizId : orderedBusinessIds) {
            BusinessGroupMember m = byBusinessId.get(bizId);
            if (m == null) continue;
            m.setOrderInGroup(i++);
        }
        // Verilmeyen üyeler — sonuna it.
        for (BusinessGroupMember m : current) {
            if (!orderedBusinessIds.contains(m.getBusiness().getId())) {
                m.setOrderInGroup(i++);
            }
        }
        memberRepository.saveAll(current);

        return toDto(group, memberRepository.findByGroupIdOrderByOrderInGroupAsc(groupId));
    }

    // ───────────────────────── HELPERS ─────────────────────────

    /** Verilen group ID kullanıcının grubu mu — değilse SecurityException. */
    private BusinessGroup mustOwn(UUID userId, UUID groupId) {
        return groupRepository.findByIdAndUserId(groupId, userId)
                .orElseThrow(() -> new SecurityException(
                        "Group not found or not accessible: " + groupId));
    }

    private static int normalizePriority(Integer raw, int fallback) {
        if (raw == null) return fallback;
        if (raw == BusinessGroup.PRIORITY_PINNED
                || raw == BusinessGroup.PRIORITY_HIGH
                || raw == BusinessGroup.PRIORITY_NORMAL) {
            return raw;
        }
        throw new IllegalArgumentException(
                "Geçersiz priority: " + raw + " — 0/1/2 olmalı");
    }

    private static String normalizeColor(String raw) {
        if (raw == null || raw.isBlank()) return "zinc";
        String lower = raw.trim().toLowerCase(Locale.ROOT);
        if (!ALLOWED_COLORS.contains(lower)) {
            throw new IllegalArgumentException(
                    "Geçersiz renk: " + raw + " — paletten birini seçin");
        }
        return lower;
    }

    private static BusinessGroupDto toDto(BusinessGroup g, List<BusinessGroupMember> members) {
        return BusinessGroupDto.builder()
                .id(g.getId())
                .name(g.getName())
                .color(g.getColor())
                .priority(g.getPriority())
                .orderIndex(g.getOrderIndex())
                .members(members.stream().map(BusinessGroupService::toMemberDto).toList())
                .createdAt(g.getCreatedAt())
                .updatedAt(g.getUpdatedAt())
                .build();
    }

    private static BusinessGroupMemberDto toMemberDto(BusinessGroupMember m) {
        return BusinessGroupMemberDto.builder()
                .businessId(m.getBusiness().getId())
                .businessName(m.getBusiness().getName())
                .orderInGroup(m.getOrderInGroup())
                .addedAt(m.getAddedAt())
                .build();
    }
}
