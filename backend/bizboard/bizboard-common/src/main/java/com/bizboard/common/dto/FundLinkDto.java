package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * "Para İzi" — tek fon-bağı (FundLink) görünümü.
 *
 * <p>Çift-yönlü görünümde kullanılır: detay modal'ında bir bağ satırı, KARŞI
 * işleme drill-down (tıkla-git) için yeterli alanı taşır. Hangi yöne
 * baktığımıza göre ({@code source-side} veya {@code target-side}) "counter"
 * alanları farklı tx'i işaret eder; bu yüzden hem source hem target alanlarını
 * taşırız ve UI {@code counter*} kısayollarını kullanır.</p>
 */
@Data
@Builder
public class FundLinkDto {

    private UUID id;

    private BigDecimal amount;
    private String note;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    // ── Kaynak (source) işlem özeti ──
    @JsonProperty("source_transaction_id")
    private UUID sourceTransactionId;
    @JsonProperty("source_direction")
    private String sourceDirection;
    @JsonProperty("source_amount")
    private BigDecimal sourceAmount;
    @JsonProperty("source_date")
    private LocalDate sourceDate;
    @JsonProperty("source_description")
    private String sourceDescription;
    @JsonProperty("source_counterpart_name")
    private String sourceCounterpartName;

    // ── Hedef (target) işlem özeti ──
    @JsonProperty("target_transaction_id")
    private UUID targetTransactionId;
    @JsonProperty("target_direction")
    private String targetDirection;
    @JsonProperty("target_amount")
    private BigDecimal targetAmount;
    @JsonProperty("target_date")
    private LocalDate targetDate;
    @JsonProperty("target_description")
    private String targetDescription;
    @JsonProperty("target_counterpart_name")
    private String targetCounterpartName;
}
