package com.bizboard.repository;

import com.bizboard.common.entity.TelegramLinkCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/** Telegram bot MVP: deep-link bağlama kodu erişimi. */
public interface TelegramLinkCodeRepository extends JpaRepository<TelegramLinkCode, UUID> {

    Optional<TelegramLinkCode> findByCode(String code);

    /** Cleanup: süresi geçmiş + tüketilmiş eski kayıtları sil (best-effort). */
    @Modifying
    @Query("delete from TelegramLinkCode c where c.expiresAt < :threshold")
    int deleteExpiredBefore(LocalDateTime threshold);
}
