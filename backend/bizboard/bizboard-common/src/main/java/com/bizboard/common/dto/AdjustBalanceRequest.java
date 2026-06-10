package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Bankalar WP (bakiye düzeltme): {@code POST /bank-accounts/{id}/adjust-balance} body.
 *
 * <p><b>STRICT finansal kural:</b> Bakiye düzeltme bir <em>gelir/gider değildir</em>.
 * Eski ↔ yeni bakiye farkı Transaction olarak <b>yaratılmaz</b>; gelir/gider
 * raporlarına, kategorilere veya kasa gelir-gider akışına <b>yansımaz</b>. Bu
 * yalnızca cached {@code current_balance}'ı gerçek banka ekstresiyle eşitlemek
 * (mutabakat) içindir. Gerekçesiz bakiye değişikliği olmaz — {@code description}
 * zorunludur ve her düzeltme audit log'a yazılır.</p>
 *
 * <p>Adjustable tipler: CHECKING / SAVINGS / CASH_HOLDER (cached current_balance
 * doğrudan tutulur). MAIN_CASH / SUB_CASH'in kendi bakiyesi yoktur — değerleri
 * üye hesaplardan hesaplanan aggregate'tir; bu tipler için servis 400 döner.</p>
 */
@Data
public class AdjustBalanceRequest {

    /** Hesabın eşitleneceği yeni bakiye. Negatif olabilir (borçlu kasa/hesap). */
    @NotNull(message = "new_balance zorunlu")
    @JsonProperty("new_balance")
    private BigDecimal newBalance;

    /**
     * Düzeltme gerekçesi — ZORUNLU (STRICT). Örn. "Banka ekstresiyle mutabakat —
     * faiz işlemi sisteme girilmemiş". Boş/whitespace kabul edilmez.
     */
    @NotNull(message = "Açıklama (description) zorunlu")
    @Size(min = 3, max = 1000, message = "Açıklama 3-1000 karakter olmalı")
    private String description;
}
