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
 * Ledger v2 (Faz A, §1.4 + §8.4) — firma↔banka isim parse + typo-merge
 * <b>ÖNERİ</b> servisi. STRICT: OTOMATİK COMMIT YOK — yalnız öneri üretir
 * (dry-run); uygulama elle onay + reversible runner ile yapılır.
 *
 * <h3>Parse hedefi (§1.4):</h3>
 * <p>{@code {KARŞI/SAHİP} {BANKA}} paterni — örn. "BİDÜNYA HIR.GARANTİ",
 * "TEKNİK İŞ GARANTİ", "DGR YAPIKREDİ". Banka sözlüğü ile son token(lar)ı banka
 * olarak tanır, kalanı firma/karşı-taraf adı olarak çıkarır.</p>
 *
 * <h3>Typo-merge (§1.4):</h3>
 * <p>Bilinen typo kümeleri (TEKNİK/TEKNİŞ, Bİ DÜNYA/BİDÜNYA, MUSTAFA/MUATAFA…)
 * normalize edilerek aynı firmanın iki yazımını ÖNERİ olarak eşleştirir.</p>
 *
 * <p>Tüm çıktı salt-okunur rapordur; DB'ye DOKUNMAZ (reversible by construction).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LedgerNameParseService {

    /** Banka sözlüğü (§8.4) — token normalize edilip eşleştirilir. */
    private static final List<String> BANK_DICTIONARY = List.of(
            "GARANTI", "GARANTİ", "YAPIKREDI", "YAPIKREDİ", "YAPI KREDI", "YAPI KREDİ",
            "HALKBANKASI", "HALKBANK", "QNB", "FINANSBANK", "FİNANSBANK", "QNB FINANSBANK",
            "VAKIFBANK", "ZIRAAT", "ZİRAAT", "AKBANK", "ISBANKASI", "İSBANKASI", "IS BANKASI",
            "TEB", "DENIZBANK", "DENİZBANK", "ING", "HSBC", "SEKERBANK", "ŞEKERBANK",
            "KUVEYTTURK", "KUVEYT TÜRK", "ALBARAKA", "ENPARA", "PAPARA"
    );

    /**
     * Bilinen typo kümeleri (§1.4): aynı kümedeki tüm yazımlar tek kanonik forma
     * normalize edilir. Anahtar = kanonik; değer = varyantlar.
     */
    private static final Map<String, List<String>> TYPO_CLUSTERS = new LinkedHashMap<>();
    static {
        TYPO_CLUSTERS.put("TEKNIK", List.of("TEKNIK", "TEKNİK", "TEKNIS", "TEKNİŞ"));
        TYPO_CLUSTERS.put("BIDUNYA", List.of("BIDUNYA", "BİDÜNYA", "BI DUNYA", "Bİ DÜNYA"));
        TYPO_CLUSTERS.put("MUSTAFA", List.of("MUSTAFA", "MUATAFA", "MUSTAFA POS"));
        TYPO_CLUSTERS.put("NAKIT", List.of("NAKIT", "NKAIT", "NAKİT", "NAKIT HARCAMA"));
        TYPO_CLUSTERS.put("TOPLAM", List.of("TOPLAM", "TOPALAM"));
    }

    private final JdbcTemplate jdbc;

    /**
     * Firma↔banka isim parse ÖNERİLERİ (dry-run). {@code counterparts} ve/veya
     * {@code bank_accounts} adlarından {KARŞI} {BANKA} paternini ayrıştırır.
     * DB'ye DOKUNMAZ.
     */
    @Transactional(readOnly = true)
    public List<NameParseSuggestion> suggestFirmBankParse() {
        List<NameParseSuggestion> out = new ArrayList<>();
        out.addAll(parseSource("counterparts", "COUNTERPART"));
        out.addAll(parseSource("bank_accounts", "BANK_ACCOUNT"));
        log.info("[name-parse] firma↔banka parse onerisi: {} kayit (dry-run, COMMIT YOK).", out.size());
        return out;
    }

    /**
     * Typo-merge ÖNERİLERİ (dry-run): counterpart adlarını normalize edip aynı
     * kanonik forma düşen FARKLI yazımları eşleştirir. DB'ye DOKUNMAZ.
     */
    @Transactional(readOnly = true)
    public List<TypoMergeSuggestion> suggestTypoMerge() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, name FROM counterparts WHERE name IS NOT NULL");
        // kanonik forma göre grupla
        Map<String, List<Map<String, Object>>> byCanonical = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            String name = String.valueOf(r.get("name"));
            String canonical = canonicalize(name);
            byCanonical.computeIfAbsent(canonical, k -> new ArrayList<>()).add(r);
        }
        List<TypoMergeSuggestion> out = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> e : byCanonical.entrySet()) {
            List<Map<String, Object>> group = e.getValue();
            if (group.size() < 2) continue; // tek yazım — merge önerisi yok
            // farklı orijinal yazımlar mı?
            long distinct = group.stream()
                    .map(g -> String.valueOf(g.get("name")).trim().toUpperCase(Locale.ROOT))
                    .distinct().count();
            if (distinct < 2) continue;
            List<String> variants = new ArrayList<>();
            List<String> ids = new ArrayList<>();
            for (Map<String, Object> g : group) {
                variants.add(String.valueOf(g.get("name")));
                ids.add(String.valueOf(g.get("id")));
            }
            out.add(new TypoMergeSuggestion(e.getKey(), variants, ids));
        }
        log.info("[name-parse] typo-merge onerisi: {} grup (dry-run, COMMIT YOK).", out.size());
        return out;
    }

    // ───────── parse helpers ─────────

    private List<NameParseSuggestion> parseSource(String table, String sourceType) {
        List<NameParseSuggestion> out = new ArrayList<>();
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList("SELECT id, name FROM " + table + " WHERE name IS NOT NULL");
        } catch (Exception e) {
            log.warn("[name-parse] {} okunamadi: {}", table, e.getMessage());
            return out;
        }
        for (Map<String, Object> r : rows) {
            String raw = String.valueOf(r.get("name"));
            ParseResult pr = parseFirmBank(raw);
            if (pr != null) {
                out.add(new NameParseSuggestion(
                        sourceType, String.valueOf(r.get("id")), raw, pr.firm, pr.bank));
            }
        }
        return out;
    }

    /**
     * {@code {FIRMA} {BANKA}} paternini ayrıştırır. Son 1-2 token banka sözlüğünde
     * ise firma = kalan baş, banka = eşleşen. Eşleşme yoksa null.
     */
    private ParseResult parseFirmBank(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String norm = stripDiacritics(raw.trim().toUpperCase(Locale.ROOT)).replaceAll("\\s+", " ");
        // 2-token banka adlarını da dene (örn. "YAPI KREDI", "KUVEYT TURK").
        for (String bank : BANK_DICTIONARY) {
            String bankNorm = stripDiacritics(bank.toUpperCase(Locale.ROOT));
            if (norm.endsWith(" " + bankNorm)) {
                String firm = raw.trim().substring(0,
                        raw.trim().length() - bank.length()).trim();
                // baştaki firma boş değilse anlamlı öneri
                if (!firm.isBlank() && firm.length() >= 2) {
                    return new ParseResult(firm, bank);
                }
            }
        }
        return null;
    }

    /** Typo normalize: diakritik/boşluk sadeleştir + typo kümesi kanonikleştir. */
    private String canonicalize(String name) {
        String norm = stripDiacritics(name.trim().toUpperCase(Locale.ROOT)).replaceAll("\\s+", " ");
        for (Map.Entry<String, List<String>> cluster : TYPO_CLUSTERS.entrySet()) {
            for (String variant : cluster.getValue()) {
                String vNorm = stripDiacritics(variant.toUpperCase(Locale.ROOT));
                if (norm.equals(vNorm) || norm.startsWith(vNorm + " ") || norm.endsWith(" " + vNorm)) {
                    norm = norm.replace(vNorm, cluster.getKey());
                }
            }
        }
        return norm;
    }

    /** Türkçe diakritikleri ASCII'ye indirger (fuzzy eşleşme için). */
    private static String stripDiacritics(String s) {
        return s
                .replace('İ', 'I').replace('I', 'I').replace('ı', 'I')
                .replace('Ş', 'S').replace('ş', 'S')
                .replace('Ğ', 'G').replace('ğ', 'G')
                .replace('Ü', 'U').replace('ü', 'U')
                .replace('Ö', 'O').replace('ö', 'O')
                .replace('Ç', 'C').replace('ç', 'C');
    }

    private record ParseResult(String firm, String bank) {}

    // ───────── öneri DTO'ları ─────────

    /** Firma↔banka parse önerisi (uygulanmaz — elle onay). */
    public record NameParseSuggestion(String sourceType, String id, String originalName,
                                      String suggestedFirm, String suggestedBank) {}

    /** Typo-merge önerisi: aynı kanonik forma düşen farklı yazımlar. */
    public record TypoMergeSuggestion(String canonical, List<String> variants, List<String> ids) {}
}
