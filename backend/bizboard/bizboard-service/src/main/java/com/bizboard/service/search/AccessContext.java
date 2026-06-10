package com.bizboard.service.search;

import com.bizboard.common.search.SearchPermission;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * v2.2.0 — bir arama isteğinin yetkilendirme bağlamı (spec L2 + L8).
 *
 * <p>{@code SearchService} bu context'i {@code BusinessAccessGuard} üzerinden
 * <b>tek seferde</b> çözer ve her entity strategy'sine geçirir. Strategy'ler
 * <b>asla</b> ham userId'den yola çıkıp kendi başına erişim hesaplamaz —
 * mandatory filter (L3) için {@code accessibleBusinessIds}'i kullanır.</p>
 *
 * @param userId               istek sahibi
 * @param admin                role=admin (tüm tenant'lara erişir, maskeleme bypass)
 * @param accessibleBusinessIds L3 mandatory filter listesi (boş = hiç erişim yok)
 * @param accessibleMyCompanyIds my_company_user_access üzerinden erişilen firmalar
 * @param permissions          hassas alan görünürlüğü (L8)
 */
public record AccessContext(
        UUID userId,
        boolean admin,
        List<UUID> accessibleBusinessIds,
        List<UUID> accessibleMyCompanyIds,
        Set<SearchPermission> permissions
) {
    /** Kullanıcının erişebildiği hiçbir tenant yoksa true → tüm sonuçlar boş döner. */
    public boolean hasNoAccess() {
        return !admin && (accessibleBusinessIds == null || accessibleBusinessIds.isEmpty());
    }

    public boolean can(SearchPermission p) {
        return admin || (permissions != null && permissions.contains(p));
    }
}
