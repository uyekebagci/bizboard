package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * "Para İzi" — bağlanabilir KAYNAK işlem adayı (bind-picker için).
 *
 * <p>Kullanıcı bir hedef işlemi bağlarken "uygun kaynak girişleri" listesini
 * görür: tutarı, kalanı ({@code remaining = amount − allocated}) &gt; 0 olanlar.
 * Tahsis ettiği tutar kalandan büyük olamaz (BE over-allocation guard).</p>
 */
@Data
@Builder
public class FundSourceCandidateDto {

    @JsonProperty("transaction_id")
    private UUID transactionId;

    private String direction;
    private BigDecimal amount;

    /** Bu kaynağa tahsis edilmiş toplam (Σ bağ tutarları). */
    private BigDecimal allocated;

    /** Kalan = amount − allocated (&gt; 0). */
    private BigDecimal remaining;

    private LocalDate date;
    private String description;

    @JsonProperty("counterpart_name")
    private String counterpartName;
}
