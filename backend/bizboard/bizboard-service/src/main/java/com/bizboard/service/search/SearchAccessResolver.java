package com.bizboard.service.search;

import com.bizboard.common.search.SearchPermission;
import com.bizboard.repository.MyCompanyUserAccessRepository;
import com.bizboard.service.BusinessAccessGuard;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * v2.2.0 — bir arama isteği için {@link AccessContext} üretir (spec L2).
 *
 * <p>Tek giriş noktası: erişilebilir business id'leri ({@link BusinessAccessGuard}),
 * erişilebilir my-company id'leri ({@code my_company_user_access}) ve hassas-alan
 * permission'larını (L8) çözer.</p>
 *
 * <p><b>Permission modeli notu:</b> Çatı'nın mevcut yetki modeli rol tabanlıdır
 * ({@code role=admin}). Spec §4'teki granular permission'lar (COUNTERPART_FULL_VIEW
 * vb.) henüz RBAC tablosunda yok. Bu nedenle ŞU AN: admin → tüm full-view
 * permission'ları (maskeleme bypass); normal kullanıcı → hiçbiri (VKN/IBAN/maaş
 * maskeli). RBAC genişlediğinde yalnız {@link #resolvePermissions} değişir.</p>
 */
@Component
@RequiredArgsConstructor
public class SearchAccessResolver {

    private final BusinessAccessGuard accessGuard;
    private final MyCompanyUserAccessRepository myCompanyAccessRepository;

    public AccessContext resolve(UUID userId) {
        boolean admin = accessGuard.isAdmin(userId);
        List<UUID> businessIds = accessGuard.accessibleBusinessIds(userId);
        List<UUID> myCompanyIds = admin
                ? List.of() // admin: strategy tüm firmaları döner, id listesine gerek yok
                : myCompanyAccessRepository.findAccessibleMyCompanyIds(userId);
        Set<SearchPermission> perms = resolvePermissions(admin);
        return new AccessContext(userId, admin, businessIds, myCompanyIds, perms);
    }

    private Set<SearchPermission> resolvePermissions(boolean admin) {
        return admin
                ? EnumSet.allOf(SearchPermission.class)
                : EnumSet.noneOf(SearchPermission.class);
    }
}
