package com.bizboard.common.audit;

import com.bizboard.common.entity.AuditLog;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Tamper-proof audit hash-chain yardımcıları (mod-audit v2).
 *
 * <p>Her audit kaydı, kendinden önceki kaydın {@code recordHash}'ini ({@code prevHash})
 * içeren kanonik bir gösterimden SHA-256 ile özetlenir. Böylece geçmiş bir kaydı
 * değiştirmek, ondan sonraki TÜM kayıtların hash'lerini geçersiz kılar — yani
 * herhangi bir tahrifat zincir doğrulamasında yakalanır (blockchain-benzeri).</p>
 *
 * <p><b>Login-safety notu:</b> bu sınıf SAF FONKSİYONELdir (durum tutmaz, DB'ye
 * dokunmaz, yan etkisizdir, hiçbir alanı mutasyona uğratmaz). Asla yazım/login
 * yolunda çalıştırılmaz; yalnız ayrı chainer/verify/anonymize akışlarında.</p>
 *
 * <p><b>Kanoniklik kuralları</b> (deterministik olmalı, aksi halde doğrulama
 * yanlış FAIL verir):</p>
 * <ul>
 *   <li>Alanlar sabit sırayla, {@code |} ayracıyla birleştirilir.</li>
 *   <li>null değerler boş string olarak yazılır.</li>
 *   <li>Zaman damgası {@link LocalDateTime#toString()} ile.</li>
 *   <li>Metadata anahtarları alfabetik sıraya konur ({@link TreeMap}).</li>
 *   <li>Ayraç/escape: değer içindeki {@code |} ve {@code \} kaçırılır.</li>
 * </ul>
 */
public final class AuditHashUtil {

    private AuditHashUtil() {}

    /** Zincirin ilk kaydının {@code prevHash}'i — "genesis" sabitidir. */
    public static final String GENESIS_PREV_HASH =
            "0000000000000000000000000000000000000000000000000000000000000000";

    /**
     * Bir audit kaydının kanonik recordHash'ini hesaplar.
     *
     * @param log      hash'lenecek kayıt (id + iş alanları okunur; hash alanları okunmaz)
     * @param prevHash zincirdeki bir önceki kaydın recordHash'i; ilk kayıt için
     *                 {@link #GENESIS_PREV_HASH}
     * @return 64 karakterlik lowercase hex SHA-256 özeti
     */
    public static String computeRecordHash(AuditLog log, String prevHash) {
        return sha256Hex(canonical(log, prevHash));
    }

    /**
     * Kanonik string gösterimi. Hash girdi belirleyiciliği burada sağlanır;
     * bu metodun çıktısı KESİNLİKLE değişmemeli (eski kayıtların doğrulaması
     * bozulur). Yeni alan eklemek gerekirse SONA eklenmeli ve geçmişe-dönük
     * yeniden-zincirleme planlanmalı.
     */
    static String canonical(AuditLog log, String prevHash) {
        StringBuilder sb = new StringBuilder(256);
        append(sb, prevHash);
        append(sb, str(log.getId()));
        append(sb, log.getAction());
        append(sb, str(log.getUserId()));
        append(sb, log.getUserName());
        append(sb, log.getResourceType());
        append(sb, str(log.getResourceId()));
        append(sb, log.getIpAddress());
        append(sb, log.getUserAgent());
        append(sb, log.getDetail());
        append(sb, log.getHighlightType());
        append(sb, str(log.getCreatedAt()));
        append(sb, canonicalMetadata(log.getMetadata()));
        return sb.toString();
    }

    /** Metadata'yı anahtar-sıralı, deterministik bir string'e çevirir. */
    static String canonicalMetadata(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return "";
        }
        TreeMap<String, Object> sorted = new TreeMap<>(metadata);
        StringBuilder sb = new StringBuilder(128);
        boolean first = true;
        for (Map.Entry<String, Object> e : sorted.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append(escape(e.getKey())).append('=').append(escape(String.valueOf(e.getValue())));
        }
        return sb.toString();
    }

    private static void append(StringBuilder sb, String value) {
        sb.append(escape(value)).append('|');
    }

    /** {@code \} ve {@code |} kaçırma — ayraç çakışmasını önler. */
    private static String escape(String value) {
        if (value == null) return "";
        if (value.indexOf('\\') < 0 && value.indexOf('|') < 0) return value;
        return value.replace("\\", "\\\\").replace("|", "\\|");
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }

    private static String str(UUID u) {
        return u == null ? "" : u.toString();
    }

    private static String str(LocalDateTime t) {
        return t == null ? "" : t.toString();
    }

    /** SHA-256 → lowercase hex. */
    public static String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
