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

    private final Map<NotificationEvent, Template> templates = Map.of(
            NotificationEvent.DEBT_DUE_SOON, new Template(
                    NotificationType.WARNING,
                    "Borç vadesi yaklaşıyor: {counterparty}",
                    "{counterparty} — {amount} {currency} — vadesi {when} doluyor."),
            NotificationEvent.CHEQUE_DUE_SOON, new Template(
                    NotificationType.WARNING,
                    "Çek/senet vadesi yaklaşıyor: {counterparty}",
                    "{counterparty} — {amount} {currency} — vade {when}{chequeNo}."),
            NotificationEvent.PAYMENT_RECEIVED, new Template(
                    NotificationType.SUCCESS,
                    "Ödeme alındı: {counterparty}",
                    "{counterparty} tarafından {amount} {currency} ödeme alındı."),
            NotificationEvent.CASH_CLOSING_REMINDER, new Template(
                    NotificationType.INFO,
                    "Kasa kapanışı hatırlatması",
                    "{date} günü için kasa kapanışını henüz yapmadınız."),
            NotificationEvent.TAX_DEADLINE_DUE_SOON, new Template(
                    NotificationType.WARNING,
                    "Vergi son tarihi yaklaşıyor: {tax}",
                    "{tax} — {period} dönemi — son tarih {when} ({dueDate})."),
            NotificationEvent.OTP, new Template(
                    NotificationType.INFO,
                    "Doğrulama kodu",
                    "Doğrulama kodunuz: {code}. {ttl} dakika geçerlidir."),
            NotificationEvent.GENERIC, new Template(
                    NotificationType.INFO,
                    "{title}",
                    "{body}")
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
