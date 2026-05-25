package com.bizboard.repository;

import com.bizboard.common.entity.MyCompanyUserAccess;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MyCompanyUserAccessRepository extends JpaRepository<MyCompanyUserAccess, UUID> {

    List<MyCompanyUserAccess> findByMyCompanyIdOrderByGrantedAtDesc(UUID myCompanyId);

    List<MyCompanyUserAccess> findByUserId(UUID userId);

    Optional<MyCompanyUserAccess> findByMyCompanyIdAndUserId(UUID myCompanyId, UUID userId);

    @Query("SELECT a.user.id FROM MyCompanyUserAccess a WHERE a.myCompany.id = :myCompanyId")
    List<UUID> findUserIdsByMyCompanyId(UUID myCompanyId);

    @Modifying
    @Query("DELETE FROM MyCompanyUserAccess a WHERE a.myCompany.id = :myCompanyId AND a.user.id IN :userIds")
    int deleteByMyCompanyIdAndUserIdIn(UUID myCompanyId, List<UUID> userIds);

    @Modifying
    @Query("DELETE FROM MyCompanyUserAccess a WHERE a.myCompany.id = :myCompanyId")
    int deleteByMyCompanyId(UUID myCompanyId);

    /** Non-admin user'ın erişebildiği my_company_id'ler. */
    @Query("SELECT a.myCompany.id FROM MyCompanyUserAccess a WHERE a.user.id = :userId")
    List<UUID> findAccessibleMyCompanyIds(UUID userId);
}
