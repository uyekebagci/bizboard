package com.bizboard.repository;

import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.enums.CounterpartKind;
import com.bizboard.common.enums.CounterpartRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CounterpartRepository extends JpaRepository<Counterpart, UUID> {

    List<Counterpart> findAllByOrderByNameAsc();

    List<Counterpart> findByRoleOrderByNameAsc(CounterpartRole role);

    Optional<Counterpart> findByTaxId(String taxId);

    Optional<Counterpart> findFirstByNameIgnoreCase(String name);

    // ── v1.6.20 (WP-3): Sub-firm hierarchy + person/firm split ──

    /** Bir firmanın alt firmaları (children) — orderBy name. */
    List<Counterpart> findByParentIdOrderByNameAsc(UUID parentId);

    /** v1.7.0+: PERSON / FIRM ayrımı. */
    List<Counterpart> findByKindOrderByNameAsc(CounterpartKind kind);

    long countByParentId(UUID parentId);
}
