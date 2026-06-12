package com.bizboard.service.approval;

import java.util.UUID;

/**
 * Bir {@link com.bizboard.common.entity.ApprovalRequest} PENDING olarak
 * oluşturulduğunda yayınlanan domain event'i.
 *
 * <p>Onay transaction'ı COMMIT olduktan SONRA dinleyiciler tetiklenir
 * ({@code @TransactionalEventListener(AFTER_COMMIT)}); böylece yan-etkiler
 * (örn. Telegram buton-mesajı gönderimi) onay kaydının kalıcılığını bozmaz ve
 * Telegram hatası onay oluşturmayı geri almaz.</p>
 *
 * <p>Bu event yalnız onay GERÇEKTEN oluşturulduğunda yayınlanır — yani
 * işletmede onay bayrağı AÇIK ve (varsa) eşik aşıldığında. Bayrak kapalıysa
 * hiç onay oluşmaz → event de yayınlanmaz (flag default-kapalı uyumu).</p>
 */
public record ApprovalRequestedEvent(
        UUID approvalRequestId,
        UUID businessId,
        String actionType) {
}
