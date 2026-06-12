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

    /** v1.6.23.21 (Security WP / arch-rules §1.3.A): business-scoped varyant. */
    List<Debt> findByBusinessIdAndDirectionAndSettledFalseOrderByDueDateAsc(
            UUID businessId, com.bizboard.common.enums.DebtDirection direction);

    /**
     * v1.7.x WP fbb2ef55: bir counterpart'ın açık (OPEN/PARTIAL) borçları
     * FIFO sırasıyla (due_date ASC NULLS LAST → created_at ASC).
     */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.business.id = :businessId " +
            "  AND d.counterpartRef.id = :counterpartId " +
            "  AND d.direction = :direction " +
            "  AND d.status IN ('OPEN','PARTIAL') " +
            "ORDER BY d.dueDate ASC NULLS LAST, d.createdAt ASC")
    List<Debt> findOpenByCounterpartFifo(
            @org.springframework.data.repository.query.Param("businessId") UUID businessId,
            @org.springframework.data.repository.query.Param("counterpartId") UUID counterpartId,
            @org.springframework.data.repository.query.Param("direction")
                    com.bizboard.common.enums.DebtDirection direction);

    /** v1.7.x: counterpart'ın tüm borçları (statu fark etmez), tarih sırasıyla. */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.business.id = :businessId " +
            "  AND d.counterpartRef.id = :counterpartId " +
            "ORDER BY d.createdAt ASC")
    List<Debt> findByBusinessAndCounterpartAll(
            @org.springframework.data.repository.query.Param("businessId") UUID businessId,
            @org.springframework.data.repository.query.Param("counterpartId") UUID counterpartId);

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

    /** v1.6.23.21 (Security WP / arch-rules §1.3.A): business-scoped cheque varyant. */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.business.id = :businessId " +
            "  AND d.settled = false " +
            "  AND d.chequeDueDate IS NOT NULL " +
            "  AND d.chequeDueDate BETWEEN :from AND :to " +
            "ORDER BY d.chequeDueDate ASC")
    List<Debt> findUpcomingChequesByBusiness(
            @org.springframework.data.repository.query.Param("businessId") UUID businessId,
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

    /** v1.6.23.21 (Security WP / arch-rules §1.3.A): business-scoped reminder varyant. */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.business.id = :businessId " +
            "  AND d.settled = false " +
            "  AND d.reminderDate IS NOT NULL " +
            "  AND d.reminderDate BETWEEN :from AND :to " +
            "ORDER BY d.reminderDate ASC")
    List<Debt> findUpcomingRemindersByBusiness(
            @org.springframework.data.repository.query.Param("businessId") UUID businessId,
            @org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
            @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);

    // ── v1.1 (Krediler sayfası): kredi-kaynaklı borçlar — salt görüntü ──────
    //
    // Verilen/Alınan Borç (LoanService) bir Debt kaydı üretir; tx tarafında
    // kind=LOAN olur, ancak Debt↔Transaction arasında FK YOKTUR. Tek güvenilir
    // işaret: LoanService.buildTxDescription'ın description'a yazdığı sabit
    // önekler ("Verilen borç:" → ALACAK, "Alınan borç:" → VERECEK). Bu sorgular
    // SADECE OKUR; yeni hesap/mutasyon üretmez. Önekler değişirse buradaki
    // pattern de güncellenmelidir (LoanService ile çift-kontrol).

    /** v1.1: bir işletmenin kredi-kaynaklı borçları (admin_only dahil). */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.business.id = :businessId " +
            "  AND (d.description LIKE 'Verilen borç:%' OR d.description LIKE 'Alınan borç:%') " +
            "ORDER BY d.createdAt DESC")
    List<Debt> findLoansByBusiness(
            @org.springframework.data.repository.query.Param("businessId") UUID businessId);

    /** v1.1: bir işletmenin kredi-kaynaklı borçları (admin_only=false). */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.business.id = :businessId " +
            "  AND d.adminOnly = false " +
            "  AND (d.description LIKE 'Verilen borç:%' OR d.description LIKE 'Alınan borç:%') " +
            "ORDER BY d.createdAt DESC")
    List<Debt> findLoansByBusinessAndAdminOnlyFalse(
            @org.springframework.data.repository.query.Param("businessId") UUID businessId);

    /** v1.1: birden çok işletmenin kredi-kaynaklı borçları (admin: tümü). */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.business.id IN :businessIds " +
            "  AND (d.description LIKE 'Verilen borç:%' OR d.description LIKE 'Alınan borç:%') " +
            "ORDER BY d.createdAt DESC")
    List<Debt> findLoansByBusinessIdIn(
            @org.springframework.data.repository.query.Param("businessIds") List<UUID> businessIds);

    /** v1.1: birden çok işletmenin kredi-kaynaklı borçları (admin_only=false). */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM Debt d " +
            "WHERE d.business.id IN :businessIds " +
            "  AND d.adminOnly = false " +
            "  AND (d.description LIKE 'Verilen borç:%' OR d.description LIKE 'Alınan borç:%') " +
            "ORDER BY d.createdAt DESC")
    List<Debt> findLoansByBusinessIdInAndAdminOnlyFalse(
            @org.springframework.data.repository.query.Param("businessIds") List<UUID> businessIds);
}
