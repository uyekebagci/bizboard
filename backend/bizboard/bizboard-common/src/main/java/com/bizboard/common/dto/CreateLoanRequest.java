package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Çatı v1.2 — Verilen/Alınan Borç (LOAN) oluşturma isteği.
 *
 * <p><b>Verilen Borç</b> ({@code loan_type=GIVEN}): DGR birine para verdi →
 * nakit ÇIKAR + karşılığı <b>ALACAK</b> (RECEIVABLE Debt) artar.</p>
 *
 * <p><b>Alınan Borç</b> ({@code loan_type=TAKEN}): DGR birinden para aldı →
 * nakit ARTAR + <b>VERECEK</b> (PAYABLE Debt) artar.</p>
 *
 * <p>Her iki durumda da P&L'e (Net Kâr) GİRMEZ — bilanço hareketidir. Kasa
 * hareketi {@code payment_method} (NAKIT/HESAPDAN) ile yapılır; HESAPDAN ise
 * {@code bank_account_id} zorunlu.</p>
 */
@Data
public class CreateLoanRequest {

    /** "GIVEN" (verilen borç → alacak) veya "TAKEN" (alınan borç → verecek). */
    @JsonProperty("loan_type")
    @NotNull
    private String loanType;

    @NotNull
    @Positive
    private BigDecimal amount;

    private String currency;

    /**
     * Kasa hareketinin yöntemi: "NAKIT" (default) veya "HESAPDAN".
     * HESAPDAN ise {@link #bankAccountId} zorunlu. (POS borç akışında anlamsız.)
     */
    @JsonProperty("payment_method")
    private String paymentMethod;

    /** HESAPDAN için zorunlu banka hesabı; NAKIT'te default "Genel Nakit"e route. */
    @JsonProperty("bank_account_id")
    private UUID bankAccountId;

    /** Borçlu/alacaklı cari (kişi/firma). Verilirse Debt counterpart_ref ile bağlanır. */
    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    /** Cari yoksa serbest metin ad (Debt.counterparty). counterpart_id varsa onun adı kullanılır. */
    private String counterparty;

    /** İşlem (kasa hareketi + borç kayıt) tarihi. Null → bugün. */
    private LocalDate date;

    /** Borç vade tarihi (opsiyonel). */
    @JsonProperty("due_date")
    private LocalDate dueDate;

    private String description;

    /** Sadece admin görebilir (Debt.admin_only). */
    @JsonProperty("admin_only")
    private Boolean adminOnly;
}
