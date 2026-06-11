package com.bizboard.service.notification;

import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.NotificationType;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * WP f1fa3cd5: Kanal-agnostik bildirim ŞABLON sistemi.
 *
 * <p>Her domain olayı için varsayılan TR başlık/gövde şablonu + seviye tutar.
 * Şablonlar {@code {var}} sözdizimiyle değişken içerir; {@link #render} verilen
 * değişken haritasıyla doldurur. Platform-spesifik (WhatsApp template submission
 * gibi) HİÇBİR şey YOKTUR — düz metin, tüm kanallarda kullanılabilir.</p>
 *
 * <p>Yeni olay eklerken buraya {@link Template} ekle. GENERIC olayında başlık/gövde
 * doğrudan değişken olarak verilir ({@code {title}}, {@code {body}}).</p>
 */
@Component
public class NotificationTemplateRegistry {

    /** Tek bir olaya ait şablon. */
    public record Template(NotificationType type, String titleTemplate, String bodyTemplate) {}

    /** Render edilmiş sonuç. */
    public record Rendered(NotificationType type, String title, String body) {}

    // Map.ofEntries: 10'dan fazla event olduğu için Map.of yerine (11+).
    private final Map<NotificationEvent, Template> templates = Map.ofEntries(
            Map.entry(NotificationEvent.DEBT_DUE_SOON, new Template(
                    NotificationType.WARNING,
                    "Borç vadesi yaklaşıyor: {counterparty}",
                    "{counterparty} — {amount} {currency} — vadesi {when} doluyor.")),
            Map.entry(NotificationEvent.CHEQUE_DUE_SOON, new Template(
                    NotificationType.WARNING,
                    "Çek/senet vadesi yaklaşıyor: {counterparty}",
                    "{counterparty} — {amount} {currency} — vade {when}{chequeNo}.")),
            Map.entry(NotificationEvent.PAYMENT_RECEIVED, new Template(
                    NotificationType.SUCCESS,
                    "Ödeme alındı: {counterparty}",
                    "{counterparty} tarafından {amount} {currency} ödeme alındı.")),
            Map.entry(NotificationEvent.CASH_CLOSING_REMINDER, new Template(
                    NotificationType.INFO,
                    "Kasa kapanışı hatırlatması",
                    "{date} günü için kasa kapanışını henüz yapmadınız.")),
            Map.entry(NotificationEvent.TAX_DEADLINE_DUE_SOON, new Template(
                    NotificationType.WARNING,
                    "Vergi son tarihi yaklaşıyor: {tax}",
                    "{tax} — {period} dönemi — son tarih {when} ({dueDate}).")),
            Map.entry(NotificationEvent.LOW_STOCK, new Template(
                    NotificationType.WARNING,
                    "Düşük stok: {item}",
                    "{item} — kalan {quantity}, reorder eşiği {threshold}. Sipariş gerekebilir.")),
            Map.entry(NotificationEvent.WARRANTY_EXPIRING, new Template(
                    NotificationType.WARNING,
                    "Garanti bitiyor: {item}",
                    "{item} — garanti {when} ({warrantyDate}) sona eriyor.")),
            Map.entry(NotificationEvent.NEW_TRANSACTION, new Template(
                    NotificationType.INFO,
                    "Yeni işlem: {business}",
                    "{business} — {direction} {amount} {currency}{description}.")),
            Map.entry(NotificationEvent.FIRM_ACCESS_GRANTED, new Template(
                    NotificationType.INFO,
                    "Firma erişimi verildi: {business}",
                    "{business} işletmesine erişiminiz tanımlandı.")),
            Map.entry(NotificationEvent.DAY_CLOSE_VARIANCE_ALERT, new Template(
                    NotificationType.ALERT,
                    "⚠ KAÇAK ALARMI — {date}",
                    "{date} kapanışında kaçak/fark {variance} {currency} (eşik {threshold}). "
                            + "Olması gereken {computed}, sayılan {actual}. Drill-down: gün hareketleri.")),
            Map.entry(NotificationEvent.INSTRUMENT_BOUNCED, new Template(
                    NotificationType.ALERT,
                    "⚠ KARŞILIKSIZ ÇEK/SENET: {counterparty}",
                    "{counterparty} — {amount} {currency} — vade {dueDate} karşılıksız çıktı.")),
            // Tier 2 (EVT-1, §2.2 / §2.4): proaktif finansal alarmlar (ALERT seviye).
            Map.entry(NotificationEvent.BALANCE_BELOW_THRESHOLD, new Template(
                    NotificationType.ALERT,
                    "⚠ DÜŞÜK BAKİYE: {business}",
                    "{business} bakiyesi {balance} {currency} — eşik {threshold} {currency} altına düştü.")),
            Map.entry(NotificationEvent.HIGH_EXPENSE_ALERT, new Template(
                    NotificationType.ALERT,
                    "⚠ BÜYÜK HARCAMA: {business}",
                    "{business} — {amount} {currency} gider{category}{description}. Eşik: {threshold} {currency}.")),
            Map.entry(NotificationEvent.OTP, new Template(
                    NotificationType.INFO,
                    "Doğrulama kodu",
                    "Doğrulama kodunuz: {code}. {ttl} dakika geçerlidir.")),
            Map.entry(NotificationEvent.GENERIC, new Template(
                    NotificationType.INFO,
                    "{title}",
                    "{body}"))
    );

    /**
     * Olayı verilen değişkenlerle render eder. Şablonda olup haritada bulunmayan
     * değişken boş string'e düşer (hata fırlatılmaz — best-effort mesaj üretimi).
     */
    public Rendered render(NotificationEvent event, Map<String, String> vars) {
        Template t = templates.getOrDefault(event, templates.get(NotificationEvent.GENERIC));
        return new Rendered(
                t.type(),
                interpolate(t.titleTemplate(), vars),
                interpolate(t.bodyTemplate(), vars));
    }

    private static String interpolate(String template, Map<String, String> vars) {
        if (template == null) return "";
        String out = template;
        if (vars != null) {
            for (Map.Entry<String, String> e : vars.entrySet()) {
                out = out.replace("{" + e.getKey() + "}", e.getValue() != null ? e.getValue() : "");
            }
        }
        // Doldurulmamış {placeholder}'ları temizle (yarım metin görünmesin).
        out = out.replaceAll("\\{[a-zA-Z0-9_]+\\}", "");
        return out.trim().replaceAll("\\s{2,}", " ");
    }
}
