package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.8 / §5): banka import (manuel satır iskeleti) DTO'ları.
 * PDF auto-parse ERTELENDİ (KARAR A4) — bugün elle satır girişi.
 */
public final class BankImportDtos {

    private BankImportDtos() {}

    /** Yeni parti aç (banka hesabı seç). */
    @Data
    public static class CreateBatchRequest {
        @NotNull
        @JsonProperty("account_id")
        private UUID accountId;

        @JsonProperty("statement_date")
        private LocalDate statementDate;
    }

    /** Elle satır ekle. */
    @Data
    public static class AddLineRequest {
        @JsonProperty("parsed_date")
        private LocalDate parsedDate;

        /** İşaretli: + giriş, − çıkış. */
        @NotNull
        @JsonProperty("parsed_amount")
        private BigDecimal parsedAmount;

        @JsonProperty("parsed_counterpart")
        private String parsedCounterpart;

        @JsonProperty("raw_text")
        private String rawText;
    }

    /** Satıra kategori onayla (öğrenme kuralı güncellenir). */
    @Data
    public static class CategorizeLineRequest {
        @NotNull
        @JsonProperty("category_id")
        private UUID categoryId;
    }

    @Data
    @Builder
    public static class BatchDto {
        private UUID id;
        @JsonProperty("account_id")
        private UUID accountId;
        @JsonProperty("account_name")
        private String accountName;
        @JsonProperty("statement_date")
        private LocalDate statementDate;
        private String status;
        @JsonProperty("line_count")
        private int lineCount;
        @JsonProperty("matched_count")
        private int matchedCount;
        @JsonProperty("unexplained_count")
        private int unexplainedCount;
        @JsonProperty("created_at")
        private LocalDateTime createdAt;
        private List<LineDto> lines;
    }

    @Data
    @Builder
    public static class LineDto {
        private UUID id;
        @JsonProperty("parsed_date")
        private LocalDate parsedDate;
        @JsonProperty("parsed_amount")
        private BigDecimal parsedAmount;
        @JsonProperty("parsed_counterpart")
        private String parsedCounterpart;
        /** Hareketten sonraki yürüyen bakiye (PDF import'ta dolar). */
        @JsonProperty("parsed_balance")
        private BigDecimal parsedBalance;
        @JsonProperty("raw_text")
        private String rawText;
        @JsonProperty("suggested_category_id")
        private UUID suggestedCategoryId;
        @JsonProperty("suggested_category_name")
        private String suggestedCategoryName;
        @JsonProperty("confirmed_category_id")
        private UUID confirmedCategoryId;
        private String status;
        @JsonProperty("journal_entry_id")
        private UUID journalEntryId;
    }

    /**
     * PDF import sonucu özeti: kaç satır oluşturuldu, kaçı atlandı (dedupe),
     * kaçı flag'lendi (bakiye zinciri tutmadı), açılış bakiyesi ve güncel
     * parti durumu (satırlarıyla).
     */
    @Data
    @Builder
    public static class PdfImportResult {
        @JsonProperty("opening_balance")
        private BigDecimal openingBalance;
        @JsonProperty("parsed_count")
        private int parsedCount;
        @JsonProperty("imported_count")
        private int importedCount;
        @JsonProperty("skipped_duplicate_count")
        private int skippedDuplicateCount;
        @JsonProperty("flagged_count")
        private int flaggedCount;
        @JsonProperty("chain_consistent")
        private boolean chainConsistent;
        private BatchDto batch;
    }
}
