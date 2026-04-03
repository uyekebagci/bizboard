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
}
