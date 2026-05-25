package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * v1.6.23.4: BankAccount create payload.
 *
 * <p>Önceki sürümlerde POST endpoint'i yoktu — yeni banka hesabı eklemek için
 * direkt SQL gerekiyordu (sandbox-test sırasında tespit edilen BUG-3). Bu DTO
 * eksikliği kapatır.</p>
 *
 * <p>Validation:</p>
 * <ul>
 *   <li>{@code name} zorunlu</li>
 *   <li>{@code type} zorunlu — CHECKING / SAVINGS / CASH / CASH_HOLDER</li>
 *   <li>{@code type=CASH_HOLDER} ise {@code holder_person_id} zorunlu (servis
 *       tarafında counterpart.kind=PERSON kontrolü)</li>
 *   <li>{@code currency} opsiyonel — verilmezse TRY</li>
 * </ul>
 */
@Data
public class CreateBankAccountRequest {

    /**
     * v1.6.23.19 (Security WP 667d8a71 / TODO 7432143f): hesabın bağlı olduğu
     * işletme. Multi-tenant izolasyonu için zorunlu — service tarafında
     * {@code BusinessAccessGuard.assertCanAccessBusiness} ile actor'ın bu
     * işletmeye erişimi kontrol edilir.
     */
    @NotNull
    @JsonProperty("business_id")
    private UUID businessId;

    @NotBlank
    private String name;

    /** CHECKING / SAVINGS / CASH / CASH_HOLDER */
    @NotBlank
    private String type;

    @JsonProperty("bank_name")
    private String bankName;

    private String iban;

    /** Default TRY. */
    private String currency;

    /** {@code type=CASH_HOLDER} için zorunlu; counterpart.kind=PERSON olmalı. */
    @JsonProperty("holder_person_id")
    private UUID holderPersonId;

    /**
     * v1.7.0.x: Banka hesabının ait olduğu kendi firmamız (MyCompany).
     * Opsiyonel — null gönderilebilir (sonradan atanır).
     */
    @JsonProperty("owner_my_company_id")
    private UUID ownerMyCompanyId;

    /** İlk yükleme için başlangıç bakiyesi (opsiyonel; default 0). */
    @JsonProperty("opening_balance")
    private BigDecimal openingBalance;

    private String notes;
}
