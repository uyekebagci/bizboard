package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.23.9 (TODO 6ee7a9f1): PATCH /businesses/{bizId}/transactions/{txId}/settle body.
 *
 * <p>POS tx'in "hesaba düştü" onayı için. {@code bank_account_id} zorunlu —
 * tx'in net tutarı bu hesaba ekler. {@code settled_at} opsiyonel; verilmezse
 * {@code now()} kullanılır.</p>
 *
 * <p>Validation (servis tarafında):</p>
 * <ul>
 *   <li>tx.payment_method = POS olmalı (yoksa 400)</li>
 *   <li>tx.pos_settled = false / null olmalı (zaten true ise 409)</li>
 *   <li>bank_account aktif olmalı, type CHECKING/SAVINGS (CASH_HOLDER hariç —
 *       POS direkt fiziksel kişiye düşmez)</li>
 *   <li>currency uyuşmalı</li>
 * </ul>
 *
 * <p>Side effect: {@code bank_account.current_balance += net} (= amount −
 * commission). Audit log: {@code highlight_type=POS_SETTLED}.</p>
 */
@Data
public class PosSettleRequest {

    @NotNull
    @JsonProperty("bank_account_id")
    private UUID bankAccountId;

    /** Opsiyonel; verilmezse now(). */
    @JsonProperty("settled_at")
    private LocalDateTime settledAt;
}
