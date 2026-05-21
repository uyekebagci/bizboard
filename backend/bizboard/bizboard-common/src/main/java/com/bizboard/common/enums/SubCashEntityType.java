package com.bizboard.common.enums;

/**
 * v1.6.23.27 (UI Fix WP TODO 52459999): Sub-Cash assignment entity tipi.
 *
 * <p>Polymorphic union — bir sub-cash farklı tipte entity'leri içerebilir.
 * Aggregate value rules (TODO d884a0ec):</p>
 *
 * <ul>
 *   <li>{@link #BANK_ACCOUNT} → bank_account.current_balance (yalnız
 *       CHECKING/SAVINGS/CASH_HOLDER kabul; MAIN_CASH ve SUB_CASH
 *       eklemek YASAK — Σ invariant'ı kırar)</li>
 *   <li>{@link #COUNTERPART} → 0 (sadece tx grouping; cari net karışmaz)</li>
 *   <li>{@link #POS_DEVICE} → 0 (sadece tx grouping)</li>
 * </ul>
 */
public enum SubCashEntityType {
    COUNTERPART,
    POS_DEVICE,
    BANK_ACCOUNT
}
