package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.7) — çek ciro/devir isteği.
 *
 * <p>Sadece RECEIVED (alacak) evrak ciro edilebilir → devralan counterpart'a
 * aktarım. Para hareketi yok; sadece durum geçişi (CONFIRMED → ENDORSED).</p>
 */
@Data
public class EndorseInstrumentRequest {

    @NotNull(message = "to_counterpart_id (devralan) zorunlu")
    @JsonProperty("to_counterpart_id")
    private UUID toCounterpartId;

    private String notes;
}
