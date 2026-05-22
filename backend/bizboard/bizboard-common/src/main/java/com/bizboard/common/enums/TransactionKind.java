package com.bizboard.common.enums;

/**
 * v1.7.0-beta (Bankalar WP TODO 0aa4c6d1): Transaction "tip" boyutu —
 * direction'tan ayrı (INCOME/EXPENSE) yeni eksen.
 *
 * <ul>
 *   <li>{@link #NORMAL} — Olağan gelir/gider tx. {@code transfer_pair_id}
 *       NULL olmalı.</li>
 *   <li>{@link #TRANSFER} — Banka hesapları arası transferin bir tarafı
 *       (OUT ya da IN). {@code transfer_pair_id} NOT NULL olmalı; karşı
 *       tarafla aynı UUID'yi paylaşır. {@code direction} doldurulur
 *       (OUT = EXPENSE, IN = INCOME) — ancak rapor agregasyonlarında
 *       {@code kind = 'NORMAL'} filter'ı ile dışlanır.</li>
 * </ul>
 *
 * <p>Equivalence DB constraint: {@code kind=TRANSFER ⟺ transfer_pair_id NOT NULL}.</p>
 */
public enum TransactionKind {
    NORMAL,
    TRANSFER
}
