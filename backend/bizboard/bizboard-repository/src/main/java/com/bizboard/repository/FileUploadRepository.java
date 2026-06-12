package com.bizboard.repository;

import com.bizboard.common.entity.FileUpload;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FileUploadRepository extends JpaRepository<FileUpload, UUID> {

    /** Belirli bir entity'ye bagli dosyalar */
    List<FileUpload> findByEntityTypeAndEntityIdOrderByCreatedAtDesc(String entityType, UUID entityId);

    /*
     * PERF (server-pagination, non-breaking): {@code GET /files/all} ADMIN yolu için
     * sayfalı varyant. Eski {@code findAllByOrderByCreatedAtDesc} AYNEN korunur;
     * bu yalnız {@code ?page=&size=} + admin geldiğinde kullanılır. (Non-admin yolu
     * per-row {@code canRead} elemesi gerektirdiğinden serviste bellekte slice edilir —
     * sonuç içeriği birebir korunur.)
     */
    Page<FileUpload> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** Belirli bir entity'ye bagli, admin_only olmayan dosyalar */
    List<FileUpload> findByEntityTypeAndEntityIdAndAdminOnlyFalseOrderByCreatedAtDesc(String entityType, UUID entityId);

    /** Kategoriye gore dosyalar */
    List<FileUpload> findByCategoryOrderByCreatedAtDesc(String category);

    /** Stored name ile bul */
    Optional<FileUpload> findByStoredName(String storedName);

    /** Kullanicinin yuklediği dosyalar */
    List<FileUpload> findByUploadedByOrderByCreatedAtDesc(UUID uploadedBy);

    /** Entity'ye bagli dosya sayisi */
    long countByEntityTypeAndEntityId(String entityType, UUID entityId);

    /** Tum dosyalar (admin icin) */
    List<FileUpload> findAllByOrderByCreatedAtDesc();

    /** Tum dosyalar admin_only haric (normal kullanicilar icin) */
    List<FileUpload> findByAdminOnlyFalseOrderByCreatedAtDesc();

    /** Belirli entity ID'lere ait tüm dosyalar (admin) */
    List<FileUpload> findByEntityTypeAndEntityIdInOrderByCreatedAtDesc(String entityType, List<UUID> entityIds);

    /** Belirli entity ID'lere ait dosyalar, admin_only haric */
    List<FileUpload> findByEntityTypeAndEntityIdInAndAdminOnlyFalseOrderByCreatedAtDesc(String entityType, List<UUID> entityIds);
}
