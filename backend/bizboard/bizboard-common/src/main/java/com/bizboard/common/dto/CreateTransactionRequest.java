package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
public class CreateTransactionRequest {

    @NotNull
    private String direction; // "income" or "expense"

    @NotNull
    @Positive
    private BigDecimal amount;

    private String currency;

    private String description;

    @NotNull
    private LocalDate date;

    @JsonProperty("category_id")
    private UUID categoryId;

    private List<String> tags;

    private Map<String, Object> metadata;

    /**
     * v1.6.3: ödeme yöntemi. Geçerli değerler: "POS" veya "NAKIT".
     * Opsiyonel — gönderilmezse default "NAKIT" (backend tarafında normalize).
     */
    @JsonProperty("payment_method")
    private String paymentMethod;

    /**
     * v1.6.3 / v1.7.x: BANKA komisyon oranı (yüzde).
     * paymentMethod=POS olduğunda anlamlı; NAKIT için yoksayılır.
     * v1.7.x'te bu alan artık banka oranıdır (yeni model 2 oranlı).
     */
    @JsonProperty("pos_rate")
    private BigDecimal posRate;

    /**
     * v1.7.x (POS Komisyon WP TODO fc3ed50f): Bizim komisyon oranımız (yüzde).
     * paymentMethod=POS için ZORUNLU (servis tarafında validation: NOT NULL
     * + our_commission_rate &gt;= pos_rate, eşit OK).
     */
    @JsonProperty("our_commission_rate")
    private BigDecimal ourCommissionRate;

    /**
     * v1.6.20 (WP-3): Karşı taraf id (counterpart). Tek-tenant DGR modunda
     * işletme zaten sabit; kullanıcı tx girerken kimden/kime'yi seçer.
     * Opsiyonel — geriye uyumluluk için.
     */
    @JsonProperty("target_counterpart_id")
    private java.util.UUID targetCounterpartId;

    /**
     * v1.6.20 (WP-3): POS cihazı id. paymentMethod=POS iken seçilebilir.
     * Service tx'in appliedPosRate'ini cihazın o anki rate'inden snapshot eder.
     */
    @JsonProperty("pos_device_id")
    private java.util.UUID posDeviceId;

    /**
     * v1.6.23.4 (sandbox-test): paymentMethod=HESAPDAN iken zorunlu banka hesabı.
     * Hesabın {@code current_balance}'ı tx kaydedildiğinde direction'a göre
     * güncellenir (income → +, expense → -). Diğer payment_method'larda yoksayılır.
     */
    @JsonProperty("bank_account_id")
    private java.util.UUID bankAccountId;

    /**
     * Beta v1.1: Tx-time manuel alt kasa atama. Verilirse tx oluşturulduktan
     * sonra ilgili sub-cash için MANUAL scope'lu inclusion kaydı eklenir
     * (otomatik entity-based attribution'a EK — overlap allowed). Transfer
     * tx'lerinde reject edilir.
     */
    @JsonProperty("manual_sub_cash_id")
    private java.util.UUID manualSubCashId;
}
