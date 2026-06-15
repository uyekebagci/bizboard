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

    /**
     * Önizlemeden seçilen satırları toplu (veya tek) ekle. Kullanıcı PDF'i
     * parse edip önizlediği satırlardan onayladıklarını gönderir; her biri
     * PARSED satır olur (zincir-şüphesi olanlar FLAGGED). Dedupe korunur.
     */
    @Data
    public static class BulkAddLinesRequest {
        @NotNull
        private List<BulkAddLineItem> lines;
    }

    /** Toplu eklemede tek satır (önizlemede düzenlenebilir alanlar dâhil). */
    @Data
    public static class BulkAddLineItem {
        @JsonProperty("parsed_date")
        private LocalDate parsedDate;

        /** İşaretli: + giriş, − çıkış. */
        @NotNull
        @JsonProperty("parsed_amount")
        private BigDecimal parsedAmount;

        @JsonProperty("parsed_counterpart")
        private String parsedCounterpart;

        @JsonProperty("parsed_balance")
        private BigDecimal parsedBalance;

        @JsonProperty("raw_text")
        private String rawText;

        /** Parser'dan gelen dedupe hash'i (yeniden hesaplanmazsa korunur). */
        @JsonProperty("dedupe_hash")
        private String dedupeHash;

        /** Bakiye zinciri tuttu mu? false → satır FLAGGED gelir. */
        @JsonProperty("chain_ok")
        private Boolean chainOk;
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
     * PDF parse-ONLY sonucu (persist YOK). Kullanıcı önizleme ekranında bu
     * satırları görür/düzenler, sonra seçtiklerini {@link BulkAddLinesRequest}
     * ile partiye ekler. Açılış bakiyesi + zincir tutarlılığı bilgi amaçlıdır.
     */
    @Data
    @Builder
    public static class ParsedPdfResult {
        @JsonProperty("opening_balance")
        private BigDecimal openingBalance;
        @JsonProperty("parsed_count")
        private int parsedCount;
        @JsonProperty("flagged_count")
        private int flaggedCount;
        @JsonProperty("duplicate_count")
        private int duplicateCount;
        @JsonProperty("chain_consistent")
        private boolean chainConsistent;
        private List<ParsedPdfLine> lines;
    }

    /**
     * Önizlemede gösterilen tek parse-edilmiş satır (DB'ye YAZILMAMIŞ).
     * Magnitude değil işaretli tutar döner (display'de yön renklenir).
     */
    @Data
    @Builder
    public static class ParsedPdfLine {
        @JsonProperty("parsed_date")
        private LocalDate parsedDate;
        private String channel;
        @JsonProperty("raw_text")
        private String rawText;
        @JsonProperty("parsed_counterpart")
        private String parsedCounterpart;
        /** İşaretli: + giriş, − çıkış. */
        @JsonProperty("parsed_amount")
        private BigDecimal parsedAmount;
        /** INCOME / EXPENSE. */
        private String direction;
        /** Hareketten sonraki yürüyen bakiye. */
        @JsonProperty("parsed_balance")
        private BigDecimal parsedBalance;
        /** Bakiye zinciri tuttu mu (false → eklenince FLAGGED). */
        @JsonProperty("chain_ok")
        private boolean chainOk;
        /** Parti içi dedupe anahtarı (eklemede aynen gönderilir). */
        @JsonProperty("dedupe_hash")
        private String dedupeHash;
        /** Bu hash zaten bu partide var mı? (önizlemede "çıkar" önerilir) */
        @JsonProperty("is_duplicate")
        private boolean duplicate;
    }

    /** Toplu/tek satır ekleme sonucu (eklenen + atlanan + güncel parti). */
    @Data
    @Builder
    public static class BulkAddResult {
        @JsonProperty("added_count")
        private int addedCount;
        @JsonProperty("skipped_duplicate_count")
        private int skippedDuplicateCount;
        @JsonProperty("flagged_count")
        private int flaggedCount;
        private BatchDto batch;
    }
}
