package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateDebtRequest {

    @NotBlank
    private String direction; // RECEIVABLE or PAYABLE

    /**
     * Geriye uyumluluk için free-text. v1.5.1+: {@link #counterpartId} verilirse
     * ondaki name otomatik kullanılır ve bu alan opsiyonel kabul edilir (controller
     * tarafında validation şu an @NotBlank, ama service counterpart varsa onun
     * adıyla auto-fill eder). Eski client'lar yine string ile devam edebilir.
     */
    @NotBlank
    private String counterparty;

    /** v1.5.1: normalize edilmiş karşı firma kaydı (opsiyonel). */
    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    @NotNull
    @Positive
    private BigDecimal amount;

    private String currency;

    @NotBlank
    @JsonProperty("instrument_type")
    private String instrumentType; // CEK, SENET, NAKIT veya özel

    /**
     * v1.6.5: alacak (RECEIVABLE) için tip seçimi. İzin verilen değerler:
     * SENET, CEK, ALTIN, NAKIT, DIGER. PAYABLE için null.
     */
    @JsonProperty("receivable_type")
    private String receivableType;

    /** v1.6.5: receivable_type = DIGER iken serbest metin tip adı. */
    @JsonProperty("receivable_type_other")
    private String receivableTypeOther;

    @JsonProperty("due_date")
    private LocalDate dueDate;

    private String description;

    @JsonProperty("document_url")
    private String documentUrl;

    @JsonProperty("admin_only")
    private Boolean adminOnly;
}
