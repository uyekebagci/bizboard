package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.7) — çek/senet manuel giriş isteği.
 *
 * <p>Telegram-foto/OCR girişi ileride aynı servisi {@code source=TELEGRAM_PHOTO}
 * + {@code photoUrl}/{@code ocrMeta} ile çağıracak (ayrı modül); manuel girişte
 * doğrudan CONFIRMED açılır.</p>
 */
@Data
public class CreateInstrumentRequest {

    /** CHECK | PROMISSORY_NOTE */
    @NotNull(message = "type zorunlu (CHECK | PROMISSORY_NOTE)")
    private String type;

    /** RECEIVED (alacak) | GIVEN (borç) */
    @NotNull(message = "direction zorunlu (RECEIVED | GIVEN)")
    private String direction;

    @NotNull(message = "amount zorunlu")
    @DecimalMin(value = "0.01", message = "amount > 0 olmalı")
    private BigDecimal amount;

    private String currency;

    /** Keşideci/karşı taraf. */
    @JsonProperty("issuer_counterpart_id")
    private UUID issuerCounterpartId;

    /** Bizim firmamız (lehtar/borçlu). */
    @JsonProperty("our_company_id")
    private UUID ourCompanyId;

    @JsonProperty("bank_name")
    private String bankName;

    @JsonProperty("serial_no")
    private String serialNo;

    @JsonProperty("issue_date")
    private LocalDate issueDate;

    @NotNull(message = "due_date (vade) zorunlu")
    @JsonProperty("due_date")
    private LocalDate dueDate;

    private String notes;

    // ─── Telegram-foto / OCR (ileride ayrı modül doldurur; manuel'de boş) ───
    /** MANUAL (default) | TELEGRAM_PHOTO */
    private String source;
    @JsonProperty("photo_url")
    private String photoUrl;
    @JsonProperty("ocr_meta")
    private String ocrMeta;
}
