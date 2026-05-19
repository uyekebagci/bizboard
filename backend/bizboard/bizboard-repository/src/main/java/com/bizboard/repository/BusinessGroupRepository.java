package com.bizboard.repository;

import com.bizboard.common.entity.BusinessGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BusinessGroupRepository extends JpaRepository<BusinessGroup, UUID> {

    /** Kullanıcının tüm grupları — priority ASC, orderIndex ASC, createdAt ASC. */
    List<BusinessGroup> findByUserIdOrderByPriorityAscOrderIndexAscCreatedAtAsc(UUID userId);

    /** Aynı kullanıcının aynı priority'sindeki tüm gruplar — orderIndex hesaplama için. */
    List<BusinessGroup> findByUserIdAndPriorityOrderByOrderIndexAsc(UUID userId, int priority);

    /** Tek grup, user'ı ile birlikte (isolation check). */
    Optional<BusinessGroup> findByIdAndUserId(UUID id, UUID userId);

    long countByUserId(UUID userId);
}
