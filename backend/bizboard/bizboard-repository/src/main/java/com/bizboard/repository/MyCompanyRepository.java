package com.bizboard.repository;

import com.bizboard.common.entity.MyCompany;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface MyCompanyRepository extends JpaRepository<MyCompany, UUID> {

    Optional<MyCompany> findByTaxId(String taxId);

    Optional<MyCompany> findFirstByIsDefaultTrue();
}
