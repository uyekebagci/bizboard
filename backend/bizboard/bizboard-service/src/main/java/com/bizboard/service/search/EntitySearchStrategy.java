package com.bizboard.service.search;

import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchHit;
import com.bizboard.common.search.Suggestion;

import java.util.List;

/**
 * v2.2.0 — entity-başına arama stratejisi (spec §8.1).
 *
 * <p>Her searchable entity için bir implementasyon. {@code SearchService} tüm
 * uygun strategy'leri çağırır, sonuçları merge + re-rank eder. <b>Güvenlik
 * sözleşmesi:</b> implementasyon HER sorguda mandatory tenant filter (L3)
 * uygular — {@code ctx.accessibleBusinessIds()} dışındaki hiçbir satır
 * döndürülemez. Hassas alanlar {@link #search} içinde maskelenmiş döner (L8).</p>
 *
 * <p>Yeni entity = yeni strategy + {@link SearchEntityType} sabiti. Servis kodu
 * değişmez (Open/Closed).</p>
 */
public interface EntitySearchStrategy {

    /** Bu strategy'nin yönettiği entity tipi. */
    SearchEntityType type();

    /**
     * Tenant-scope'lu arama. {@code limit} bu entity için döndürülecek max satır
     * (spec T4: 50 hard-cap). Dönen hit'ler zaten maskelenmiş + url'li.
     */
    List<SearchHit> search(ParsedQuery query, AccessContext ctx, int limit);

    /**
     * Autocomplete önerileri (spec §9.1). Aynı access filter altında; yetkisiz
     * isim sızmaz (T9). Boş prefix → boş liste.
     */
    List<Suggestion> suggest(String prefix, AccessContext ctx, int limit);
}
