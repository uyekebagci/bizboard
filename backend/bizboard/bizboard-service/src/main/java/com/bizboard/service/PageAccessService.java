package com.bizboard.service;

import com.bizboard.common.enums.SidebarPage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Kullanıcı-bazlı sidebar SAYFA erişimi — {@code users.allowed_pages} kolonu için
 * normalize / parse / resolve mantığını tek noktada toplar.
 *
 * <p><b>Default-permissive sözleşmesi:</b></p>
 * <ul>
 *   <li>Admin rolü → her zaman {@code "all"} (kolon yok sayılır, tüm sayfalar).</li>
 *   <li>{@code null} / boş / {@code "all"} → tüm sayfalar (mevcut kullanıcılar
 *       etkilenmez; kısıtlama opt-in).</li>
 *   <li>Aksi takdirde virgülle ayrılmış {@link SidebarPage} anahtarları; geçersiz
 *       anahtarlar (whitelist dışı) sessizce atılır (defansif).</li>
 * </ul>
 *
 * <p>Bu yalnızca navigasyon/görünürlük seviyesidir; sayfa endpoint RBAC'ından
 * AYRI ve ona dokunmaz.</p>
 */
@Slf4j
@Service
public class PageAccessService {

    /** Sentinel — tüm sayfalara erişim. */
    public static final String ALL = "all";

    /**
     * Admin paneli formundan gelen ham sayfa-anahtarı listesini {@code allowed_pages}
     * kolonu için normalize eder.
     *
     * <ul>
     *   <li>Admin rolü → {@code "all"} (request ne olursa olsun ezilir).</li>
     *   <li>{@code null} veya boş liste → {@code "all"} (default-permissive: hiçbir
     *       sayfa seçilmemişse kullanıcı KILITLENMEZ, tüm sayfaları görür).</li>
     *   <li>Tüm geçerli sayfa anahtarları işaretliyse → {@code "all"} (kanonikleştirme,
     *       gereksiz kısıtlama kaydı tutulmaz).</li>
     *   <li>Aksi takdirde: yalnız GEÇERLI (whitelist) anahtarlar, sırasız tekilleştirilmiş,
     *       virgülle birleştirilmiş CSV.</li>
     * </ul>
     *
     * @param pageKeys admin formundan gelen sayfa anahtarları (örn. ["dashboard", "transactions"])
     * @param role     hedef kullanıcının (efektif) rolü
     * @return kolona yazılacak değer ({@code "all"} veya CSV)
     */
    public String normalize(List<String> pageKeys, String role) {
        if (role != null && "admin".equalsIgnoreCase(role.trim())) {
            return ALL;
        }
        if (pageKeys == null || pageKeys.isEmpty()) {
            return ALL;
        }
        Set<String> valid = new LinkedHashSet<>();
        for (String raw : pageKeys) {
            if (raw == null) continue;
            String key = raw.trim();
            if (key.isEmpty()) continue;
            if (SidebarPage.isValidKey(key)) {
                valid.add(key);
            } else {
                log.debug("[page-access] geçersiz sayfa anahtarı atlandı: {}", key);
            }
        }
        if (valid.isEmpty()) {
            // Yalnız geçersiz anahtar geldi → kullanıcıyı kilitleme; default-permissive.
            return ALL;
        }
        // Tüm geçerli sayfalar seçildiyse "all"'a indirge (kanonik).
        if (valid.containsAll(SidebarPage.allKeys())) {
            return ALL;
        }
        return String.join(",", valid);
    }

    /**
     * Saklanan {@code allowed_pages} değerini efektif sayfa-anahtarı setine çözer
     * (FE'ye expose için).
     *
     * @param storedValue {@code users.allowed_pages} kolon değeri
     * @param role        kullanıcının rolü
     * @return erişilebilir sayfa anahtarları; "all"/admin durumunda TÜM anahtarlar
     */
    public Set<String> resolveAllowed(String storedValue, String role) {
        if (isAll(storedValue, role)) {
            return SidebarPage.allKeys();
        }
        return parse(storedValue);
    }

    /**
     * Kullanıcı {@code "all"} (tüm sayfa) erişimine mi sahip? Admin VEYA null/boş/"all".
     */
    public boolean isAll(String storedValue, String role) {
        if (role != null && "admin".equalsIgnoreCase(role.trim())) {
            return true;
        }
        if (storedValue == null) return true;
        String v = storedValue.trim();
        return v.isEmpty() || ALL.equalsIgnoreCase(v);
    }

    /**
     * CSV'yi geçerli sayfa-anahtarı setine çevirir. {@code null}/boş/"all" → boş set.
     * Geçersiz token'lar sessizce atlanır (defansif).
     */
    private Set<String> parse(String csv) {
        Set<String> out = new LinkedHashSet<>();
        if (csv == null) return out;
        String v = csv.trim();
        if (v.isEmpty() || ALL.equalsIgnoreCase(v)) return out;
        for (String token : v.split(",")) {
            String t = token.trim().toLowerCase(Locale.ENGLISH);
            if (t.isEmpty()) continue;
            if (SidebarPage.isValidKey(t)) {
                out.add(t);
            }
        }
        return out;
    }
}
