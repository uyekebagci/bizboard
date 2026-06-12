package com.bizboard.repository;

import com.bizboard.common.entity.Invoice;
import com.bizboard.common.enums.InvoiceStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * e-Fatura repository. Tüm liste sorguları tenant filtresi için
 * {@code businessIdIn(...)} varyantı üzerinden gider — servis katmanı
 * {@code BusinessAccessGuard.accessibleBusinessIds(...)} ile doldurur.
 */
public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    // ── Tenant-scoped list ────────────────────────────────────────────────

    List<Invoice> findByBusinessIdInOrderByIssueDateDescCreatedAtDesc(List<UUID> businessIds);

    List<Invoice> findByBusinessIdInAndStatusOrderByIssueDateDescCreatedAtDesc(
            List<UUID> businessIds, InvoiceStatus status);

    List<Invoice> findByBusinessIdOrderByIssueDateDescCreatedAtDesc(UUID businessId);

    // ── Benzersizlik / lookup ─────────────────────────────────────────────

    boolean existsByBusinessIdAndInvoiceNumber(UUID businessId, String invoiceNumber);

    Optional<Invoice> findByEttn(String ettn);

    long countByBusinessId(UUID businessId);
}
