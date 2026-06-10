package com.bizboard.repository;

import com.bizboard.common.entity.JournalEntry;
import com.bizboard.common.enums.JournalSourceType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Ledger v2 (Faz A): {@link JournalEntry} repository.
 *
 * <p>Backfill runner idempotency'si {@code source_type + source_ref_id}
 * üzerinden yürür: bir Transaction için entry zaten varsa tekrar üretilmez.</p>
 */
public interface JournalEntryRepository extends JpaRepository<JournalEntry, UUID> {

    /** Idempotency anahtarı: bu kaynak olay için entry zaten var mı? */
    Optional<JournalEntry> findBySourceTypeAndSourceRefId(
            JournalSourceType sourceType, UUID sourceRefId);

    boolean existsBySourceTypeAndSourceRefId(JournalSourceType sourceType, UUID sourceRefId);

    List<JournalEntry> findBySourceType(JournalSourceType sourceType);

    long countBySourceType(JournalSourceType sourceType);
}
