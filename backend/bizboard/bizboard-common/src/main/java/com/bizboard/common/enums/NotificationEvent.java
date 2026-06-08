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

    /** Tek kullanımlık doğrulama kodu (OTP) — ileride 2FA/login için. */
    OTP,

    /** Tipi spesifik olmayan serbest bildirim (başlık+mesaj doğrudan verilir). */
    GENERIC
}
