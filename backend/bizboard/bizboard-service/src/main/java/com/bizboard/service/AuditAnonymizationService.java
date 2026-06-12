package com.bizboard.service;

import com.bizboard.common.entity.AuditLog;
import com.bizboard.repository.AuditLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * KVKK / GDPR uyumlu audit anonimleştirme.
 *
 * <p>İki yetenek sağlar:</p>
 * <ol>
 *   <li><b>Maskeleme yardımcıları</b> ({@link #maskEmail}, {@link #maskIp},
 *       {@link #maskName}, {@link #scrubText}) — yeni audit yazılırken hassas
 *       alanları proaktif maskeleyebilmek için saf fonksiyonlar.</li>
 *   <li><b>Retention anonimleştirme</b> ({@link #anonymizeOlderThan}) — belirli
 *       yaştan eski kayıtların PII alanlarını ({@code userName/ip/userAgent/detail})
 *       maskeler. Kaydı SİLMEZ — forensik bütünlük (kim ne zaman ne yaptı'nın
 *       yapısı) korunur; yalnız kişisel veriler kaldırılır.</li>
 * </ol>
 *
 * <p><b>Hash-chain etkileşimi:</b> anonimleştirme, hash kanonik girdisindeki
 * alanları değiştirir; bu yüzden işlemden sonra {@link AuditChainService#rechainFrom}
 * ile etkilenen en küçük seq'ten itibaren zincir yeniden imzalanır → tamper-proof
 * doğrulama tutarlı kalır. Anonimleştirme operasyonunun kendisi ayrıca audit'lenir
 * (çağıran controller tarafından), böylece işlem izlenebilir.</p>
 */
@Slf4j
@Service
public class AuditAnonymizationService {

    private static final int BATCH_SIZE = 500;
    /** Maskelenmiş alan işareti. */
    public static final String REDACTED = "[anonim]";

    private static final Pattern EMAIL =
            Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern PHONE =
            Pattern.compile("(?<!\\d)(\\+?\\d[\\d ()-]{8,}\\d)(?!\\d)");
    private static final Pattern IBAN =
            Pattern.compile("\\bTR\\d{2}[ ]?(?:\\d[ ]?){22}\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern LONG_DIGITS =
            Pattern.compile("\\b\\d{10,}\\b"); // TCKN / kart / hesap no benzeri

    private final AuditLogRepository repository;
    private final AuditChainService chainService;
    private final long anonymizeAfterDays;

    public AuditAnonymizationService(AuditLogRepository repository,
                                     AuditChainService chainService,
                                     @Value("${app.audit.anonymize-after-days:0}") long anonymizeAfterDays) {
        this.repository = repository;
        this.chainService = chainService;
        this.anonymizeAfterDays = anonymizeAfterDays;
    }

    /** Konfigüre edilmiş retention anonimleştirme penceresi (gün); 0 = kapalı. */
    public long getAnonymizeAfterDays() {
        return anonymizeAfterDays;
    }

    // ── Maskeleme yardımcıları (saf, yan etkisiz) ────────────────────────────

    /** {@code john.doe@x.com} → {@code j***@x.com}; null güvenli. */
    public static String maskEmail(String email) {
        if (email == null || email.isBlank()) return email;
        int at = email.indexOf('@');
        if (at <= 0) return REDACTED;
        char first = email.charAt(0);
        String domain = email.substring(at);
        return first + "***" + domain;
    }

    /** IPv4/IPv6 son okteti/segmenti maskelenir: {@code 1.2.3.4} → {@code 1.2.3.*}. */
    public static String maskIp(String ip) {
        if (ip == null || ip.isBlank()) return ip;
        if (ip.contains(".")) { // IPv4
            int last = ip.lastIndexOf('.');
            return ip.substring(0, last) + ".*";
        }
        if (ip.contains(":")) { // IPv6
            int last = ip.lastIndexOf(':');
            return ip.substring(0, last) + ":*";
        }
        return REDACTED;
    }

    /** {@code Ahmet Yılmaz} → {@code A*** Y***}; null güvenli. */
    public static String maskName(String name) {
        if (name == null || name.isBlank()) return name;
        String[] parts = name.trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append(' ');
            String p = parts[i];
            sb.append(p.isEmpty() ? "" : p.charAt(0) + "***");
        }
        return sb.toString();
    }

    /**
     * Serbest metinden PII desenlerini ({@code email/telefon/IBAN/uzun-sayı})
     * temizler. İçeriğin yapısı korunur, yalnız kişisel-veri parçaları maskelenir.
     */
    public static String scrubText(String text) {
        if (text == null || text.isBlank()) return text;
        String out = EMAIL.matcher(text).replaceAll("[email]");
        out = IBAN.matcher(out).replaceAll("[iban]");
        out = PHONE.matcher(out).replaceAll("[tel]");
        out = LONG_DIGITS.matcher(out).replaceAll("[no]");
        return out;
    }

    // ── Retention anonimleştirme ─────────────────────────────────────────────

    /**
     * {@code days} günden eski kayıtların PII alanlarını maskeler ve etkilenen
     * zincir kısmını yeniden imzalar. Kayıt SİLİNMEZ.
     *
     * @param days yaş eşiği (>0 olmalı; aksi halde no-op)
     * @return anonimleştirilen kayıt sayısı + raporlama
     */
    @Transactional
    public AnonymizeResult anonymizeOlderThan(long days) {
        if (days <= 0) {
            return new AnonymizeResult(0, null, "days<=0 — atlandı (anonimleştirme kapalı)");
        }
        LocalDateTime cutoff = LocalDateTime.now().minusDays(days);
        long anonymized = 0;
        Long minSeqTouched = null;

        Pageable firstPage = PageRequest.of(0, BATCH_SIZE);
        Slice<AuditLog> slice;
        do {
            // İşlenenler artık PII taşımadığı için bir sonraki sorguda düşer
            // (findAnonymizationCandidates ip/ua/name/detail NOT NULL filtreliyor).
            slice = repository.findAnonymizationCandidates(cutoff, firstPage);
            List<AuditLog> toSave = new ArrayList<>(slice.getNumberOfElements());
            for (AuditLog rec : slice.getContent()) {
                boolean piiChanged = anonymizeRecord(rec);
                // Her aday işaretlenir (idempotensi) — PII değişmese bile flag set
                // edilir ki bir sonraki sorguda düşsün (sonsuz döngü koruması).
                rec.setAnonymized(Boolean.TRUE);
                toSave.add(rec);
                if (piiChanged) {
                    anonymized++;
                    if (rec.getChainSeq() != null) {
                        minSeqTouched = (minSeqTouched == null)
                                ? rec.getChainSeq()
                                : Math.min(minSeqTouched, rec.getChainSeq());
                    }
                }
            }
            if (!toSave.isEmpty()) {
                repository.saveAll(toSave);
                repository.flush();
            }
        } while (slice.hasNext() && slice.getNumberOfElements() > 0);

        // Hash-chain'i etkilenen en küçük seq'ten itibaren yeniden imzala.
        long rechained = 0;
        if (minSeqTouched != null) {
            rechained = chainService.rechainFrom(minSeqTouched);
        }

        String msg = anonymized == 0
                ? "Anonimleştirilecek kayıt yok (" + days + " günden eski PII kalmamış)"
                : anonymized + " kayıt anonimleştirildi (cutoff=" + cutoff + "); zincir seq>="
                  + minSeqTouched + " yeniden imzalandı (" + rechained + " kayıt).";
        log.info("[audit-anonymize] {}", msg);
        return new AnonymizeResult(anonymized, minSeqTouched, msg);
    }

    /** Tek bir kaydın PII alanlarını maskeler. @return değişiklik oldu mu */
    private boolean anonymizeRecord(AuditLog rec) {
        boolean changed = false;
        if (rec.getIpAddress() != null) {
            rec.setIpAddress(maskIp(rec.getIpAddress()));
            changed = true;
        }
        if (rec.getUserAgent() != null) {
            // UA cihaz parmak izi taşır — tümüyle kaldır.
            rec.setUserAgent(REDACTED);
            changed = true;
        }
        if (rec.getUserName() != null) {
            rec.setUserName(maskName(rec.getUserName()));
            changed = true;
        }
        if (rec.getDetail() != null) {
            String scrubbed = scrubText(rec.getDetail());
            if (!scrubbed.equals(rec.getDetail())) {
                rec.setDetail(scrubbed);
                changed = true;
            }
            // detail PII içermiyorsa dokunma; idempotensi flag ile sağlanır.
        }
        return changed;
    }

    // ── result ───────────────────────────────────────────────────────────────

    public record AnonymizeResult(long anonymizedCount, Long rechainedFromSeq, String message) {}
}
