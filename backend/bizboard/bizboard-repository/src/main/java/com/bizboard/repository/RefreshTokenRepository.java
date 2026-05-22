package com.bizboard.repository;

import com.bizboard.common.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /** Cleanup yardımcısı: belirli bir tarihten önce expire olmuş kayıtları siler. */
    @Modifying
    @Query("delete from RefreshToken t where t.expiresAt < :threshold")
    long deleteExpiredBefore(LocalDateTime threshold);

    /** Bir kullanıcının tüm aktif refresh token'larını revoke eder (global logout, parola değiştirme). */
    @Modifying
    @Query("update RefreshToken t set t.revoked = true, t.revokedAt = :now where t.userId = :userId and t.revoked = false")
    int revokeAllForUser(UUID userId, LocalDateTime now);

    /** v1.7.x: kullanıcı silme öncesi FK temizleme. */
    @Modifying
    @Query("delete from RefreshToken t where t.userId = :userId")
    int deleteByUserId(UUID userId);
}
