package com.bizboard.repository;

import com.bizboard.common.entity.MyCompanyGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MyCompanyGroupRepository extends JpaRepository<MyCompanyGroup, UUID> {

    List<MyCompanyGroup> findAllByOrderByOrderIndexAscNameAsc();

    Optional<MyCompanyGroup> findByName(String name);
}
