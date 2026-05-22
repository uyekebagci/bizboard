package com.bizboard.repository;

import com.bizboard.common.entity.Notification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    List<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    long countByUserIdAndReadFalse(UUID userId);

    long countByBusinessIdAndReadFalse(UUID businessId);

    /** Bir kullanıcının tüm okunmamış bildirimlerini toplu olarak okundu işaretler. */
    @Modifying
    @Query("update Notification n set n.read = true where n.user.id = :userId and n.read = false")
    int markAllReadForUser(UUID userId);

    /** Cleanup: belirli bir tarihten önce oluşturulmuş okunmuş bildirimleri sil. */
    @Modifying
    @Query("delete from Notification n where n.read = true and n.createdAt < :threshold")
    long deleteReadBefore(LocalDateTime threshold);

    /** v1.7.x: kullanıcı silme öncesi FK temizleme. */
    @Modifying
    @Query("delete from Notification n where n.user.id = :userId")
    int deleteByUserId(UUID userId);
}
