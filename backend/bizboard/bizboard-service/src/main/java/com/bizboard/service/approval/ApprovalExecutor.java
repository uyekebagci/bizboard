package com.bizboard.service.approval;

import com.bizboard.common.entity.ApprovalRequest;

/**
 * Onay (Approval) modülü v1.1 — bir onay türü ({@code actionType}) onaylandığında
 * gerçek işlemi yürüten strateji.
 *
 * <p>Her {@code actionType} için bir Spring bean {@code ApprovalExecutor} register
 * edilir; {@link ApprovalService} onayı işlerken {@link #actionType()} eşleşen
 * executor'ı bulup {@link #execute(ApprovalRequest)} çağırır. Eşleşen executor
 * yoksa onay reddedilir (sessiz yürütme yok — STRICT).</p>
 *
 * <p>{@code execute} ApprovalService'in onay transaction'ı içinde çağrılır: işlem
 * başarısız olursa (exception) tüm onay geçişi (status=APPROVED dahil) rollback
 * olur — yani "onayladım ama işlem yapılmadı" tutarsızlığı oluşmaz.</p>
 */
public interface ApprovalExecutor {

    /** Bu executor'ın yürüttüğü onay türü (örn. "BALANCE_ADJUST"). */
    String actionType();

    /**
     * Onaylanmış talebin payload'ını kullanarak gerçek işlemi yürütür.
     *
     * @param request onaylanan talep (payload + business + requestedBy okunur)
     * @throws RuntimeException işlem başarısız olursa — onay geçişi rollback olur
     */
    void execute(ApprovalRequest request);
}
