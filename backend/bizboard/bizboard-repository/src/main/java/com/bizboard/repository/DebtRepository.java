package com.bizboard.repository;

import com.bizboard.common.entity.Debt;
import com.bizboard.common.enums.DebtDirection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DebtRepository extends JpaRepository<Debt, UUID> {

    /** Bir işletmenin tüm borçları (admin_only dahil) */
    List<Debt> findByBusinessIdOrderByCreatedAtDesc(UUID businessId);

    /** Bir işletmenin admin_only=false borçları */
    List<Debt> findByBusinessIdAndAdminOnlyFalseOrderByCreatedAtDesc(UUID businessId);

    /** Tüm işletmelerin borçları (admin panel) */
    List<Debt> findAllByOrderByCreatedAtDesc();

    /** Belirli işletmelerin borçları */
    List<Debt> findByBusinessIdInOrderByCreatedAtDesc(List<UUID> businessIds);

    /** Belirli işletmelerin admin_only=false borçları */
    List<Debt> findByBusinessIdInAndAdminOnlyFalseOrderByCreatedAtDesc(List<UUID> businessIds);

    /** Bir işletmenin yönüne göre borçları */
    List<Debt> findByBusinessIdAndDirection(UUID businessId, DebtDirection direction);

    // ── v1.5.1: counterpart bazlı sorgular (cari hesap motoru) ─────────────

    /** Bir counterpart'a bağlı tüm borçlar (settle dahil). */
    List<Debt> findByCounterpartRefIdOrderByCreatedAtAsc(UUID counterpartId);

    /** Bir counterpart'a bağlı borç sayısı — delete guard'ı için. */
    long countByCounterpartRefId(UUID counterpartId);

    // ── v1.5.5: migration ───────────────────────────────────────

    /** Counterpart_id'si null olan (free-text only) borçlar — migration kaynağı. */
    List<Debt> findByCounterpartRefIsNull();

    // ── v1.6.20 (WP-3): widget queries ─────────────────────────────

    /** v1.6.20: belirli direction'daki tüm açık (settled=false) borçlar. */
    List<Debt> findByDirectionAndSettledFalseOrderByDueDateAsc(
            com.bizboard.common.enums.DebtDirection direction);

    /** v1.6.20: önümüzdeki N gün vadeli açık çekler (chequeDueDate dolu, settled=false). */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.settled = false " +
            "  AND d.chequeDueDate IS NOT NULL " +
            "  AND d.chequeDueDate BETWEEN :from AND :to " +
            "ORDER BY d.chequeDueDate ASC")
    List<Debt> findUpcomingCheques(
            @org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
            @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);

    /** v1.6.20: önümüzdeki N gün hatırlatma tarihli açık borçlar. */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.settled = false " +
            "  AND d.reminderDate IS NOT NULL " +
            "  AND d.reminderDate BETWEEN :from AND :to " +
            "ORDER BY d.reminderDate ASC")
    List<Debt> findUpcomingReminders(
            @org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
            @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);
}
