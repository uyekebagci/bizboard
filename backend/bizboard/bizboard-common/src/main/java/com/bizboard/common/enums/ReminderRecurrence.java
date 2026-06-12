package com.bizboard.common.enums;

/**
 * Standalone hatırlatıcı tekrar sıklığı.
 *
 * <p>{@code NONE} → tek-sefer (fire ettikten sonra pasifleşir). Diğerleri →
 * fire ettikten sonra {@code remindAt} bir sonraki periyoda ötelenir (DAILY +1
 * gün, WEEKLY +1 hafta, MONTHLY +1 ay).</p>
 */
public enum ReminderRecurrence {
    /** Tek sefer — fire sonrası tekrar etmez. */
    NONE,
    /** Her gün tekrarla. */
    DAILY,
    /** Her hafta tekrarla. */
    WEEKLY,
    /** Her ay tekrarla. */
    MONTHLY
}
