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
 *   <li>{@link #LOAN} — Verilen/Alınan Borç (cari ↔ kasa TRANSFER'i).
 *       <b>Verilen Borç</b>: nakit ÇIKAR ({@code direction=EXPENSE}) + karşılığı
 *       <b>ALACAK</b> (RECEIVABLE Debt) artar. <b>Alınan Borç</b>: nakit ARTAR
 *       ({@code direction=INCOME}) + <b>VERECEK</b> (PAYABLE Debt) artar.
 *       <b>P&L'e GİRMEZ</b> — gelir/gider değil; bilanço hareketidir (kasa ile
 *       alacak/verecek arası transfer). Posting türetiminde iki {@code
 *       LOCATION_MOVE} bacağı üretilir (PNL bacağı YOK, Σ=0); konsolide net
 *       katkısı 0 ({@code incomeContribution}). Kasa hareketi gerçek olduğundan
 *       gün-kapanışı kasa akışına ({@code ClosingCalculator}) DAHİL edilir.</li>
 * </ul>
 *
 * <p>Equivalence DB constraint: {@code kind=TRANSFER ⟺ transfer_pair_id NOT NULL}.</p>
 */
public enum TransactionKind {
    NORMAL,
    TRANSFER,
    LOAN
}
