package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz B, §3.8 / §5) — banka ekstre satırı durumu.
 *
 * <p><b>Kapsam (KARAR A4):</b> bugün manuel/elle satır girişi yeterli; PDF
 * auto-parse ERTELENDİ. {@code PARSED} hem manuel girilen hem (ileride) parse
 * edilen satırı kapsar.</p>
 *
 * <ul>
 *   <li>{@link #PARSED}      — satır girildi/çıkarıldı; kategorile bekliyor.</li>
 *   <li>{@link #CATEGORIZED} — kategori atandı; postala bekliyor.</li>
 *   <li>{@link #POSTED}      — JournalEntry+Posting üretildi (ledger'a girdi).</li>
 *   <li>{@link #FLAGGED}     — açıklanamayan satır; kaçak adayı (mutabakatta görünür).</li>
 * </ul>
 */
public enum BankImportLineStatus {
    PARSED,
    CATEGORIZED,
    POSTED,
    FLAGGED
}
