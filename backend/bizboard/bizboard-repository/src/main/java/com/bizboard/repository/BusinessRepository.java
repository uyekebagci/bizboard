package com.bizboard.repository;

import com.bizboard.common.entity.Business;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface BusinessRepository extends JpaRepository<Business, UUID> {

    List<Business> findByOwnerIdAndActiveTrue(UUID ownerId);

    @Query("SELECT DISTINCT b FROM Business b " +
            "LEFT JOIN b.members m " +
            "WHERE b.owner.id = :userId OR m.user.id = :userId")
    List<Business> findAllAccessibleByUser(@Param("userId") UUID userId);

    List<Business> findByIdIn(List<UUID> ids);

    /**
     * v1.5.7: business_type_name autocomplete kaynağı — kullanıcıların
     * önceden girdiği serbest tip adlarını distinct olarak döndürür.
     */
    @Query("SELECT DISTINCT b.businessTypeName FROM Business b " +
            "WHERE b.businessTypeName IS NOT NULL AND b.businessTypeName <> '' " +
            "ORDER BY b.businessTypeName ASC")
    List<String> findDistinctBusinessTypeNames();
}
