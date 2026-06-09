package com.bizboard.service.notification.telegram;

import com.bizboard.common.dto.NotificationMessage;
import com.bizboard.common.entity.NotificationChannelBinding;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.repository.NotificationChannelBindingRepository;
import com.bizboard.service.notification.NotificationChannel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Telegram teslim kanalı. {@code NotificationDispatchService} List&lt;NotificationChannel&gt;
 * ile otomatik toplar — dispatch koduna dokunulmadı.
 *
 * <p>send: kullanıcının TELEGRAM binding'ini bul; yoksa/verified=false → sessizce dön
 * (opt-in). chat_id = binding.externalId. 403 → binding.verified=false (bot engellendi).
 * Token yoksa {@link #isEnabled()} false → dispatch zaten atlar.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramNotificationChannel implements NotificationChannel {

    private final TelegramProperties props;
    private final TelegramClient client;
    private final NotificationChannelBindingRepository bindingRepository;

    @Override
    public NotificationChannelType type() {
        return NotificationChannelType.TELEGRAM;
    }

    @Override
    public boolean isEnabled() {
        return props.isConfigured();
    }

    @Override
    @Transactional
    public void send(NotificationMessage m) {
        if (m.getRecipientUserId() == null) return;
        NotificationChannelBinding binding = bindingRepository
                .findByUserIdAndChannel(m.getRecipientUserId(), NotificationChannelType.TELEGRAM)
                .orElse(null);
        // opt-in: binding yok ya da doğrulanmamış / chat_id boş → sessizce geç.
        if (binding == null || !binding.isVerified()
                || binding.getExternalId() == null || binding.getExternalId().isBlank()) {
            return;
        }

        TelegramClient.SendResult r = client.sendMessage(binding.getExternalId(), buildHtml(m));
        if (r == TelegramClient.SendResult.FORBIDDEN) {
            // Kullanıcı botu engelledi/sildi → binding'i pasifleştir (tekrar denenmesin).
            binding.setVerified(false);
            bindingRepository.save(binding);
        }
        // RATE_LIMITED / TRANSIENT: best-effort — sonraki tetikte tekrar denenir (MVP).
    }

    /** Telegram HTML: kalın başlık + gövde + (varsa) eylem linki. */
    private static String buildHtml(NotificationMessage m) {
        StringBuilder sb = new StringBuilder();
        if (m.getTitle() != null && !m.getTitle().isBlank()) {
            sb.append("<b>").append(escape(m.getTitle())).append("</b>\n");
        }
        if (m.getBody() != null && !m.getBody().isBlank()) {
            sb.append(escape(m.getBody()));
        }
        if (m.getActionUrl() != null && !m.getActionUrl().isBlank()) {
            sb.append("\n\n").append(escape(m.getActionUrl()));
        }
        return sb.length() == 0 ? "ÇATI bildirimi" : sb.toString();
    }

    /** Telegram HTML parse_mode için minimum kaçış. */
    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
