package com.bizboard.service.notification.telegram;

import com.bizboard.common.entity.NotificationChannelBinding;
import com.bizboard.common.entity.TelegramLinkCode;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.NotificationChannelBindingRepository;
import com.bizboard.repository.TelegramLinkCodeRepository;
import com.bizboard.service.notification.NotificationPreferenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Telegram bot MVP: deep-link bağlama akışı + binding yönetimi (tek-kaynak helper).
 *
 * <ul>
 *   <li>{@link #createLinkCode} — kullanıcı için tek-kullanımlık kod (~10dk TTL).</li>
 *   <li>{@link #redeemCode} — /start &lt;kod&gt; → binding upsert (verified=true) + kod tüket.</li>
 *   <li>{@link #disable} — /kapat: binding verified=false + TELEGRAM tercihlerini kapat.</li>
 *   <li>{@link #statusOf} — bağlı mı?</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramLinkService {

    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray(); // base32, karışan harf yok
    private static final int CODE_LEN = 10;
    private static final long TTL_MINUTES = 10;

    private final TelegramLinkCodeRepository codeRepository;
    private final NotificationChannelBindingRepository bindingRepository;
    private final NotificationPreferenceService preferenceService;
    private final SecureRandom random = new SecureRandom();

    public record IssuedCode(String code, LocalDateTime expiresAt) {}

    /** Kullanıcı için yeni tek-kullanımlık bağlama kodu üret. */
    @Transactional
    public IssuedCode createLinkCode(UUID userId) {
        String code = generateCode();
        LocalDateTime expires = LocalDateTime.now().plusMinutes(TTL_MINUTES);
        codeRepository.save(TelegramLinkCode.builder()
                .code(code).userId(userId).expiresAt(expires).build());
        return new IssuedCode(code, expires);
    }

    /**
     * /start &lt;kod&gt; akışı: kodu doğrula → bu kullanıcının TELEGRAM binding'ini
     * chat_id ile upsert (verified=true) → kodu tüket. Başarılıysa userId döner.
     */
    @Transactional
    public Optional<UUID> redeemCode(String code, String chatId) {
        if (code == null || code.isBlank() || chatId == null || chatId.isBlank()) return Optional.empty();
        TelegramLinkCode lc = codeRepository.findByCode(code.trim().toUpperCase()).orElse(null);
        if (lc == null || lc.getConsumedAt() != null) return Optional.empty();
        if (lc.getExpiresAt().isBefore(LocalDateTime.now())) return Optional.empty();

        UUID userId = lc.getUserId();
        NotificationChannelBinding binding = bindingRepository
                .findByUserIdAndChannel(userId, NotificationChannelType.TELEGRAM)
                .orElseGet(() -> NotificationChannelBinding.builder()
                        .userId(userId).channel(NotificationChannelType.TELEGRAM).build());
        binding.setExternalId(chatId);
        binding.setVerified(true);
        bindingRepository.save(binding);

        lc.setConsumedAt(LocalDateTime.now());
        codeRepository.save(lc);
        log.info("[telegram] binding doğrulandı user={} chat={}", userId, chatId);
        return Optional.of(userId);
    }

    /** /kapat: binding'i pasifleştir + tüm TELEGRAM tercihlerini kapat. */
    @Transactional
    public void disable(UUID userId) {
        bindingRepository.findByUserIdAndChannel(userId, NotificationChannelType.TELEGRAM)
                .ifPresent(b -> { b.setVerified(false); bindingRepository.save(b); });
        for (NotificationEvent ev : NotificationEvent.values()) {
            preferenceService.setPreference(userId, ev, NotificationChannelType.TELEGRAM, false);
        }
    }

    /** Bir chat_id'ye bağlı doğrulanmış kullanıcı (webhook komutları için). */
    @Transactional(readOnly = true)
    public Optional<UUID> userByChatId(String chatId) {
        // MVP: binding tablosu küçük; chat_id externalId ile eşleşen verified kaydı bul.
        return bindingRepository.findAll().stream()
                .filter(b -> b.getChannel() == NotificationChannelType.TELEGRAM
                        && b.isVerified() && chatId.equals(b.getExternalId()))
                .map(NotificationChannelBinding::getUserId)
                .findFirst();
    }

    /** Kullanıcının TELEGRAM bağlantı durumu (verified + chat_id var). */
    @Transactional(readOnly = true)
    public boolean isLinked(UUID userId) {
        return bindingRepository.findByUserIdAndChannel(userId, NotificationChannelType.TELEGRAM)
                .map(b -> b.isVerified() && b.getExternalId() != null && !b.getExternalId().isBlank())
                .orElse(false);
    }

    private String generateCode() {
        StringBuilder sb = new StringBuilder(CODE_LEN);
        for (int i = 0; i < CODE_LEN; i++) sb.append(ALPHABET[random.nextInt(ALPHABET.length)]);
        return sb.toString();
    }
}
