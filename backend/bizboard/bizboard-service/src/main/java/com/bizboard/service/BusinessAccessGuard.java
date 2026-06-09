package com.bizboard.service;

import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * Tek noktadan yetkilendirme kontrolü: "Bu kullanıcı bu işletmeye erişebilir mi?"
 *
 * <p>Tüm servisler (Employee, Vehicle, Debt, Transaction, Inventory, FixedCost,
 * BusinessNote, …) bir business-bound kaynak üzerinde mutate/read yapmadan önce
 * {@link #assertCanAccessBusiness} çağırır. Mantığı tek yerde tuttuğumuz için
 * "şuna eklemeyi unutmuşuz" hatası bir daha aynı şekilde tekrarlanmaz.</p>
 *
 * <p>Kurallar:</p>
 * <ul>
 *   <li>{@code role=admin} → her şeye erişir</li>
 *   <li>{@code accessibleBusinesses="all"} → her şeye erişir</li>
 *   <li>{@code accessibleBusinesses=uuid1,uuid2,...} → listede olan business'a erişir</li>
 *   <li>Hiçbiri değilse legacy owner/member tablosu üzerinden fallback kontrolü</li>
 * </ul>
 *
 * <p>v2 schema migration'ında {@code accessibleBusinesses} kolonu normalize
 * tabloya (user_business_access) çekildiğinde bu sınıfın iç mantığı tek yerden
 * güncellenecek; çağıran servislerin imzası değişmeyecek.</p>
 */
@Component
@RequiredArgsConstructor
public class BusinessAccessGuard {

    private final UserRepository userRepository;
    private final BusinessRepository businessRepository;

    /**
     * Kullanıcı işletmeye erişebiliyor mu? Throw etmez, sadece boolean döner.
     * Yetkilendirme tek satırlık {@code if (!guard.canAccess(...)) ...} kontrolleri için.
     */
    public boolean canAccessBusiness(UUID userId, UUID businessId) {
        if (userId == null || businessId == null) return false;

        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return false;

        if ("admin".equalsIgnoreCase(user.getRole())) {
            return true;
        }

        String accessible = user.getAccessibleBusinesses();
        if (accessible != null && !accessible.isBlank()) {
            String trimmed = accessible.trim();
            if ("all".equalsIgnoreCase(trimmed)) {
                return true;
            }
            String target = businessId.toString();
            return Arrays.stream(trimmed.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .anyMatch(target::equals);
        }

        // Legacy fallback: owner veya member.
        Business business = businessRepository.findById(businessId).orElse(null);
        if (business == null) return false;
        if (business.getOwner() != null && business.getOwner().getId().equals(userId)) {
            return true;
        }
        return business.getMembers() != null
                && business.getMembers().stream()
                .anyMatch(m -> m.getUser() != null && m.getUser().getId().equals(userId));
    }

    /**
     * MUTATE (create/update/delete) erişim kontrolü. Erişim yoksa
     * {@link SecurityException} → <b>403</b>. arch-rules §1.5: mutate-deny 403.
     *
     * <p>Hata mesajı kasıtlı olarak generic; bilgi sızması yapmaz.</p>
     */
    public void assertCanAccessBusiness(UUID userId, UUID businessId) {
        if (!canAccessBusiness(userId, businessId)) {
            throw new SecurityException("Access denied");
        }
    }

    /**
     * H-2 (arch-rules §1.5): READ erişim kontrolü. Erişim yoksa
     * {@link ResourceNotAccessibleException} → <b>404 "Kayıt bulunamadı"</b>
     * (varlık sızdırma yok). Read/list/get/summary/statement servis metodları
     * mutate-variant yerine bunu kullanmalı.
     */
    public void assertCanReadBusiness(UUID userId, UUID businessId) {
        if (!canAccessBusiness(userId, businessId)) {
            throw new ResourceNotAccessibleException();
        }
    }

    /**
     * v1.6.23.19 (Security WP TODO 809834ef): kullanıcının erişebildiği tüm
     * business id'leri. Admin için TÜM businesses döner; user için
     * accessible_businesses CSV'sinden parse edilir, "all" değerinde admin
     * gibi davranır. Multi-tenant filter query'lerinde kullanılır.
     *
     * @return boş set = hiçbir business erişilebilir değil (yetkisiz);
     *         null değer DÖNDÜRÜLMEZ.
     */
    public List<UUID> accessibleBusinessIds(UUID userId) {
        if (userId == null) return List.of();
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return List.of();

        if ("admin".equalsIgnoreCase(user.getRole())) {
            return businessRepository.findAll().stream().map(Business::getId).toList();
        }
        String accessible = user.getAccessibleBusinesses();
        if (accessible != null && !accessible.isBlank()) {
            String trimmed = accessible.trim();
            if ("all".equalsIgnoreCase(trimmed)) {
                return businessRepository.findAll().stream().map(Business::getId).toList();
            }
            return Arrays.stream(trimmed.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(s -> {
                        try { return UUID.fromString(s); } catch (Exception e) { return null; }
                    })
                    .filter(java.util.Objects::nonNull)
                    .toList();
        }
        // Legacy: owner + member relations
        return businessRepository.findAll().stream()
                .filter(b ->
                    (b.getOwner() != null && b.getOwner().getId().equals(userId)) ||
                    (b.getMembers() != null && b.getMembers().stream()
                        .anyMatch(m -> m.getUser() != null && m.getUser().getId().equals(userId)))
                )
                .map(Business::getId)
                .toList();
    }
}
