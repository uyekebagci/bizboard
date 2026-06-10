package com.bizboard.repository;

import com.bizboard.common.entity.SavedSearch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * v2.2.0 — kayıtlı aramalar (spec §9.1). Tüm sorgular {@code userId} ile sınırlı
 * (T1: kullanıcı yalnız kendi kayıtlarını görür).
 */
public interface SavedSearchRepository extends JpaRepository<SavedSearch, UUID> {

    List<SavedSearch> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Tenant-safe fetch: id + sahip eşleşmeli, yoksa boş (cross-user erişim yok). */
    Optional<SavedSearch> findByIdAndUserId(UUID id, UUID userId);

    long countByUserId(UUID userId);
}
