package com.bizboard.repository;

import com.bizboard.common.entity.Reminder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ReminderRepository extends JpaRepository<Reminder, UUID> {

    /** Kullanıcının kendi hatırlatıcıları, en yakın vade önce. */
    List<Reminder> findByOwnerIdOrderByRemindAtAsc(UUID ownerId);

    /**
     * Scheduler taraması: vadesi gelmiş ({@code remind_at &le; cutoff}) ve aktif
     * hatırlatıcılar. {@code lastFiredAt} kontrolü servis katmanında (tekrar
     * mantığıyla birlikte) yapılır.
     */
    List<Reminder> findByEnabledTrueAndRemindAtLessThanEqual(LocalDateTime cutoff);

    /** v1.7.x: kullanıcı silme öncesi FK temizleme. */
    @Modifying
    @Query("delete from Reminder r where r.owner.id = :userId")
    int deleteByOwnerId(UUID userId);
}
