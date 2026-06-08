package com.bizboard.common.enums;

/**
 * WP f1fa3cd5: Bildirim teslim KANALLARI.
 *
 * <p>Şu an YALNIZ {@link #IN_APP} implemente edilmiştir (mevcut notifications
 * tablosu). Diğer değerler dispatch/preference altyapısının kanal-agnostik
 * kalması için tanımlıdır; channel implementasyonları henüz YOK.</p>
 *
 * <p>TODO: Telegram channel (WP f1fa3cd5) — {@link #TELEGRAM} için
 * {@code TelegramNotificationChannel implements NotificationChannel} eklenecek;
 * chat_id binding {@code NotificationChannelBinding} entity'sinde tutulur.</p>
 */
public enum NotificationChannelType {

    /** In-app — mevcut notifications tablosuna yazar. AKTİF. */
    IN_APP,

    /** TODO: Telegram channel (WP f1fa3cd5) — implemente DEĞİL. */
    TELEGRAM,

    /** TODO: WhatsApp channel — bu WP kapsamında YOK (ileride Telegram tercih edildi). */
    WHATSAPP,

    /** TODO: Email channel — implemente DEĞİL. */
    EMAIL
}
