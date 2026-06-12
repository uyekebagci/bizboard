package com.bizboard.repository;

import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.enums.CounterpartKind;
import com.bizboard.common.enums.CounterpartRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
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

    // ── v1.6.23.20 (Security WP / arch-rules §1.1): multi-tenant filter ──

    List<Counterpart> findByBusinessIdInOrderByNameAsc(List<UUID> businessIds);

    List<Counterpart> findByBusinessIdInAndRoleOrderByNameAsc(
            List<UUID> businessIds, CounterpartRole role);

    List<Counterpart> findByBusinessIdInAndKindOrderByNameAsc(
            List<UUID> businessIds, CounterpartKind kind);

    List<Counterpart> findByBusinessIdInAndParentIdOrderByNameAsc(
            List<UUID> businessIds, UUID parentId);

    /*
     * PERF (server-pagination, non-breaking): {@code GET /counterparts} için
     * sayfalı varyantlar. Eski parametresiz {@code findByBusinessIdIn...OrderByNameAsc}
     * metodları AYNEN korunur (silinmedi); bunlar yalnız {@code ?page=&size=}
     * geldiğinde kullanılır. {@code kind}/{@code role} filtresi DB'de uygulanır,
     * sıralama {@code name ASC} (eski davranışla birebir). {@code @EntityGraph}
     * ile {@code business} eager → {@code toDto}'daki {@code getBusiness().getName()}
     * N+1'i elenir (to-ONE, sayfalama DB-seviyesinde doğru).
     */

    @EntityGraph(attributePaths = {"business"})
    Page<Counterpart> findByBusinessIdInOrderByNameAsc(List<UUID> businessIds, Pageable pageable);

    @EntityGraph(attributePaths = {"business"})
    Page<Counterpart> findByBusinessIdInAndRoleOrderByNameAsc(
            List<UUID> businessIds, CounterpartRole role, Pageable pageable);

    @EntityGraph(attributePaths = {"business"})
    Page<Counterpart> findByBusinessIdInAndKindOrderByNameAsc(
            List<UUID> businessIds, CounterpartKind kind, Pageable pageable);

    /**
     * Eski list davranışında {@code role} + {@code kind} BİRLİKTE verilince önce
     * role sorgusu, sonra bellekte {@code kind} filtresi uygulanıyordu. Sayfalamada
     * bellekte filtre sayfa boyutunu bozacağından, kombine filtre DB'ye itilir —
     * SONUÇ aynı, sıralama {@code name ASC}.
     */
    @EntityGraph(attributePaths = {"business"})
    Page<Counterpart> findByBusinessIdInAndRoleAndKindOrderByNameAsc(
            List<UUID> businessIds, CounterpartRole role, CounterpartKind kind, Pageable pageable);
}
