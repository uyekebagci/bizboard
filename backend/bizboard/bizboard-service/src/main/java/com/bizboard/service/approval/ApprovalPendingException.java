package com.bizboard.service.approval;

import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1 — bir {@code @RequiresApproval} metodu, doğrudan
 * yürütülmek yerine onaya gönderildiğinde fırlatılır.
 *
 * <p>Controller bunu yakalayıp <b>HTTP 202 Accepted</b> + oluşturulan onay
 * talebinin id'siyle döner ("işlem onaya gönderildi"). İşlem henüz YÜRÜTÜLMEDİ —
 * yetkili onaylayınca {@link ApprovalExecutor} yürütecek.</p>
 */
public class ApprovalPendingException extends RuntimeException {

    private final UUID approvalRequestId;
    private final String actionType;

    public ApprovalPendingException(UUID approvalRequestId, String actionType) {
        super("İşlem onaya gönderildi (onay bekliyor): " + actionType);
        this.approvalRequestId = approvalRequestId;
        this.actionType = actionType;
    }

    public UUID getApprovalRequestId() {
        return approvalRequestId;
    }

    public String getActionType() {
        return actionType;
    }
}
