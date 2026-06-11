package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;

/**
 * Ledger v2 (Faz B — Gün Açılışı): bir işletme+tarih için BİRLEŞİK gün durumu —
 * UI rozeti + işlem-giriş gating'i bunu tüketir.
 *
 * <p>{@code lifecycleStatus}: AÇILMAMIŞ (UNOPENED) / AÇIK (OPEN) / KAPALI (CLOSED).
 * {@code enforcementEnabled}: enforcement feature-flag açık mı? (FE: kapalıysa
 * AÇILMAMIŞ günde de işlem girişi serbest — geçiş dönemi). {@code canAddTransaction}:
 * enforcement + status birleşik nihai karar (FE doğrudan kullanır).</p>
 */
@Data
@Builder
public class DayStatusDto {

    private LocalDate date;

    /** UNOPENED / OPEN / CLOSED. */
    @JsonProperty("lifecycle_status")
    private String lifecycleStatus;

    /** İşlem-giriş enforcement bayrağı açık mı? */
    @JsonProperty("enforcement_enabled")
    private boolean enforcementEnabled;

    /** Nihai karar: bu gün için yeni işlem girilebilir mi? */
    @JsonProperty("can_add_transaction")
    private boolean canAddTransaction;
}
