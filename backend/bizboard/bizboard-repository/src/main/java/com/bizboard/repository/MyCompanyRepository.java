package com.bizboard.repository;

import com.bizboard.common.entity.MyCompany;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MyCompanyRepository extends JpaRepository<MyCompany, UUID> {

    Optional<MyCompany> findByTaxId(String taxId);

    Optional<MyCompany> findFirstByIsDefaultTrue();

    /** v1.7.x WP TODO 113bbe5b: non-admin filtered list. */
    List<MyCompany> findByIdInOrderByLegalNameAsc(List<UUID> ids);

    List<MyCompany> findAllByOrderByLegalNameAsc();

    List<MyCompany> findByGroupIdOrderByLegalNameAsc(UUID groupId);
}
