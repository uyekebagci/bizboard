package com.bizboard.repository;

import com.bizboard.common.entity.BusinessNote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BusinessNoteRepository extends JpaRepository<BusinessNote, UUID> {

    /** Sabitlenmiş notlar önce, sonra oluşturulma tarihine göre azalan (tüm notlar — admin için) */
    List<BusinessNote> findByBusinessIdOrderByPinnedDescCreatedAtDesc(UUID businessId);

    /** Sadece herkese açık notlar — admin olmayan kullanıcılar için */
    List<BusinessNote> findByBusinessIdAndAdminOnlyFalseOrderByPinnedDescCreatedAtDesc(UUID businessId);

    // ── WP a9da4e9d fix: scope-filtreli finder'lar (BUSINESS vs RECEIVABLES) ──

    /** Belirli scope'taki tüm notlar (admin için) — pinned önce, sonra createdAt DESC. */
    List<BusinessNote> findByBusinessIdAndScopeOrderByPinnedDescCreatedAtDesc(
            UUID businessId, String scope);

    /** Belirli scope'taki herkese açık notlar (admin olmayan için). */
    List<BusinessNote> findByBusinessIdAndScopeAndAdminOnlyFalseOrderByPinnedDescCreatedAtDesc(
            UUID businessId, String scope);
}
