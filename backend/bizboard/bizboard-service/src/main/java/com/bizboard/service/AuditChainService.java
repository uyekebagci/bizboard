package com.bizboard.service;

import com.bizboard.common.audit.AuditHashUtil;
import com.bizboard.common.entity.AuditLog;
import com.bizboard.repository.AuditLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Tamper-proof hash-chain motoru (mod-audit v2) — audit kayıtlarına
 * blockchain-benzeri değiştirilemezlik kazandırır.
 *
 * <p><b>KRİTİK login-safety farkı (v1 incident'ine karşı):</b> v1'de zincir
 * alanları audit YAZIM yolunda (REQUIRES_NEW tx içinde) hesaplanıyordu; oradaki
 * sorgu+flush bir hata verince inner tx rollback-only işaretleniyor ve commit
 * {@code UnexpectedRollbackException} atıp LOGIN'i kırıyordu. <b>v2'de zincir
 * hesabı yazım yolundan TAMAMEN ÇIKARILDI:</b> yeni kayıtlar insert'te
 * {@code chainSeq=null} yazılır; bu servis ayrı bir {@code @Scheduled} görevde
 * ({@link #chainNewEntries()}) bunları kendi izole tx'inde zincirler. Audit
 * yazımı/login asla zincir-kaynaklı bir hatadan etkilenmez.</p>
 *
 * <p><b>Nasıl çalışır:</b> her kayıt, kendinden önceki kaydın {@code recordHash}'ini
 * ({@code prevHash}) içeren kanonik gösterimden SHA-256 ile özetlenir
 * ({@link AuditHashUtil}). Geçmiş bir kaydı değiştirmek o kaydın recordHash'ini
 * değiştirir; sonraki kaydın prevHash'iyle uyuşmaz → zincir kırılır ve
 * {@link #verifyChain()} kırılma noktasını raporlar.</p>
 *
 * <p><b>Eşzamanlılık:</b> tüm seq/hash atama bir kritik bölgede ({@code CHAIN_LOCK})
 * serileştirilir; zincirleme tek bir scheduler thread'inde aktığı için seq
 * çakışması olmaz (zaten chain_seq'te UNIQUE constraint YOK — yumuşatıldı).</p>
 */
@Slf4j
@Service
public class AuditChainService {

    /** Tek-node serileştirme kilidi (chainer + backfill + rechain ortak). */
    private static final Object CHAIN_LOCK = new Object();

    private static final int BATCH_SIZE = 500;
    /** Bir scheduler turunda zincirlenecek azami yeni kayıt (CPU/IO sınırı). */
    private static final int CHAIN_TICK_MAX = 5_000;
    /** Tek doğrulama çağrısında gezilecek azami kayıt (DoS koruması). */
    private static final int VERIFY_MAX_RECORDS = 200_000;

    private final AuditLogRepository repository;
    /** SSE canlı akış — lazy/opsiyonel; zincirleme onu beklemez, yokluğunda no-op. */
    private final ObjectProvider<AuditStreamService> streamProvider;

    public AuditChainService(AuditLogRepository repository,
                             ObjectProvider<AuditStreamService> streamProvider) {
        this.repository = repository;
        this.streamProvider = streamProvider;
    }

    // ── Scheduled chainer (asenkron, yazım yolundan izole) ───────────────────

    /**
     * Yeni (chainSeq=null) audit kayıtlarını periyodik olarak zincirler. Audit
     * yazımından TAMAMEN bağımsız: bu görev kendi tx'inde çalışır, hata verirse
     * yalnız loglanır ve bir sonraki turda otomatik devam eder; hiçbir koşulda
     * çağıran iş akışını (login) etkilemez.
     *
     * <p>{@code @Scheduled} thread'i tek olduğundan zincirleme doğal serileşir.
     * Aralık kısa (5 sn) → yeni kayıtlar saniyeler içinde zincirlenir; canlı
     * doğrulama neredeyse anlık çalışır.</p>
     */
    @Scheduled(fixedDelayString = "${app.audit.chain.interval-ms:5000}",
               initialDelayString = "${app.audit.chain.initial-delay-ms:15000}")
    public void chainNewEntries() {
        try {
            if (repository.countByChainSeqIsNull() == 0) {
                return;
            }
            int chained = chainPending(CHAIN_TICK_MAX);
            if (chained > 0) {
                log.debug("[audit-chain] tick chained {} new entries", chained);
            }
        } catch (Exception e) {
            // Non-fatal: bir sonraki tur devam eder. Yazım/login ETKİLENMEZ.
            log.warn("[audit-chain] scheduled tick failed (non-fatal, will retry): {}", e.getMessage());
        }
    }

    /**
     * En fazla {@code maxRecords} adet zincirsiz kaydı, deterministik sırayla
     * ({@code createdAt, id}) mevcut zincirin ucuna ekler ve canlı akışa yayar.
     * Kendi tx'inde; idempotent (zincirli kayda dokunmaz).
     *
     * @return zincire eklenen kayıt sayısı
     */
    @Transactional
    public int chainPending(int maxRecords) {
        int processed = 0;
        List<AuditLog> published = new ArrayList<>();
        synchronized (CHAIN_LOCK) {
            AuditLog tip = repository.findFirstByChainSeqIsNotNullOrderByChainSeqDesc();
            long seq = (tip != null && tip.getChainSeq() != null) ? tip.getChainSeq() : 0L;
            String prevHash = (tip != null && tip.getRecordHash() != null)
                    ? tip.getRecordHash()
                    : AuditHashUtil.GENESIS_PREV_HASH;

            Pageable firstPage = PageRequest.of(0, BATCH_SIZE);
            Slice<AuditLog> slice;
            do {
                slice = repository.findByChainSeqIsNullOrderByCreatedAtAscIdAsc(firstPage);
                List<AuditLog> toSave = new ArrayList<>(slice.getNumberOfElements());
                for (AuditLog rec : slice.getContent()) {
                    if (processed >= maxRecords) break;
                    seq++;
                    rec.setChainSeq(seq);
                    rec.setPrevHash(prevHash);
                    String hash = AuditHashUtil.computeRecordHash(rec, prevHash);
                    rec.setRecordHash(hash);
                    prevHash = hash;
                    toSave.add(rec);
                    processed++;
                }
                if (!toSave.isEmpty()) {
                    repository.saveAll(toSave);
                    repository.flush();
                    published.addAll(toSave);
                }
            } while (slice.hasNext() && processed < maxRecords);
        }
        // Yayın tx commit'inden bağımsız best-effort — asla hata fırlatmaz.
        publishAll(published);
        return processed;
    }

    /** Zincirlenen kayıtları canlı SSE akışına yayar (best-effort). */
    private void publishAll(List<AuditLog> records) {
        if (records.isEmpty()) return;
        AuditStreamService stream = streamProvider.getIfAvailable();
        if (stream == null) return;
        for (AuditLog rec : records) {
            try {
                stream.publish(rec);
            } catch (Exception e) {
                log.debug("[audit-chain] stream publish failed (ignored): {}", e.getMessage());
            }
        }
    }

    // ── Manuel backfill (idempotent) ─────────────────────────────────────────

    /**
     * Geçmişe-dönük backfill: TÜM zincirsiz kayıtları zincire ekler. Idempotent.
     * Admin endpoint'inden manuel tetiklenir; scheduler ile aynı mantığı tek
     * çağrıda (üst-sınırsız) çalıştırır.
     *
     * @return işlenen (zincire eklenen) kayıt sayısı
     */
    @Transactional
    public BackfillResult backfillChain() {
        long initialUnchained = repository.countByChainSeqIsNull();
        int processed = chainPending(Integer.MAX_VALUE);
        long remaining = repository.countByChainSeqIsNull();
        AuditLog tip = repository.findFirstByChainSeqIsNotNullOrderByChainSeqDesc();
        long tipSeq = (tip != null && tip.getChainSeq() != null) ? tip.getChainSeq() : 0L;
        log.info("[audit-chain] backfill done: initialUnchained={} processed={} remaining={} tipSeq={}",
                initialUnchained, processed, remaining, tipSeq);
        return new BackfillResult(initialUnchained, processed, remaining, tipSeq);
    }

    // ── Anonimleştirme sonrası kısmi yeniden-zincirleme ──────────────────────

    /**
     * Zinciri {@code fromSeq}'ten (dahil) itibaren yeniden hesaplar. KVKK
     * anonimleştirme PII alanlarını değiştirir (hash girdisinde olduklarından);
     * bu metod {@code fromSeq-1}'in recordHash'inden başlayıp ileri doğru zinciri
     * tutarlı kılar → doğrulama yanlış FAIL vermez.
     *
     * @param fromSeq yeniden hesaba başlanacak ilk chain_seq (dahil)
     * @return yeniden hesaplanan kayıt sayısı
     */
    @Transactional
    public long rechainFrom(long fromSeq) {
        if (fromSeq < 1) fromSeq = 1;
        String prevHash = AuditHashUtil.GENESIS_PREV_HASH;
        long rechained = 0;

        synchronized (CHAIN_LOCK) {
            if (fromSeq > 1) {
                AuditLog prior = findBySeq(fromSeq - 1);
                if (prior != null && prior.getRecordHash() != null) {
                    prevHash = prior.getRecordHash();
                }
            }
            int pageNum = 0;
            Slice<AuditLog> slice;
            do {
                Pageable page = PageRequest.of(pageNum, BATCH_SIZE);
                slice = repository.findChainedFromSeq(fromSeq, page);
                List<AuditLog> toSave = new ArrayList<>(slice.getNumberOfElements());
                for (AuditLog rec : slice.getContent()) {
                    rec.setPrevHash(prevHash);
                    String hash = AuditHashUtil.computeRecordHash(rec, prevHash);
                    rec.setRecordHash(hash);
                    prevHash = hash;
                    toSave.add(rec);
                    rechained++;
                }
                if (!toSave.isEmpty()) {
                    repository.saveAll(toSave);
                    repository.flush();
                }
                pageNum++;
            } while (slice.hasNext());
        }
        log.info("[audit-chain] rechained {} records from seq={}", rechained, fromSeq);
        return rechained;
    }

    private AuditLog findBySeq(long seq) {
        Slice<AuditLog> s = repository.findChainedFromSeq(seq, PageRequest.of(0, 1));
        if (s.hasContent()) {
            AuditLog first = s.getContent().get(0);
            if (first.getChainSeq() != null && first.getChainSeq() == seq) {
                return first;
            }
        }
        return null;
    }

    // ── Doğrulama (salt-okunur) ──────────────────────────────────────────────

    /**
     * Zinciri baştan sona doğrular. Her kayıt için: recordHash yeniden
     * hesaplananla eşleşmeli (tahrif yok), prevHash bir önceki recordHash'le
     * eşleşmeli (kopuk değil), seq monoton olmalı. İlk uyumsuzlukta valid=false
     * + kırılma noktası. Salt-okunur; DB'ye yazmaz.
     */
    @Transactional(readOnly = true)
    public ChainVerification verifyChain() {
        long unchained = repository.countByChainSeqIsNull();
        String expectedPrev = AuditHashUtil.GENESIS_PREV_HASH;
        Long expectedSeq = 1L;
        long verified = 0;

        Pageable page = PageRequest.of(0, BATCH_SIZE);
        Slice<AuditLog> slice;
        do {
            slice = repository.findChainedOrderBySeq(page);
            for (AuditLog rec : slice.getContent()) {
                if (!expectedPrev.equals(nz(rec.getPrevHash()))) {
                    return ChainVerification.broken(verified + 1, rec.getId(), rec.getChainSeq(),
                            "prev_hash zincir bağlantısı kopuk (beklenen=" + shorten(expectedPrev)
                                    + ", bulunan=" + shorten(nz(rec.getPrevHash())) + ")", unchained);
                }
                String recomputed = AuditHashUtil.computeRecordHash(rec, nz(rec.getPrevHash()));
                if (!recomputed.equals(nz(rec.getRecordHash()))) {
                    return ChainVerification.broken(verified + 1, rec.getId(), rec.getChainSeq(),
                            "record_hash uyuşmuyor — kayıt tahrif edilmiş olabilir (beklenen="
                                    + shorten(recomputed) + ", saklanan=" + shorten(nz(rec.getRecordHash())) + ")",
                            unchained);
                }
                if (expectedSeq != null && !expectedSeq.equals(rec.getChainSeq())) {
                    return ChainVerification.broken(verified + 1, rec.getId(), rec.getChainSeq(),
                            "chain_seq beklenen " + expectedSeq + " değil (boşluk/atlama)", unchained);
                }
                expectedPrev = nz(rec.getRecordHash());
                expectedSeq = (rec.getChainSeq() != null) ? rec.getChainSeq() + 1 : null;
                verified++;
                if (verified >= VERIFY_MAX_RECORDS) {
                    return ChainVerification.valid(verified, unchained,
                            "Doğrulama üst sınırına ulaşıldı (" + VERIFY_MAX_RECORDS + "); ilk "
                                    + verified + " kayıt tutarlı.");
                }
            }
            page = page.next();
        } while (slice.hasNext());

        return ChainVerification.valid(verified, unchained, null);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String shorten(String hash) {
        if (hash == null || hash.length() <= 12) return hash;
        return hash.substring(0, 12) + "…";
    }

    // ── result records ─────────────────────────────────────────────────────────

    /** Backfill çıktısı. */
    public record BackfillResult(long initialUnchained, long processed, long remainingUnchained, long tipSeq) {}

    /** Zincir doğrulama çıktısı. */
    public record ChainVerification(
            boolean valid,
            long verifiedCount,
            long unchainedCount,
            Long brokenAtSeq,
            UUID brokenRecordId,
            Long brokenPosition,
            String message) {

        static ChainVerification valid(long verified, long unchained, String note) {
            return new ChainVerification(true, verified, unchained, null, null, null,
                    note != null ? note
                            : (unchained > 0
                                ? "Zincir tutarlı (" + verified + " kayıt). Not: " + unchained
                                  + " kayıt henüz zincirlenmedi (chainer birazdan işleyecek)."
                                : "Zincir tutarlı (" + verified + " kayıt doğrulandı)."));
        }

        static ChainVerification broken(long position, UUID recordId, Long seq, String reason, long unchained) {
            return new ChainVerification(false, position - 1, unchained, seq, recordId, position,
                    "ZİNCİR KIRIK @ pozisyon " + position + " (seq=" + seq + ", id=" + recordId + "): " + reason);
        }
    }
}
