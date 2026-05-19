package com.bizboard.repository;

import com.bizboard.common.entity.BusinessGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BusinessGroupMemberRepository extends JpaRepository<BusinessGroupMember, UUID> {

    /** Bir grubun tüm üyeleri — orderInGroup ASC. */
    List<BusinessGroupMember> findByGroupIdOrderByOrderInGroupAsc(UUID groupId);

    /** Bir kullanıcının tüm gruplarındaki tüm üyeler (single round-trip için). */
    @Query("SELECT m FROM BusinessGroupMember m " +
           "WHERE m.group.user.id = :userId " +
           "ORDER BY m.group.priority ASC, m.group.orderIndex ASC, m.orderInGroup ASC")
    List<BusinessGroupMember> findAllForUser(@Param("userId") UUID userId);

    /** Bir grup + işletme çiftini bul (duplicate check). */
    Optional<BusinessGroupMember> findByGroupIdAndBusinessId(UUID groupId, UUID businessId);

    /** Bir kullanıcının herhangi bir grubunda bu işletme var mı (multi-grup üyelik raporu). */
    @Query("SELECT m FROM BusinessGroupMember m " +
           "WHERE m.group.user.id = :userId AND m.business.id = :businessId")
    List<BusinessGroupMember> findByUserIdAndBusinessId(
            @Param("userId") UUID userId,
            @Param("businessId") UUID businessId);

    void deleteByGroupIdAndBusinessId(UUID groupId, UUID businessId);

    long countByGroupId(UUID groupId);
}
