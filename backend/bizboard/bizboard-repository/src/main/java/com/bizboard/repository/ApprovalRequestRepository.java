package com.bizboard.repository;

import com.bizboard.common.entity.ApprovalRequest;
import com.bizboard.common.enums.ApprovalStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1 — onay talepleri için multi-tenant erişim.
 *
 * <p>Tüm sorgular {@code businessId} ile sınırlıdır; servis katmanı ayrıca
 * {@code accessibleBusinessIds} ile cross-tenant erişimi keser.</p>
 */
public interface ApprovalRequestRepository extends JpaRepository<ApprovalRequest, UUID> {

    List<ApprovalRequest> findByBusinessIdOrderByCreatedAtDesc(UUID businessId);

    List<ApprovalRequest> findByBusinessIdAndStatusOrderByCreatedAtDesc(
            UUID businessId, ApprovalStatus status);

    /** Onay Kuyruğu (birden çok erişilebilir işletme için bekleyenler). */
    List<ApprovalRequest> findByBusinessIdInAndStatusOrderByCreatedAtDesc(
            List<UUID> businessIds, ApprovalStatus status);

    List<ApprovalRequest> findByBusinessIdInOrderByCreatedAtDesc(List<UUID> businessIds);

    long countByBusinessIdInAndStatus(List<UUID> businessIds, ApprovalStatus status);
}
