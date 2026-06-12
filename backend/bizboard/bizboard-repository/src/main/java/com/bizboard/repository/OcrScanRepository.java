package com.bizboard.repository;

import com.bizboard.common.entity.OcrScan;
import com.bizboard.common.enums.OcrScanStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * OCR Modülü (WP 1bdb8116): {@link OcrScan} repository.
 *
 * <p>Çok-tenant: servis {@code businessId} ile çağırır; cross-tenant erişim
 * {@code BusinessAccessGuard} + service'teki business-eşleşme kontrolüyle engellenir.</p>
 */
public interface OcrScanRepository extends JpaRepository<OcrScan, UUID> {

    List<OcrScan> findByBusinessIdOrderByCreatedAtDesc(UUID businessId);

    List<OcrScan> findByBusinessIdAndStatusOrderByCreatedAtDesc(UUID businessId, OcrScanStatus status);
}
