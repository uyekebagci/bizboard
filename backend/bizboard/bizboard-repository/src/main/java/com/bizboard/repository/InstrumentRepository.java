package com.bizboard.repository;

import com.bizboard.common.entity.Instrument;
import com.bizboard.common.enums.InstrumentDirection;
import com.bizboard.common.enums.InstrumentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.7): {@link Instrument} (çek/senet) repository.
 *
 * <p>Portföy listesi, vade-yaklaşma sorgusu (reminder cron), ve durum-bazlı
 * filtre. Çok-tenant: servis {@code businessId} ile çağırır.</p>
 */
public interface InstrumentRepository extends JpaRepository<Instrument, UUID> {

    List<Instrument> findByBusinessIdOrderByDueDateAsc(UUID businessId);

    List<Instrument> findByBusinessIdAndStatusOrderByDueDateAsc(UUID businessId, InstrumentStatus status);

    /**
     * Vadesi {@code from..to} aralığına düşen ve hâlâ takipteki (CONFIRMED)
     * evraklar — reminder cron için (tüm işletmeler). BETWEEN inclusive.
     */
    @Query("SELECT i FROM Instrument i " +
            "WHERE i.status = com.bizboard.common.enums.InstrumentStatus.CONFIRMED " +
            "AND i.dueDate BETWEEN :from AND :to " +
            "ORDER BY i.dueDate ASC")
    List<Instrument> findUpcoming(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * Çek/senet ↔ nakit tahsilat bağlama (tx-form öneri kartı): bir cari'nin
     * (keşideci) AÇIK (CONFIRMED → tahsil/ödeme edilebilir) ve verilen yöndeki
     * evrakları. İşlem formunda nakit/banka girişi girilirken "bu bir çek/senet
     * tahsilatı mı?" önerisini besler. Vadeye göre sıralı (yakın vade önce).
     */
    @Query("SELECT i FROM Instrument i " +
            "WHERE i.business.id = :businessId " +
            "AND i.issuerCounterpart.id = :counterpartId " +
            "AND i.direction = :direction " +
            "AND i.status = com.bizboard.common.enums.InstrumentStatus.CONFIRMED " +
            "ORDER BY i.dueDate ASC")
    List<Instrument> findOpenByCounterpart(@Param("businessId") UUID businessId,
                                           @Param("counterpartId") UUID counterpartId,
                                           @Param("direction") InstrumentDirection direction);

    /**
     * Cross-link (işlem/journal → instrument): tahsil/ödeme entry'sine bağlı
     * evrak. İşlem detayında "Çek X tahsilatı" rozeti için ters arama.
     */
    Optional<Instrument> findByJournalEntryId(UUID journalEntryId);
}
