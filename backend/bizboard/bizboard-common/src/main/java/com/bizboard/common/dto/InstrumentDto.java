package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.7) — çek/senet (Instrument) ekran DTO'su.
 */
@Data
@Builder
public class InstrumentDto {

    private UUID id;
    private String type;        // CHECK | PROMISSORY_NOTE
    private String direction;   // RECEIVED | GIVEN
    private BigDecimal amount;
    private String currency;

    @JsonProperty("issuer_counterpart_id")
    private UUID issuerCounterpartId;
    @JsonProperty("issuer_name")
    private String issuerName;

    @JsonProperty("our_company_id")
    private UUID ourCompanyId;
    @JsonProperty("our_company_name")
    private String ourCompanyName;

    @JsonProperty("bank_name")
    private String bankName;
    @JsonProperty("serial_no")
    private String serialNo;

    @JsonProperty("issue_date")
    private LocalDate issueDate;
    @JsonProperty("due_date")
    private LocalDate dueDate;

    private String status;      // PENDING_OCR | CONFIRMED | CASHED | BOUNCED | ENDORSED

    @JsonProperty("endorsed_to_counterpart_id")
    private UUID endorsedToCounterpartId;
    @JsonProperty("endorsed_to_name")
    private String endorsedToName;
    @JsonProperty("endorsed_at")
    private LocalDateTime endorsedAt;

    @JsonProperty("journal_entry_id")
    private UUID journalEntryId;
    @JsonProperty("cashed_account_id")
    private UUID cashedAccountId;
    @JsonProperty("cashed_account_name")
    private String cashedAccountName;
    @JsonProperty("cashed_at")
    private LocalDateTime cashedAt;
    @JsonProperty("bounced_at")
    private LocalDateTime bouncedAt;

    private String source;      // MANUAL | TELEGRAM_PHOTO
    @JsonProperty("photo_url")
    private String photoUrl;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    /** Türetilmiş: vadeye kalan gün (negatif = geçmiş). */
    @JsonProperty("days_to_due")
    private Long daysToDue;
}
