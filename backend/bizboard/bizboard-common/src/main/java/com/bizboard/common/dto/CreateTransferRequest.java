package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * v1.7.0-beta (Bankalar WP TODO abb90050): POST /transfers body.
 *
 * <p>{@code business_id} JWT'den çözülür — body'de YOK (multi-tenant
 * doğrulama + actor accessibility üzerinden). {@code category_id} de
 * YOK — transfer category boyutu taşımaz.</p>
 *
 * <p>v1.7.x: İki mod desteklenir.</p>
 * <ul>
 *   <li><b>Paired (internal)</b>: {@code to_bank_account_id} dolu →
 *       OUT + IN tx pair'i (eski davranış).</li>
 *   <li><b>External</b>: {@code to_external_name} dolu, {@code to_bank_account_id}
 *       null → yalnız OUT tx; kaynak hesap bakiyesi düşer, paired IN yok.
 *       Raporlara yansımaz (kind=TRANSFER).</li>
 * </ul>
 */
@Data
public class CreateTransferRequest {

    @NotNull
    @JsonProperty("from_bank_account_id")
    private UUID fromBankAccountId;

    /** v1.7.x: external mode için null olabilir. Validation servis seviyesinde. */
    @JsonProperty("to_bank_account_id")
    private UUID toBankAccountId;

    /**
     * v1.7.x (Transfer UX): External hedef (kayıtsız) — IBAN, kişi adı vs.
     * Doluysa to_bank_account_id null kabul edilir; sadece OUT tx oluşur.
     */
    @JsonProperty("to_external_name")
    private String toExternalName;

    @NotNull
    @Positive
    private BigDecimal amount;

    @NotNull
    private LocalDate date;

    /** Opsiyonel — iki tx'in de description'ı aynı olur. */
    private String description;
}
