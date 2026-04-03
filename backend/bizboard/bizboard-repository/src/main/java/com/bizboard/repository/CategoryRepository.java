package com.bizboard.repository;

import com.bizboard.common.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    List<Category> findByBusinessIdAndActiveTrueOrderBySortOrder(UUID businessId);
}
