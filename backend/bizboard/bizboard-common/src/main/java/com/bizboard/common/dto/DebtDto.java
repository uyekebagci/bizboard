package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class DebtDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    private String direction; // RECEIVABLE or PAYABLE

    /** Free-text karşı taraf adı (geriye uyumluluk). */
    private String counterparty;

    /** v1.5.1: normalize counterpart entity referansı (varsa). */
    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    /** v1.5.1: normalize counterpart adı (varsa; client tarafı ekstre vs için kullanabilir). */
    @JsonProperty("counterpart_name")
    private String counterpartName;

    /** TL cinsinden tutar (kayıt anı kuruyla; USD/GOLD için çevrilmiş). */
    private BigDecimal amount;

    private String currency;

    // ── WP a9da4e9d (USD+Altın): çift gösterim alanları ──
    /** Orijinal para birimindeki tutar (USD/GOLD için döviz/gram; TRY için = amount). */
    @JsonProperty("original_amount")
    private BigDecimal originalAmount;

    /** Son recompute/kayıt anı kuru (1 birim currency = rateSnapshot TL). */
    @JsonProperty("rate_snapshot")
    private BigDecimal rateSnapshot;

    @JsonProperty("rate_snapshot_at")
    private LocalDateTime rateSnapshotAt;

    /** GÜNCEL kurla TL karşılığı (canlı; original × güncel kur). Gösterim için. */
    @JsonProperty("current_amount_try")
    private BigDecimal currentAmountTry;

    @JsonProperty("instrument_type")
    private String instrumentType;

    /** v1.6.5: alacak (RECEIVABLE) tipi — SENET / CEK / ALTIN / NAKIT / DIGER. */
    @JsonProperty("receivable_type")
    private String receivableType;

    /** v1.6.5: receivable_type = DIGER iken serbest metin tip adı. */
    @JsonProperty("receivable_type_other")
    private String receivableTypeOther;

    // ── v1.6.22 (WP-5): Çek + reminder alanları ──
    @JsonProperty("cheque_due_date")        private LocalDate chequeDueDate;
    @JsonProperty("cheque_collector_bank")  private String chequeCollectorBank;
    @JsonProperty("cheque_no")              private String chequeNo;
    @JsonProperty("reminder_date")          private LocalDate reminderDate;
    @JsonProperty("reminder_note")          private String reminderNote;

    @JsonProperty("due_date")
    private LocalDate dueDate;

    @JsonProperty("is_settled")
    private boolean settled;

    @JsonProperty("settled_at")
    private LocalDateTime settledAt;

    private String description;

    @JsonProperty("document_url")
    private String documentUrl;

    @JsonProperty("admin_only")
    private boolean adminOnly;

    @JsonProperty("created_by_name")
    private String createdByName;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
