package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz B, §3.8) — banka ekstre import partisi durumu.
 *
 * <ul>
 *   <li>{@link #OPEN}      — parti açık; satır girişi/kategorileme sürüyor.</li>
 *   <li>{@link #POSTED}    — tüm onaylı satırlar ledger'a postalandı.</li>
 *   <li>{@link #CANCELLED} — parti iptal (satırlar postalanmadan).</li>
 * </ul>
 */
public enum BankImportBatchStatus {
    OPEN,
    POSTED,
    CANCELLED
}
