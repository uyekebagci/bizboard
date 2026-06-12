package com.bizboard.common.enums;

/**
 * Onay (Approval) modülü — bir {@code approval_requests} kaydının yaşam-döngüsü
 * durumu.
 *
 * <p>Geçişler:</p>
 * <ul>
 *   <li>{@link #PENDING} → {@link #APPROVED} (yetkili onayladı; işlem yürütülür)</li>
 *   <li>{@link #PENDING} → {@link #REJECTED} (yetkili reddetti; işlem YÜRÜTÜLMEZ)</li>
 *   <li>{@link #PENDING} → {@link #CANCELLED} (talep eden / admin geri çekti)</li>
 *   <li>{@link #PENDING} → {@link #EXPIRED} (TTL doldu; lazy işaretlenir)</li>
 * </ul>
 *
 * <p>Terminal durumlar (APPROVED/REJECTED/CANCELLED/EXPIRED) üzerinde yeniden
 * onay/red/iptal yapılamaz — idempotent + tutarlı denetim için.</p>
 */
public enum ApprovalStatus {
    /** Onay bekliyor; verify-code istenmişse henüz doğrulanmadı. */
    PENDING,
    /** Onaylandı; işaretlenen işlem (payload) yürütüldü. */
    APPROVED,
    /** Reddedildi; işlem hiçbir zaman yürütülmedi. */
    REJECTED,
    /** Talep eden ya da admin tarafından geri çekildi. */
    CANCELLED,
    /** TTL ({@code expires_at}) doldu; onaylanamaz (lazy işaretlenir). */
    EXPIRED
}
