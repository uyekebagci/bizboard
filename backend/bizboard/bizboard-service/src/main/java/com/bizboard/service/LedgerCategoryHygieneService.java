package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Ledger v2 (Faz A, §3.10 + §8.6) — kategori hijyeni <b>ÖNERİ</b> servisi.
 * STRICT: OTOMATİK COMMIT YOK — yalnız öneri (dry-run); taşıma elle onay +
 * reversible runner ile yapılır.
 *
 * <h3>İki öneri tipi:</h3>
 * <ol>
 *   <li><b>İsim-merge önerisi</b>: aynı business'ta aynı isimli (case-insensitive)
 *       birden çok AKTİF kategori (ör. 2× "Diğer"). {@link CategorySharedMigrationRunner}
 *       zaten otomatik merge eder; bu servis ileride kalan/yeni duplicate'leri
 *       rapor eder.</li>
 *   <li><b>Operatör/kişi-tipi kategori ayıklama önerisi (§3.10, A6)</b>: kategori
 *       listesinde aslında operatör/kişi olan kayıtlar ("fatih abi" gibi) —
 *       isim eşleşmesi (counterpart adı veya SUB_CASH hesap adı) heuristiği ile
 *       tespit edilir. Öneri: bu kategoriyi {@code Account(SUB_CASH/operatör)}
 *       veya {@code Counterpart}'a taşı (ortogonalite §3.10). Kullanıcı onayı
 *       gerekir; otomatik taşıma YOK.</li>
 * </ol>
 *
 * <p>Tüm çıktı salt-okunur rapordur; DB'ye DOKUNMAZ (reversible by construction).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LedgerCategoryHygieneService {

    private final JdbcTemplate jdbc;

    /**
     * Operatör/kişi-tipi kategori ÖNERİLERİ (dry-run). Kategori adı bir
     * counterpart (PERSON) veya SUB_CASH hesap adıyla eşleşiyorsa, o kategorinin
     * aslında operatör/kişi olduğu önerilir. DB'ye DOKUNMAZ.
     */
    @Transactional(readOnly = true)
    public List<OperatorCategorySuggestion> suggestOperatorCategoryExtraction() {
        List<OperatorCategorySuggestion> out = new ArrayList<>();

        // Aday isim havuzu: PERSON counterpart adları + SUB_CASH hesap adları.
        Map<String, MatchTarget> nameTargets = new LinkedHashMap<>();
        for (Map<String, Object> r : safeQuery(
                "SELECT id, name FROM counterparts WHERE kind = 'PERSON' AND name IS NOT NULL")) {
            nameTargets.put(norm(String.valueOf(r.get("name"))),
                    new MatchTarget("COUNTERPART_PERSON", String.valueOf(r.get("id")),
                            String.valueOf(r.get("name"))));
        }
        for (Map<String, Object> r : safeQuery(
                "SELECT id, name FROM bank_accounts WHERE type = 'SUB_CASH' AND name IS NOT NULL")) {
            nameTargets.put(norm(String.valueOf(r.get("name"))),
                    new MatchTarget("SUB_CASH_ACCOUNT", String.valueOf(r.get("id")),
                            String.valueOf(r.get("name"))));
        }

        for (Map<String, Object> c : safeQuery(
                "SELECT id, name, business_id FROM categories WHERE is_active = true AND name IS NOT NULL")) {
            String catName = String.valueOf(c.get("name"));
            String key = norm(catName);
            MatchTarget exact = nameTargets.get(key);
            // tam eşleşme veya kategori adı bir kişi/operatör adını içeriyorsa
            MatchTarget hit = exact;
            if (hit == null) {
                for (Map.Entry<String, MatchTarget> e : nameTargets.entrySet()) {
                    if (e.getKey().length() >= 3
                            && (key.contains(e.getKey()) || e.getKey().contains(key))) {
                        hit = e.getValue();
                        break;
                    }
                }
            }
            if (hit != null) {
                long txCount = countTxForCategory(String.valueOf(c.get("id")));
                out.add(new OperatorCategorySuggestion(
                        String.valueOf(c.get("id")), catName,
                        String.valueOf(c.get("business_id")),
                        hit.targetType, hit.targetId, hit.targetName, txCount));
            }
        }
        log.info("[cat-hygiene] operator/kisi-tipi kategori onerisi: {} kayit (dry-run, COMMIT YOK).",
                out.size());
        return out;
    }

    /**
     * Aynı isimli aktif kategori (duplicate) ÖNERİLERİ (dry-run). DB'ye DOKUNMAZ.
     */
    @Transactional(readOnly = true)
    public List<DuplicateCategorySuggestion> suggestDuplicateMerge() {
        List<Map<String, Object>> rows = safeQuery(
                "SELECT business_id, LOWER(TRIM(name)) AS norm_name, COUNT(*) AS cnt, " +
                        "STRING_AGG(id::text, ',') AS ids, STRING_AGG(name, ' | ') AS names " +
                        "FROM categories WHERE is_active = true AND name IS NOT NULL " +
                        "GROUP BY business_id, LOWER(TRIM(name)) HAVING COUNT(*) > 1");
        List<DuplicateCategorySuggestion> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            out.add(new DuplicateCategorySuggestion(
                    String.valueOf(r.get("business_id")),
                    String.valueOf(r.get("norm_name")),
                    ((Number) r.get("cnt")).intValue(),
                    List.of(String.valueOf(r.get("ids")).split(",")),
                    String.valueOf(r.get("names"))));
        }
        log.info("[cat-hygiene] duplicate-merge onerisi: {} grup (dry-run, COMMIT YOK).", out.size());
        return out;
    }

    // ───────── helpers ─────────

    private long countTxForCategory(String categoryId) {
        try {
            Long n = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM transactions WHERE category_id = ?::uuid",
                    Long.class, categoryId);
            return n != null ? n : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private List<Map<String, Object>> safeQuery(String sql) {
        try {
            return jdbc.queryForList(sql);
        } catch (Exception e) {
            log.warn("[cat-hygiene] sorgu basarisiz ({}): {}", sql, e.getMessage());
            return List.of();
        }
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private record MatchTarget(String targetType, String targetId, String targetName) {}

    // ───────── öneri DTO'ları ─────────

    /**
     * Operatör/kişi-tipi kategori taşıma önerisi (§3.10). Uygulanmaz — elle onay.
     * {@code txCount} = bu kategoriye bağlı tx sayısı (taşıma etkisi için).
     */
    public record OperatorCategorySuggestion(String categoryId, String categoryName,
                                             String businessId, String suggestedTargetType,
                                             String suggestedTargetId, String suggestedTargetName,
                                             long txCount) {}

    /** Aynı isimli aktif kategori duplicate önerisi. */
    public record DuplicateCategorySuggestion(String businessId, String normalizedName,
                                              int count, List<String> categoryIds,
                                              String names) {}
}
