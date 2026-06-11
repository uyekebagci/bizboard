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
     * Tek chat_id → binding (webhook + manuel gönderim hedef doğrulaması).
     * Design notu §5.4: lineer tarama yerine indexli sorgu.
     */
    Optional<NotificationChannelBinding> findByChannelAndExternalIdAndVerifiedTrue(
            NotificationChannelType channel, String externalId);
}
