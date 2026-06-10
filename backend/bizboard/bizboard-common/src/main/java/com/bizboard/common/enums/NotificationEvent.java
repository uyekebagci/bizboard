package com.bizboard.common.enums;

/**
 * WP f1fa3cd5: Kanal-agnostik bildirim DOMAIN OLAYLARI.
 *
 * <p>{@link NotificationType} bir <b>seviye</b>dir (INFO/WARNING/ALERT/SUCCESS);
 * bu enum ise <b>ne olduğu</b>nu (hangi iş olayı) belirtir. Dispatch katmanı olayı
 * şablona + varsayılan seviyeye + varsayılan kanallara eşler.</p>
 *
 * <p>Yeni olay eklerken: (1) buraya değer ekle, (2) {@code NotificationTemplateRegistry}
 * içine TR şablon + varsayılan seviye ekle. Kanal implementasyonuna dokunmaya gerek
 * yoktur — dispatch katmanı kanal-agnostiktir.</p>
 */
public enum NotificationEvent {

    /** Borç vadesi yaklaştı (gün sayısı template değişkeni). */
    DEBT_DUE_SOON,

    /** Çek/senet vadesi yaklaştı. (Mevcut ChequeReminderScheduler bunu kullanabilir.) */
    CHEQUE_DUE_SOON,

    /** Karşı taraftan ödeme alındı. */
    PAYMENT_RECEIVED,

    /** Günlük kasa kapanışı hatırlatması. */
    CASH_CLOSING_REMINDER,

    /** Vergi son tarihi yaklaştı (Vergi Takvimi Modülü; gün sayısı template değişkeni). */
    TAX_DEADLINE_DUE_SOON,

    /** Tek kullanımlık doğrulama kodu (OTP) — ileride 2FA/login için. */
    OTP,

    /** WP f1fa3cd5: Envanter kalemi düşük stok (reorder eşiği altı). */
    LOW_STOCK,

    /** WP f1fa3cd5: Envanter kalemi garanti bitişi yaklaşıyor. */
    WARRANTY_EXPIRING,

    /** WP f1fa3cd5: Yeni işlem eklendi (düşük öncelik; in-app default açık). */
    NEW_TRANSACTION,

    /** WP f1fa3cd5: Bir kullanıcıya firma erişimi verildi. */
    FIRM_ACCESS_GRANTED,

    /**
     * Ledger v2 (Faz D, §9 / TODO 4): gün kapanışı variance (kaçak) eşik aştı.
     * Kritik anomali — Telegram'a outbound + admin'lere. {@code OLMASI GEREKEN −
     * SON KASA} eşiği aşınca tetiklenir (DayCloseService.fireAlarm).
     */
    DAY_CLOSE_VARIANCE_ALERT,

    /**
     * Ledger v2 (Faz D, §3.7): çek/senet karşılıksız (BOUNCED) — kritik anomali,
     * admin'lere + Telegram.
     */
    INSTRUMENT_BOUNCED,

    /** Tipi spesifik olmayan serbest bildirim (başlık+mesaj doğrudan verilir). */
    GENERIC
}
