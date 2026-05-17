package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class DebtMigrationResultDto {

    @JsonProperty("dry_run")
    private boolean dryRun;

    /** İncelenen toplam orphan borç sayısı (counterpart_id IS NULL). */
    @JsonProperty("orphan_debts")
    private int orphanDebts;

    /** Mevcut counterpart kaydına bağlanan borç sayısı. */
    @JsonProperty("matched_existing")
    private int matchedExisting;

    /** Yeni counterpart kaydı oluşturup bağlanan borç sayısı (auto_create=true ise). */
    @JsonProperty("created_new")
    private int createdNew;

    /** Counterparty string'i boş/geçersiz olduğu için atlanan borç sayısı. */
    private int skipped;

    /** Migration sonrası tetiklenmiş counterpart recompute sayısı. */
    @JsonProperty("recomputed_counterparts")
    private int recomputedCounterparts;
}
