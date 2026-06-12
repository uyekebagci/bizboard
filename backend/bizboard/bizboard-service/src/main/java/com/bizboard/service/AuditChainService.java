package com.bizboard.service;

import com.bizboard.common.audit.AuditHashUtil;
import com.bizboard.common.entity.AuditLog;
import com.bizboard.repository.AuditLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Tamper-proof hash-chain motoru — audit kayıtlarına blockchain-benzeri
 * değiştirilemezlik kazandırır.
 *
 * <p><b>Nasıl çalışır:</b> her kayıt, kendinden önceki kaydın {@code recordHash}'ini
 * ({@code prevHash}) içeren kanonik gösterimden SHA-256 ile özetlenir
 * ({@link AuditHashUtil}). Geçmiş bir kaydı değiştirmek o kaydın recordHash'ini
 * değiştirir; bu da sonraki kaydın prevHash'iyle uyuşmaz → zincir kırılır ve
 * {@link #verifyChain()} kırılma noktasını raporlar.</p>
 *
 * <p><b>Eşzamanlılık:</b> chainSeq/prevHash atama bir kritik bölgede
 * ({@code CHAIN_LOCK}) serileştirilir — aynı anda iki kayıt yazılırsa ikisi de
 * aynı zincir ucunu okumamalı. Audit hacmi orta düzeyde olduğundan bu kilit
 * darboğaz oluşturmaz; doğruluk > throughput.</p>
 *
 * <p><b>Additive & non-fatal:</b> hash hesabı mevcut audit yazımını BOZMAZ.
 * {@link AuditLogService#record} bu servisi çağırır; bir hata olursa kayıt
 * chainSeq=null ile kaydedilir (sonradan backfill ile zincirlenebilir) ve iş
 * akışı asla başarısız olmaz.</p>
 */
@Slf4j
@Service
public class AuditChainService {

    /**
     * Single-node serileştirme kilidi. NOT: çok-instance dağıtık dağıtımda
     * her node kendi ucunu görür; o senaryoda DB seviyesinde sıralama (max seq
     * okuma + benzersiz seq) gerekir. Mevcut tek-instance Sevalla dağıtımında
     * bu kilit yeterlidir ve doğru sonuç verir.
     */
    private static final Object CHAIN_LOCK = new Object();

    private static final int BATCH_SIZE = 500;
    /** Tek doğrulama çağrısında gezilecek azami kayıt (DoS koruması). */
    private static final int VERIFY_MAX_RECORDS = 200_000;

    private final AuditLogRepository repository;

    public AuditChainService(AuditLogRepository repository) {
        this.repository = repository;
    }

    /**
     * Henüz persist edilmemiş bir kayda zincir alanlarını (chainSeq, prevHash,
     * recordHash) atar. {@link AuditLogService#record} içinde, save'den HEMEN
     * önce çağrılır. Kayda {@code id} atanmış olmalı (UUID generator entity'de
     * önceden üretilir veya burada üretilir).
     *
     * <p>Hata durumunda kaydın zincir alanları null bırakılır (non-fatal) ve
     * sonraki backfill onu zincire ekler.</p>
     */
    public void assignChainFields(AuditLog entry) {
        try {
            // id + createdAt recordHash kanonik girdisine dahil → save öncesi
            // sabitlenmeli. createdAt @PrePersist guard'ı sayesinde null ise
            // burada atadığımız değer korunur (insert'te değişmez).
            if (entry.getId() == null) {
                entry.setId(UUID.randomUUID());
            }
            if (entry.getCreatedAt() == null) {
                entry.setCreatedAt(java.time.LocalDateTime.now());
            }
            synchronized (CHAIN_LOCK) {
                AuditLog tip = repository.findFirstByChainSeqIsNotNullOrderByChainSeqDesc();
                long nextSeq = (tip != null && tip.getChainSeq() != null) ? tip.getChainSeq() + 1 : 1L;
                String prevHash = (tip != null && tip.getRecordHash() != null)
                        ? tip.getRecordHash()
                        : AuditHashUtil.GENESIS_PREV_HASH;
                entry.setChainSeq(nextSeq);
                entry.setPrevHash(prevHash);
                entry.setRecordHash(AuditHashUtil.computeRecordHash(entry, prevHash));
            }
        } catch (Exception e) {
            // Non-fatal: zincirsiz yaz, backfill toplar. Audit asla iş akışını bozmaz.
            log.warn("[audit-chain] assign failed (entry will be unchained, backfill can fix): {}",
                    e.getMessage());
            entry.setChainSeq(null);
            entry.setPrevHash(null);
            entry.setRecordHash(null);
        }
    }

    /**
     * Geçmişe-dönük backfill: chainSeq=null kayıtları deterministik sırayla
     * (createdAt, id) mevcut zincirin ucuna ekler. <b>Idempotent</b> — zaten
     * zincirli kayıtlara dokunmaz; tekrar çağrılırsa yalnız yeni zincirsizleri
     * işler. Non-fatal: bir batch hata verirse loglanır ve sonuç raporlanır.
     *
     * @return işlenen (zincire eklenen) kayıt sayısı
     */
    @Transactional
    public BackfillResult backfillChain() {
        long initialUnchained = repository.countByChainSeqIsNull();
        AuditLog tip = repository.findFirstByChainSeqIsNotNullOrderByChainSeqDesc();
        long seq = (tip != null && tip.getChainSeq() != null) ? tip.getChainSeq() : 0L;
        String prevHash = (tip != null && tip.getRecordHash() != null)
                ? tip.getRecordHash()
                : AuditHashUtil.GENESIS_PREV_HASH;

        int processed = 0;
        synchronized (CHAIN_LOCK) {
            // Her iterasyonda ilk sayfayı çek: işlenenler artık chainSeq!=null
            // olduğu için bir sonraki sorguda otomatik düşer (offset gerekmez).
            Pageable firstPage = PageRequest.of(0, BATCH_SIZE);
            Slice<AuditLog> slice;
            do {
                slice = repository.findByChainSeqIsNullOrderByCreatedAtAscIdAsc(firstPage);
                List<AuditLog> toSave = new ArrayList<>(slice.getNumberOfElements());
                for (AuditLog rec : slice.getContent()) {
                    if (rec.getId() == null) {
                        rec.setId(UUID.randomUUID());
                    }
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
                }
            } while (slice.hasNext() && !slice.getContent().isEmpty());
        }

        long remaining = repository.countByChainSeqIsNull();
        log.info("[audit-chain] backfill done: initialUnchained={} processed={} remaining={} tipSeq={}",
                initialUnchained, processed, remaining, seq);
        return new BackfillResult(initialUnchained, processed, remaining, seq);
    }

    /**
     * Zinciri {@code fromSeq}'ten (dahil) itibaren yeniden hesaplar.
     *
     * <p>KVKK anonimleştirme PII alanlarını ({@code userName/ipAddress/userAgent/
     * detail}) değiştirir; bunlar hash kanonik girdisinde olduğundan, anonimleşen
     * kaydın ve sonrasının recordHash'leri yeniden hesaplanmazsa
     * {@link #verifyChain()} yanlış FAIL verir. Bu metod anonimleştirmeden SONRA
     * çağrılır: {@code fromSeq-1}'in recordHash'inden başlayarak ileri doğru
     * tüm zinciri tutarlı kılar.</p>
     *
     * <p>Bu meşru, audit'li bir işlemdir (anonimleştirme operasyonu ayrıca audit'lenir);
     * keyfi tahrifattan farkı, yalnız PII alanlarına dokunup zinciri bilinçli ve
     * izlenebilir biçimde yeniden imzalamasıdır.</p>
     *
     * @param fromSeq yeniden hesaba başlanacak ilk chain_seq (dahil)
     * @return yeniden hesaplanan kayıt sayısı
     */
    @Transactional
    public long rechainFrom(long fromSeq) {
        if (fromSeq < 1) fromSeq = 1;

        // fromSeq-1'in recordHash'i, fromSeq'in beklenen prevHash'idir.
        String prevHash = AuditHashUtil.GENESIS_PREV_HASH;
        long rechained = 0;

        synchronized (CHAIN_LOCK) {
            if (fromSeq > 1) {
                // (fromSeq-1) kaydının recordHash'i, fromSeq'in beklenen prevHash'i.
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
            // findChainedFromSeq seq>=fromSeq döner; ilk eleman tam seq olmalı.
            if (first.getChainSeq() != null && first.getChainSeq() == seq) {
                return first;
            }
        }
        return null;
    }

    /**
     * Zinciri baştan sona doğrular. Her kayıt için:
     * <ul>
     *   <li>recordHash, kaydın kanonik içeriğinden yeniden hesaplananla eşleşmeli
     *       (kayıt tahrif edilmemiş);</li>
     *   <li>prevHash, bir önceki kaydın recordHash'iyle eşleşmeli (zincir kopuk değil);</li>
     *   <li>ilk kayıt GENESIS prevHash taşımalı.</li>
     * </ul>
     * İlk uyumsuzlukta valid=false döner + kırılma noktası raporlanır. Tüm
     * zincir tutarlıysa valid=true.
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
                // 1) prevHash zincir bağlantısı
                if (!expectedPrev.equals(nz(rec.getPrevHash()))) {
                    return ChainVerification.broken(verified + 1, rec.getId(), rec.getChainSeq(),
                            "prev_hash zincir bağlantısı kopuk (beklenen=" + shorten(expectedPrev)
                                    + ", bulunan=" + shorten(nz(rec.getPrevHash())) + ")", unchained);
                }
                // 2) recordHash tahrifat kontrolü
                String recomputed = AuditHashUtil.computeRecordHash(rec, nz(rec.getPrevHash()));
                if (!recomputed.equals(nz(rec.getRecordHash()))) {
                    return ChainVerification.broken(verified + 1, rec.getId(), rec.getChainSeq(),
                            "record_hash uyuşmuyor — kayıt tahrif edilmiş olabilir (beklenen="
                                    + shorten(recomputed) + ", saklanan=" + shorten(nz(rec.getRecordHash())) + ")",
                            unchained);
                }
                // 3) seq monotonluk (boşluk/atlama)
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

    // ── helpers ──────────────────────────────────────────────────────────

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String shorten(String hash) {
        if (hash == null || hash.length() <= 12) return hash;
        return hash.substring(0, 12) + "…";
    }

    // ── result records ─────────────────────────────────────────────────────

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
                                ? "Zincir tutarlı (" + verified + " kayıt). UYARI: " + unchained
                                  + " zincirsiz kayıt var — backfill çalıştırın."
                                : "Zincir tutarlı (" + verified + " kayıt doğrulandı)."));
        }

        static ChainVerification broken(long position, UUID recordId, Long seq, String reason, long unchained) {
            return new ChainVerification(false, position - 1, unchained, seq, recordId, position,
                    "ZİNCİR KIRIK @ pozisyon " + position + " (seq=" + seq + ", id=" + recordId + "): " + reason);
        }
    }
}
