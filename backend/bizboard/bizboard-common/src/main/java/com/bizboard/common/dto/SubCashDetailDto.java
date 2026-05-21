package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * v1.6.23.27 (UI Fix WP TODO 85a7e425 + 31c441cb): SUB_CASH detay paneli
 * aggregate response.
 *
 * <p>UI'da 2 ayrı kart:</p>
 * <ul>
 *   <li><b>Balance kartı</b>: {@link #aggregate} (Σ assigned BANK_ACCOUNT balances)
 *       + assignment listesi + her satırın balance katkısı</li>
 *   <li><b>Tx listesi</b>: COALESCE resolve sonucu bu sub-cash'e route edilen
 *       transaction'lar</li>
 * </ul>
 */
@Data
@Builder
public class SubCashDetailDto {

    /** Sub-cash bank_account info. */
    private BankAccountDto subCash;

    /** Σ assigned BANK_ACCOUNT.current_balance (TODO d884a0ec formula). */
    private BigDecimal aggregate;

    /** Ana Kasa (MAIN) aggregate — UI'da total bağlam için. */
    @JsonProperty("main_aggregate")
    private BigDecimal mainAggregate;

    /** Atanmamış toplamı — MAIN − Σ SUB (TODO 73dd2694 INVARIANT). */
    @JsonProperty("unassigned_aggregate")
    private BigDecimal unassignedAggregate;

    /** Bu sub-cash'in atamaları. */
    private List<SubCashAssignmentDto> assignments;

    /** COALESCE ile resolve edilmiş son N tx. */
    private List<TransactionDto> transactions;
}
