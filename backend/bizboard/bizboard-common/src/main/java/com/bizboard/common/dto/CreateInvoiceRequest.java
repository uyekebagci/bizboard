package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Yeni e-Fatura oluşturma isteği.
 *
 * <p>Satıcı bilgileri {@code supplierCompanyId} (MyCompany) üzerinden snapshot
 * alınır; alıcı bilgileri {@code customerCounterpartId} (Counterpart) ya da
 * doğrudan girilen alıcı alanlarından gelir. Tenant binding {@code businessId}
 * ile zorunludur ve servis erişimi doğrular.</p>
 */
@Data
public class CreateInvoiceRequest {

    @NotNull(message = "business_id zorunlu")
    @JsonProperty("business_id")
    private UUID businessId;

    /** Satıcı tüzel kişi (MyCompany). Verilmezse işletmenin bağlı firması kullanılır. */
    @JsonProperty("supplier_company_id")
    private UUID supplierCompanyId;

    /** Alıcı karşı firma (Counterpart). Verilirse alıcı snapshot'ı bundan alınır. */
    @JsonProperty("customer_counterpart_id")
    private UUID customerCounterpartId;

    // Alıcı bilgileri counterpart yoksa / override için doğrudan girilebilir.
    @JsonProperty("customer_tax_id")
    private String customerTaxId;

    @JsonProperty("customer_title")
    private String customerTitle;

    @JsonProperty("customer_tax_office")
    private String customerTaxOffice;

    @JsonProperty("customer_address")
    private String customerAddress;

    @JsonProperty("customer_city")
    private String customerCity;

    @JsonProperty("customer_district")
    private String customerDistrict;

    @JsonProperty("customer_country")
    private String customerCountry;

    /** Fatura numarası — boş bırakılırsa servis otomatik üretir. */
    @JsonProperty("invoice_number")
    private String invoiceNumber;

    /** İsteğe bağlı; boş bırakılırsa bugün. */
    @JsonProperty("issue_date")
    private LocalDate issueDate;

    /** "TEMEL" / "TICARI". Boş → TEMEL. */
    private String scenario;

    /** "SATIS" / "IADE" / ... Boş → SATIS. */
    @JsonProperty("invoice_type")
    private String invoiceType;

    /** Para birimi (ISO 4217). Boş → TRY. */
    private String currency;

    private String notes;

    @NotEmpty(message = "En az bir satır kalemi zorunlu")
    @Valid
    private List<CreateInvoiceLineRequest> lines;
}
