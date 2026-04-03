package com.bizboard.repository;

import com.bizboard.common.entity.Employee;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface EmployeeRepository extends JpaRepository<Employee, UUID> {

    List<Employee> findByBusinessIdOrderByFullNameAsc(UUID businessId);

    List<Employee> findByBusinessIdAndActiveTrueOrderByFullNameAsc(UUID businessId);

    List<Employee> findByBusinessIdIn(List<UUID> businessIds);

    int countByBusinessIdAndActiveTrue(UUID businessId);
}
