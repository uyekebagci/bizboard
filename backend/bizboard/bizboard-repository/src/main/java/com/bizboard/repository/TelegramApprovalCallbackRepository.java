package com.bizboard.repository;

import com.bizboard.common.entity.TelegramApprovalCallback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Telegram bakiye-düzeltme onay akışı — inline-keyboard callback token erişimi.
 *
 * <ul>
 *   <li>{@link #findByToken} — buton callback'i geldiğinde nonce çözümü.</li>
 *   <li>{@link #findByApprovalRequestId} — "ilk-onay-kazanır" sonrası kardeş
 *       mesajları "işlendi" diye düzenlemek için.</li>
 * </ul>
 */
public interface TelegramApprovalCallbackRepository
        extends JpaRepository<TelegramApprovalCallback, UUID> {

    Optional<TelegramApprovalCallback> findByToken(String token);

    List<TelegramApprovalCallback> findByApprovalRequestId(UUID approvalRequestId);

    boolean existsByApprovalRequestId(UUID approvalRequestId);

    /**
     * Onay kuyruğu DTO zenginleştirme — verilen onay id'lerinden Telegram'a
     * buton-mesajı gönderilmiş olanların ayrık id'leri (N+1 önleme).
     */
    @Query("select distinct c.approvalRequestId from TelegramApprovalCallback c "
            + "where c.approvalRequestId in :ids")
    List<UUID> findApprovalIdsWithCallback(@Param("ids") List<UUID> ids);
}
