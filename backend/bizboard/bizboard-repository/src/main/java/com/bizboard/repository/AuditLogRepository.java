package com.bizboard.repository;

import com.bizboard.common.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    Page<AuditLog> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    Page<AuditLog> findByActionOrderByCreatedAtDesc(String action, Pageable pageable);

    Page<AuditLog> findByResourceTypeAndResourceIdOrderByCreatedAtDesc(
            String resourceType, UUID resourceId, Pageable pageable);

    @Query("select a from AuditLog a where a.createdAt >= :since order by a.createdAt desc")
    Page<AuditLog> findRecent(LocalDateTime since, Pageable pageable);

    /**
     * Admin viewer filter — tüm parametreler opsiyonel; null geldiğinde o filtre devre dışı.
     * Tek sorgu ile filtrelenebilir liste döndürür; pagination ile sayfalanır.
     */
    @Query("""
            select a from AuditLog a
            where (:userId is null or a.userId = :userId)
              and (:action is null or a.action = :action)
              and (:resourceType is null or a.resourceType = :resourceType)
              and (:from is null or a.createdAt >= :from)
              and (:to is null or a.createdAt < :to)
            order by a.createdAt desc
            """)
    Page<AuditLog> search(
            @Param("userId") UUID userId,
            @Param("action") String action,
            @Param("resourceType") String resourceType,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            Pageable pageable);
}
