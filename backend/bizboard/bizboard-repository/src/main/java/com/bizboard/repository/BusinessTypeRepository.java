package com.bizboard.repository;

import com.bizboard.common.entity.BusinessType;
import com.bizboard.common.enums.BusinessCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BusinessTypeRepository extends JpaRepository<BusinessType, UUID> {

    Optional<BusinessType> findByCategory(BusinessCategory category);

    /**
     * v1.6.1: yeni manuel wizard akışı için case-insensitive label arama.
     * Kullanıcı "Kafe" yazdıysa daha önce oluşturulan "Kafe" tipini bul.
     */
    Optional<BusinessType> findFirstByLabelIgnoreCase(String label);
}
