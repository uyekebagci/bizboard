package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

/**
 * <h3>DGR perspective sign convention (v1.6.23.8)</h3>
 *
 * Tüm magnitude field'ları ({@code total_receivable}, {@code total_payable},
 * {@code settled_*}, {@code pending_*}) <b>her zaman pozitif (>= 0)</b>.
 * Sign frontend display layer'ında uygulanır:
 * <ul>
 *   <li><b>RECEIVABLE</b> → "+X TL" yeşil (DGR'ye gelecek)</li>
 *   <li><b>PAYABLE</b> → "−X TL" kırmızı (DGR'den gidecek)</li>
 * </ul>
 *
 * <p>{@code net_balance = total_receivable − total_payable} (işaretli;
 * pozitif = net alacak, negatif = net borç).</p>
 *
 * <p>Convention: {@code docs/conventions.md}.</p>
 */
@Data
@Builder
public class DebtSummaryDto {

    /** Magnitude (>= 0). Display: "+X TL". DGR'ye gelecek. */
    @JsonProperty("total_receivable")
    private BigDecimal totalReceivable;

    /** Magnitude (>= 0). Display: "−X TL". DGR'den gidecek. */
    @JsonProperty("total_payable")
    private BigDecimal totalPayable;

    /** İşaretli sonuç: receivable − payable. Pozitif = net alacaklı. */
    @JsonProperty("net_balance")
    private BigDecimal netBalance;

    @JsonProperty("settled_receivable")
    private BigDecimal settledReceivable;

    @JsonProperty("settled_payable")
    private BigDecimal settledPayable;

    @JsonProperty("pending_receivable")
    private BigDecimal pendingReceivable;

    @JsonProperty("pending_payable")
    private BigDecimal pendingPayable;

    @JsonProperty("receivable_count")
    private int receivableCount;

    @JsonProperty("payable_count")
    private int payableCount;
}
