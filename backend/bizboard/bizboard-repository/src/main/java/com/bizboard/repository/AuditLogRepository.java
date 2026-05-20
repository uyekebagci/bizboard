package com.bizboard.repository;

import com.bizboard.common.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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
     *
     * <p><b>v1.6.23.3:</b> Native query + PostgreSQL explicit CAST. JPQL
     * {@code (:param is null or col = :param)} pattern'i Hibernate tarafından
     * Postgres'e {@code (? IS NULL OR col = ?)} olarak gönderiliyordu; aynı
     * parametre iki kez bağlandığı için Postgres parametre tipini çıkaramıyor
     * (özellikle UUID ve TIMESTAMP için) → {@code ERROR: could not determine
     * data type of parameter $N}. Yan etki: tüm audit log paneli 500 dönüyordu
     * (frontend silent-refresh chain'i de yanlış 401 yorumluyordu).</p>
     *
     * <p>Çözüm: native SQL ile {@code CAST(:p AS uuid/text/timestamp)} kullanarak
     * her bağlama için tip context'i Postgres'e açıkça veriyoruz. Pageable için
     * countQuery da explicit yazıldı.</p>
     */
    @Query(
            value = """
                    SELECT * FROM audit_logs
                    WHERE (CAST(:userId AS uuid) IS NULL OR user_id = CAST(:userId AS uuid))
                      AND (CAST(:action AS text) IS NULL OR action = CAST(:action AS text))
                      AND (CAST(:resourceType AS text) IS NULL OR resource_type = CAST(:resourceType AS text))
                      AND (CAST(:fromTs AS timestamp) IS NULL OR created_at >= CAST(:fromTs AS timestamp))
                      AND (CAST(:toTs AS timestamp) IS NULL OR created_at < CAST(:toTs AS timestamp))
                    ORDER BY created_at DESC
                    """,
            countQuery = """
                    SELECT count(*) FROM audit_logs
                    WHERE (CAST(:userId AS uuid) IS NULL OR user_id = CAST(:userId AS uuid))
                      AND (CAST(:action AS text) IS NULL OR action = CAST(:action AS text))
                      AND (CAST(:resourceType AS text) IS NULL OR resource_type = CAST(:resourceType AS text))
                      AND (CAST(:fromTs AS timestamp) IS NULL OR created_at >= CAST(:fromTs AS timestamp))
                      AND (CAST(:toTs AS timestamp) IS NULL OR created_at < CAST(:toTs AS timestamp))
                    """,
            nativeQuery = true)
    Page<AuditLog> search(
            @Param("userId") UUID userId,
            @Param("action") String action,
            @Param("resourceType") String resourceType,
            @Param("fromTs") LocalDateTime from,
            @Param("toTs") LocalDateTime to,
            Pageable pageable);

    /**
     * Retention cleanup — {@code cutoff} tarihinden eski tüm audit kayıtlarını siler.
     * Silinen satır sayısını döndürür. Bulk delete, JPA cache'ini bypass eder.
     */
    @Modifying
    @Query("delete from AuditLog a where a.createdAt < :cutoff")
    long deleteCreatedBefore(@Param("cutoff") LocalDateTime cutoff);
}
