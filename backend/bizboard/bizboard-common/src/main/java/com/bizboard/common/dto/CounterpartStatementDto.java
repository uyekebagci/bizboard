package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Cari hesap ekstresi.
 *
 * <p>{@code from} verilmezse açılış bakiyesi 0 alınır + ilk hareketten başlar.
 * {@code to} verilmezse bugün alınır.</p>
 */
@Data
@Builder
public class CounterpartStatementDto {

    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    @JsonProperty("counterpart_name")
    private String counterpartName;

    @JsonProperty("from_date")
    private LocalDate fromDate;

    @JsonProperty("to_date")
    private LocalDate toDate;

    /** Dönem başında bakiye (period'dan önceki aktif borçların net'i). */
    @JsonProperty("opening_balance")
    private BigDecimal openingBalance;

    /** Dönem sonunda bakiye (counterpart.current_balance). */
    @JsonProperty("closing_balance")
    private BigDecimal closingBalance;

    /** Period içindeki toplam alacak (RECEIVABLE) tutarı. */
    @JsonProperty("total_receivable")
    private BigDecimal totalReceivable;

    /** Period içindeki toplam borç (PAYABLE) tutarı. */
    @JsonProperty("total_payable")
    private BigDecimal totalPayable;

    @JsonProperty("entry_count")
    private int entryCount;

    private List<CounterpartStatementEntryDto> entries;
}
