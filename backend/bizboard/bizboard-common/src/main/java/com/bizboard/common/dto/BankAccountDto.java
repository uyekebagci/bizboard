package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.20 (WP-3): Banka hesabı / kasa DTO'su.
 */
@Data
@Builder
public class BankAccountDto {

    private UUID id;

    /**
     * v1.6.23.19 (Security WP 667d8a71 / TODO 7432143f): hesabın bağlı olduğu
     * işletmenin id'si — UI multi-tenant filter / etiketleme için kullanır.
     */
    @JsonProperty("business_id")
    private UUID businessId;

    /** İşletme görünür adı (UI rozet/etiket). */
    @JsonProperty("business_name")
    private String businessName;

    private String name;
    /** v1.6.23.25: CHECKING / SAVINGS / MAIN_CASH / SUB_CASH / CASH_HOLDER */
    private String type;

    /**
     * v1.6.23.25 (UI Fix WP TODO e9a619e3): UI MAIN_CASH satırını görsel
     * olarak ayırmak için flag — frontend bu alanı kullanarak kilit ikonu
     * gösterir + delete butonunu disable eder.
     */
    @JsonProperty("is_main_cash")
    private boolean mainCash;

    /** v1.6.23.25: false ise UI delete butonunu disable eder (MAIN_CASH = false). */
    @JsonProperty("is_user_deletable")
    private boolean userDeletable;

    /**
     * v1.6.23.27 (UI Fix WP TODO 7e0c5333): sistem-managed hesap (örn.
     * "Genel Nakit" default CASH_HOLDER). UI bu flag ile delete/edit'i
     * kısıtlar — name dışındaki alanlar disabled, delete tamamen disabled.
     */
    @JsonProperty("is_system")
    private boolean system;

    @JsonProperty("bank_name")
    private String bankName;

    private String iban;
    private String currency;

    @JsonProperty("holder_person_id")
    private UUID holderPersonId;

    @JsonProperty("holder_person_name")
    private String holderPersonName;

    /** v1.7.0.x: Banka hesabının ait olduğu kendi firmamız (MyCompany). */
    @JsonProperty("owner_my_company_id")
    private UUID ownerMyCompanyId;

    @JsonProperty("owner_my_company_name")
    private String ownerMyCompanyName;

    @JsonProperty("current_balance")
    private BigDecimal currentBalance;

    @JsonProperty("is_active")
    private boolean active;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
