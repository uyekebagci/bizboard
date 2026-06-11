package com.bizboard.repository;

import com.bizboard.common.entity.NotificationChannelBinding;
import com.bizboard.common.enums.NotificationChannelType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * WP f1fa3cd5: Kullanıcı ↔ harici kanal bağlaması erişimi.
 * Telegram channel eklenince {@code findByUserIdAndChannel(.., TELEGRAM)} ile
 * chat_id çözülecek.
 */
public interface NotificationChannelBindingRepository extends JpaRepository<NotificationChannelBinding, UUID> {

    List<NotificationChannelBinding> findByUserId(UUID userId);

    Optional<NotificationChannelBinding> findByUserIdAndChannel(
            UUID userId, NotificationChannelType channel);

    /**
     * CHT-1: Bağlı chat listesi — belirli kanaldaki doğrulanmış tüm binding'ler.
     */
    List<NotificationChannelBinding> findByChannelAndVerifiedTrue(NotificationChannelType channel);

    /**
     * chat_id → doğrulanmış binding'ler (webhook + manuel gönderim hedef doğrulaması).
     * Aynı grup chat'i birden fazla kullanıcı bağlamış olabilir; unique kısıt
     * (user_id, channel) üzerinde — (channel, external_id) üzerinde değil.
     * IncorrectResultSizeDataAccessException'ı önlemek için List döner.
     * Design notu §5.4: lineer tarama yerine indexli sorgu.
     */
    List<NotificationChannelBinding> findByChannelAndExternalIdAndVerifiedTrue(
            NotificationChannelType channel, String externalId);
}
