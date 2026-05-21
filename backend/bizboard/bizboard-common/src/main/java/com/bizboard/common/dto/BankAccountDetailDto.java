package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * v1.6.23.19 (UI Fix WP 8b961444 / TODO bank-account-detail): Banka hesabı
 * detay paneli için aggregate payload.
 *
 * <p>Tek endpoint ile UI'nın ihtiyacı olan tüm parçaları sağlar:</p>
 * <ul>
 *   <li>{@link #account}: hesap meta + cari bakiye</li>
 *   <li>{@link #recentTransactions}: son N (default 10) tx</li>
 *   <li>{@link #pendingPosTransactions}: aynı işletmede henüz settle olmamış
 *       POS tx'ler — bu hesaba düşmesi muhtemel (settle anında bank account
 *       seçilir; operatör burada bekleyenleri görür)</li>
 *   <li>{@link #balanceTrend}: 30 günlük günlük bakiye serisi (gün sonu)</li>
 * </ul>
 */
@Data
@Builder
public class BankAccountDetailDto {

    private BankAccountDto account;

    @JsonProperty("recent_transactions")
    private List<TransactionDto> recentTransactions;

    @JsonProperty("pending_pos_transactions")
    private List<TransactionDto> pendingPosTransactions;

    @JsonProperty("balance_trend")
    private List<BalanceTrendPoint> balanceTrend;

    @Data
    @Builder
    public static class BalanceTrendPoint {
        private LocalDate date;
        private BigDecimal balance;
    }
}
