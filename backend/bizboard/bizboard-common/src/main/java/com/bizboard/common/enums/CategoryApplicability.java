package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz A, RAFİNASYON 1 — §3.9): kategori uygulanabilirliği.
 *
 * <p>Eski {@code Category.direction} (zorunlu yön) modeli paylaşımlıya geçti
 * (NULL = yön-bağımsız); v2'de bunun üstüne <b>hibrit</b> bir kilit gelir:
 * bir kategori her iki yönde de (BOTH) kullanılabilir ya da tek tarafa
 * kilitlenebilir.</p>
 *
 * <ul>
 *   <li>{@link #BOTH}         — Varsayılan: hem gelir hem gider (bugünkü
 *       paylaşımlı davranış). Migration tüm mevcut kategorileri buraya düşürür
 *       → KIRILMA YOK.</li>
 *   <li>{@link #INCOME_ONLY}  — Sadece gelir işlemlerinde (örn. "Hizmet geliri").</li>
 *   <li>{@link #EXPENSE_ONLY} — Sadece gider işlemlerinde (örn. "Kira").</li>
 * </ul>
 *
 * <p><b>İşlem formu süzme:</b> o anki yöne göre {@code BOTH} her zaman + yöne
 * uygun olan gösterilir. <b>İhlal davranışı (A7 KİLİTLİ):</b> tek-tarafa-kilitli
 * kategoriye ters yön işlemi = HARD-BLOCK DEĞİL, uyarı + izin (STRICT ama
 * geçişi engellemez).</p>
 */
public enum CategoryApplicability {
    BOTH,
    INCOME_ONLY,
    EXPENSE_ONLY;

    /**
     * Bu kategori verilen yön ({@link TransactionDirection}) için geçerli mi?
     * BOTH her zaman true.
     */
    public boolean appliesTo(TransactionDirection direction) {
        if (this == BOTH || direction == null) return true;
        if (this == INCOME_ONLY) return direction == TransactionDirection.INCOME;
        return direction == TransactionDirection.EXPENSE;
    }
}
