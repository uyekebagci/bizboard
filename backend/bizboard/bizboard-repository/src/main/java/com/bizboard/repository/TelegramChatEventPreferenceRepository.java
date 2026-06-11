package com.bizboard.repository;

import com.bizboard.common.entity.TelegramChatEventPreference;
import com.bizboard.common.enums.NotificationEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * CHT-2 / GRP-3: chat (binding) başına event tercihi erişimi.
 */
public interface TelegramChatEventPreferenceRepository
        extends JpaRepository<TelegramChatEventPreference, UUID> {

    List<TelegramChatEventPreference> findByBindingId(UUID bindingId);

    Optional<TelegramChatEventPreference> findByBindingIdAndEvent(UUID bindingId, NotificationEvent event);

    @Transactional
    void deleteByBindingId(UUID bindingId);
}
