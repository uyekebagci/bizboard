package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * v1.7.0-beta (Bankalar WP TODO abb90050): Transfer aggregate response.
 *
 * <p>Pair'in iki tarafını + meta'yı tek paket. UI TransferDetailModal
 * için kullanılır.</p>
 */
@Data
@Builder
public class TransferDto {

    @JsonProperty("transfer_pair_id")
    private UUID transferPairId;

    @JsonProperty("business_id")
    private UUID businessId;

    private BigDecimal amount;
    private String currency;
    private LocalDate date;
    private String description;

    /** TRANSFER_OUT (kaynak hesaptan çıkış) — direction=EXPENSE tarafı. */
    @JsonProperty("out_tx")
    private TransactionDto outTx;

    /** TRANSFER_IN (hedef hesaba giriş) — direction=INCOME tarafı. */
    @JsonProperty("in_tx")
    private TransactionDto inTx;

    @JsonProperty("from_bank_account_id")
    private UUID fromBankAccountId;

    @JsonProperty("from_bank_account_name")
    private String fromBankAccountName;

    @JsonProperty("to_bank_account_id")
    private UUID toBankAccountId;

    @JsonProperty("to_bank_account_name")
    private String toBankAccountName;

    /**
     * Bakiye yetersiz uyarısı (200 + warning). Block değil.
     * Kaynak bank_account.current_balance &lt; amount durumunda set edilir.
     */
    @JsonProperty("low_balance_warning")
    private String lowBalanceWarning;
}
