package com.bizboard.repository;

import com.bizboard.common.entity.BusinessMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BusinessMemberRepository extends JpaRepository<BusinessMember, UUID> {

    Optional<BusinessMember> findByBusinessIdAndUserId(UUID businessId, UUID userId);

    boolean existsByBusinessIdAndUserId(UUID businessId, UUID userId);
}
