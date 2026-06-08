package com.bizboard.repository;

import com.bizboard.common.entity.NotificationPreference;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.common.enums.NotificationEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** WP f1fa3cd5: Kullanıcı bildirim tercihleri erişimi. */
public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, UUID> {

    List<NotificationPreference> findByUserId(UUID userId);

    Optional<NotificationPreference> findByUserIdAndEventAndChannel(
            UUID userId, NotificationEvent event, NotificationChannelType channel);
}
